"""Public Agmarknet last-week market-price provider.

This provider uses only the public filters and market-price last-week
endpoints. The upstream values are observations, not documented modal prices.

HTTP 429 responses from Agmarknet are retried with bounded exponential
backoff (up to _MAX_RETRIES attempts) before raising AgmarknetRateLimitError.
"""

from __future__ import annotations

import json
import math
import socket
import ssl
import time
from datetime import date
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from pydantic import ValidationError

from models.market_models import MarketPrice
from models.market_models import MarketCommodityOption, MarketFilterOption
from services.data_gov_client import MarketDataFetchResult
from core.geography import KARNATAKA_STATE
from services.market_catalogue import find_catalogue_entries, normalize_catalogue_name

BASE_URL = "https://api.agmarknet.gov.in/v1"
SOURCE_NAME = "agmarknet.gov.in"
TIMEOUT_SECONDS = 15
KG_PER_QUINTAL = 100
PRICE_UNIT = "Rs./Quintal"
PRICE_TYPE = "market_price_lastweek_observation"
DEFAULT_MAX_AGE_DAYS = 7
FILTER_SNAPSHOT_PATH = Path(__file__).resolve().parent.parent / "agmarknet_filters.json"

# Retry configuration for HTTP 429 (Too Many Requests).
# Delays are in seconds: attempt 1 waits _RETRY_BASE_SECONDS, attempt 2 waits
# _RETRY_BASE_SECONDS * 2, and so on up to _MAX_RETRIES total attempts.
_MAX_RETRIES = 3
_RETRY_BASE_SECONDS = 1

# In-process TTL cache for the filter payload.  The filter list changes at most
# once a day on Agmarknet; caching it for 10 minutes avoids a redundant live
# hit when the /market-filters and /markets endpoints are called within seconds
# of each other at page load, which would otherwise trigger rate limiting and
# cause the price fetch to fall through to local demo data.
_FILTER_CACHE_TTL_SECONDS = 600  # 10 minutes
_filter_cache: dict[str, object] = {"payload": None, "expires_at": 0.0}

_PRICE_CACHE_TTL_SECONDS = 600  # 10 minutes
_price_cache: dict[tuple[int, int, int], tuple[float, object]] = {}


def clear_caches() -> None:
    """Clear in-process caches for testing and fresh reload."""
    _filter_cache["payload"] = None
    _filter_cache["expires_at"] = 0.0
    _price_cache.clear()



def _max_age_days() -> int:
    raw = os.getenv("AGMARKNET_MAX_AGE_DAYS", str(DEFAULT_MAX_AGE_DAYS))
    try:
        value = int(raw)
    except ValueError as exc:
        raise AgmarknetError("AGMARKNET_MAX_AGE_DAYS must be a non-negative integer") from exc
    if value < 0:
        raise AgmarknetError("AGMARKNET_MAX_AGE_DAYS must be a non-negative integer")
    return value


class AgmarknetError(Exception):
    """Base error for public Agmarknet retrieval and parsing failures."""


class AgmarknetServiceError(AgmarknetError):
    """Network or HTTP failure from Agmarknet."""


class AgmarknetRateLimitError(AgmarknetServiceError):
    """Agmarknet returned HTTP 429 and all bounded retries were exhausted."""


class AgmarknetParseError(AgmarknetError):
    """Malformed or unusable Agmarknet response."""


