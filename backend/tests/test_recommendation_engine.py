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
from core.logistics import LogisticsConfig
from services.distance_provider import (
    CoordinateResult,
    DistanceResult,
    MappingDistanceProvider,
    OsrmDistanceProvider,
    StaticLocationGeocoder,
    SQLiteDistanceMatrix,
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


def test_observation_price_is_used_without_modal_or_range_semantics():
    observation = MarketPrice(
        commodity="Tomato",
        variety="Tomato",
        state="Karnataka",
        district="Mysuru",
        market="Mysuru APMC",
        date=date(2026, 10, 9),
        observation_price_per_kg=24.0,
        price_type="market_price_lastweek_observation",
        source_provider="agmarknet.gov.in",
        is_stale=True,
        freshness_status="stale",
    )

    result = recommend_market(
        crop="Tomato",
        quantity_kg=100,
        farmer_location="Mandya",
        markets=[observation],
        transportation_costs={"Mysuru APMC": 100.0},
        other_costs={"Mysuru APMC": 50.0},
    )

    comparison = result.ranked_markets[0]
    assert comparison.price_per_kg == 24.0
    assert comparison.gross_revenue == 2400.0
    assert comparison.net_return == 2250.0
    assert comparison.price_type == "market_price_lastweek_observation"
    assert comparison.is_stale is True
    assert comparison.freshness_status == "stale"


def test_legacy_modal_price_and_loss_percentage_remain_compatible():
    result = recommend_market(
        crop="Tomato",
        quantity_kg=100,
        farmer_location="Mandya",
        markets=[_market("Legacy Mandi", modal_price=30)],
        transportation_costs={"Legacy Mandi": 100.0},
        other_costs={"Legacy Mandi": 50.0},
        loss_percentage=10,
    )

    comparison = result.ranked_markets[0]
    assert comparison.price_type == "modal_price"
    assert comparison.saleable_quantity_kg == 90.0
    assert comparison.gross_revenue == 2700.0
    assert comparison.net_return == 2550.0


def test_higher_price_can_rank_below_lower_price_after_transport():
    result = recommend_market(
        crop="Tomato",
        quantity_kg=100,
        farmer_location="Mandya",
        markets=[
            _market("High Price", modal_price=35),
            _market("Lower Price", modal_price=30),
        ],
        transportation_costs={"High Price": 700.0, "Lower Price": 100.0},
    )

    assert result.recommended_market == "Lower Price"
    assert [market.name for market in result.ranked_markets] == [
        "Lower Price",
        "High Price",
    ]


def test_nonfinite_quantity_and_prices_are_rejected_or_skipped():
    with pytest.raises(ValueError):
        recommend_market(
            crop="Tomato",
            quantity_kg=float("inf"),
            farmer_location="Mandya",
            markets=[_market("Mandi", modal_price=20)],
        )

    with pytest.raises(ValueError):
        MarketPrice(
            commodity="Tomato",
            state="Karnataka",
            district="Mysuru",
            market="Mandi",
            date=date(2026, 10, 9),
            observation_price_per_kg=float("nan"),
        )


def test_ties_preserve_input_order_and_no_usable_data_is_safe():
    tied = recommend_market(
        crop="Tomato",
        quantity_kg=100,
        farmer_location="Mandya",
        markets=[
            _market("First", modal_price=20),
            _market("Second", modal_price=20),
        ],
        transportation_costs={"First": 0, "Second": 0},
    )
    assert [market.name for market in tied.ranked_markets] == ["First", "Second"]
    assert tied.recommended_market == "First"

    invalid = recommend_market(
        crop="Tomato",
        quantity_kg=100,
        farmer_location="Mandya",
        markets=[{"market": "Invalid", "modal_price": -1}],  # type: ignore
    )
    assert invalid.recommended_market is None
    assert invalid.ranked_markets == []


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


@pytest.mark.parametrize(
    ("quantity", "capacity", "trips"),
    [(100, 500, 1), (500, 500, 1), (501, 500, 2)],
)
def test_load_aware_transport_cost_uses_vehicle_trips(quantity, capacity, trips):
    result = recommend_market(
        crop="Tomato",
        quantity_kg=quantity,
        farmer_location="Mandya",
        markets=[_market("Mysore", modal_price=30)],
        distance_provider=MappingDistanceProvider({"Mysore": 10}),
        logistics_config=LogisticsConfig(vehicle_rate_per_km=15, vehicle_capacity_kg=capacity),
    )

    comparison = result.ranked_markets[0]
    assert comparison.trips_required == trips
    assert comparison.distance_km == 10
    assert comparison.estimated_transport_cost == trips * 10 * 15
    assert comparison.transportation_cost == trips * 10 * 15
    assert comparison.transport_cost_basis == "estimated"


def test_different_distances_and_prices_rank_by_estimated_net_return():
    result = recommend_market(
        crop="Tomato",
        quantity_kg=500,
        farmer_location="Mandya",
        markets=[
            _market("Far Market", modal_price=31),
            _market("Near Market", modal_price=30),
        ],
        distance_provider=MappingDistanceProvider({"Far Market": 100, "Near Market": 10}),
        logistics_config=LogisticsConfig(vehicle_rate_per_km=15, vehicle_capacity_kg=500),
    )

    assert result.recommended_market == "Near Market"
    assert result.ranked_markets[0].transportation_cost == 150


def test_market_without_quote_or_route_is_incomplete_not_free():
    result = recommend_market(
        crop="Tomato",
        quantity_kg=100,
        farmer_location="Mandya",
        markets=[_market("Unknown Market", modal_price=30)],
        distance_provider=MappingDistanceProvider({}),
    )

    assert result.recommended_market is None
    assert result.ranked_markets == []
    assert result.incomplete_markets[0].comparable is False
    assert result.incomplete_markets[0].transportation_cost == 0
    assert result.incomplete_markets[0].transport_cost_basis == "unavailable"


def test_actual_quote_takes_precedence_without_double_counting():
    result = recommend_market(
        crop="Tomato",
        quantity_kg=500,
        farmer_location="Mandya",
        markets=[_market("Mysore", modal_price=30)],
        transportation_costs={"Mysore": 700},
        distance_provider=MappingDistanceProvider({"Mysore": 10}),
        logistics_config=LogisticsConfig(vehicle_rate_per_km=15, vehicle_capacity_kg=500),
    )

    comparison = result.ranked_markets[0]
    assert comparison.transportation_cost == 700
    assert comparison.estimated_transport_cost is None
    assert comparison.transport_cost_basis == "actual_quote"


@pytest.mark.parametrize("distances", [{"Mysore": -1}, {"Mysore": float("inf")}])
def test_invalid_route_distance_is_unavailable(distances):
    result = recommend_market(
        crop="Tomato",
        quantity_kg=100,
        farmer_location="Mandya",
        markets=[_market("Mysore", modal_price=30)],
        distance_provider=MappingDistanceProvider(distances),
    )

    assert result.recommended_market is None
    assert result.incomplete_markets[0].distance_status == "unavailable"


def test_route_provider_failure_is_incomplete_not_free():
    class FailingProvider:
        def get_distance_km(self, origin: str, destination: str):
            raise TimeoutError("routing timeout")

    result = recommend_market(
        crop="Tomato",
        quantity_kg=100,
        farmer_location="Mandya",
        markets=[_market("Mysore", modal_price=30)],
        distance_provider=FailingProvider(),
    )

    assert result.recommended_market is None
    assert result.incomplete_markets[0].distance_status == "error"
    assert result.incomplete_markets[0].transport_error == "routing timeout"


def test_routing_provider_receives_selected_farm_location():
    calls = []

    class CapturingProvider:
        def get_distance_km(self, origin: str, destination: str):
            calls.append((origin, destination))
            return DistanceResult(12.5, "test-routing", "available")

    result = recommend_market(
        crop="Tomato",
        quantity_kg=100,
        farmer_location="Kikkeri",
        markets=[_market("Mysore", modal_price=30)],
        distance_provider=CapturingProvider(),
        logistics_config=LogisticsConfig(vehicle_rate_per_km=15, vehicle_capacity_kg=500),
    )

    assert result.recommended_market == "Mysore"
    assert calls == [("Kikkeri", "Mysore")]


def test_osrm_provider_converts_route_metres_to_kilometres_and_caches(monkeypatch):
    class Geocoder:
        def geocode(self, location):
            return CoordinateResult(12.3, 76.6, "test-geocoder", "available")

    class Response:
        status = 200

        def read(self):
            return b'{"code":"Ok","routes":[{"distance":12500}]}'

        def getcode(self):
            return 200

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    calls = []
    monkeypatch.setattr(
        "services.distance_provider.urlopen",
        lambda request, timeout: calls.append((request.full_url, timeout)) or Response(),
    )
    provider = OsrmDistanceProvider("https://routing.test", Geocoder())

    first = provider.get_distance_km("Mandya", "Mysore")
    second = provider.get_distance_km("Mandya", "Mysore")

    assert first == DistanceResult(12.5, "osrm", "available")
    assert second == first
    assert len(calls) == 1


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        (b'{"code":"NoRoute","routes":[]}', "no usable route"),
        (b'{"code":"Ok","routes":[{"distance":"bad"}]}', "invalid route distance"),
        (b"not-json", "invalid JSON"),
    ],
)
def test_osrm_provider_rejects_invalid_routes(monkeypatch, payload, message):
    class Geocoder:
        def geocode(self, location):
            return CoordinateResult(12.3, 76.6, "test-geocoder", "available")

    class Response:
        status = 200

        def read(self):
            return payload

        def getcode(self):
            return 200

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr("services.distance_provider.urlopen", lambda *args, **kwargs: Response())
    result = OsrmDistanceProvider("https://routing.test", Geocoder()).get_distance_km(
        "Mandya", "Mysore"
    )

    assert result.distance_km is None
    assert result.status == "error"
    assert message.lower() in result.error.lower()


