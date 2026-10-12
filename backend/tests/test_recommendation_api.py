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
        "api.recommendation.fetch_market_prices_with_fallback",
        return_value=MarketDataFetchResult(records=mock_markets, available=True),
    ):
        response = client.post("/recommend", json=_valid_payload())

    assert response.status_code == 200
    data = response.json()

    assert data["available"] is True
    assert data["error"] is None
    assert data["recommendation"] is not None
    assert data["source"] == "data.gov.in"
    assert data["using_fallback"] is False

    rec = data["recommendation"]
    assert rec["crop"] == "Tomato"
    assert rec["quantity_kg"] == 500.0
    assert rec["farmer_location"] == "Mandya"
    assert rec["recommended_market"] == "Mysore"
    assert rec["expected_gross_revenue"] == 14000.0
    assert rec["transportation_cost"] == 500.0
    assert rec["other_costs"] == 0.0
    assert rec["expected_net_return"] == 13500.0
    assert rec["loss_percentage"] is None
    assert rec["losses_provided"] is False
    assert rec["loss_data_status"] == "not_provided_zero_baseline"
    assert rec["loss_data_scope"] == "request_level"
    assert all(
        market["loss_data_status"] == "not_provided_zero_baseline"
        and market["loss_data_scope"] == "request_level"
        and market["losses_provided"] is False
        and market["loss_percentage"] is None
        for market in rec["ranked_markets"]
    )
    assert rec["market_dates"] == {
        "Bangalore": "2026-10-08",
        "Mysore": "2026-10-08",
    }


def test_recommendation_rejects_out_of_scope_state(client):
    response = client.post("/recommend", json=_valid_payload(state="Maharashtra"))

    assert response.status_code == 422
    assert "Only Karnataka market data is supported." in response.text


def test_recommendation_propagates_selected_crop_and_karnataka_scope(client):
    mock_markets = [_market("Mandya", modal_price=21, commodity="Maize")]
    captured = {}

    def fake_fetch(**kwargs):
        captured.update(kwargs)
        return MarketDataFetchResult(records=mock_markets, available=True)

    with patch("api.recommendation.fetch_market_prices_with_fallback", side_effect=fake_fetch):
        response = client.post(
            "/recommend",
            json=_valid_payload(
                crop="Maize",
                state=None,
                district="Mandya",
                transportation_costs={"Mandya": 100},
            ),
        )

    assert response.status_code == 200
    assert captured == {
        "commodity": "Maize",
        "state": "Karnataka",
        "district": None,
        "market_names": ["Mandya"],
        "limit": 20,
    }
    assert response.json()["recommendation"]["crop"] == "Maize"


def test_observation_metadata_and_staleness_survive_api_response(client):
    observation = MarketPrice(
        commodity="Tomato",
        variety="Tomato",
        state="Karnataka",
        district="Mysuru",
        market="Mysuru APMC",
        date=date(2026, 10, 1),
        observation_price_per_kg=24.0,
        price_type="market_price_lastweek_observation",
        source_provider="agmarknet.gov.in",
        source_unit="Rs./Quintal",
        source_price_value=2400.0,
        is_stale=True,
        freshness_status="stale",
    )
    fetch_result = MarketDataFetchResult(
        records=[observation],
        available=True,
        source="agmarknet.gov.in",
        using_fallback=False,
    )

    with patch(
        "api.recommendation.fetch_market_prices_with_fallback",
        return_value=fetch_result,
    ):
        response = client.post(
            "/recommend",
            json=_valid_payload(
                state="Karnataka",
                district="Mysuru",
                transportation_costs={"Mysuru APMC": 100},
            ),
        )

    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "agmarknet.gov.in"
    market = data["recommendation"]["ranked_markets"][0]
    assert market["price_type"] == "market_price_lastweek_observation"
    assert market["is_stale"] is True
    assert market["freshness_status"] == "stale"
    assert data["recommendation"]["market_dates"]["Mysuru APMC"] == "2026-10-01"