def _request_json(path: str, *, params: dict[str, object] | None = None) -> object:
    """Make a GET request to the Agmarknet API and return the parsed JSON body.

    Retries up to _MAX_RETRIES times with exponential backoff when the server
    responds with HTTP 429 (Too Many Requests). All other HTTP errors, network
    failures, and parse errors are raised immediately.
    """
    query = f"?{urlencode(params)}" if params else ""
    url = f"{BASE_URL}{path}{query}"
    request_headers = {
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://agmarknet.gov.in",
        "Referer": "https://agmarknet.gov.in/",
        "User-Agent": "FarmProfitAI/0.1",
    }
    # Use a short timeout for static filter catalog queries to avoid blocking the frontend
    # when the live Agmarknet filter endpoint hangs.
    effective_timeout = (
        float(os.getenv("AGMARKNET_FILTER_TIMEOUT_SECONDS", "2.0"))
        if path.endswith("/filters")
        else float(os.getenv("AGMARKNET_TIMEOUT_SECONDS", "5.0"))
    )
    last_exc: AgmarknetServiceError | None = None
    for attempt in range(1, _MAX_RETRIES + 1):
        request = Request(url, headers=request_headers)
        try:
            with urlopen(request, timeout=effective_timeout) as response:
                status = getattr(response, "status", None) or response.getcode()
                body = response.read()
        except HTTPError as exc:
            if exc.code == 429:
                last_exc = AgmarknetRateLimitError(
                    f"Agmarknet rate-limited (HTTP 429), attempt {attempt}/{_MAX_RETRIES}"
                )
                if attempt < _MAX_RETRIES:
                    time.sleep(_RETRY_BASE_SECONDS * (2 ** (attempt - 1)))
                    continue
                raise last_exc from exc
            raise AgmarknetServiceError(f"Agmarknet returned HTTP {exc.code}") from exc
        except (TimeoutError, socket.timeout) as exc:
            raise AgmarknetServiceError("Agmarknet request timed out") from exc
        except ssl.SSLError as exc:
            raise AgmarknetServiceError("Agmarknet TLS connection failed") from exc
        except URLError as exc:
            raise AgmarknetServiceError("Agmarknet is unavailable") from exc
        except OSError as exc:
            raise AgmarknetServiceError("Agmarknet is unavailable") from exc

        if status == 429:
            # Handle 429 returned as a success-status response (non-exception path)
            last_exc = AgmarknetRateLimitError(
                f"Agmarknet rate-limited (HTTP 429), attempt {attempt}/{_MAX_RETRIES}"
            )
            if attempt < _MAX_RETRIES:
                time.sleep(_RETRY_BASE_SECONDS * (2 ** (attempt - 1)))
                continue
            raise last_exc
        if status < 200 or status >= 300:
            raise AgmarknetServiceError(f"Agmarknet returned HTTP {status}")
        try:
            return json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise AgmarknetParseError("Agmarknet response was not valid JSON") from exc
    # Unreachable, but satisfies type checkers
    raise last_exc  # type: ignore[misc]


def _filter_payload() -> object:
    """Load provider filters with a short TTL cache, falling back to the bundled snapshot.

    Caching avoids a second live Agmarknet hit when /market-filters and /markets
    are called within seconds of each other at page load, which would otherwise
    trigger rate limiting and cause the price fetch to fall through to local demo data.
    """
    now = time.monotonic()
    if _filter_cache["payload"] is not None and now < _filter_cache["expires_at"]:
        return _filter_cache["payload"]

    try:
        payload = _request_json("/daily-price-arrival/filters")
        _filter_cache["payload"] = payload
        _filter_cache["expires_at"] = now + _FILTER_CACHE_TTL_SECONDS
        return payload
    except AgmarknetError:
        if not FILTER_SNAPSHOT_PATH.exists():
            raise
        try:
            with FILTER_SNAPSHOT_PATH.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
            _filter_cache["payload"] = payload
            _filter_cache["expires_at"] = now + _FILTER_CACHE_TTL_SECONDS
            return payload
        except (OSError, json.JSONDecodeError) as exc:
            raise AgmarknetParseError("Agmarknet filter snapshot was unavailable") from exc



def _text(value: object) -> str:
    return str(value).strip() if value is not None else ""


def _same(value: object, query: str | None) -> bool:
    return bool(query and _text(value).casefold() == query.strip().casefold())


