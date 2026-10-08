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
import os
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

RESOURCE_URL = (
    "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070"
)
DEFAULT_LIMIT = 10
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
    return None


def _price_per_quintal_to_per_kg(value: object) -> float | None:
    """Convert an Agmarknet INR/quintal field to INR/kg. Does not convert MarketPrice values."""

    try:
        return float(value) / KG_PER_QUINTAL
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
    }


def _build_url(
    api_key: str,
    limit: int,
    commodity: str | None,
    state: str | None,
    district: str | None,
) -> str:
    query: dict[str, str] = {
        "api-key": api_key,
        "format": "json",
        "limit": str(limit),
    }
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
        raise DataGovServiceError(
            f"Data.gov.in returned HTTP {exc.code}"
        ) from exc
    except TimeoutError as exc:
        raise DataGovServiceError("Data.gov.in request timed out") from exc
    except URLError as exc:
        raise DataGovServiceError(
            f"Data.gov.in is unavailable: {exc.reason}"
        ) from exc

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


def fetch_market_prices(
    *,
    limit: int = DEFAULT_LIMIT,
    commodity: str | None = None,
    state: str | None = None,
    district: str | None = None,
    api_key: str | None = None,
) -> MarketDataFetchResult:
    """Fetch and validate mandi prices from Data.gov.in.

    Raises DataGovError subclasses on configuration, transport, HTTP, or
    payload failures. Invalid individual rows are skipped, not raised.
    """
    if limit < 1:
        raise DataGovConfigError("limit must be at least 1")

    key = api_key if api_key is not None else get_api_key()
    url = _build_url(key, limit, commodity, state, district)
    _status, body = _read_http_body(url)
    raw_records = _parse_records_payload(body)
    records, skipped = _normalize_records(raw_records)
    return MarketDataFetchResult(
        records=records,
        skipped_invalid=skipped,
        source=SOURCE_NAME,
        available=True,
    )


def try_fetch_market_prices(
    *,
    limit: int = DEFAULT_LIMIT,
    commodity: str | None = None,
    state: str | None = None,
    district: str | None = None,
    api_key: str | None = None,
) -> MarketDataFetchResult:
    """Same as fetch_market_prices, but never raises.

    On failure returns available=False and empty records so the app can use
    the latest validated local data instead of crashing.
    """
    try:
        return fetch_market_prices(
            limit=limit,
            commodity=commodity,
            state=state,
            district=district,
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
