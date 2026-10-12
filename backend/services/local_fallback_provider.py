"""Local fallback market data provider for demos when Data.gov.in is unavailable.

The bundled dataset is curated fallback/demo data. It is not live, not real-time,
and must not be presented as currently retrieved from Data.gov.in.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from services.data_gov_client import MarketDataFetchResult
from services.market_data_service import normalize_market_price
from services.market_catalogue import find_catalogue_entries, normalize_catalogue_name

SOURCE_NAME = "farmprofit-local-fallback"
DEFAULT_DATASET_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "fallback_market_prices.json"
)


def _matches_filter(value: str, query: str | None) -> bool:
    if query is None or not query.strip():
        return True
    return value.strip().casefold() == query.strip().casefold()


def _matches_market(record, market_names: list[str] | None) -> bool:
    if not market_names:
        return True
    requested_keys = {
        normalize_catalogue_name(name)
        for name in market_names
        if str(name).strip()
    }
    if normalize_catalogue_name(record.market) in requested_keys:
        return True
    entries = find_catalogue_entries([name for name in market_names if str(name).strip()])
    return any(
        normalize_catalogue_name(record.market) == normalize_catalogue_name(entry.name)
        and normalize_catalogue_name(record.district) == normalize_catalogue_name(entry.district)
        for entry in entries
    )


def _load_raw_records(dataset_path: Path = DEFAULT_DATASET_PATH) -> list[Any]:
    with dataset_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, list):
        raise ValueError("fallback market dataset must be a JSON list")
    return payload


def fetch_fallback_market_prices(
    *,
    limit: int = 10,
    commodity: str | None = None,
    state: str | None = None,
    district: str | None = None,
    market_names: list[str] | None = None,
    dataset_path: Path = DEFAULT_DATASET_PATH,
) -> MarketDataFetchResult:
    """Read validated fallback/demo market prices from the local dataset."""

    if limit < 1:
        raise ValueError("limit must be at least 1")

    records = []
    skipped = 0
    for raw in _load_raw_records(dataset_path):
        try:
            record = normalize_market_price(raw)
        except (ValidationError, TypeError, ValueError):
            skipped += 1
            continue

        if not _matches_filter(record.commodity, commodity):
            continue
        if not _matches_filter(record.state, state):
            continue
        if not market_names and not _matches_filter(record.district, district):
            continue
        if not _matches_market(record, market_names):
            continue

        records.append(record)
        if len(records) >= limit:
            break

    return MarketDataFetchResult(
        records=records,
        skipped_invalid=skipped,
        source=SOURCE_NAME if records else None,
        available=bool(records),
        using_fallback=bool(records),
        error_kind=None if records else "data",
        error_message=None
        if records
        else "No fallback/demo market records matched the requested filters.",
    )
