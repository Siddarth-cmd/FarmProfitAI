import json
from urllib.error import URLError

import pytest
from fastapi.testclient import TestClient

from main import app
from models.market_models import MarketsResponse


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


@pytest.fixture
def client():
    return TestClient(app)


def test_get_markets_success(client, monkeypatch):
    captured = {}

    def fake_urlopen(request, timeout=None):
        captured["url"] = request.full_url
        return _FakeResponse(_ok_payload([_api_record()]))

    monkeypatch.setattr("services.data_gov_client.urlopen", fake_urlopen)

    response = client.get(
        "/markets",
        params={"commodity": "Tomato", "state": "Maharashtra", "district": "Nashik", "limit": 5},
        headers={"X-Data-Gov-Api-Key": "test-key"},
    )

    assert response.status_code == 200
    data = response.json()

    # Validate envelope structure and metadata
    assert data["available"] is True
    assert data["source"] == "data.gov.in"
    assert data["count"] == 1
    assert len(data["records"]) == 1
    assert data["skipped_invalid"] == 0
    assert data["error"] is None

    record = data["records"][0]
    assert record["commodity"] == "Tomato"
    assert record["state"] == "Maharashtra"
    assert record["district"] == "Nashik"
    assert record["market"] == "Nashik"
    assert record["variety"] == "Local"
    assert record["date"] == "2026-10-08"
    # Quintal to kg conversion: 1600 / 100 = 16, 2000 / 100 = 20, 2200 / 100 = 22
    assert record["min_price"] == 16.0
    assert record["modal_price"] == 20.0
    assert record["max_price"] == 22.0

    # Ensure response conforms to Pydantic model
    validated = MarketsResponse.model_validate(data)
    assert validated.available is True
    assert validated.count == 1
    assert validated.records[0].modal_price == 20.0
    assert validated.error is None


def test_get_markets_multiple_records_and_skipped_invalid(client, monkeypatch):
    def fake_urlopen(request, timeout=None):
        return _FakeResponse(
            _ok_payload(
                [
                    _api_record(market="Nashik", modal_price="2000"),
                    _api_record(market="Pune", modal_price="2500", max_price="2700"),
                    _api_record(arrival_date="not-a-date"),  # invalid row, should be skipped
                ]
            )
        )

    monkeypatch.setattr("services.data_gov_client.urlopen", fake_urlopen)

    response = client.get("/markets", params={"api_key": "test-key"})
    assert response.status_code == 200
    data = response.json()

    assert data["available"] is True
    assert data["count"] == 2
    assert len(data["records"]) == 2
    assert data["skipped_invalid"] == 1
    assert data["source"] == "data.gov.in"
    assert data["error"] is None
    assert [r["market"] for r in data["records"]] == ["Nashik", "Pune"]
    assert data["records"][0]["modal_price"] == 20.0
    assert data["records"][1]["modal_price"] == 25.0


def test_get_markets_service_failure(client, monkeypatch):
    def fake_urlopen_fail(request, timeout=None):
        raise URLError("Network connection failed")

    monkeypatch.setattr("services.data_gov_client.urlopen", fake_urlopen_fail)

    response = client.get("/markets", params={"api_key": "test-key"})
    assert response.status_code == 200
    data = response.json()

    assert data["available"] is False
    assert data["records"] == []
    assert data["count"] == 0
    assert data["source"] is None
    assert data["skipped_invalid"] == 0
    assert data["error"] is not None
    assert data["error"]["kind"] == "service"
    assert "Network connection failed" in data["error"]["message"]


def test_get_markets_missing_api_key(client, monkeypatch):
    monkeypatch.setattr("services.data_gov_client.load_dotenv", lambda *args, **kwargs: None)
    monkeypatch.delenv("DATA_GOV_API_KEY", raising=False)

    response = client.get("/markets")
    assert response.status_code == 200
    data = response.json()

    assert data["available"] is False
    assert data["records"] == []
    assert data["count"] == 0
    assert data["source"] is None
    assert data["skipped_invalid"] == 0
    assert data["error"] is not None
    assert data["error"]["kind"] == "config"
    assert "DATA_GOV_API_KEY is not set" in data["error"]["message"]


def test_get_markets_query_validation(client):
    # limit must be >= 1
    res_zero = client.get("/markets", params={"limit": 0})
    assert res_zero.status_code == 422

    # limit must be <= 100
    res_too_large = client.get("/markets", params={"limit": 101})
    assert res_too_large.status_code == 422


def test_health_check_still_intact(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
