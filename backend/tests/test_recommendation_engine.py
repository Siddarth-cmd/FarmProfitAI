from datetime import date

import pytest
from pydantic import ValidationError

from models.market_models import MarketPrice
from recommendation.recommendation_engine import (
    DictTransportationCostProvider,
    FlatRateTransportationCostProvider,
    RecommendationEngine,
    TransportationCostProvider,
    recommend_market,
)


def _market(
    name: str,
    modal_price: float,
    min_price: float | None = None,
    max_price: float | None = None,
    commodity: str = "Tomato",
    arrival_date: str = "2026-10-08",
) -> MarketPrice:
    return MarketPrice(
        commodity=commodity,
        variety="Local",
        state="Karnataka",
        district=name,
        market=name,
        date=date.fromisoformat(arrival_date),
        min_price=min_price if min_price is not None else modal_price - 2,
        modal_price=modal_price,
        max_price=max_price if max_price is not None else modal_price + 2,
    )


# 1. Highest net return is selected.
def test_highest_net_return_is_selected():
    # Mandi A: 100 kg * 25 = 2500 gross; transport = 200; net = 2300
    # Mandi B: 100 kg * 22 = 2200 gross; transport = 100; net = 2100
    markets = [_market("Mandi A", modal_price=25), _market("Mandi B", modal_price=22)]
    transport_costs = {"Mandi A": 200.0, "Mandi B": 100.0}

    result = recommend_market(
        crop="Tomato",
        quantity_kg=100,
        farmer_location="Hassan",
        markets=markets,
        transportation_costs=transport_costs,
    )

    assert result.recommended_market == "Mandi A"
    assert result.expected_gross_revenue == 2500.0
    assert result.transportation_cost == 200.0
    assert result.expected_net_return == 2300.0


# 2. Highest price is NOT necessarily selected when transport cost is considered.
def test_highest_price_not_necessarily_selected_when_transport_higher():
    # Scenario matching the farmer example:
    # Bangalore: 500 kg * 30/kg = 15,000 gross. Transport = 3,900. Net = 11,100.
    # Mysore:    500 kg * 28/kg = 14,000 gross. Transport = 500.   Net = 13,500.
    # Advantage for Mysore = 13,500 - 11,100 = 2,400.
    markets = [
        _market("Bangalore", modal_price=30),
        _market("Mysore", modal_price=28),
    ]
    transport = {"Bangalore": 3900.0, "Mysore": 500.0}

    result = recommend_market(
        crop="Tomato",
        quantity_kg=500,
        farmer_location="Mandya",
        markets=markets,
        transportation_costs=transport,
    )

    assert result.recommended_market == "Mysore"
    assert result.expected_gross_revenue == 14000.0
    assert result.transportation_cost == 500.0
    assert result.expected_net_return == 13500.0
    # Mysore has lower price (28 vs 30) but wins on net return due to transportation
    assert "Mysore" in result.explanation
    assert "Bangalore" in result.explanation
    assert "2,400" in result.explanation or "2400" in result.explanation


# 3. Multiple markets are ranked correctly.
def test_multiple_markets_ranked_correctly():
    # 100 kg
    # M1: 20/kg, trans 100 -> net = 1900 (rank 1)
    # M2: 22/kg, trans 400 -> net = 1800 (rank 2)
    # M3: 18/kg, trans 150 -> net = 1650 (rank 3)
    markets = [
        _market("Market 2", modal_price=22),
        _market("Market 3", modal_price=18),
        _market("Market 1", modal_price=20),
    ]
    transport = {"Market 1": 100.0, "Market 2": 400.0, "Market 3": 150.0}

    result = recommend_market(
        crop="Tomato",
        quantity_kg=100,
        farmer_location="Nashik",
        markets=markets,
        transportation_costs=transport,
    )

    assert result.recommended_market == "Market 1"
    assert [m.name for m in result.ranked_markets] == ["Market 1", "Market 2", "Market 3"]
    assert [m.rank for m in result.ranked_markets] == [1, 2, 3]
    assert [m.net_return for m in result.ranked_markets] == [1900.0, 1800.0, 1650.0]


# 4. Explanation identifies the recommended market.
def test_explanation_identifies_recommended_market():
    markets = [_market("Mysore", modal_price=25)]
    result = recommend_market(
        crop="Tomato",
        quantity_kg=200,
        farmer_location="Nanjangud",
        markets=markets,
        transportation_costs={"Mysore": 300.0},
    )

    assert result.recommended_market == "Mysore"
    assert "Mysore" in result.explanation
    assert "recommended" in result.explanation.lower()


