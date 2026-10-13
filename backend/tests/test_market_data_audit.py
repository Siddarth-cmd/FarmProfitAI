from datetime import date
import pytest
from services.agmarknet_client import (
    _COMMODITY_ALIASES,
    _resolve_commodity_row,
    _filter_ids,
    _filter_payload,
)
from services.market_data_service import _deduplicate_by_market
from main import app
from fastapi.testclient import TestClient
from models.market_models import MarketPrice

@pytest.fixture
def client():
    return TestClient(app)


def _sample_price(commodity: str, market: str, district: str, day: int) -> MarketPrice:
    return MarketPrice(
        commodity=commodity,
        variety="Local",
        state="Karnataka",
        district=district,
        market=market,
        date=date(2026, 10, day),
        observation_price_per_kg=25.0,
        price_type="market_price_lastweek_observation",
        source_provider="agmarknet.gov.in",
    )


def test_commodity_alias_resolution():
    sample_cmdt = [
        {"cmdt_id": 65, "cmdt_name": "Tomato"},
        {"cmdt_id": 30, "cmdt_name": "Ragi(Finger Millet)"},
        {"cmdt_id": 6, "cmdt_name": "Bengal Gram(Gram)(Whole)"},
        {"cmdt_id": 73, "cmdt_name": "Green Chilli"},
        {"cmdt_id": 4, "cmdt_name": "Maize"},
        {"cmdt_id": 23, "cmdt_name": "Onion"},
        {"cmdt_id": 24, "cmdt_name": "Potato"},
    ]

    # Test exact
    r_tomato = _resolve_commodity_row(sample_cmdt, "Tomato")
    assert r_tomato is not None
    assert r_tomato["cmdt_id"] == 65

    # Test Ragi alias / parenthesis stripping
    r_ragi = _resolve_commodity_row(sample_cmdt, "Ragi")
    assert r_ragi is not None
    assert r_ragi["cmdt_id"] == 30

    # Test Bengal Gram alias
    r_bg = _resolve_commodity_row(sample_cmdt, "Bengal Gram")
    assert r_bg is not None
    assert r_bg["cmdt_id"] == 6

    # Test Chana alias
    r_chana = _resolve_commodity_row(sample_cmdt, "Chana")
    assert r_chana is not None
    assert r_chana["cmdt_id"] == 6

    # Test Chilli alias
    r_chilli = _resolve_commodity_row(sample_cmdt, "Chilli")
    assert r_chilli is not None
    assert r_chilli["cmdt_id"] == 73


def test_ramanagar_district_resolves_apmc_markets():
    payload = _filter_payload()
    state_id, cmdt_id, markets, district_names = _filter_ids(
        payload,
        commodity="Tomato",
        state="Karnataka",
        district="Ramanagar",
    )

    assert state_id == 16
    assert cmdt_id == 65
    assert len(markets) >= 1
    mkt_names = [m.get("mkt_name") for m in markets]
    assert any("Ramanagara" in name or "Channapatna" in name for name in mkt_names)


def test_deduplicate_by_market_keeps_latest_observation_per_market():
    records = [
        _sample_price("Tomato", "Kolar APMC", "Kolar", 5),
        _sample_price("Tomato", "Kolar APMC", "Kolar", 10),
        _sample_price("Tomato", "Kolar APMC", "Kolar", 8),
        _sample_price("Tomato", "Bagepalli APMC", "Chikkaballapur", 9),
        _sample_price("Tomato", "Bagepalli APMC", "Chikkaballapur", 11),
    ]

    deduped = _deduplicate_by_market(records)
    assert len(deduped) == 2
    # Bagepalli date should be 11, Kolar should be 10
    kolar = next(r for r in deduped if r.market == "Kolar APMC")
    bagepalli = next(r for r in deduped if r.market == "Bagepalli APMC")
    assert kolar.date == date(2026, 10, 10)
    assert bagepalli.date == date(2026, 10, 11)


def test_available_markets_endpoint_structure(client):
    response = client.get("/forecast/available-markets?commodity=Tomato")
    assert response.status_code == 200
    data = response.json()
    assert "available" in data
    assert "markets" in data
    assert "total" in data
    assert data["commodity"] == "Tomato"
    if data["available"]:
        assert len(data["markets"]) == data["total"]
        sample = data["markets"][0]
        assert "market" in sample
        assert "district" in sample
        assert "observation_count" in sample
        assert sample["observation_count"] >= 1