_COMMODITY_ALIASES: dict[str, str] = {
    "ragi": "Ragi(Finger Millet)",
    "bengal gram": "Bengal Gram(Gram)(Whole)",
    "chana": "Bengal Gram(Gram)(Whole)",
    "gram": "Bengal Gram(Gram)(Whole)",
    "chilli": "Green Chilli",
    "chillies": "Green Chilli",
    "paddy": "Paddy(Common)",
    "cotton": "Cotton",
    "groundnut": "Groundnut",
    "tur": "Arhar (Tur/Red Gram)(Whole)",
    "red gram": "Arhar (Tur/Red Gram)(Whole)",
    "toor": "Arhar (Tur/Red Gram)(Whole)",
    "toor dal": "Arhar Dal(Tur Dal)",
    "green gram": "Green Gram (Moong)(Whole)",
    "moong": "Green Gram (Moong)(Whole)",
    "black gram": "Black Gram (Urd Beans)(Whole)",
    "urad": "Black Gram (Urd Beans)(Whole)",
    "jowar": "Jowar(Sorghum)",
    "sorghum": "Jowar(Sorghum)",
    "bajra": "Bajra(Pearl Millet/Cumbu)",
    "capsicum": "Capsicum",
    "maize": "Maize",
    "onion": "Onion",
    "potato": "Potato",
    "tomato": "Tomato",
}


def _resolve_commodity_row(commodities: list[dict[str, object]], query: str | None) -> dict[str, object] | None:
    if not query or not query.strip():
        return None
    import re
    q = query.strip().casefold()
    # 1. Alias lookup
    alias = _COMMODITY_ALIASES.get(q)
    if alias:
        for row in commodities:
            if isinstance(row, dict) and _same(row.get("cmdt_name"), alias):
                return row
    # 2. Exact match
    for row in commodities:
        if isinstance(row, dict) and _same(row.get("cmdt_name"), q):
            return row
    # 3. Strip parentheses (e.g. "Ragi" matches "Ragi(Finger Millet)")
    for row in commodities:
        if isinstance(row, dict):
            cname = _text(row.get("cmdt_name"))
            base = re.sub(r"\(.*?\)", "", cname).strip().casefold()
            if base == q:
                return row
    # 4. Word boundary / startswith match
    for row in commodities:
        if isinstance(row, dict):
            cname = _text(row.get("cmdt_name")).casefold()
            words = cname.split()
            if q in words or cname.startswith(q):
                return row
    # 5. Substring match fallback
    for row in commodities:
        if isinstance(row, dict) and q in _text(row.get("cmdt_name")).casefold():
            return row
    return None


def _finite_number(value: object) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) and number >= 0 else None


def _parse_date(value: object) -> date | None:
    try:
        return date.fromisoformat(_text(value))
    except ValueError:
        return None


