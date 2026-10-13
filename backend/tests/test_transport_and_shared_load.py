from datetime import date
import pytest
from fastapi.testclient import TestClient

from core.logistics import (
    LogisticsConfig,
    calculate_dedicated_vehicle_transport,
    calculate_shared_load_transport,
)
from main import app
from models.market_models import MarketPrice
from recommendation.recommendation_engine import recommend_market
from services.distance_provider import DistanceResult, MappingDistanceProvider


def _market(
    name: str,
    modal_price: float,
    district: str = "Mandya",
    commodity: str = "Tomato",
) -> MarketPrice:
    return MarketPrice(
        commodity=commodity,
        variety="Local",
        state="Karnataka",
        district=district,
        market=name,
        date=date(2026, 10, 10),
        min_price=modal_price - 2,
        modal_price=modal_price,
        max_price=modal_price + 2,
    )


# 1. Shared-load cost per kilogram (distance-based)
def test_shared_load_distance_based_per_kg_default_estimate():
    """Formula: Quantity (kg) * Rate (₹/kg/km) * Road Distance (km).
    500 kg * 80 km * ₹0.03/kg/km = ₹1,200.
    """
    config = LogisticsConfig(
        transport_mode="shared_load",
        shared_rate_type="per_kg_per_km",
        shared_pricing_basis="distance_based",
        shared_rate_per_kg_per_km=0.03,
        rate_is_illustrative=True,
    )
    cost, rate, unit, is_estimate, err = calculate_shared_load_transport(500, 80, config)
    assert cost == 1200.0
    assert rate == 0.03
    assert unit == "₹/kg/km"
    assert is_estimate is True
    assert err is None


def test_shared_load_distance_based_per_kg_custom_rate():
    """User provides ₹0.04/kg/km rate."""
    config = LogisticsConfig(
        transport_mode="shared_load",
        shared_rate_type="per_kg_per_km",
        shared_pricing_basis="distance_based",
        shared_rate_per_kg_per_km=0.04,
        rate_is_illustrative=False,
    )
    cost, rate, unit, is_estimate, err = calculate_shared_load_transport(500, 80, config)
    assert cost == 1600.0
    assert rate == 0.04
    assert is_estimate is False


# 2. Shared-load cost per crate (distance-based and fixed trip)
def test_shared_load_cost_per_crate_distance_based():
    """User enters ₹0.75/crate/km. Standard crate = 25 kg.
    Equivalent per-kg rate = 0.75 / 25 = 0.03 ₹/kg/km.
    Cost for 500 kg over 80 km = 500 * (0.75 / 25) * 80 = ₹1,200.
    """
    config = LogisticsConfig(
        transport_mode="shared_load",
        shared_rate_type="per_crate",
        shared_pricing_basis="distance_based",
        shared_rate=0.75,
        crate_capacity_kg=25.0,
    )
    cost, rate, unit, is_estimate, err = calculate_shared_load_transport(500, 80, config)
    assert cost == 1200.0
    assert rate == 0.75
    assert unit == "₹/crate/km"
    assert is_estimate is False


def test_shared_load_cost_per_crate_fixed_trip():
    """Fixed price per crate that already represents the full trip:
    500 kg produce in 25 kg crates = 20 crates.
    At ₹30/crate flat for the trip: cost = 20 * 30 = ₹600.
    Must NOT multiply by distance again.
    """
    config = LogisticsConfig(
        transport_mode="shared_load",
        shared_rate_type="per_crate",
        shared_pricing_basis="fixed_trip",
        shared_rate=30.0,
        crate_capacity_kg=25.0,
    )
    cost, rate, unit, is_estimate, err = calculate_shared_load_transport(500, 80, config)
    assert cost == 600.0
    assert rate == 30.0
    assert unit == "₹/crate"
    assert is_estimate is False


# 3. Shared-load cost per bag (distance-based and fixed trip)
def test_shared_load_cost_per_bag_distance_based():
    """User enters ₹1.5/bag/km. Standard gunny bag = 50 kg.
    Equivalent per-kg rate = 1.5 / 50 = 0.03 ₹/kg/km.
    Cost for 500 kg over 80 km = 500 * (1.5 / 50) * 80 = ₹1,200.
    """
    config = LogisticsConfig(
        transport_mode="shared_load",
        shared_rate_type="per_bag",
        shared_pricing_basis="distance_based",
        shared_rate=1.5,
        bag_capacity_kg=50.0,
    )
    cost, rate, unit, is_estimate, err = calculate_shared_load_transport(500, 80, config)
    assert cost == 1200.0
    assert rate == 1.5
    assert unit == "₹/bag/km"
    assert is_estimate is False


def test_shared_load_cost_per_bag_fixed_trip():
    """Fixed price per bag for the full trip:
    500 kg produce in 50 kg bags = 10 bags.
    At ₹50/bag flat for the trip: cost = 10 * 50 = ₹500.
    Must NOT multiply by distance again.
    """
    config = LogisticsConfig(
        transport_mode="shared_load",
        shared_rate_type="per_bag",
        shared_pricing_basis="fixed_trip",
        shared_rate=50.0,
        bag_capacity_kg=50.0,
    )
    cost, rate, unit, is_estimate, err = calculate_shared_load_transport(500, 80, config)
    assert cost == 500.0
    assert rate == 50.0
    assert unit == "₹/bag"
    assert is_estimate is False