def test_osrm_provider_marks_missing_coordinates_unavailable(monkeypatch):
    class Geocoder:
        def geocode(self, location):
            return CoordinateResult(None, None, "test-geocoder", "unavailable", "ambiguous location")

    provider = OsrmDistanceProvider("https://routing.test", Geocoder())
    result = provider.get_distance_km("Unknown", "Mysore")

    assert result.distance_km is None
    assert result.status == "unavailable"
    assert "ambiguous" in result.error


def test_osrm_provider_identifies_unknown_farm_origin():
    class Geocoder:
        def geocode(self, location):
            if location == "Unknown Farm":
                return CoordinateResult(None, None, "local", "unavailable", "missing")
            return CoordinateResult(12.3, 76.6, "local", "available")

    result = OsrmDistanceProvider(
        "https://routing.test",
        Geocoder(),
        min_request_interval_seconds=0,
    ).get_distance_km("Unknown Farm", "Mysore")

    assert result.status == "unavailable"
    assert "farm origin" in result.error


def test_osrm_provider_identifies_unknown_market_destination():
    class Geocoder:
        def geocode(self, location):
            if location == "Unknown Market":
                return CoordinateResult(None, None, "local", "unavailable", "missing")
            return CoordinateResult(12.3, 76.6, "local", "available")

    result = OsrmDistanceProvider(
        "https://routing.test",
        Geocoder(),
        min_request_interval_seconds=0,
    ).get_distance_km("Mandya", "Unknown Market")

    assert result.status == "unavailable"
    assert "market destination" in result.error


