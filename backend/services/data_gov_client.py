"""Data.gov.in client for Agmarknet daily mandi prices.

This module only talks to the external API and maps records onto MarketPrice.
It does not invent market data. Callers should catch DataGovError (or use
try_fetch_market_prices) and fall back to the latest validated local data.

Unit assumption: Agmarknet ``min_price``, ``max_price``, and ``modal_price``
are INR per quintal (100 kg). FarmProfit ``MarketPrice`` stores INR per kg.
Conversion happens only in this mapping layer: price_per_kg = price_per_quintal / 100.
"""

from __future__ import annotations

import json
import math
import os
import socket
import ssl
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from pydantic import ValidationError

from models.market_models import MarketPrice
from services.market_data_service import normalize_market_price
from services.market_catalogue import find_catalogue_entries, normalize_catalogue_name

RESOURCE_URL = (
    "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070"
)
DEFAULT_LIMIT = 100          # default page size; data.gov.in allows up to 1000
MAX_PAGE_SIZE = 100          # safe page size that data.gov.in reliably serves
TIMEOUT_SECONDS = 15
SOURCE_NAME = "data.gov.in"
# Agmarknet mandi prices are INR per quintal; 1 quintal = 100 kg.
KG_PER_QUINTAL = 100

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_PROJECT_ROOT = _BACKEND_DIR.parent


class DataGovError(Exception):
    """Base error for Data.gov.in integration failures."""


class DataGovConfigError(DataGovError):
    """Missing or invalid local configuration (for example the API key)."""


class DataGovServiceError(DataGovError):
    """Network, timeout, or non-success HTTP response from Data.gov.in."""


class DataGovAuthError(DataGovServiceError):
    """Data.gov.in rejected the configured API key or permissions."""


class DataGovParseError(DataGovError):
    """Response body could not be parsed as the expected JSON payload."""


@dataclass
class MarketDataFetchResult:
    """Outcome of a Data.gov.in fetch, including skipped invalid rows.

    When ``available`` is False, ``records`` is empty and ``error_*`` describe
    why a later layer should use the latest validated local data instead.
    """

    records: list[MarketPrice]
    skipped_invalid: int = 0
    source: str | None = SOURCE_NAME
    available: bool = True
    using_fallback: bool = False
    error_kind: str | None = None
    error_message: str | None = None


def _load_env_files() -> None:
    load_dotenv(_PROJECT_ROOT / ".env")
    load_dotenv(_BACKEND_DIR / ".env")


def get_api_key() -> str:
    _load_env_files()
    key = (os.getenv("DATA_GOV_API_KEY") or "").strip()
    if not key:
        raise DataGovConfigError(
            "DATA_GOV_API_KEY is not set. Add it to the environment or a .env file."
        )
    return key


def _parse_arrival_date(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return None
    return None


def _price_per_quintal_to_per_kg(value: object) -> float | None:
    """Convert an Agmarknet INR/quintal field to INR/kg. Does not convert MarketPrice values."""

    try:
        converted = float(value) / KG_PER_QUINTAL
        return converted if math.isfinite(converted) and converted >= 0 else None
    except (TypeError, ValueError):
        return None


def _map_api_record(raw: dict[str, Any]) -> dict[str, Any] | None:
    arrival = _parse_arrival_date(raw.get("arrival_date"))
    if arrival is None:
        return None

    min_price = _price_per_quintal_to_per_kg(raw.get("min_price"))
    max_price = _price_per_quintal_to_per_kg(raw.get("max_price"))
    modal_price = _price_per_quintal_to_per_kg(raw.get("modal_price"))
    if min_price is None or max_price is None or modal_price is None:
        return None

    raw_modal = None
    try:
        raw_modal = float(raw.get("modal_price"))
    except (TypeError, ValueError):
        pass

    return {
        "commodity": raw.get("commodity"),
        "variety": raw.get("variety"),
        "state": raw.get("state"),
        "district": raw.get("district"),
        "market": raw.get("market"),
        "date": arrival,
        "min_price": min_price,
        "max_price": max_price,
        "modal_price": modal_price,
        "observation_price_per_kg": modal_price,
        "price_type": "modal_price",
        "source_provider": SOURCE_NAME,
        "source_unit": "Rs./Quintal",
        "source_price_value": raw_modal,
    }


def _build_url(
    api_key: str,
    limit: int,
    commodity: str | None,
    state: str | None,
    district: str | None,
    offset: int = 0,
) -> str:
    query: dict[str, str] = {
        "api-key": api_key,
        "format": "json",
        "limit": str(limit),
    }
    if offset > 0:
        query["offset"] = str(offset)
    if commodity and commodity.strip():
        query["filters[commodity]"] = commodity.strip()
    if state and state.strip():
        query["filters[state]"] = state.strip()
    if district and district.strip():
        query["filters[district]"] = district.strip()
    return f"{RESOURCE_URL}?{urlencode(query, safe='[]')}"


def _read_http_body(url: str) -> tuple[int, bytes]:
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "FarmProfitAI/0.1",
        },
    )
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            status = getattr(response, "status", None) or response.getcode()
            body = response.read()
    except HTTPError as exc:
        error_type = DataGovAuthError if exc.code in (401, 403) else DataGovServiceError
        raise error_type(f"Data.gov.in returned HTTP {exc.code}") from exc
    except (TimeoutError, socket.timeout) as exc:
        raise DataGovServiceError("Data.gov.in request timed out") from exc
    except ssl.SSLError as exc:
        raise DataGovServiceError("Data.gov.in TLS connection failed") from exc
    except URLError as exc:
        reason = exc.reason
        if isinstance(reason, (TimeoutError, socket.timeout)):
            message = "Data.gov.in request timed out"
        elif isinstance(reason, ssl.SSLError):
            message = "Data.gov.in TLS connection failed"
        else:
            message = "Data.gov.in is unavailable"
        raise DataGovServiceError(message) from exc
    except OSError as exc:
        if isinstance(exc, (TimeoutError, socket.timeout)):
            message = "Data.gov.in request timed out"
        else:
            message = "Data.gov.in is unavailable"
        raise DataGovServiceError(message) from exc

    if status < 200 or status >= 300:
        raise DataGovServiceError(f"Data.gov.in returned HTTP {status}")
    return status, body


