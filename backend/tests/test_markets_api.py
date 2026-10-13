import json
from urllib.error import URLError

import pytest
from fastapi.testclient import TestClient

from main import app
from models.market_models import MarketPrice, MarketsResponse
from services.data_gov_client import MarketDataFetchResult
from models.market_models import MarketCommodityOption, MarketFilterOption
from unittest.mock import patch


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


def test_get_markets_rejects_out_of_scope_state(client, monkeypatch):
    captured = {}

    def fake_urlopen(request, timeout=None):
        captured["url"] = request.full_url
        return _FakeResponse(_ok_payload([_api_record()]))

    monkeypatch.setattr("services.data_gov_client.urlopen", fake_urlopen)
    monkeypatch.setattr(
        "services.agmarknet_client.try_fetch_market_prices",
        lambda **_kwargs: MarketDataFetchResult(
            records=[],
            available=False,
            source=None,
            error_kind="service",
            error_message="Agmarknet unavailable",
        ),
    )

    response = client.get(
        "/markets",
        params={"commodity": "Tomato", "state": "Maharashtra", "district": "Nashik", "limit": 5},
        headers={"X-Data-Gov-Api-Key": "test-key"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Only Karnataka market data is supported."


def test_get_market_filters_returns_states_and_related_districts(client, monkeypatch):
    monkeypatch.setattr(
        "api.markets.fetch_filter_metadata",
        lambda: (
            [
                MarketFilterOption(id=16, name="Karnataka"),
                MarketFilterOption(id=27, name="Maharashtra"),
            ],
            [
                MarketFilterOption(id=263, name="Mysuru", state_id=16),
                MarketFilterOption(id=99, name="Nashik", state_id=27),
            ],
            [
                MarketCommodityOption(id=65, name="Tomato"),
                MarketCommodityOption(id=23, name="Onion"),
            ],
        ),
    )

    response = client.get("/market-filters")

    assert response.status_code == 200
    assert response.json() == {
        "available": True,
        "states": [{"id": 16, "name": "Karnataka", "state_id": None}],
        "districts": [{"id": 263, "name": "Mysuru", "state_id": 16}],
        "commodities": [{"id": 65, "name": "Tomato"}, {"id": 23, "name": "Onion"}],
        "locations": [
            {
                "name": "Mandya",
                "state": "Karnataka",
                "district": "Mandya",
                "source": "OpenStreetMap city-centre coordinate, curated for prototype routing",
            },
            {
                "name": "Mysore",
                "state": "Karnataka",
                "district": "Mysuru",
                "source": "OpenStreetMap city-centre coordinate, curated for prototype routing",
            },
            {
                "name": "Mysuru",
                "state": "Karnataka",
                "district": "Mysuru",
                "source": "OpenStreetMap city-centre coordinate, curated for prototype routing",
            },
        ],
        "error": None,
    }


def test_market_filters_endpoint_is_registered_in_openapi(client, monkeypatch):
    monkeypatch.setattr(
        "api.markets.fetch_filter_metadata",
        lambda: ([], [], []),
    )

    assert "/market-filters" in app.openapi()["paths"]
    response = client.get("/market-filters")
    assert response.status_code == 200


def test_get_market_filters_returns_retryable_error(client, monkeypatch):
    from services.agmarknet_client import AgmarknetServiceError

    monkeypatch.setattr(
        "api.markets.fetch_filter_metadata",
        lambda: (_ for _ in ()).throw(AgmarknetServiceError("Agmarknet unavailable")),
    )

    response = client.get("/market-filters")

    assert response.status_code == 200
    assert response.json()["available"] is False
    assert response.json()["states"] == []
    assert response.json()["districts"] == []
    assert response.json()["commodities"] == []
    assert response.json()["error"] == {
        "kind": "service",
        "message": "Agmarknet unavailable",
    }


def test_get_markets_forwards_geographic_filters_to_agmarknet(client, monkeypatch):
    captured = {}

    def fake_agmarknet(**kwargs):
        captured.update(kwargs)
        return MarketDataFetchResult(
            records=[],
            available=False,
            source=None,
            error_kind="service",
            error_message="No mocked live records",
        )

    monkeypatch.setattr(
        "services.agmarknet_client.try_fetch_market_prices",
        fake_agmarknet,
    )
    monkeypatch.setattr(
        "services.data_gov_client.try_fetch_market_prices",
        lambda **_kwargs: MarketDataFetchResult(records=[], available=False),
    )

    response = client.get(
        "/markets",
        params={
            "commodity": "Tomato",
            "state": "Karnataka",
            "district": "Mysuru",
            "limit": 15,
        },
    )

    assert response.status_code == 200
    assert captured == {
        "limit": 15,
        "commodity": "Tomato",
        "state": "Karnataka",
        "district": "Mysuru",
        "market_names": None,
    }


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

    assert data["available"] is True
    assert data["records"]
    assert data["count"] > 0
    assert data["source"] == "farmprofit-local-fallback"
    assert data["skipped_invalid"] == 0
    assert data["error"] is None


def test_get_markets_missing_api_key(client, monkeypatch):
    monkeypatch.setattr("services.data_gov_client.load_dotenv", lambda *args, **kwargs: None)
    monkeypatch.delenv("DATA_GOV_API_KEY", raising=False)

    response = client.get("/markets")
    assert response.status_code == 200
    data = response.json()

    assert data["available"] is True
    assert data["records"]
    assert data["count"] > 0
    assert data["source"] == "farmprofit-local-fallback"
    assert data["skipped_invalid"] == 0
    assert data["error"] is None


def test_get_markets_query_validation(client):
    # limit must be >= 1
    res_zero = client.get("/markets", params={"limit": 0})
    assert res_zero.status_code == 422

    # limit must be <= 500 (raised from 100 to allow full state-wide Karnataka queries)
    res_too_large = client.get("/markets", params={"limit": 501})
    assert res_too_large.status_code == 422


def test_health_check_still_intact(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_market_catalogue_contains_curated_karnataka_identities_and_price_flags(client):
    observed = _api_record(
        state="Karnataka",
        district="Mysuru",
        market="Mysuru APMC",
    )
    observed["date"] = "2026-10-08"
    with patch(
        "api.markets.fetch_market_prices_with_fallback",
        return_value=MarketDataFetchResult(
            records=[MarketPrice.model_validate(observed)],
            source="farmprofit-local-fallback",
            available=True,
            using_fallback=True,
        ),
    ):
        response = client.get("/market-catalogue", params={"commodity": "Tomato"})

    assert response.status_code == 200
    data = response.json()
    assert len(data["entries"]) >= 25
    assert {entry["name"] for entry in data["entries"]} >= {
        "Mysuru APMC",
        "Nanjangud APMC",
        "Hunsur APMC",
        "T. Narasipura APMC",
        "Mandya APMC",
        "Bengaluru APMC",
        "Hassan APMC",
    }
    assert next(
        entry for entry in data["entries"] if entry["name"] == "Mysuru APMC"
    )["price_available"] is True
    assert next(
        entry for entry in data["entries"] if entry["name"] == "Nanjangud APMC"
    )["price_available"] is False


def test_market_catalogue_endpoint_is_registered_in_openapi(client):
    assert "/market-catalogue" in app.openapi()["paths"]

    with patch(
        "api.markets.fetch_market_prices_with_fallback",
        return_value=MarketDataFetchResult(records=[], available=False),
    ):
        response = client.get("/market-catalogue")

    assert response.status_code == 200
    assert response.json()["available"] is True
    assert len(response.json()["entries"]) >= 25


def test_market_catalogue_matches_legacy_provider_names_by_crop_and_district(client):
    observed = MarketPrice(
        commodity="Tomato",
        variety="Local",
        state="Karnataka",
        district="Mysore",
        market="Mysore",
        date="2026-10-08",
        min_price=26.0,
        modal_price=28.0,
        max_price=30.0,
    )
    captured = {}

    def fake_fetch(**kwargs):
        captured.update(kwargs)
        return MarketDataFetchResult(
            records=[observed],
            source="farmprofit-local-fallback",
            available=True,
            using_fallback=True,
        )

    with patch("api.markets.fetch_market_prices_with_fallback", side_effect=fake_fetch):
        response = client.get(
            "/market-catalogue",
            params={"commodity": "Tomato", "district": "Mysuru"},
        )

    assert response.status_code == 200
    assert captured == {
        "limit": 100,
        "commodity": "Tomato",
        "state": "Karnataka",
        "district": "Mysuru",
    }
    data = response.json()
    assert next(
        entry for entry in data["entries"] if entry["name"] == "Mysuru APMC"
    )["price_available"] is True
    assert next(
        entry for entry in data["entries"] if entry["name"] == "Hunsur APMC"
    )["price_available"] is False


def test_get_markets_state_wide_karnataka(client, monkeypatch):
    observed = MarketPrice(
        commodity="Tomato",
        variety="Local",
        state="Karnataka",
        district="Kolar",
        market="Kolar APMC",
        date="2026-10-10",
        min_price=20.0,
        modal_price=24.0,
        max_price=28.0,
        source_provider="agmarknet.gov.in",
    )
    monkeypatch.setattr(
        "api.markets.fetch_market_prices_with_fallback",
        lambda **kwargs: MarketDataFetchResult(
            records=[observed],
            source="agmarknet.gov.in",
            available=True,
            using_fallback=False,
        ),
    )

    response = client.get("/markets", params={"commodity": "Tomato", "state": "Karnataka", "limit": 20})
    assert response.status_code == 200
    data = response.json()
    assert data["available"] is True
    assert data["count"] == 1
    assert data["source"] == "agmarknet.gov.in"
    assert data["using_fallback"] is False
    assert data["records"][0]["market"] == "Kolar APMC"
    assert data["records"][0]["district"] == "Kolar"


from datetime import datetime, timezone
import db


def _seed_test_crops():
    records = [
        MarketPrice(
            commodity="Tomato",
            variety="Local",
            state="Karnataka",
            district="Kolar",
            market="Kolar APMC",
            date="2026-10-10",
            min_price=20.0,
            modal_price=24.0,
            max_price=28.0,
            source_provider="agmarknet.gov.in",
        ),
        MarketPrice(
            commodity="Tomato",
            variety="Hybrid",
            state="Karnataka",
            district="Bengaluru",
            market="Bengaluru APMC",
            date="2026-10-10",
            min_price=22.0,
            modal_price=25.0,
            max_price=30.0,
            source_provider="agmarknet.gov.in",
        ),
        MarketPrice(
            commodity="Onion",
            variety="Nasik",
            state="Karnataka",
            district="Hubballi",
            market="Hubballi APMC",
            date="2026-10-10",
            min_price=18.0,
            modal_price=20.0,
            max_price=22.0,
            source_provider="agmarknet.gov.in",
        ),
    ]
    now = datetime.now(timezone.utc)
    for r in records:
        db.upsert_observation(r, retrieved_at=now, provider="agmarknet.gov.in")


def test_get_distinct_crops_endpoint(client):
    """GET /crops returns distinct supported crops from the database catalogue."""
    _seed_test_crops()
    response = client.get("/crops")
    assert response.status_code == 200
    data = response.json()
    assert "crops" in data
    assert "count" in data
    assert data["count"] == 2
    assert "Tomato" in data["crops"]
    assert "Onion" in data["crops"]
    # Verify no duplicates
    assert len(data["crops"]) == len(set(data["crops"]))


def test_get_crop_varieties_endpoint(client):
    """GET /crops/{crop}/varieties returns distinct varieties for a supported crop."""
    _seed_test_crops()
    response = client.get("/crops/Tomato/varieties")
    assert response.status_code == 200
    data = response.json()
    assert data["crop"] == "Tomato"
    assert "varieties" in data
    assert "count" in data
    assert data["count"] == 2
    assert set(data["varieties"]) == {"Hybrid", "Local"}


def test_get_crop_varieties_case_insensitive(client):
    """GET /crops/{crop}/varieties matches crop case-insensitively."""
    _seed_test_crops()
    response = client.get("/crops/tomato/varieties")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 2
    assert set(data["varieties"]) == {"Hybrid", "Local"}


def test_get_crop_varieties_empty_for_unknown(client):
    """GET /crops/{crop}/varieties gracefully returns empty list for unknown crop."""
    _seed_test_crops()
    response = client.get("/crops/NonExistentCropXYZ/varieties")
    assert response.status_code == 200
    data = response.json()
    assert data["crop"] == "NonExistentCropXYZ"
    assert data["varieties"] == []
    assert data["count"] == 0


def test_actual_db_catalogue(monkeypatch):
    """Verify that the actual database used by running app contains valid crops and varieties."""
    if db._DEFAULT_DB_PATH.exists():
        monkeypatch.setenv("BACKEND_DB_PATH", str(db._DEFAULT_DB_PATH))
        crops = db.get_distinct_crops()
        assert len(crops) >= 7
        assert "Tomato" in crops
        assert "Onion" in crops
        assert "Potato" in crops
        assert "Maize" in crops
        tomato_varieties = db.get_varieties_for_crop("Tomato")
        assert len(tomato_varieties) >= 2