def _filter_ids(
    payload: object,
    *,
    commodity: str | None,
    state: str | None,
    district: str | None,
    market_names: list[str] | None = None,
) -> tuple[int, int, list[dict[str, object]], dict[int, str]]:
    if not isinstance(payload, dict) or not payload.get("status"):
        raise AgmarknetParseError("Agmarknet filters response was invalid")
    data = payload.get("data")
    if not isinstance(data, dict):
        raise AgmarknetParseError("Agmarknet filters data was missing")

    states = data.get("state_data")
    districts = data.get("district_data")
    commodities = data.get("cmdt_data")
    markets = data.get("market_data")
    if not all(isinstance(items, list) for items in (states, districts, commodities, markets)):
        raise AgmarknetParseError("Agmarknet filters lists were missing")

    state_row = next((row for row in states if isinstance(row, dict) and _same(row.get("state_name"), state)), None)
    commodity_row = _resolve_commodity_row(commodities, commodity)
    if not state_row or not commodity_row:
        raise AgmarknetParseError("Agmarknet filters did not match the requested crop and state")
    state_id = state_row.get("state_id")
    commodity_id = commodity_row.get("cmdt_id")

    target_district_ids: set[int] = set()
    is_ramanagar_query = False
    if district:
        norm_dist = normalize_catalogue_name(district)
        if norm_dist in ("ramanagar", "ramanagara"):
            is_ramanagar_query = True
            # In Agmarknet, Ramanagar markets (Channapatna, Kanakapura, Ramanagara APMC)
            # are classified under district_id 728 (Bengaluru South) while 265 has 0 markets.
            target_district_ids.update({265, 728})
        else:
            for row in districts:
                if isinstance(row, dict) and row.get("state_id") == state_id:
                    if normalize_catalogue_name(row.get("district_name")) == norm_dist:
                        target_district_ids.add(row.get("id"))

        if not target_district_ids:
            raise AgmarknetParseError("Agmarknet filters did not match the requested district")

    district_names_by_id = {
        row.get("id"): _text(row.get("district_name"))
        for row in districts
        if isinstance(row, dict)
        and isinstance(row.get("id"), int)
        and _text(row.get("district_name"))
    }
    requested_market_ids: set[int] = set()
    requested_market_keys: set[str] = set()
    if market_names:
        requested_market_keys = {
            normalize_catalogue_name(name)
            for name in market_names
            if _text(name)
        }
        requested_market_ids = {
            entry.id
            for entry in find_catalogue_entries([name for name in market_names if _text(name)])
        }
    selected_markets = [
        row for row in markets
        if isinstance(row, dict)
        and row.get("state_id") == state_id
        and (
            (
                market_names
                and (
                    row.get("id") in requested_market_ids
                    or normalize_catalogue_name(_text(row.get("mkt_name"))) in requested_market_keys
                )
            )
            or (
                not market_names
                and (not target_district_ids or row.get("district_id") in target_district_ids)
            )
        )
    ]
    if is_ramanagar_query:
        # Keep only the actual Ramanagar APMCs
        selected_markets = [
            m for m in selected_markets
            if any(k in _text(m.get("mkt_name")).casefold() for k in ("ramanagar", "channapatna", "kanakapura"))
        ]
        # Ensure district display name is Ramanagar for these records
        for m in selected_markets:
            district_names_by_id[m.get("district_id")] = "Ramanagar"

    if not isinstance(state_id, int) or not isinstance(commodity_id, int):
        raise AgmarknetParseError("Agmarknet filter IDs were invalid")
    if market_names and not selected_markets:
        raise AgmarknetParseError("Agmarknet filters did not match the requested market")
    return state_id, commodity_id, selected_markets, district_names_by_id


def _filter_options(
    payload: object,
) -> tuple[list[MarketFilterOption], list[MarketFilterOption], list[MarketCommodityOption]]:
    """Extract all state and district options while preserving their relationship."""
    if not isinstance(payload, dict) or not payload.get("status"):
        raise AgmarknetParseError("Agmarknet filters response was invalid")
    data = payload.get("data")
    if not isinstance(data, dict):
        raise AgmarknetParseError("Agmarknet filters data was missing")

    states = data.get("state_data")
    districts = data.get("district_data")
    commodities = data.get("cmdt_data")
    if not isinstance(states, list) or not isinstance(districts, list) or not isinstance(commodities, list):
        raise AgmarknetParseError("Agmarknet geography filter lists were missing")

    parsed_states: list[MarketFilterOption] = []
    parsed_districts: list[MarketFilterOption] = []
    parsed_commodities: list[MarketCommodityOption] = []
    for row in states:
        if not isinstance(row, dict):
            continue
        state_id = row.get("state_id")
        name = _text(row.get("state_name"))
        if isinstance(state_id, int) and name:
            parsed_states.append(MarketFilterOption(id=state_id, name=name))
    for row in districts:
        if not isinstance(row, dict):
            continue
        district_id = row.get("id")
        state_id = row.get("state_id")
        name = _text(row.get("district_name"))
        if isinstance(district_id, int) and isinstance(state_id, int) and name:
            parsed_districts.append(
                MarketFilterOption(id=district_id, name=name, state_id=state_id)
            )
    for row in commodities:
        if not isinstance(row, dict):
            continue
        commodity_id = row.get("cmdt_id")
        name = _text(row.get("cmdt_name"))
        if isinstance(commodity_id, int) and name:
            parsed_commodities.append(MarketCommodityOption(id=commodity_id, name=name))
    state_ids = {option.id for option in parsed_states}
    parsed_districts = [
        option for option in parsed_districts if option.state_id in state_ids
    ]
    karnataka_state = next(
        (option for option in parsed_states
         if option.name.casefold() == KARNATAKA_STATE.casefold()),
        None,
    )
    if karnataka_state is None:
        raise AgmarknetParseError("Agmarknet geography filters did not include Karnataka")
    parsed_states = [karnataka_state]
    parsed_districts = [
        option for option in parsed_districts
        if option.state_id == karnataka_state.id
    ]
    if not parsed_states or not parsed_districts or not parsed_commodities:
        raise AgmarknetParseError("Agmarknet geography filters contained no usable options")
    parsed_commodities.sort(key=lambda option: option.name.casefold())
    return parsed_states, parsed_districts, parsed_commodities