# 4. Dedicated vehicle calculations
def test_dedicated_vehicle_calculations():
    """Dedicated vehicle uses trips * distance * vehicle_rate_per_km.
    500 kg in 500 kg capacity = 1 trip. 80 km * ₹15/km = ₹1,200.
    1000 kg in 500 kg capacity = 2 trips. 2 * 80 km * ₹15/km = ₹2,400.
    """
    config = LogisticsConfig(
        transport_mode="dedicated_vehicle",
        vehicle_rate_per_km=15.0,
        vehicle_capacity_kg=500.0,
        rate_is_illustrative=True,
    )
    cost1, rate1, unit1, is_est1, trips1, err1 = calculate_dedicated_vehicle_transport(500, 80, config)
    assert cost1 == 1200.0
    assert trips1 == 1
    assert rate1 == 15.0
    assert unit1 == "₹/km"

    cost2, rate2, unit2, is_est2, trips2, err2 = calculate_dedicated_vehicle_transport(1000, 80, config)
    assert cost2 == 2400.0
    assert trips2 == 2


# 5. Missing or failed road-distance lookups
def test_missing_or_failed_road_distance_lookups():
    """When road distance lookup fails or is unavailable, never invent a road distance.
    The market must be marked incomplete and prompt for an actual transport quote.
    """
    dist_provider = MappingDistanceProvider({})  # No routes
    markets = [_market("Market A", modal_price=25)]
    config = LogisticsConfig(transport_mode="shared_load")

    result = recommend_market(
        crop="Tomato",
        quantity_kg=500,
        farmer_location="UnknownOrigin",
        markets=markets,
        distance_provider=dist_provider,
        logistics_config=config,
    )

    assert result.recommended_market is None
    assert len(result.incomplete_markets) == 1
    assert result.incomplete_markets[0].name == "Market A"
    assert result.incomplete_markets[0].transport_cost_basis == "unavailable"
    assert "road distance" in result.incomplete_markets[0].transport_error.lower() or "geocoding" in result.incomplete_markets[0].transport_error.lower() or "route" in result.incomplete_markets[0].transport_error.lower()


# 6. Net return calculation and no double counting
def test_net_return_and_no_double_counting():
    """Verify net return = gross_revenue - transportation_cost - other_costs.
    Ensure costs are deducted exactly once with no double-counting.
    """
    dist_provider = MappingDistanceProvider({
        "Bangalore": 80.0, "Mysore": 45.0
    })
    markets = [
        _market("Bangalore", modal_price=30),  # 500 * 30 = 15,000 gross. trans: 500 * 80 * 0.03 = 1200. net = 13,800 - 300 = 13,500
        _market("Mysore", modal_price=28),     # 500 * 28 = 14,000 gross. trans: 500 * 45 * 0.03 = 675. net = 14,000 - 675 - 300 = 13,025
    ]
    config = LogisticsConfig(
        transport_mode="shared_load",
        shared_rate_type="per_kg_per_km",
        shared_rate_per_kg_per_km=0.03,
    )

    result = recommend_market(
        crop="Tomato",
        quantity_kg=500,
        farmer_location="Mandya",
        markets=markets,
        other_costs=300.0,
        distance_provider=dist_provider,
        logistics_config=config,
    )

    assert result.recommended_market == "Bangalore"
    assert result.expected_gross_revenue == 15000.0
    assert result.transportation_cost == 1200.0
    assert result.other_costs == 300.0
    # Net return deducted exactly once: 15,000 - 1,200 - 300 = 13,500
    assert result.expected_net_return == 13500.0

    # Check runner up
    assert len(result.alternatives) == 1
    runner_up = result.alternatives[0]
    assert runner_up.name == "Mysore"
    assert runner_up.gross_revenue == 14000.0
    assert runner_up.transportation_cost == 675.0
    assert runner_up.other_costs == 300.0
    assert runner_up.net_return == 13025.0
    assert runner_up.distance_km == 45.0
    assert runner_up.rate_applied == 0.03


# 7. End-to-end API recommendation with shared load
def test_recommendation_api_shared_load_distance():
    client = TestClient(app)
    payload = {
        "crop": "Tomato",
        "quantity_kg": 500,
        "farmer_location": "Mandya",
        "state": "Karnataka",
        "transport_mode": "shared_load",
        "shared_rate_type": "per_kg_per_km",
        "shared_pricing_basis": "distance_based",
        "shared_rate_per_kg_per_km": 0.03,
        "markets": [
            {
                "commodity": "Tomato",
                "variety": "Local",
                "state": "Karnataka",
                "district": "Mandya",
                "market": "Mysore",
                "date": "2026-10-10",
                "modal_price": 28.0,
            }
        ],
        "transportation_costs": {"Mysore": 675.0},  # Provide quote or fallback
    }
    response = client.post("/recommend", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["available"] is True
    assert data["recommendation"]["recommended_market"] == "Mysore"
    assert data["recommendation"]["transportation_cost"] == 675.0


def test_recommendation_api_shared_load_default_rates_without_custom_input():
    """Verify that omitting custom shared_rate and shared_rate_per_kg_per_km does not crash with 500."""
    client = TestClient(app)
    payload = {
        "crop": "Tomato",
        "quantity_kg": 500,
        "farmer_location": "Mandya",
        "state": "Karnataka",
        "transport_mode": "shared_load",
        "shared_rate_type": "per_kg_per_km",
        "shared_pricing_basis": "distance_based",
        # shared_rate and shared_rate_per_kg_per_km deliberately omitted / None
        "markets": [
            {
                "commodity": "Tomato",
                "variety": "Local",
                "state": "Karnataka",
                "district": "Mandya",
                "market": "Mysore",
                "date": "2026-10-10",
                "modal_price": 28.0,
            }
        ],
        "transportation_costs": {"Mysore": 450.0},
    }
    response = client.post("/recommend", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["available"] is True
    assert data["recommendation"]["recommended_market"] == "Mysore"
    assert data["recommendation"]["expected_net_return"] == (500 * 28.0) - 450.0

