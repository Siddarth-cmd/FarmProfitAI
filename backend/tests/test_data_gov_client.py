import json
from io import BytesIO
import socket
import ssl
from urllib.error import HTTPError, URLError

import pytest

from services.data_gov_client import (
    DataGovAuthError,
    DataGovConfigError,
    DataGovParseError,
    DataGovServiceError,
    fetch_market_prices,
    try_fetch_market_prices,
)


class _FakeResponse:
    def __init__(self, payload: dict | str | bytes, status: int = 200) -> None:
        if isinstance(payload, dict):
            body = json.dumps(payload).encode("utf-8")
        elif isinstance(payload, str):
            body = payload.encode("utf-8")
        else:
            body = payload
        self._body = body
        self.status = status

    def read(self) -> bytes:
        return self._body

    def getcode(self) -> int:
        return self.status

    def __enter__(self) -> "_FakeResponse":
        return self

    def __exit__(self, *_exc) -> None:
        return None


def _api_record(**overrides) -> dict:
    record = {
        "state": "Maharashtra",
        "district": "Nashik",
        "market": "Nashik",
        "commodity": "Tomato",
        "variety": "Local",
        "grade": "FAQ",
        "arrival_date": "08/10/2026",
        "min_price": "1600",
        "max_price": "2200",
        "modal_price": "2000",
    }
    record.update(overrides)
    return record


def _ok_payload(records: list[dict]) -> dict:
    return {"status": "ok", "records": records, "count": len(records)}


def _patch_urlopen(monkeypatch, handler):
    monkeypatch.setattr("services.data_gov_client.urlopen", handler)


def test_successful_api_response(monkeypatch):
    captured = {}

    def fake_urlopen(request, timeout=None):
        captured["url"] = request.full_url
        captured["timeout"] = timeout
        return _FakeResponse(_ok_payload([_api_record()]))

    _patch_urlopen(monkeypatch, fake_urlopen)

    result = fetch_market_prices(limit=5, commodity="Tomato", api_key="test-key")

    assert result.available is True
    assert result.source == "data.gov.in"
    assert result.skipped_invalid == 0
    assert len(result.records) == 1
    record = result.records[0]
    assert record.commodity == "Tomato"
    assert record.market == "Nashik"
    assert record.date.isoformat() == "2026-10-08"
    assert record.min_price == 16
    assert record.modal_price == 20
    assert record.max_price == 22
    assert "format=json" in captured["url"]
    assert "limit=5" in captured["url"]
    assert "filters[commodity]=Tomato" in captured["url"]
    assert "api-key=test-key" in captured["url"]
    assert captured["timeout"] == 15


def test_multiple_market_records(monkeypatch):
    def fake_urlopen(request, timeout=None):
        return _FakeResponse(
            _ok_payload(
                [
                    _api_record(),
                    _api_record(
                        district="Pune",
                        market="Pune",
                        modal_price="2100",
                        max_price="2300",
                    ),
                ]
            )
        )

    _patch_urlopen(monkeypatch, fake_urlopen)
    result = fetch_market_prices(
        limit=10,
        state="Maharashtra",
        district="Nashik",
        api_key="test-key",
    )

    assert [item.market for item in result.records] == ["Nashik", "Pune"]
    assert result.records[1].modal_price == 21
    assert result.skipped_invalid == 0


def test_missing_api_key(monkeypatch):
    monkeypatch.setattr("services.data_gov_client.load_dotenv", lambda *args, **kwargs: None)
    monkeypatch.delenv("DATA_GOV_API_KEY", raising=False)

    with pytest.raises(DataGovConfigError, match="DATA_GOV_API_KEY"):
        fetch_market_prices(limit=1)

    safe = try_fetch_market_prices(limit=1)
    assert safe.available is False
    assert safe.records == []
    assert safe.error_kind == "config"


def test_api_network_failure(monkeypatch):
    def fake_urlopen(request, timeout=None):
        raise URLError("connection refused")

    _patch_urlopen(monkeypatch, fake_urlopen)

    with pytest.raises(DataGovServiceError, match="unavailable"):
        fetch_market_prices(api_key="test-key")

    safe = try_fetch_market_prices(api_key="test-key")
    assert safe.available is False
    assert safe.error_kind == "service"
    assert safe.records == []


def test_non_success_http_response(monkeypatch):
    def fake_urlopen(request, timeout=None):
        raise HTTPError(
            request.full_url,
            502,
            "Bad Gateway",
            hdrs=None,
            fp=BytesIO(b"error"),
        )

    _patch_urlopen(monkeypatch, fake_urlopen)

    with pytest.raises(DataGovServiceError, match="HTTP 502"):
        fetch_market_prices(api_key="test-key")


@pytest.mark.parametrize("status", [401, 403])
def test_authentication_http_errors_are_classified_without_exposing_key(monkeypatch, status):
    def fake_urlopen(request, timeout=None):
        raise HTTPError(request.full_url, status, "Unauthorized", hdrs=None, fp=BytesIO())

    _patch_urlopen(monkeypatch, fake_urlopen)

    with pytest.raises(DataGovAuthError, match=f"HTTP {status}") as exc_info:
        fetch_market_prices(api_key="secret-test-key")
    assert "secret-test-key" not in str(exc_info.value)

    safe = try_fetch_market_prices(api_key="secret-test-key")
    assert safe.error_kind == "auth"
    assert "secret-test-key" not in (safe.error_message or "")