def test_optional_loss_percentage_is_returned_in_breakdown(client):
    mock_markets = [_market("Mysore", modal_price=28)]
    with patch(
        "api.recommendation.fetch_market_prices_with_fallback",
        return_value=MarketDataFetchResult(records=mock_markets, available=True),
    ):
        response = client.post(
            "/recommend",
            json=_valid_payload(loss_percentage=10),
        )

    assert response.status_code == 200
    comparison = response.json()["recommendation"]["ranked_markets"][0]
    assert comparison["estimated_loss_kg"] == 50
    assert comparison["saleable_quantity_kg"] == 450
    assert comparison["gross_revenue"] == 12600
    assert comparison["net_return"] == 12100
    assert comparison["losses_provided"] is True
    assert comparison["loss_percentage"] == 10
    assert comparison["loss_data_status"] == "provided"
    assert comparison["loss_data_scope"] == "request_level"


def test_fallback_source_and_market_dates_remain_truthful(client):
    mock_markets = [_market("Mysore", modal_price=28)]
    with patch(
        "api.recommendation.fetch_market_prices_with_fallback",
        return_value=MarketDataFetchResult(
            records=mock_markets,
            available=True,
            source="farmprofit-local-fallback",
            using_fallback=True,
        ),
    ):
        response = client.post("/recommend", json=_valid_payload())

    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "farmprofit-local-fallback"
    assert data["using_fallback"] is True
    assert data["recommendation"]["market_dates"] == {"Mysore": "2026-10-08"}