def fetch_filter_options() -> tuple[list[MarketFilterOption], list[MarketFilterOption]]:
    """Fetch and validate geography options from Agmarknet."""
    states, districts, _commodities = fetch_filter_metadata()
    return states, districts


def fetch_filter_metadata() -> tuple[
    list[MarketFilterOption],
    list[MarketFilterOption],
    list[MarketCommodityOption],
]:
    """Fetch and validate geography and commodity options from Agmarknet."""
    return _filter_options(_filter_payload())


def _records_from_report(
    payload: object,
    *,
    commodity: str,
    state: str,
    district: str,
    market: str,
) -> tuple[list[MarketPrice], int]:
    if not isinstance(payload, dict) or payload.get("success") is not True:
        raise AgmarknetParseError("Agmarknet price response was unsuccessful")
    columns = payload.get("columns")
    rows = payload.get("data")
    if not isinstance(columns, list) or not isinstance(rows, list):
        raise AgmarknetParseError("Agmarknet price response lacked columns or data")
    column_dates = {
        _text(column.get("key"))
        for column in columns
        if isinstance(column, dict) and _parse_date(column.get("key"))
    }
    row_dates = {
        _text(key)
        for row in rows
        if isinstance(row, dict)
        for key in row
        if _parse_date(key)
    }
    dates = column_dates | row_dates
    unit = PRICE_UNIT
    records: list[MarketPrice] = []
    skipped = 0
    max_age_days = _max_age_days()
    for row in rows:
        if not isinstance(row, dict):
            skipped += 1
            continue
        raw_variety = _text(row.get("variety"))
        from db import extract_genuine_variety
        clean_variety = (
            extract_genuine_variety(raw_variety, commodity=commodity, market=market)
            if raw_variety
            else None
        )
        for date_key in dates:
            observed = _finite_number(row.get(date_key))
            parsed_date = _parse_date(date_key)
            if observed is None or parsed_date is None:
                skipped += 1
                continue
            row_unit = _text(row.get("unitOfPrice")) or unit
            if row_unit.casefold() != PRICE_UNIT.casefold():
                skipped += 1
                continue
            price_per_kg = observed / KG_PER_QUINTAL
            age_days = (date.today() - parsed_date).days
            is_stale = age_days > max_age_days
            try:
                records.append(
                    MarketPrice(
                        commodity=commodity,
                        variety=clean_variety,
                        state=state,
                        district=district or market,
                        market=market,
                        date=parsed_date,
                        min_price=None,
                        max_price=None,
                        modal_price=None,
                        observation_price_per_kg=price_per_kg,
                        price_type=PRICE_TYPE,
                        source_provider=SOURCE_NAME,
                        source_unit=row_unit,
                        source_price_value=observed,
                        is_stale=is_stale,
                        freshness_status="stale" if is_stale else "within_configured_window",
                    )
                )
            except (ValidationError, TypeError, ValueError):
                skipped += 1
    return records, skipped


