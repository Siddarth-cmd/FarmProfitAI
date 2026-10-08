from datetime import date
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from main import app
from models.market_models import MarketPrice
from services.data_gov_client import MarketDataFetchResult


@pytest.fixture
def client():
    return TestClient(app)


def _market(
    name: str,
    modal_price: float,
    commodity: str = "Tomato",
) -> MarketPrice:
    return MarketPrice(
        commodity=commodity,
        variety="Local",
        state="Karnataka",
        district=name,
        market=name,
        date=date(2026, 10, 8),
        min_price=modal_price - 2,
        modal_price=modal_price,
        max_price=modal_price + 2,
    )


def _valid_payload(**overrides) -> dict:
    payload = {
        "crop": "Tomato",
        "quantity_kg": 500,
        "farmer_location": "Mandya",
        "transportation_costs": {
            "Mysore": 500,
            "Bangalore": 3900,
        },
        "other_costs": 0,
    }
    payload.update(overrides)
    return payload


# 1. Successful recommendation.
def test_successful_recommendation(client):
    mock_markets = [
        _market("Bangalore", modal_price=30),
        _market("Mysore", modal_price=28),
    ]
    with patch(
        "api.recommendation.try_fetch_market_prices",
        return_value=MarketDataFetchResult(records=mock_markets, available=True),
    ):
        response = client.post("/recommend", json=_valid_payload())

    assert response.status_code == 200
    data = response.json()

    assert data["available"] is True
    assert data["error"] is None
    assert data["recommendation"] is not None

    rec = data["recommendation"]
    assert rec["crop"] == "Tomato"
    assert rec["quantity_kg"] == 500.0
    assert rec["farmer_location"] == "Mandya"
    assert rec["recommended_market"] == "Mysore"
    assert rec["expected_gross_revenue"] == 14000.0
    assert rec["transportation_cost"] == 500.0
    assert rec["other_costs"] == 0.0
    assert rec["expected_net_return"] == 13500.0


# 2. Multiple markets are passed to the recommendation engine.
def test_multiple_markets_passed_to_engine(client):
    mock_markets = [
        _market("M1", modal_price=20),
        _market("M2", modal_price=22),
        _market("M3", modal_price=24),
    ]
    with patch(
        "api.recommendation.try_fetch_market_prices",
        return_value=MarketDataFetchResult(records=mock_markets, available=True),
    ):
        response = client.post(
            "/recommend",
            json=_valid_payload(
                transportation_costs={"M1": 100, "M2": 200, "M3": 300}
            ),
        )

    assert response.status_code == 200
    data = response.json()
    assert data["available"] is True
    rec = data["recommendation"]
    assert len(rec["ranked_markets"]) == 3
    assert len(rec["alternatives"]) == 2


# 3. Highest net-return market is returned (not merely highest gross price).
def test_highest_net_return_market_is_returned(client):
    # Bangalore: 500 * 30 - 3900 = 11,100 net
    # Mysore:    500 * 28 - 500  = 13,500 net
    mock_markets = [
        _market("Bangalore", modal_price=30),
        _market("Mysore", modal_price=28),
    ]
    with patch(
        "api.recommendation.try_fetch_market_prices",
        return_value=MarketDataFetchResult(records=mock_markets, available=True),
    ):
        response = client.post("/recommend", json=_valid_payload())

    assert response.status_code == 200
    data = response.json()
    assert data["available"] is True
    rec = data["recommendation"]
    assert rec["recommended_market"] == "Mysore"
    assert rec["expected_net_return"] == 13500.0


# 4. Invalid quantity is rejected.
def test_invalid_quantity_is_rejected(client):
    res_zero = client.post("/recommend", json=_valid_payload(quantity_kg=0))
    assert res_zero.status_code == 422

    res_negative = client.post("/recommend", json=_valid_payload(quantity_kg=-50))
    assert res_negative.status_code == 422