# 2. Multiple markets are passed to the recommendation engine.
def test_multiple_markets_passed_to_engine(client):
    mock_markets = [
        _market("M1", modal_price=20),
        _market("M2", modal_price=22),
        _market("M3", modal_price=24),
    ]
    with patch(
        "api.recommendation.fetch_market_prices_with_fallback",
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


def test_selected_markets_without_transport_quotes_are_incomplete(client):
    mock_markets = [
        _market("Mysore", modal_price=28),
        _market("Bangalore", modal_price=30),
    ]
    with patch(
        "api.recommendation.fetch_market_prices_with_fallback",
        return_value=MarketDataFetchResult(records=mock_markets, available=True),
    ):
        response = client.post(
            "/recommend",
            json=_valid_payload(
                selected_markets=["Mysore", "Bangalore"],
                transportation_costs={},
            ),
        )

    assert response.status_code == 200
    data = response.json()
    assert data["available"] is False
    assert data["recommendation"] is None
    assert "No comparable market has a verified transport cost" in data["error"]["message"]


def test_mysuru_origin_automatically_discovers_four_markets(client):
    markets = [
        _market("Mysuru APMC", 30),
        _market("Nanjangud APMC", 29),
        _market("Hunsur APMC", 28),
        _market("T. Narasipura APMC", 27),
    ]
    captured = {}

    def fake_fetch(**kwargs):
        captured.update(kwargs)
        return MarketDataFetchResult(records=markets, available=True)

    with patch("api.recommendation.fetch_market_prices_with_fallback", side_effect=fake_fetch):
        response = client.post(
            "/recommend",
            json=_valid_payload(
                farmer_location="Mysuru",
                district="Mysuru",
                selected_markets=[market.market for market in markets],
                transportation_costs={
                    market.market: 100 for market in markets
                },
            ),
        )

    assert response.status_code == 200
    assert captured["state"] == "Karnataka"
    assert captured["district"] is None
    assert captured["market_names"] == [market.market for market in markets]
    assert {
        market["name"]
        for market in response.json()["recommendation"]["ranked_markets"]
    } == {market.market for market in markets}


def test_selected_markets_are_filtered_without_requiring_transport_quotes(client):
    mock_markets = [
        _market("Mysore", modal_price=28),
        _market("Bangalore", modal_price=30),
    ]
    with patch(
        "api.recommendation.fetch_market_prices_with_fallback",
        return_value=MarketDataFetchResult(records=mock_markets, available=True),
    ):
        response = client.post(
            "/recommend",
            json=_valid_payload(
                selected_markets=["Mysore"],
                transportation_costs={"Mysore": 500},
                transportation_cost_basis={"Mysore": "actual_quote"},
            ),
        )

    assert response.status_code == 200
    data = response.json()
    assert data["available"] is True
    assert [market["name"] for market in data["recommendation"]["ranked_markets"]] == ["Mysore"]
    assert data["recommendation"]["ranked_markets"][0]["transport_cost_basis"] == "actual_quote"


def test_selected_catalogue_market_matches_legacy_provider_record(client):
    mock_markets = [_market("Mysore", modal_price=28)]
    with patch(
        "api.recommendation.fetch_market_prices_with_fallback",
        return_value=MarketDataFetchResult(
            records=mock_markets,
            available=True,
            source="farmprofit-local-fallback",
            using_fallback=True,
        ),
    ):
        response = client.post(
            "/recommend",
            json=_valid_payload(
                district="Mysuru",
                selected_markets=["Mysuru APMC"],
                transportation_costs={"Mysuru APMC": 500},
                transportation_cost_basis={"Mysuru APMC": "actual_quote"},
            ),
        )

    assert response.status_code == 200
    data = response.json()
    assert data["available"] is True
    market = data["recommendation"]["ranked_markets"][0]
    assert market["name"] == "Mysuru APMC"
    assert market["price_per_kg"] == 28
    assert market["transportation_cost"] == 500
    assert data["recommendation"]["market_dates"] == {"Mysuru APMC": "2026-10-08"}


def test_selected_non_origin_market_is_requested_by_name_not_origin_district(client):
    mock_markets = [_market("Hassan APMC", modal_price=25)]
    captured = {}

    def fake_fetch(**kwargs):
        captured.update(kwargs)
        return MarketDataFetchResult(records=mock_markets, available=True)

    with patch("api.recommendation.fetch_market_prices_with_fallback", side_effect=fake_fetch):
        response = client.post(
            "/recommend",
            json=_valid_payload(
                district="Mysuru",
                selected_markets=["Hassan APMC"],
                transportation_costs={"Hassan APMC": 500},
                transportation_cost_basis={"Hassan APMC": "actual_quote"},
            ),
        )

    assert response.status_code == 200
    assert captured["district"] is None
    assert captured["market_names"] == ["Hassan APMC"]
    assert response.json()["recommendation"]["ranked_markets"][0]["name"] == "Hassan APMC"


def test_legacy_transport_cost_keys_still_select_explicit_markets(client):
    mock_markets = [
        _market("Mysore", modal_price=28),
        _market("Bangalore", modal_price=30),
    ]
    with patch(
        "api.recommendation.fetch_market_prices_with_fallback",
        return_value=MarketDataFetchResult(records=mock_markets, available=True),
    ):
        response = client.post(
            "/recommend",
            json=_valid_payload(
                transportation_costs={"Mysore": 500},
            ),
        )

    assert response.status_code == 200
    assert [market["name"] for market in response.json()["recommendation"]["ranked_markets"]] == ["Mysore"]


# 3. Highest net-return market is returned (not merely highest gross price).
def test_highest_net_return_market_is_returned(client):
    # Bangalore: 500 * 30 - 3900 = 11,100 net
    # Mysore:    500 * 28 - 500  = 13,500 net
    mock_markets = [
        _market("Bangalore", modal_price=30),
        _market("Mysore", modal_price=28),
    ]
    with patch(
        "api.recommendation.fetch_market_prices_with_fallback",
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
        "api.recommendation.fetch_market_prices_with_fallback",
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
        "api.recommendation.fetch_market_prices_with_fallback",
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


def test_recommendation_api_uses_fallback_market_data(client):
    mock_markets = [
        _market("Bangalore", modal_price=30),
        _market("Mysore", modal_price=28),
    ]
    with patch(
        "api.recommendation.fetch_market_prices_with_fallback",
        return_value=MarketDataFetchResult(
            records=mock_markets,
            available=True,
            source="farmprofit-local-fallback",
            using_fallback=True,
            error_kind="service",
            error_message="Data.gov.in is unavailable: connection refused",
        ),
    ):
        response = client.post("/recommend", json=_valid_payload())

    assert response.status_code == 200
    data = response.json()
    assert data["available"] is True
    assert data["source"] == "farmprofit-local-fallback"
    assert data["using_fallback"] is True
    assert data["recommendation"]["recommended_market"] == "Mysore"
    assert data["recommendation"]["expected_net_return"] == 13500.0


# 9. Response contains the explanation and ranked alternatives.
def test_response_contains_explanation_and_ranked_alternatives(client):
    mock_markets = [
        _market("Bangalore", modal_price=30),
        _market("Mysore", modal_price=28),
    ]
    with patch(
        "api.recommendation.fetch_market_prices_with_fallback",
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
