from collections.abc import Mapping, Sequence
from datetime import datetime, timezone

from models.market_models import MarketPrice
from core.geography import KARNATAKA_STATE
from db import upsert_observation, query_observations


def try_agmarknet(*args, **kwargs):
    """Lazy import wrapper for Agmarknet fetch function.
    Allows tests to monkeypatch this symbol.
    """
    from services.agmarknet_client import try_fetch_market_prices
    return try_fetch_market_prices(*args, **kwargs)

def try_datagov(*args, **kwargs):
    """Lazy import wrapper for Data.gov.in fetch function.
    Allows tests to monkeypatch this symbol.
    """
    from services.data_gov_client import try_fetch_market_prices
    return try_fetch_market_prices(*args, **kwargs)



MarketPriceInput = MarketPrice | Mapping[str, object]


def _filter_by_district(records: list[MarketPrice], district: str | None) -> list[MarketPrice]:
    """Filter records by district name (case-insensitive) when a district is specified."""
    if not district or not district.strip():
        return records
    query = district.strip().casefold()
    return [r for r in records if r.district.strip().casefold() == query]


def _deduplicate_by_market(records: list[MarketPrice]) -> list[MarketPrice]:
    """Keep only the most recent observation per (commodity, market, district) tuple.

    This prevents the same APMC market appearing multiple times (once per observation
    date) in the results table. The user sees each distinct market once with the most
    recent price reported.
    """
    best: dict[tuple[str, str, str], MarketPrice] = {}
    for rec in records:
        key = (
            rec.commodity.strip().casefold(),
            rec.market.strip().casefold(),
            rec.district.strip().casefold(),
        )
        existing = best.get(key)
        if existing is None or rec.date > existing.date:
            best[key] = rec
    # Preserve order by date descending (newest first)
    return sorted(best.values(), key=lambda r: r.date, reverse=True)


def evaluate_record_freshness_and_confidence(
    record: MarketPrice,
    source: str | None = None,
    is_fallback: bool = False,
    is_cached: bool = False,
) -> MarketPrice:
    """Evaluate data age, freshness status, and reliability/confidence level for a market record.
    
    Freshness thresholds (configurable via env variables):
    - HIGH confidence: Live/fresh observation <= 3 days old (FRESHNESS_HIGH_DAYS, default 3)
    - MEDIUM confidence: Observation <= 7 days old (FRESHNESS_MAX_DAYS / AGMARKNET_MAX_AGE_DAYS, default 7)
    - LOW confidence: Stale observations (> 7 days), local fallback/demo data, or historical cache.
    """
    import os
    from datetime import date
    high_threshold = int(os.getenv("FRESHNESS_HIGH_DAYS", "3"))
    max_threshold = int(os.getenv("FRESHNESS_MAX_DAYS", os.getenv("AGMARKNET_MAX_AGE_DAYS", "7")))

    today = date.today()
    rec_date = getattr(record, "date", None)
    age_days = (today - rec_date).days if rec_date else None
    
    # Check fallback / demo provenance
    rec_source = (source or record.source_provider or "").lower()
    is_demo_fallback = is_fallback or "fallback" in rec_source or "demo" in rec_source

    if is_demo_fallback:
        confidence = "low"
        freshness = "fallback"
        is_stale = True
    elif age_days is None or age_days > max_threshold:
        confidence = "low"
        freshness = "stale"
        is_stale = True
    elif is_cached:
        confidence = "medium"
        freshness = "cached"
        is_stale = False
    elif age_days <= high_threshold:
        confidence = "high"
        freshness = "fresh"
        is_stale = False
    else:
        confidence = "medium"
        freshness = "within_acceptable_window"
        is_stale = False

    return record.model_copy(
        update={
            "confidence_level": confidence,
            "freshness_status": freshness,
            "is_stale": is_stale,
            "data_age_days": age_days,
            "source_provider": record.source_provider or source,
        }
    )


def normalize_market_price(record: MarketPriceInput) -> MarketPrice:
    """Validate and normalize a single market-price record. Does not fetch data."""
    price = MarketPrice.model_validate(record)
    return evaluate_record_freshness_and_confidence(price)


