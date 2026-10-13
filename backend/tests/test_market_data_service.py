from datetime import date

import pytest

from models.market_models import MarketPrice
from services.data_gov_client import MarketDataFetchResult
from services.market_data_service import fetch_market_prices_with_fallback
from services.local_fallback_provider import fetch_fallback_market_prices


def _market(name: str, commodity: str = "Tomato") -> MarketPrice:
    return MarketPrice(
        commodity=commodity,
        variety="Local",
        state="Karnataka",
        district=name,
        market=name,
        date=date(2026, 10, 8),
        min_price=24,
        modal_price=26,
        max_price=28,
    )


def test_data_gov_success_uses_live_data(monkeypatch):
    live = MarketDataFetchResult(records=[_market("Mysore")], available=True)

    monkeypatch.setattr(
        "services.data_gov_client.try_fetch_market_prices",
        lambda **_kwargs: live,
    )

    result = fetch_market_prices_with_fallback(commodity="Tomato")

    assert result.available is True
    assert result.source == "data.gov.in"
    assert result.using_fallback is False
    assert [record.market for record in result.records] == ["Mysore"]


def test_agmarknet_success_precedes_data_gov(monkeypatch):
    agmarknet = MarketDataFetchResult(records=[_market("Mysuru")], available=True)
    monkeypatch.setattr(
        "services.agmarknet_client.try_fetch_market_prices",
        lambda **_kwargs: agmarknet,
    )
    monkeypatch.setattr(
        "services.data_gov_client.try_fetch_market_prices",
        lambda **_kwargs: pytest.fail("Data.gov.in must not run after Agmarknet success"),
    )

    result = fetch_market_prices_with_fallback(
        commodity="Tomato",
        state="Karnataka",
        district="Mysuru",
    )

    assert result is agmarknet


def test_selected_market_names_are_forwarded_to_live_providers(monkeypatch):
    captured = {}

    def fake_agmarknet(**kwargs):
        captured.update(kwargs)
        return MarketDataFetchResult(records=[_market("Hassan APMC")], available=True)

    monkeypatch.setattr(
        "services.agmarknet_client.try_fetch_market_prices",
        fake_agmarknet,
    )

    result = fetch_market_prices_with_fallback(
        commodity="Tomato",
        state="Karnataka",
        district="Mysuru",
        market_names=["Hassan APMC"],
    )

    assert result.available is True
    assert captured["market_names"] == ["Hassan APMC"]
    assert captured["district"] == "Mysuru"


def test_agmarknet_observation_price_is_used_without_modal_semantics():
    from recommendation.recommendation_engine import recommend_market

    observation = MarketPrice(
        commodity="Tomato",
        variety="Tomato",
        state="Karnataka",
        district="Mysuru",
        market="Mysuru APMC",
        date=date(2026, 10, 9),
        observation_price_per_kg=24,
        price_type="market_price_lastweek_observation",
        source_provider="agmarknet.gov.in",
    )

    result = recommend_market(
        crop="Tomato",
        quantity_kg=100,
        farmer_location="Mandya",
        markets=[observation],
        transportation_costs={"Mysuru APMC": 100},
    )

    assert result.expected_gross_revenue == 2400
    assert result.ranked_markets[0].price_type == "market_price_lastweek_observation"


def test_data_gov_failure_uses_local_fallback(monkeypatch):
    monkeypatch.setattr(
        "services.agmarknet_client.try_fetch_market_prices",
        lambda **_kwargs: MarketDataFetchResult(
            records=[],
            available=False,
            source=None,
            error_kind="service",
            error_message="Agmarknet is unavailable",
        ),
    )
    monkeypatch.setattr(
        "services.data_gov_client.try_fetch_market_prices",
        lambda **_kwargs: MarketDataFetchResult(
            records=[],
            available=False,
            source=None,
            error_kind="service",
            error_message="Data.gov.in is unavailable: connection refused",
        ),
    )

    result = fetch_market_prices_with_fallback(commodity="Tomato", state="Karnataka")

    assert result.available is True
    assert result.source == "farmprofit-local-fallback"
    assert result.using_fallback is True
    assert {record.market for record in result.records} >= {"Mysore", "Bangalore"}
    assert result.error_kind == "service"
    assert "Agmarknet is unavailable" in result.error_message