def test_mysuru_apmc_without_verified_coordinates_is_incomplete():
    market = _market("Mysuru APMC", modal_price=24)
    geocoder = StaticLocationGeocoder(
        {"Mandya": (12.5218, 76.8951, "local", "karnataka:mandya")}
    )
    provider = OsrmDistanceProvider(
        "https://routing.test",
        geocoder,
        min_request_interval_seconds=0,
    )

    result = recommend_market(
        crop="Tomato",
        quantity_kg=500,
        farmer_location="Mandya",
        markets=[market],
        transportation_costs={},
        distance_provider=provider,
    )

    assert result.recommended_market is None
    assert result.incomplete_markets[0].name == "Mysuru APMC"
    assert result.incomplete_markets[0].distance_status == "unavailable"
    assert "market destination" in result.incomplete_markets[0].transport_error


def test_mysuru_apmc_actual_quote_remains_comparable_without_route():
    market = _market("Mysuru APMC", modal_price=24)
    result = recommend_market(
        crop="Tomato",
        quantity_kg=500,
        farmer_location="Mandya",
        markets=[market],
        transportation_costs={"Mysuru APMC": 600},
        distance_provider=OsrmDistanceProvider(
            "https://routing.test",
            StaticLocationGeocoder({}),
            min_request_interval_seconds=0,
        ),
    )

    assert result.recommended_market == "Mysuru APMC"
    assert result.ranked_markets[0].transport_cost_basis == "actual_quote"