@pytest.mark.parametrize(
    ("raised", "expected"),
    [
        (ConnectionRefusedError("refused"), "unavailable"),
        (ssl.SSLError("certificate verify failed"), "TLS connection failed"),
        (socket.timeout("timed out"), "timed out"),
    ],
)
def test_connection_failures_are_safe_and_classified(monkeypatch, raised, expected):
    def fake_urlopen(request, timeout=None):
        raise raised

    _patch_urlopen(monkeypatch, fake_urlopen)

    safe = try_fetch_market_prices(api_key="secret-test-key")
    assert safe.available is False
    assert safe.error_kind == "service"
    assert expected in (safe.error_message or "")
    assert "secret-test-key" not in (safe.error_message or "")


def test_malformed_response(monkeypatch):
    def fake_urlopen_not_json(request, timeout=None):
        return _FakeResponse("not-json")

    _patch_urlopen(monkeypatch, fake_urlopen_not_json)
    with pytest.raises(DataGovParseError, match="not valid JSON"):
        fetch_market_prices(api_key="test-key")

    def fake_urlopen_missing_records(request, timeout=None):
        return _FakeResponse({"status": "ok"})

    _patch_urlopen(monkeypatch, fake_urlopen_missing_records)
    with pytest.raises(DataGovParseError, match="records list"):
        fetch_market_prices(api_key="test-key")

    safe = try_fetch_market_prices(api_key="test-key")
    assert safe.available is False
    assert safe.error_kind == "parse"


def test_invalid_market_record_is_skipped(monkeypatch):
    def fake_urlopen(request, timeout=None):
        return _FakeResponse(
            _ok_payload(
                [
                    _api_record(),
                    _api_record(min_price="5000", modal_price="2000", max_price="2200"),
                    _api_record(arrival_date="not-a-date"),
                    "not-an-object",
                ]
            )
        )

    _patch_urlopen(monkeypatch, fake_urlopen)
    result = fetch_market_prices(api_key="test-key")

    assert len(result.records) == 1
    assert result.records[0].market == "Nashik"
    assert result.skipped_invalid == 3
    assert result.available is True


def test_quintal_prices_are_converted_to_per_kg(monkeypatch):
    def fake_urlopen(request, timeout=None):
        return _FakeResponse(
            _ok_payload(
                [
                    _api_record(min_price="2400", modal_price="2500", max_price="2600"),
                    _api_record(
                        market="Pune",
                        min_price="2900",
                        modal_price="3000",
                        max_price="3100",
                    ),
                ]
            )
        )

    _patch_urlopen(monkeypatch, fake_urlopen)
    result = fetch_market_prices(api_key="test-key")

    first, second = result.records
    assert first.modal_price == 25
    assert second.modal_price == 30
    assert first.min_price <= first.modal_price <= first.max_price
    assert second.min_price <= second.modal_price <= second.max_price
    assert (first.min_price, first.modal_price, first.max_price) == (24, 25, 26)
    assert (second.min_price, second.modal_price, second.max_price) == (29, 30, 31)


@pytest.mark.parametrize(
    "arrival_date",
    ["2026-10-08T00:00:00Z", "08-10-2026"],
)
def test_supported_date_formats_are_normalized(monkeypatch, arrival_date):
    def fake_urlopen(request, timeout=None):
        return _FakeResponse(_ok_payload([_api_record(arrival_date=arrival_date)]))

    _patch_urlopen(monkeypatch, fake_urlopen)
    result = fetch_market_prices(api_key="test-key")

    assert result.records[0].date.isoformat() == "2026-10-08"


@pytest.mark.parametrize("field", ["min_price", "modal_price", "max_price"])
def test_non_finite_prices_are_skipped(monkeypatch, field):
    def fake_urlopen(request, timeout=None):
        return _FakeResponse(_ok_payload([_api_record(**{field: "nan"})]))

    _patch_urlopen(monkeypatch, fake_urlopen)
    result = fetch_market_prices(api_key="test-key")

    assert result.records == []
    assert result.skipped_invalid == 1


def test_pagination_offset_included_in_request(monkeypatch):
    from services.data_gov_client import _build_url

    url = _build_url(api_key="my-key", limit=20, commodity="Tomato", state="Karnataka", district="Kolar", offset=40)
    assert "offset=40" in url
    assert "limit=20" in url
    assert "filters[commodity]=Tomato" in url


def test_mapped_record_preserves_source_metadata_and_unit(monkeypatch):
    def fake_urlopen(request, timeout=None):
        return _FakeResponse(_ok_payload([_api_record(modal_price="2000", min_price="1800", max_price="2200")]))

    _patch_urlopen(monkeypatch, fake_urlopen)
    result = fetch_market_prices(api_key="test-key")

    assert len(result.records) == 1
    rec = result.records[0]
    assert rec.source_provider == "data.gov.in"
    assert rec.source_unit == "Rs./Quintal"
    assert rec.source_price_value == 2000.0
    assert rec.modal_price == 20.0