def fetch_market_prices(
    *,
    limit: int = 10,
    commodity: str | None = None,
    state: str | None = None,
    district: str | None = None,
    market_names: list[str] | None = None,
) -> MarketDataFetchResult:
    """Fetch recent Agmarknet observations for safely resolved market IDs."""
    if limit < 1:
        raise AgmarknetError("limit must be at least 1")
    if not commodity or not state:
        raise AgmarknetError("Agmarknet requires commodity and state filters")

    filter_payload = _filter_payload()
    state_id, commodity_id, markets, district_names_by_id = _filter_ids(
        filter_payload,
        commodity=commodity,
        state=state,
        district=district,
        market_names=market_names,
    )
    # Diversify markets across districts when querying state-wide without specific market filters
    if not district and not market_names:
        from collections import defaultdict
        by_dist = defaultdict(list)
        for m in markets:
            by_dist[m.get("district_id")].append(m)
        candidate_markets = []
        max_len = max((len(v) for v in by_dist.values()), default=0)
        for i in range(max_len):
            for m_list in by_dist.values():
                if i < len(m_list):
                    candidate_markets.append(m_list[i])
    else:
        candidate_markets = markets

    records: list[MarketPrice] = []
    skipped = 0
    now = time.monotonic()
    for idx, market_row in enumerate(candidate_markets):
        market_id = market_row.get("id")
        market_name = _text(market_row.get("mkt_name"))
        if not isinstance(market_id, int) or not market_name:
            skipped += 1
            continue
        market_district = district_names_by_id.get(market_row.get("district_id")) or district or market_name

        cache_key = (market_id, state_id, commodity_id)
        cached_entry = _price_cache.get(cache_key)
        if cached_entry is not None and now < cached_entry[0]:
            payload = cached_entry[1]
        else:
            if idx > 0:
                time.sleep(0.05)
            try:
                payload = _request_json(
                    "/prices-and-arrivals/market-price/lastweek",
                    params={
                        "marketId": market_id,
                        "stateId": state_id,
                        "commodityId": commodity_id,
                        "includeExcel": "false",
                    },
                )
                _price_cache[cache_key] = (now + _PRICE_CACHE_TTL_SECONDS, payload)
            except (AgmarknetServiceError, AgmarknetRateLimitError) as exc:
                if records:
                    break
                raise

        market_records, market_skipped = _records_from_report(
            payload,
            commodity=commodity,
            state=state,
            district=market_district,
            market=market_name,
        )
        records.extend(market_records)
        skipped += market_skipped
        distinct_markets_count = len({r.market for r in records})
        if distinct_markets_count >= limit:
            break
    records.sort(key=lambda record: record.date, reverse=True)
    return MarketDataFetchResult(
        records=records,
        skipped_invalid=skipped,
        source=SOURCE_NAME if records else None,
        available=bool(records),
        error_kind=None if records else "data",
        error_message=None
        if records
        else f"No Agmarknet market arrivals reported for {commodity} in {district or state} during the observation period.",
    )


def try_fetch_market_prices(**kwargs: object) -> MarketDataFetchResult:
    try:
        return fetch_market_prices(**kwargs)
    except AgmarknetError as exc:
        # AgmarknetServiceError (and its subclasses, including AgmarknetRateLimitError)
        # are network/HTTP failures → "service". Pure AgmarknetError (validation guards
        # such as "requires commodity and state" or "limit must be at least 1") → "config".
        if isinstance(exc, AgmarknetServiceError):
            kind = "service"
        elif isinstance(exc, AgmarknetParseError):
            kind = "service"
        else:
            kind = "config"
        return MarketDataFetchResult(
            records=[],
            source=None,
            available=False,
            error_kind=kind,
            error_message=str(exc),
        )