@pytest.mark.parametrize(
    "market_name",
    [
        "Mysuru APMC",
        "Nanjangud APMC",
        "Hunsur APMC",
        "T. Narasipura APMC",
    ],
)
def test_discovered_apmc_without_coordinates_is_incomplete(market_name):
    market = _market(market_name, modal_price=24)
    provider = OsrmDistanceProvider(
        "https://routing.test",
        StaticLocationGeocoder({
            "Mandya": (12.5218, 76.8951, "local", "karnataka:mandya"),
        }),
        min_request_interval_seconds=0,
    )

    result = recommend_market(
        crop="Tomato",
        quantity_kg=500,
        farmer_location="Mandya",
        markets=[market],
        transportation_costs={},
        distance_provider=provider,
    )

    assert result.recommended_market is None
    assert [item.name for item in result.incomplete_markets] == [market_name]
    assert "market destination" in result.incomplete_markets[0].transport_error


@pytest.mark.parametrize(
    "market_name",
    [
        "Mysuru APMC",
        "Nanjangud APMC",
        "Hunsur APMC",
        "T. Narasipura APMC",
    ],
)
def test_discovered_apmc_exact_transport_quote_overrides_missing_coordinates(market_name):
    market = _market(market_name, modal_price=24)
    result = recommend_market(
        crop="Tomato",
        quantity_kg=500,
        farmer_location="Mandya",
        markets=[market],
        transportation_costs={market_name: 600},
        distance_provider=OsrmDistanceProvider(
            "https://routing.test",
            StaticLocationGeocoder({}),
            min_request_interval_seconds=0,
        ),
    )

    assert result.recommended_market == market_name
    assert result.ranked_markets[0].transportation_cost == 600
    assert result.ranked_markets[0].transport_cost_basis == "actual_quote"


def test_four_discovered_apmcs_do_not_block_a_routable_market():
    markets = [
        _market("Mysuru APMC", modal_price=30),
        _market("Nanjangud APMC", modal_price=29),
        _market("Hunsur APMC", modal_price=28),
        _market("T. Narasipura APMC", modal_price=27),
        _market("Mysore", modal_price=24),
    ]

    class MixedProvider:
        def get_distance_km(self, origin, destination):
            if destination == "Mysore":
                return DistanceResult(44.5, "osrm-cache", "available")
            return DistanceResult(
                None,
                "local-verified-coordinates",
                "unavailable",
                "Verified market destination unavailable (unavailable): "
                "No verified local coordinates are available for this location.",
            )

    result = recommend_market(
        crop="Tomato",
        quantity_kg=500,
        farmer_location="Mandya",
        markets=markets,
        transportation_costs={},
        distance_provider=MixedProvider(),
    )

    assert result.recommended_market == "Mysore"
    assert {market.name for market in result.incomplete_markets} == {
        "Mysuru APMC",
        "Nanjangud APMC",
        "Hunsur APMC",
        "T. Narasipura APMC",
    }


def test_automatic_discovery_keeps_routable_market_and_marks_only_failed_markets():
    markets = [
        _market("Mysore", modal_price=28),
        _market("Bangalore", modal_price=30),
        _market("Hassan", modal_price=25),
    ]
    class MixedRouteProvider:
        def get_distance_km(self, origin, destination):
            if destination == "Mysore":
                return DistanceResult(44.5, "osrm-cache", "available")
            return DistanceResult(
                None,
                "local-verified-coordinates",
                "unavailable",
                f"Verified market destination unavailable for {destination}.",
            )

    result = recommend_market(
        crop="Tomato",
        quantity_kg=500,
        farmer_location="Mandya",
        markets=markets,
        transportation_costs={},
        distance_provider=MixedRouteProvider(),
    )

    assert result.recommended_market == "Mysore"
    assert [market.name for market in result.ranked_markets] == ["Mysore"]
    assert {market.name for market in result.incomplete_markets} == {"Bangalore", "Hassan"}


def test_static_location_geocoder_normalizes_whitespace_and_case():
    geocoder = StaticLocationGeocoder(
        {"Mysuru": (12.2958, 76.6394, "local"), "Mysore": (12.2958, 76.6394, "local")}
    )

    result = geocoder.geocode("  mYsOrE  ")

    assert result.status == "available"
    assert result.latitude == 12.2958


def test_static_location_geocoder_marks_conflicting_alias_ambiguous():
    geocoder = StaticLocationGeocoder(
        {"Mysore": (12.2958, 76.6394, "one"), " mysore ": (13.0, 77.0, "two")}
    )

    result = geocoder.geocode("Mysore")

    assert result.status == "ambiguous"
    assert "ambiguous" in result.error