def test_neither_source_available_returns_graceful_failure(monkeypatch):
    live_failure = MarketDataFetchResult(
        records=[],
        available=False,
        source=None,
        error_kind="service",
        error_message="Data.gov.in is unavailable: connection refused",
    )
    fallback_failure = MarketDataFetchResult(
        records=[],
        available=False,
        source=None,
        using_fallback=False,
        error_kind="data",
        error_message="No fallback/demo market records matched the requested filters.",
    )

    monkeypatch.setattr(
        "services.agmarknet_client.try_fetch_market_prices",
        lambda **_kwargs: live_failure,
    )
    monkeypatch.setattr(
        "services.data_gov_client.try_fetch_market_prices",
        lambda **_kwargs: live_failure,
    )
    monkeypatch.setattr(
        "services.local_fallback_provider.fetch_fallback_market_prices",
        lambda **_kwargs: fallback_failure,
    )

    result = fetch_market_prices_with_fallback(commodity="Dragonfruit")

    assert result.available is False
    assert result.records == []
    assert result.source is None
    assert result.using_fallback is False
    assert result.error_kind == "service"


def test_empty_live_results_are_distinguished_from_provider_errors(monkeypatch):
    empty_live = MarketDataFetchResult(
        records=[],
        available=False,
        source=None,
        error_kind="data",
        error_message="No records matched.",
    )
    fallback_failure = MarketDataFetchResult(
        records=[],
        available=False,
        source=None,
        using_fallback=False,
        error_kind="data",
        error_message="No fallback/demo market records matched the requested filters.",
    )

    monkeypatch.setattr(
        "services.agmarknet_client.try_fetch_market_prices",
        lambda **_kwargs: empty_live,
    )
    monkeypatch.setattr(
        "services.data_gov_client.try_fetch_market_prices",
        lambda **_kwargs: empty_live,
    )
    monkeypatch.setattr(
        "services.local_fallback_provider.fetch_fallback_market_prices",
        lambda **_kwargs: fallback_failure,
    )

    result = fetch_market_prices_with_fallback(
        commodity="Tomato",
        state="Karnataka",
        district="Example",
    )

    assert result.available is False
    assert result.records == []
    assert result.error_kind == "data"
    assert result.error_message == "No live market records matched the requested filters."


def test_bundled_karnataka_observations_cover_multiple_crops():
    result = fetch_fallback_market_prices(limit=100)

    assert {record.commodity for record in result.records} == {
        "Tomato",
        "Onion",
        "Potato",
        "Maize",
    }
    assert {record.state for record in result.records} == {"Karnataka"}


# ---------------------------------------------------------------------------
# Regression tests for the state-wide Data.gov.in query fix
# ---------------------------------------------------------------------------


def _datagov_record(district: str, market: str, commodity: str = "Tomato") -> MarketPrice:
    return MarketPrice(
        commodity=commodity,
        variety="Local",
        state="Karnataka",
        district=district,
        market=market,
        date=date(2026, 10, 12),
        min_price=10.0,
        modal_price=15.0,
        max_price=20.0,
    )


def test_datagov_queried_without_district_filter(monkeypatch):
    """Data.gov.in must receive district=None so state-wide results are returned.

    This is the regression test for the root cause: the service previously
    forwarded the caller's district to Data.gov.in, which returned 0 records
    when the district name did not match the provider's spelling (e.g. "Mysuru"
    vs "Mysore").  After the fix, the provider is queried state-wide and the
    caller's district filter is applied client-side.
    """
    captured: dict = {}

    def fake_datagov(**kwargs):
        captured.update(kwargs)
        return MarketDataFetchResult(
            records=[_datagov_record("Kolar", "Kolar APMC")],
            available=True,
            source="data.gov.in",
        )

    monkeypatch.setattr(
        "services.agmarknet_client.try_fetch_market_prices",
        lambda **_: MarketDataFetchResult(records=[], available=False, source=None, error_kind="service"),
    )
    monkeypatch.setattr(
        "services.data_gov_client.try_fetch_market_prices",
        fake_datagov,
    )

    fetch_market_prices_with_fallback(
        commodity="Tomato",
        state="Karnataka",
        district="Mysuru",  # caller wants Mysuru
    )

    # The district passed to the provider must be None (state-wide query).
    assert captured.get("district") is None, (
        "Data.gov.in must be queried without a district filter so that "
        "all Karnataka markets are returned and name mismatches are avoided."
    )