def normalize_market_prices(records: Sequence[MarketPriceInput]) -> list[MarketPrice]:
    """Validate and normalize many market-price records. Does not fetch data."""
    return [normalize_market_price(record) for record in records]


def fetch_market_prices_with_fallback(
    *,
    limit: int = 10,
    commodity: str | None = None,
    state: str | None = None,
    district: str | None = None,
    market_names: list[str] | None = None,
    api_key: str | None = None,
):
    """Fetch Agmarknet, then Data.gov.in (state-wide), then fallback/demo market data.

    Data.gov.in is queried **state-wide** (without the district filter on the API
    call) to avoid district-name mismatches between providers, then client-side
    filtered by district when the caller provides one.  This ensures Karnataka
    districts available in Data.gov.in are not silently dropped because their names
    differ from those in the Agmarknet catalogue.

    The local fallback is only used when both live providers are unavailable or
    return no usable records.
    """

    # Local imports to avoid circular dependencies
    from services.agmarknet_client import try_fetch_market_prices as try_agmarknet
    from services.data_gov_client import try_fetch_market_prices as try_datagov, MarketDataFetchResult
    from services.local_fallback_provider import fetch_fallback_market_prices
    if state and state.strip().casefold() != KARNATAKA_STATE.casefold():
        return MarketDataFetchResult(
            records=[],
            available=False,
            error_kind="validation",
            error_message=f"Only {KARNATAKA_STATE} market data is supported.",
        )

    scoped_state = state

    # --- 1. Try Agmarknet (per-market lastweek observations) ---
    # For state-wide queries we need to fetch enough raw observations (one per market per day
    # for ~7 days) so that deduplication can return all distinct markets.
    # For district-specific or named-market queries, the caller limit is sufficient.
    agmarknet_fetch_limit = limit if (district or market_names) else max(limit * 7, 200)
    agmarknet_result = try_agmarknet(
        limit=agmarknet_fetch_limit,
        commodity=commodity,
        state=scoped_state,
        district=district,
        market_names=market_names,
    )
    if agmarknet_result.available and agmarknet_result.records:
        evaluated = [
            evaluate_record_freshness_and_confidence(rec, source=agmarknet_result.source or "agmarknet.gov.in", is_fallback=False, is_cached=False)
            for rec in agmarknet_result.records
        ]
        for rec in evaluated:
            upsert_observation(rec, agmarknet_result.source or "agmarknet", datetime.now(timezone.utc))
        # Deduplicate: one row per (commodity, market, district), keeping most recent date.
        # Agmarknet returns one observation per market per day for the last week;
        # the user should see each distinct APMC once with its latest price.
        deduplicated = _deduplicate_by_market(evaluated)
        agmarknet_result.records = deduplicated
        return agmarknet_result

    # --- 2. Try Data.gov.in state-wide, then client-side filter by district ---
    # Query without district so all Karnataka records are returned, avoiding
    # district-name mismatches (e.g. "Bengaluru South" vs "Bengaluru").
    # Use a large page size so we capture all available distinct markets.
    datagov_result = try_datagov(
        limit=500,               # fetch a full state-wide result page
        commodity=commodity,
        state=scoped_state,
        district=None,           # no district on the API call; filter client-side
        market_names=market_names,
        api_key=api_key,
    )
    if datagov_result.available and datagov_result.records:
        # Deduplicate across all returned rows to one per (commodity, market, district).
        deduped_all = _deduplicate_by_market(datagov_result.records)
        # Client-side filter by district when the caller requested one.
        # If no records match the district, return all state-wide records
        # so the user sees real data rather than a misleading empty result.
        filtered = _filter_by_district(deduped_all, district)
        result_records = filtered if filtered else deduped_all
        evaluated = [
            evaluate_record_freshness_and_confidence(rec, source=datagov_result.source or "data.gov.in", is_fallback=False, is_cached=False)
            for rec in result_records
        ]
        for rec in evaluated:
            upsert_observation(rec, datagov_result.source or "data.gov.in", datetime.now(timezone.utc))
        return MarketDataFetchResult(
            records=evaluated,
            skipped_invalid=datagov_result.skipped_invalid,
            source=datagov_result.source,
            available=True,
            using_fallback=False,
        )

    # --- 3. DB cache fallback (state-wide or district-specific) ---
    db_records = query_observations(
        commodity=commodity,
        district=district,
        market=market_names[0] if market_names else None,
        state=scoped_state,
    )
    if db_records:
        cached_source = db_records[0].source_provider or "observations.db"
        evaluated = [
            evaluate_record_freshness_and_confidence(
                rec,
                source=rec.source_provider or cached_source,
                is_fallback=False,
                is_cached=True,
            )
            for rec in db_records
        ]
        # Deduplicate to one row per (commodity, market, district) — newest date wins.
        deduplicated = _deduplicate_by_market(evaluated)
        return MarketDataFetchResult(
            records=deduplicated,
            source=f"cached ({cached_source})",
            available=True,
            using_fallback=False,
        )

    # --- 4. Bundled local fallback ---
    fallback_result = fetch_fallback_market_prices(
        limit=limit,
        commodity=commodity,
        state=scoped_state,
        district=district,
        market_names=market_names,
    )
    if fallback_result.available and fallback_result.records:
        evaluated = [
            evaluate_record_freshness_and_confidence(rec, source="farmprofit-local-fallback", is_fallback=True, is_cached=False)
            for rec in fallback_result.records
        ]
        fallback_result.records = evaluated
        error_result = agmarknet_result if agmarknet_result.error_kind else datagov_result
        if error_result.error_kind and error_result.error_message:
            fallback_result.error_kind = error_result.error_kind
            fallback_result.error_message = error_result.error_message
        return fallback_result

    live_error_kinds = {agmarknet_result.error_kind, datagov_result.error_kind}
    if live_error_kinds <= {"data", None}:
        return MarketDataFetchResult(
            records=[],
            source=None,
            available=False,
            using_fallback=False,
            error_kind="data",
            error_message="No live market records matched the requested filters.",
        )

    # If Agmarknet returned a genuine data message (while datagov failed with config/service), prioritize the data message
    if agmarknet_result.error_kind == "data" and agmarknet_result.error_message:
        return MarketDataFetchResult(
            records=[],
            source=None,
            available=False,
            using_fallback=False,
            error_kind="data",
            error_message=agmarknet_result.error_message,
        )

    live_errors = [
        message for message in (agmarknet_result.error_message, datagov_result.error_message)
        if message and "DATA_GOV_API_KEY is not set" not in message
    ]
    if not live_errors and (agmarknet_result.error_message or datagov_result.error_message):
        live_errors = [m for m in (agmarknet_result.error_message, datagov_result.error_message) if m]

    if "data" in live_error_kinds and live_errors:
        primary_msg = agmarknet_result.error_message if agmarknet_result.error_kind == "data" else (live_errors[0] if live_errors else None)
        return MarketDataFetchResult(
            records=[],
            source=None,
            available=False,
            using_fallback=False,
            error_kind="data",
            error_message=primary_msg or "No live market records matched the requested filters.",
        )
    return MarketDataFetchResult(
        records=[],
        source=None,
        available=False,
        using_fallback=False,
        error_kind="service",
        error_message=(
            "Live market data providers are unavailable."
            if not live_errors
            else ". ".join(live_errors)
        ),
    )



async def _background_ingestion_loop() -> None:
    """Run a safe background cycle without unfiltered provider requests.

    Market observations are fetched on demand for the farmer's selected
    crop and Karnataka location. This loop must not query providers without
    a commodity filter or make a large burst of requests at startup.
    """
    import asyncio
    import logging
    import os

    logger = logging.getLogger(__name__)
    interval = max(300, int(os.getenv("INGESTION_INTERVAL_SECONDS", "3600")))

    logger.info(
        "Background ingestion is idle: live observations are fetched "
        "on demand for the selected crop and Karnataka market."
    )

    while True:
        await asyncio.sleep(interval)