def test_osrm_provider_handles_timeout(monkeypatch):
    class Geocoder:
        def geocode(self, location):
            return CoordinateResult(12.3, 76.6, "test-geocoder", "available")

    def timeout(*args, **kwargs):
        raise TimeoutError("timed out")

    monkeypatch.setattr("services.distance_provider.urlopen", timeout)
    result = OsrmDistanceProvider("https://routing.test", Geocoder()).get_distance_km(
        "Mandya", "Mysore"
    )

    assert result.distance_km is None
    assert result.status == "error"
    assert result.error == "Routing service request timed out"


def test_static_location_geocoder_returns_only_curated_coordinates():
    geocoder = StaticLocationGeocoder(
        {"Mandya": (12.5218, 76.8951, "local-test-dataset")}
    )

    available = geocoder.geocode("Mandya")
    missing = geocoder.geocode("Custom Farm")

    assert available == CoordinateResult(12.5218, 76.8951, "local-test-dataset", "available")
    assert missing.status == "unavailable"
    assert missing.latitude is None


def test_osrm_provider_routes_curated_coordinates_without_remote_geocoder(monkeypatch):
    class Response:
        status = 200

        def read(self):
            return b'{"code":"Ok","routes":[{"distance":1000}]}'

        def getcode(self):
            return 200

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    calls = []
    monkeypatch.setattr(
        "services.distance_provider.urlopen",
        lambda request, timeout: calls.append(request.full_url) or Response(),
    )
    provider = OsrmDistanceProvider(
        "https://routing.test",
        StaticLocationGeocoder({
            "Mandya": (12.5218, 76.8951, "local-test-dataset"),
            "Mysore": (12.2958, 76.6394, "local-test-dataset"),
        }),
        min_request_interval_seconds=0,
    )

    result = provider.get_distance_km("Mandya", "Mysore")

    assert result == DistanceResult(1.0, "osrm", "available")
    assert len(calls) == 1


def test_persistent_distance_matrix_cache_hit_avoids_request(tmp_path, monkeypatch):
    class Response:
        status = 200
        def read(self):
            return b'{"code":"Ok","routes":[{"distance":2500}]}'
        def getcode(self):
            return 200
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False

    calls = []
    monkeypatch.setattr(
        "services.distance_provider.urlopen",
        lambda request, timeout: calls.append(request.full_url) or Response(),
    )
    coordinates = StaticLocationGeocoder({
        "Mandya": (12.5, 76.8, "local", "mandya"),
        "Mysore": (12.3, 76.6, "local", "mysuru"),
    })
    db_path = tmp_path / "routes.sqlite3"
    first = OsrmDistanceProvider(
        "https://routing.test", coordinates,
        distance_matrix=SQLiteDistanceMatrix(db_path),
        min_request_interval_seconds=0,
    )
    assert first.get_distance_km("Mandya", "Mysore").source == "osrm"

    second = OsrmDistanceProvider(
        "https://routing.test", coordinates,
        distance_matrix=SQLiteDistanceMatrix(db_path),
        min_request_interval_seconds=0,
    )
    cached = second.get_distance_km("Mandya", "Mysore")

    assert cached == DistanceResult(2.5, "osrm-cache", "available")
    assert len(calls) == 1


def test_persistent_matrix_is_directed(tmp_path):
    matrix = SQLiteDistanceMatrix(tmp_path / "routes.sqlite3")
    assert matrix.put("mandya", "mysuru", 10.0, "osrm", "driving")
    assert matrix.get("mandya", "mysuru", "driving").distance_km == 10.0
    assert matrix.get("mysuru", "mandya", "driving") is None


def test_matrix_storage_failure_does_not_create_free_distance(monkeypatch):
    class BrokenMatrix:
        def get(self, *args):
            raise OSError("database unavailable")
        def put(self, *args):
            raise OSError("database unavailable")

    class Response:
        status = 200
        def read(self):
            return b'{"code":"Ok","routes":[{"distance":3000}]}'
        def getcode(self):
            return 200
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False

    monkeypatch.setattr(
        "services.distance_provider.urlopen",
        lambda request, timeout: Response(),
    )
    provider = OsrmDistanceProvider(
        "https://routing.test",
        StaticLocationGeocoder({
            "Mandya": (12.5, 76.8, "local", "mandya"),
            "Mysore": (12.3, 76.6, "local", "mysuru"),
        }),
        distance_matrix=BrokenMatrix(),
        min_request_interval_seconds=0,
    )

    result = provider.get_distance_km("Mandya", "Mysore")

    assert result.distance_km == 3.0
    assert result.status == "available"


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