def test_datagov_client_side_district_filter_returns_matching_records(monkeypatch):
    """Client-side district filtering must narrow results when names match exactly."""
    all_records = [
        _datagov_record("Kolar", "Kolar APMC"),
        _datagov_record("Chamarajanagar", "Chamarajanagar APMC"),
        _datagov_record("Kolar", "Mulbagal APMC"),
    ]

    monkeypatch.setattr(
        "services.agmarknet_client.try_fetch_market_prices",
        lambda **_: MarketDataFetchResult(records=[], available=False, source=None, error_kind="service"),
    )
    monkeypatch.setattr(
        "services.data_gov_client.try_fetch_market_prices",
        lambda **_: MarketDataFetchResult(records=all_records, available=True, source="data.gov.in"),
    )

    result = fetch_market_prices_with_fallback(
        commodity="Tomato",
        state="Karnataka",
        district="Kolar",
        limit=50,
    )

    assert result.available is True
    assert result.using_fallback is False
    assert all(r.district == "Kolar" for r in result.records), (
        "All returned records must belong to the requested district."
    )
    assert {r.market for r in result.records} == {"Kolar APMC", "Mulbagal APMC"}


def test_datagov_returns_all_state_wide_when_district_has_no_match(monkeypatch):
    """When no records match the requested district, all state-wide records are shown.

    This prevents a misleading empty result when the user selects a district that
    has no Data.gov.in records but other Karnataka districts do.
    """
    all_records = [
        _datagov_record("Kolar", "Kolar APMC"),
        _datagov_record("Haveri", "Ranebennur APMC"),
    ]

    monkeypatch.setattr(
        "services.agmarknet_client.try_fetch_market_prices",
        lambda **_: MarketDataFetchResult(records=[], available=False, source=None, error_kind="service"),
    )
    monkeypatch.setattr(
        "services.data_gov_client.try_fetch_market_prices",
        lambda **_: MarketDataFetchResult(records=all_records, available=True, source="data.gov.in"),
    )

    result = fetch_market_prices_with_fallback(
        commodity="Tomato",
        state="Karnataka",
        district="Mysuru",  # Mysuru not in the provider records
        limit=50,
    )

    assert result.available is True
    assert result.using_fallback is False
    assert len(result.records) == 2, (
        "All state-wide records must be returned when the requested district has no match."
    )


def test_live_failure_uses_valid_cached_records_before_local_fallback(monkeypatch):
    """When live providers fail, valid cached records from DB take priority over local demo fallback."""
    from datetime import datetime, timezone
    from db import upsert_observation

    # Seed the isolated DB with a cached observation
    cached_obs = MarketPrice(
        commodity="Tomato",
        variety="Local",
        state="Karnataka",
        district="Hassan",
        market="Hassan APMC",
        date=date.today(),
        min_price=18.0,
        modal_price=22.0,
        max_price=25.0,
        source_provider="agmarknet.gov.in",
    )
    upsert_observation(cached_obs, "agmarknet.gov.in", datetime.now(timezone.utc))

    # Live providers both fail
    monkeypatch.setattr(
        "services.agmarknet_client.try_fetch_market_prices",
        lambda **_: MarketDataFetchResult(records=[], available=False, source=None, error_kind="service"),
    )
    monkeypatch.setattr(
        "services.data_gov_client.try_fetch_market_prices",
        lambda **_: MarketDataFetchResult(records=[], available=False, source=None, error_kind="service"),
    )

    result = fetch_market_prices_with_fallback(
        commodity="Tomato",
        state="Karnataka",
        district="Hassan",
    )

    assert result.available is True
    assert result.using_fallback is False
    assert "cached" in (result.source or "").lower()
    assert len(result.records) == 1
    assert result.records[0].market == "Hassan APMC"
    assert result.records[0].freshness_status == "cached"