def _parse_records_payload(body: bytes) -> list[Any]:
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise DataGovParseError("Data.gov.in response was not valid JSON") from exc

    if not isinstance(payload, dict):
        raise DataGovParseError("Data.gov.in response JSON must be an object")

    records = payload.get("records")
    if not isinstance(records, list):
        raise DataGovParseError("Data.gov.in response did not contain a records list")
    return records


def _normalize_records(raw_records: list[Any]) -> tuple[list[MarketPrice], int]:
    valid: list[MarketPrice] = []
    skipped = 0
    for item in raw_records:
        if not isinstance(item, dict):
            skipped += 1
            continue
        mapped = _map_api_record(item)
        if mapped is None:
            skipped += 1
            continue
        try:
            valid.append(normalize_market_price(mapped))
        except (ValidationError, TypeError, ValueError):
            skipped += 1
    return valid, skipped


def _matches_market_names(record: MarketPrice, market_names: list[str] | None) -> bool:
    if not market_names:
        return True
    record_key = normalize_catalogue_name(record.market)
    requested_keys = {
        normalize_catalogue_name(name)
        for name in market_names
        if str(name).strip()
    }
    if record_key in requested_keys:
        return True
    entries = find_catalogue_entries([name for name in market_names if str(name).strip()])
    return any(
        normalize_catalogue_name(record.market) == normalize_catalogue_name(entry.name)
        and normalize_catalogue_name(record.district) == normalize_catalogue_name(entry.district)
        for entry in entries
    )


def fetch_market_prices(
    *,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
    commodity: str | None = None,
    state: str | None = None,
    district: str | None = None,
    market_names: list[str] | None = None,
    api_key: str | None = None,
) -> MarketDataFetchResult:
    """Fetch and validate mandi prices from Data.gov.in.

    When ``limit`` exceeds ``MAX_PAGE_SIZE`` this function automatically paginates
    through the data.gov.in API and merges all pages.  Invalid individual rows
    are skipped, not raised.  Raises DataGovError subclasses on configuration,
    transport, HTTP, or payload failures.
    """
    if limit < 1:
        raise DataGovConfigError("limit must be at least 1")
    if offset < 0:
        raise DataGovConfigError("offset must be non-negative")

    key = api_key if api_key is not None else get_api_key()

    all_records: list[MarketPrice] = []
    total_skipped = 0
    remaining = limit
    current_offset = offset

    while remaining > 0:
        page_size = min(remaining, MAX_PAGE_SIZE)
        url = _build_url(key, page_size, commodity, state, district, offset=current_offset)
        _status, body = _read_http_body(url)
        raw_records = _parse_records_payload(body)

        # Empty page → no more data from provider
        if not raw_records:
            break

        records, skipped = _normalize_records(raw_records)
        records = [
            record for record in records
            if _matches_market_names(record, market_names)
        ]
        all_records.extend(records)
        total_skipped += skipped

        # If the provider returned fewer rows than requested the page was the last
        if len(raw_records) < page_size:
            break

        remaining -= page_size
        current_offset += page_size

    return MarketDataFetchResult(
        records=all_records,
        skipped_invalid=total_skipped,
        source=SOURCE_NAME,
        available=bool(all_records),
        error_kind=None if all_records else "data",
        error_message=None if all_records else "No Data.gov.in market records matched the requested filters.",
    )


def try_fetch_market_prices(
    *,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
    commodity: str | None = None,
    state: str | None = None,
    district: str | None = None,
    market_names: list[str] | None = None,
    api_key: str | None = None,
) -> MarketDataFetchResult:
    """Same as fetch_market_prices, but never raises.

    On failure returns available=False and empty records so the app can use
    the latest validated local data instead of crashing.
    """
    try:
        return fetch_market_prices(
            limit=limit,
            offset=offset,
            commodity=commodity,
            state=state,
            district=district,
            market_names=market_names,
            api_key=api_key,
        )
    except DataGovConfigError as exc:
        return MarketDataFetchResult(
            records=[],
            source=None,
            available=False,
            error_kind="config",
            error_message=str(exc),
        )
    except DataGovAuthError as exc:
        return MarketDataFetchResult(
            records=[],
            source=None,
            available=False,
            error_kind="auth",
            error_message=str(exc),
        )
    except DataGovServiceError as exc:
        return MarketDataFetchResult(
            records=[],
            source=None,
            available=False,
            error_kind="service",
            error_message=str(exc),
        )
    except DataGovParseError as exc:
        return MarketDataFetchResult(
            records=[],
            source=None,
            available=False,
            error_kind="parse",
            error_message=str(exc),
        )