# 5. Empty market list is handled safely.
def test_empty_market_list_handled_safely():
    result = recommend_market(
        crop="Tomato",
        quantity_kg=100,
        farmer_location="Pune",
        markets=[],
    )

    assert result.recommended_market is None
    assert result.expected_gross_revenue == 0.0
    assert result.expected_net_return == 0.0
    assert result.ranked_markets == []
    assert result.alternatives == []
    assert "No market" in result.explanation


# 6. Invalid quantity is rejected.
def test_invalid_quantity_is_rejected():
    markets = [_market("Market A", modal_price=20)]

    with pytest.raises(ValueError, match="greater than zero"):
        recommend_market(
            crop="Tomato",
            quantity_kg=0,
            farmer_location="Pune",
            markets=markets,
        )

    with pytest.raises(ValueError, match="greater than zero"):
        recommend_market(
            crop="Tomato",
            quantity_kg=-50,
            farmer_location="Pune",
            markets=markets,
        )


# 7. Zero transportation cost works.
def test_zero_transportation_cost_works():
    # With 0 transport cost, the market with higher price always wins
    markets = [
        _market("Market Low", modal_price=15),
        _market("Market High", modal_price=25),
    ]

    result = recommend_market(
        crop="Tomato",
        quantity_kg=100,
        farmer_location="Pune",
        markets=markets,
        transportation_costs=0.0,
    )

    assert result.recommended_market == "Market High"
    assert result.transportation_cost == 0.0
    assert result.expected_gross_revenue == 2500.0
    assert result.expected_net_return == 2500.0


# 8. Alternative markets are included in the result.
def test_alternative_markets_included_in_result():
    markets = [
        _market("M1", modal_price=20),
        _market("M2", modal_price=22),
        _market("M3", modal_price=24),
    ]
    transport = {"M1": 50.0, "M2": 100.0, "M3": 200.0}

    result = recommend_market(
        crop="Tomato",
        quantity_kg=100,
        farmer_location="Pune",
        markets=markets,
        transportation_costs=transport,
    )

    # Rank 1 is recommended
    assert result.recommended_market == result.ranked_markets[0].name
    # alternatives should contain the remaining 2 markets
    assert len(result.alternatives) == 2
    assert [m.name for m in result.alternatives] == [
        result.ranked_markets[1].name,
        result.ranked_markets[2].name,
    ]
    assert [m.rank for m in result.alternatives] == [2, 3]


# Additional tests: invalid market price handling, custom provider, and stateful engine
def test_invalid_market_prices_handled_safely():
    # Pass a valid market along with invalid dicts/records
    valid_record = _market("Valid Mandi", modal_price=20)
    invalid_record = {"market": "Bad Mandi", "modal_price": -50}  # negative price
    not_a_market = "not a valid structure"

    result = recommend_market(
        crop="Tomato",
        quantity_kg=50,
        farmer_location="Nashik",
        markets=[valid_record, invalid_record, not_a_market],  # type: ignore
        transportation_costs=100.0,
    )

    assert result.recommended_market == "Valid Mandi"
    assert len(result.ranked_markets) == 1
    assert result.expected_net_return == 900.0


def test_custom_transportation_cost_provider():
    class CustomProvider:
        def get_transportation_cost(
            self,
            farmer_location: str,
            market_name: str,
            quantity_kg: float,
        ) -> float:
            return 150.0

    provider = CustomProvider()
    assert isinstance(provider, TransportationCostProvider)

    result = recommend_market(
        crop="Tomato",
        quantity_kg=100,
        farmer_location="Village A",
        markets=[_market("City B", modal_price=20)],
        transportation_cost_provider=provider,
    )

    assert result.recommended_market == "City B"
    assert result.transportation_cost == 150.0
    assert result.expected_net_return == 1850.0


def test_stateful_recommendation_engine():
    provider = DictTransportationCostProvider({"Kolar": 400.0, "Chikkaballapur": 200.0})
    engine = RecommendationEngine(transportation_cost_provider=provider)

    markets = [
        _market("Kolar", modal_price=30),
        _market("Chikkaballapur", modal_price=25),
    ]

    result = engine.recommend(
        crop="Tomato",
        quantity_kg=100,
        farmer_location="Bangalore Rural",
        markets=markets,
    )

    assert result.recommended_market == "Kolar"
    assert result.expected_net_return == 2600.0


def test_blank_crop_or_location_rejected():
    markets = [_market("M1", modal_price=20)]
    with pytest.raises(ValueError, match="crop must not be blank"):
        recommend_market(crop="   ", quantity_kg=100, farmer_location="Pune", markets=markets)

    with pytest.raises(ValueError, match="farmer_location must not be blank"):
        recommend_market(crop="Tomato", quantity_kg=100, farmer_location="   ", markets=markets)