# 5. Negative transportation cost is rejected.
def test_negative_transportation_cost_is_rejected(client):
    response = client.post(
        "/recommend",
        json=_valid_payload(transportation_costs={"Mysore": -100}),
    )
    assert response.status_code == 422


# 6. Negative other costs are rejected.
def test_negative_other_costs_are_rejected(client):
    res_flat = client.post("/recommend", json=_valid_payload(other_costs=-10))
    assert res_flat.status_code == 422

    res_dict = client.post(
        "/recommend", json=_valid_payload(other_costs={"Mysore": -20})
    )
    assert res_dict.status_code == 422


# 7. Empty market data is handled safely.
def test_empty_market_data_handled_safely(client):
    with patch(
        "api.recommendation.try_fetch_market_prices",
        return_value=MarketDataFetchResult(records=[], available=True),
    ):
        response = client.post("/recommend", json=_valid_payload())

    assert response.status_code == 200
    data = response.json()
    assert data["available"] is False
    assert data["recommendation"] is None
    assert data["error"] is not None
    assert data["error"]["kind"] == "data"
    assert "No usable market records found" in data["error"]["message"]


# 8. Data.gov.in failure is handled safely with structured application state.
def test_data_gov_failure_handled_safely(client):
    with patch(
        "api.recommendation.try_fetch_market_prices",
        return_value=MarketDataFetchResult(
            records=[],
            available=False,
            error_kind="service",
            error_message="Network connection timeout",
        ),
    ):
        response = client.post("/recommend", json=_valid_payload())

    assert response.status_code == 200
    data = response.json()
    assert data["available"] is False
    assert data["recommendation"] is None
    assert data["error"] is not None
    assert data["error"]["kind"] == "service"
    assert "Network connection timeout" in data["error"]["message"]


# 9. Response contains the explanation and ranked alternatives.
def test_response_contains_explanation_and_ranked_alternatives(client):
    mock_markets = [
        _market("Bangalore", modal_price=30),
        _market("Mysore", modal_price=28),
    ]
    with patch(
        "api.recommendation.try_fetch_market_prices",
        return_value=MarketDataFetchResult(records=mock_markets, available=True),
    ):
        response = client.post("/recommend", json=_valid_payload())

    assert response.status_code == 200
    data = response.json()
    assert data["available"] is True
    rec = data["recommendation"]

    assert rec["explanation"] != ""
    assert "Mysore" in rec["explanation"]
    assert "Bangalore" in rec["explanation"]

    assert len(rec["alternatives"]) == 1
    runner_up = rec["alternatives"][0]
    assert runner_up["name"] == "Bangalore"
    assert runner_up["rank"] == 2
    assert runner_up["net_return"] == 11100.0


# 10. Blank crop or farmer_location is rejected.
def test_blank_crop_or_location_rejected(client):
    res_crop = client.post("/recommend", json=_valid_payload(crop="   "))
    assert res_crop.status_code == 422

    res_loc = client.post("/recommend", json=_valid_payload(farmer_location="   "))
    assert res_loc.status_code == 422


# 11. Explicit candidate markets passed in request body.
def test_explicit_markets_passed_in_request(client):
    explicit_markets = [
        {
            "commodity": "Tomato",
            "variety": "Local",
            "state": "Karnataka",
            "district": "Bangalore",
            "market": "Bangalore",
            "date": "2026-10-08",
            "min_price": 28.0,
            "modal_price": 30.0,
            "max_price": 32.0,
        },
        {
            "commodity": "Tomato",
            "variety": "Local",
            "state": "Karnataka",
            "district": "Mysore",
            "market": "Mysore",
            "date": "2026-10-08",
            "min_price": 26.0,
            "modal_price": 28.0,
            "max_price": 30.0,
        },
    ]

    response = client.post(
        "/recommend",
        json=_valid_payload(markets=explicit_markets),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["available"] is True
    assert data["recommendation"] is not None
    assert data["recommendation"]["recommended_market"] == "Mysore"
    assert data["recommendation"]["expected_net_return"] == 13500.0
