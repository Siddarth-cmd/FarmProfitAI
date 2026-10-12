"""Real-time market price tracking and persistence layer."""

from __future__ import annotations

from datetime import datetime, timezone
import logging
from typing import Sequence

from models.market_models import MarketPrice
from db import query_observations, upsert_observation
from services.agmarknet_client import try_fetch_market_prices as try_agmarknet
from core.geography import KARNATAKA_STATE

logger = logging.getLogger(__name__)


def track_and_fetch_real_prices(
    commodity: str,
    market: str,
    district: str | None = None,
    state: str = KARNATAKA_STATE,
    force_live_refresh: bool = False,
) -> list[MarketPrice]:
    """Retrieve real-time market price time-series for a commodity in a given market.

    1. Checks the persistent observation store for real observations recorded up to 30 days.
    2. If observations are sparse (< 2) or force_live_refresh is True, fetches live observations
       from the public Agmarknet last-week API.
    3. Persists any newly retrieved live records into the observation database.
    4. Returns sorted real-world observations from oldest to newest.
    """
    # 1. Check local observation store (up to 30 days history)
    stored_records = query_observations(
        commodity=commodity,
        market=market,
        state=state,
        max_age_days=30,
    )

    # 2. If records are sparse or fresh fetch is forced, call live Agmarknet
    if force_live_refresh or len(stored_records) < 2:
        try:
            live_result = try_agmarknet(
                limit=15,
                commodity=commodity,
                state=state,
                district=district,
                market_names=[market],
            )
            if live_result.available and live_result.records:
                now_utc = datetime.now(timezone.utc)
                for rec in live_result.records:
                    # Persist real observation
                    upsert_observation(rec, provider="agmarknet.gov.in", retrieved_at=now_utc)
                
                # Re-query stored records to get complete merged history
                stored_records = query_observations(
                    commodity=commodity,
                    market=market,
                    state=state,
                    max_age_days=30,
                )
                if not stored_records:
                    # In case market name filtering in DB slightly differs in punctuation
                    stored_records = live_result.records
        except Exception as exc:
            logger.warning("Live market fetch encountered error: %s", exc)

    # Sort chronologically (oldest to newest for time-series modeling)
    unique_by_date: dict[str, MarketPrice] = {}
    for r in stored_records:
        date_str = r.date.isoformat()
        # Keep the record with valid recommendation_price_per_kg
        if date_str not in unique_by_date or r.recommendation_price_per_kg is not None:
            unique_by_date[date_str] = r

    sorted_records = sorted(unique_by_date.values(), key=lambda x: x.date)
    return sorted_records
