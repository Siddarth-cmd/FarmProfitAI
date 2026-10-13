from datetime import date

import pytest

from services import agmarknet_client


@pytest.fixture(autouse=True)
def _reset_filter_cache():
    """Reset the in-process filter TTL cache before every test.

    The cache persists across tests within a single process run.  Without this
    fixture, a test that monkeypatches ``_request_json`` to provide a fake filter
    payload will inadvertently warm the cache; subsequent tests then skip the
    filter HTTP call, shifting the index of every recorded request by -1 and
    causing assertions like ``requests[1]`` to raise ``IndexError``.
    """
    agmarknet_client.clear_caches()
    yield
    agmarknet_client.clear_caches()


def _filters() -> dict:
    return {
        "status": True,
        "data": {
            "state_data": [{"state_id": 16, "state_name": "Karnataka"}],
            "district_data": [
                {"id": 263, "state_id": 16, "district_name": "Mysuru"},
                {"id": 254, "state_id": 16, "district_name": "Hassan"},
                {"id": 261, "state_id": 16, "district_name": "Mandya"},
                {"id": 244, "state_id": 16, "district_name": "Belagavi"},
            ],
            "cmdt_data": [
                {"cmdt_id": 65, "cmdt_name": "Tomato"},
                {"cmdt_id": 23, "cmdt_name": "Onion"},
            ],
            "market_data": [
                {"id": 115, "mkt_name": "Mysuru APMC", "state_id": 16, "district_id": 263},
                {"id": 735, "mkt_name": "Hassan APMC", "state_id": 16, "district_id": 254},
                {"id": 748, "mkt_name": "Mandya APMC", "state_id": 16, "district_id": 261},
                {"id": 749, "mkt_name": "Late Market APMC", "state_id": 16, "district_id": 261},
                {"id": 101, "mkt_name": "Belgaum APMC", "state_id": 16, "district_id": 244},
            ],
        },
    }


def _report() -> dict:
    return {
        "success": True,
        "columns": [
            {"key": "variety", "title": "Market - Variety"},
            {"key": "2026-10-09", "title": "09-10-2026"},
            {"key": "2026-10-08", "title": "08-10-2026"},
            {"key": "unitOfPrice", "title": "Unit of Price"},
        ],
        "data": [
            {
                "variety": "Mysuru APMC - Tomato",
                "2026-10-09": 2400,
                "2026-10-08": "NR",
                "unitOfPrice": "Rs./Quintal",
            }
        ],
    }


def test_report_parser_converts_and_preserves_observation_metadata():
    records, skipped = agmarknet_client._records_from_report(
        _report(),
        commodity="Tomato",
        state="Karnataka",
        district="Mysuru",
        market="Mysuru APMC",
    )

    assert skipped == 1
    assert len(records) == 1
    record = records[0]
    assert record.date == date(2026, 10, 9)
    assert record.modal_price is None
    assert record.min_price is None
    assert record.max_price is None
    assert record.observation_price_per_kg == 24
    assert record.price_type == "market_price_lastweek_observation"
    assert record.source_provider == "agmarknet.gov.in"
    assert record.source_unit == "Rs./Quintal"
    assert record.source_price_value == 2400


def test_filter_options_parse_state_and_district_relationships():
    states, districts, commodities = agmarknet_client._filter_options(_filters())

    assert [(option.id, option.name) for option in states] == [(16, "Karnataka")]
    assert [
        (option.id, option.name, option.state_id) for option in districts
    ] == [
        (263, "Mysuru", 16),
        (254, "Hassan", 16),
        (261, "Mandya", 16),
        (244, "Belagavi", 16),
    ]
    assert [(option.id, option.name) for option in commodities] == [
        (23, "Onion"),
        (65, "Tomato"),
    ]


def test_report_parser_marks_observations_older_than_configured_window(monkeypatch):
    monkeypatch.setenv("AGMARKNET_MAX_AGE_DAYS", "0")
    records, _ = agmarknet_client._records_from_report(
        _report(),
        commodity="Tomato",
        state="Karnataka",
        district="Mysuru",
        market="Mysuru APMC",
    )

    assert records[0].is_stale is True
    assert records[0].freshness_status == "stale"


def test_report_parser_skips_invalid_prices():
    payload = _report()
    payload["data"][0].update(
        {"2026-10-09": -1, "2026-10-08": "not-a-number", "2026-10-07": float("inf")}
    )
    payload["columns"].append({"key": "2026-10-07", "title": "07-10-2026"})

    records, skipped = agmarknet_client._records_from_report(
        payload,
        commodity="Tomato",
        state="Karnataka",
        district="Mysuru",
        market="Mysuru APMC",
    )

    assert records == []
    assert skipped == 3


def test_fetch_resolves_filters_and_requests_verified_query(monkeypatch):
    requests: list[tuple[str, dict | None]] = []

    def fake_request(path: str, *, params=None):
        requests.append((path, params))
        return _filters() if path.endswith("/filters") else _report()

    monkeypatch.setattr(agmarknet_client, "_request_json", fake_request)

    result = agmarknet_client.fetch_market_prices(
        limit=5,
        commodity="Tomato",
        state="Karnataka",
        district="Mysuru",
    )

    assert result.available is True
    assert result.source == "agmarknet.gov.in"
    assert requests[0] == ("/daily-price-arrival/filters", None)
    assert requests[1] == (
        "/prices-and-arrivals/market-price/lastweek",
        {"marketId": 115, "stateId": 16, "commodityId": 65, "includeExcel": "false"},
    )


def test_fetch_selected_non_mysuru_market_uses_own_provider_id(monkeypatch):
    requests: list[tuple[str, dict | None]] = []

    def fake_request(path: str, *, params=None):
        requests.append((path, params))
        return _filters() if path.endswith("/filters") else _report()

    monkeypatch.setattr(agmarknet_client, "_request_json", fake_request)

    result = agmarknet_client.fetch_market_prices(
        limit=5,
        commodity="Tomato",
        state="Karnataka",
        district="Mysuru",
        market_names=["Hassan APMC"],
    )

    assert result.available is True
    assert result.records[0].district == "Hassan"
    assert result.records[0].market == "Hassan APMC"
    assert requests[1] == (
        "/prices-and-arrivals/market-price/lastweek",
        {"marketId": 735, "stateId": 16, "commodityId": 65, "includeExcel": "false"},
    )


def test_fetch_second_supported_crop_uses_own_commodity_id(monkeypatch):
    requests: list[tuple[str, dict | None]] = []

    def fake_request(path: str, *, params=None):
        requests.append((path, params))
        return _filters() if path.endswith("/filters") else _report()

    monkeypatch.setattr(agmarknet_client, "_request_json", fake_request)

    result = agmarknet_client.fetch_market_prices(
        limit=5,
        commodity="Onion",
        state="Karnataka",
        market_names=["Mandya APMC"],
    )

    assert result.available is True
    assert result.records[0].commodity == "Onion"
    assert result.records[0].market == "Mandya APMC"
    assert requests[1] == (
        "/prices-and-arrivals/market-price/lastweek",
        {"marketId": 748, "stateId": 16, "commodityId": 23, "includeExcel": "false"},
    )


@pytest.mark.parametrize(
    ("commodity", "commodity_id"),
    [
        ("Tomato", 65),
        ("Onion", 23),
    ],
)
def test_fetch_belagavi_uses_dynamic_district_and_commodity_ids(
    monkeypatch,
    commodity,
    commodity_id,
):
    requests: list[tuple[str, dict | None]] = []

    def fake_request(path: str, *, params=None):
        requests.append((path, params))
        return _filters() if path.endswith("/filters") else _report()

    monkeypatch.setattr(agmarknet_client, "_request_json", fake_request)

    result = agmarknet_client.fetch_market_prices(
        limit=5,
        commodity=commodity,
        state="Karnataka",
        district="Belagavi",
    )

    assert result.available is True
    assert result.records[0].district == "Belagavi"
    assert result.records[0].market == "Belgaum APMC"
    assert result.records[0].commodity == commodity
    assert requests[1] == (
        "/prices-and-arrivals/market-price/lastweek",
        {"marketId": 101, "stateId": 16, "commodityId": commodity_id, "includeExcel": "false"},
    )


def test_fetch_missing_market_mapping_fails_safely(monkeypatch):
    monkeypatch.setattr(agmarknet_client, "_request_json", lambda *_args, **_kwargs: _filters())

    result = agmarknet_client.try_fetch_market_prices(
        limit=5,
        commodity="Tomato",
        state="Karnataka",
        market_names=["Unknown APMC"],
    )

    assert result.available is False
    assert result.records == []
    assert result.error_kind == "service"
    assert "requested market" in result.error_message


def test_fetch_scans_past_empty_early_markets_until_records_found(monkeypatch):
    requests: list[tuple[str, dict | None]] = []

    def fake_request(path: str, *, params=None):
        requests.append((path, params))
        if path.endswith("/filters"):
            return _filters()
        if params["marketId"] == 748:
            return {"success": True, "columns": [{"key": "2026-10-09"}], "data": []}
        return _report()

    monkeypatch.setattr(agmarknet_client, "_request_json", fake_request)

    result = agmarknet_client.fetch_market_prices(
        limit=1,
        commodity="Tomato",
        state="Karnataka",
        district="Mandya",
    )

    requested_ids = [
        params["marketId"] for path, params in requests if path.endswith("/lastweek")
    ]
    assert requested_ids == [748, 749]
    assert result.available is True
    assert result.records[0].market == "Late Market APMC"


def test_filter_metadata_uses_snapshot_when_live_filters_unavailable(monkeypatch):
    monkeypatch.setattr(
        agmarknet_client,
        "_request_json",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            agmarknet_client.AgmarknetServiceError("network unavailable")
        ),
    )

    states, districts, commodities = agmarknet_client.fetch_filter_metadata()

    assert [(state.id, state.name) for state in states] == [(16, "Karnataka")]
    assert any(district.name == "Belagavi" for district in districts)
    assert any(commodity.name == "Tomato" for commodity in commodities)


def test_fetch_returns_safe_failure_for_missing_required_filters():
    result = agmarknet_client.try_fetch_market_prices(commodity="Tomato")

    assert result.available is False
    assert result.error_kind == "config"
    assert "requires commodity and state" in result.error_message


@pytest.mark.parametrize("exception", [TimeoutError(), OSError("connection refused")])
def test_request_errors_are_sanitized(monkeypatch, exception):
    def fail(*_args, **_kwargs):
        raise exception

    monkeypatch.setattr(agmarknet_client, "urlopen", fail)

    with pytest.raises(agmarknet_client.AgmarknetServiceError) as raised:
        agmarknet_client._request_json("/daily-price-arrival/filters")

    assert "connection refused" not in str(raised.value)


# ---------------------------------------------------------------------------
# Verified Mysuru-Tomato live payload shape (confirmed 2026-10-12)
# marketId=115, stateId=16, commodityId=65, includeExcel=false
# ---------------------------------------------------------------------------

def _mysuru_tomato_report() -> dict:
    """Mirror of the real API response shape observed for Mysuru APMC Tomato."""
    return {
        "success": True,
        "message": "Data fetched successfully.",
        "title": "Market-wise Prices during last week Commodity: Tomato, State/UT: Karnataka",
        "columns": [
            {"key": "variety", "title": "Market - Variety"},
            {"key": "2026-10-10", "title": "10-10-2026"},
            {"key": "2026-10-09", "title": "09-10-2026"},
            {"key": "2026-10-08", "title": "08-10-2026"},
            {"key": "2026-10-07", "title": "07-10-2026"},
            {"key": "2026-10-06", "title": "06-10-2026"},
            {"key": "2026-10-05", "title": "05-10-2026"},
            {"key": "2026-10-04", "title": "04-10-2026"},
            {"key": "unitOfPrice", "title": "Unit of Price"},
        ],
        "data": [
            {
                "variety": "Mysuru APMC - Tomato",
                "2026-10-10": "NR",
                "2026-10-09": 2400.0,
                "2026-10-08": 2600.0,
                "2026-10-07": 3200.0,
                "2026-10-06": 3200.0,
                "2026-10-05": 3200.0,
                "2026-10-04": 3700.0,
                "unitOfPrice": "Rs./Quintal",
            }
        ],
    }


def test_mysuru_tomato_request_uses_verified_query_params(monkeypatch):
    """_request_json must be called with the exact params verified against live API."""
    requests: list[tuple[str, dict | None]] = []

    def fake_request(path: str, *, params=None):
        requests.append((path, params))
        return _filters() if path.endswith("/filters") else _mysuru_tomato_report()

    monkeypatch.setattr(agmarknet_client, "_request_json", fake_request)

    result = agmarknet_client.fetch_market_prices(
        limit=5,
        commodity="Tomato",
        state="Karnataka",
        district="Mysuru",
    )

    assert result.available is True
    assert result.source == "agmarknet.gov.in"
    # Verified live params: marketId=115 (Mysuru APMC), stateId=16 (Karnataka),
    # commodityId=65 (Tomato).
    price_call = next(
        (path, params) for path, params in requests if "lastweek" in path
    )
    assert price_call == (
        "/prices-and-arrivals/market-price/lastweek",
        {"marketId": 115, "stateId": 16, "commodityId": 65, "includeExcel": "false"},
    )


def test_mysuru_tomato_report_parses_multi_date_observations():
    """Parser must extract one record per non-NR date from the live payload shape."""
    records, skipped = agmarknet_client._records_from_report(
        _mysuru_tomato_report(),
        commodity="Tomato",
        state="Karnataka",
        district="Mysuru",
        market="Mysuru APMC",
    )

    # 7 date columns, 1 is NR → 6 valid records, 1 skipped
    assert len(records) == 6
    assert skipped == 1
    dates = {r.date for r in records}
    assert date(2026, 10, 10) not in dates  # NR must be absent
    assert date(2026, 10, 9) in dates
    assert date(2026, 10, 4) in dates

    # Spot-check price conversion: 2400 Rs./Quintal → 24 Rs./kg
    rec_9 = next(r for r in records if r.date == date(2026, 10, 9))
    assert rec_9.observation_price_per_kg == pytest.approx(24.0)
    assert rec_9.source_price_value == pytest.approx(2400.0)
    assert rec_9.source_unit == "Rs./Quintal"
    assert rec_9.price_type == "market_price_lastweek_observation"
    assert rec_9.source_provider == "agmarknet.gov.in"
    # min/max/modal must remain None (this endpoint returns a single observation per date)
    assert rec_9.min_price is None
    assert rec_9.max_price is None
    assert rec_9.modal_price is None


def test_report_parser_handles_empty_data_list():
    """An empty data list must yield zero records and zero skipped (not raise)."""
    payload = {
        "success": True,
        "message": "Data fetched successfully.",
        "columns": [
            {"key": "variety", "title": "Market - Variety"},
            {"key": "2026-10-09", "title": "09-10-2026"},
            {"key": "unitOfPrice", "title": "Unit of Price"},
        ],
        "data": [],
    }
    records, skipped = agmarknet_client._records_from_report(
        payload,
        commodity="Tomato",
        state="Karnataka",
        district="Mysuru",
        market="Mysuru APMC",
    )

    assert records == []
    assert skipped == 0


def test_report_parser_rejects_success_false():
    """success:false must raise AgmarknetParseError, not silently return empty."""
    payload = {
        "success": False,
        "message": "No data available.",
        "columns": [],
        "data": [],
    }
    with pytest.raises(agmarknet_client.AgmarknetParseError):
        agmarknet_client._records_from_report(
            payload,
            commodity="Tomato",
            state="Karnataka",
            district="Mysuru",
            market="Mysuru APMC",
        )


def test_fetch_returns_empty_result_when_all_dates_are_nr(monkeypatch):
    """All-NR response must surface as available=False with an informative error."""
    all_nr_report = {
        "success": True,
        "message": "Data fetched successfully.",
        "columns": [
            {"key": "variety", "title": "Market - Variety"},
            {"key": "2026-10-09", "title": "09-10-2026"},
            {"key": "unitOfPrice", "title": "Unit of Price"},
        ],
        "data": [
            {
                "variety": "Mysuru APMC - Tomato",
                "2026-10-09": "NR",
                "unitOfPrice": "Rs./Quintal",
            }
        ],
    }

    def fake_request(path: str, *, params=None):
        return _filters() if path.endswith("/filters") else all_nr_report

    monkeypatch.setattr(agmarknet_client, "_request_json", fake_request)

    result = agmarknet_client.try_fetch_market_prices(
        limit=5,
        commodity="Tomato",
        state="Karnataka",
        district="Mysuru",
    )

    assert result.available is False
    assert result.records == []


# ---------------------------------------------------------------------------
# HTTP 429 retry/backoff tests (no real sleeps)
# ---------------------------------------------------------------------------

def test_http_429_raises_rate_limit_error_after_all_retries_exhausted(monkeypatch):
    """After _MAX_RETRIES failed attempts, AgmarknetRateLimitError must be raised."""
    from urllib.error import HTTPError

    call_count = 0

    def always_429(*_args, **_kwargs):
        nonlocal call_count
        call_count += 1
        raise HTTPError(url="", code=429, msg="Too Many Requests", hdrs=None, fp=None)

    monkeypatch.setattr(agmarknet_client, "urlopen", always_429)
    monkeypatch.setattr(agmarknet_client.time, "sleep", lambda _s: None)

    with pytest.raises(agmarknet_client.AgmarknetRateLimitError) as raised:
        agmarknet_client._request_json("/prices-and-arrivals/market-price/lastweek")

    assert "429" in str(raised.value)
    assert call_count == agmarknet_client._MAX_RETRIES


def test_http_429_retries_before_succeeding(monkeypatch):
    """If the first attempt is 429 but the second succeeds, no error is raised."""
    from urllib.error import HTTPError
    import io, json as _json
    from unittest.mock import MagicMock

    call_count = 0

    class FakeResponse:
        status = 200

        def read(self):
            return _json.dumps({"ok": True}).encode()

        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

        def getcode(self):
            return 200

    def sometimes_429(*_args, **_kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise HTTPError(url="", code=429, msg="Too Many Requests", hdrs=None, fp=None)
        return FakeResponse()

    monkeypatch.setattr(agmarknet_client, "urlopen", sometimes_429)
    monkeypatch.setattr(agmarknet_client.time, "sleep", lambda _s: None)

    result = agmarknet_client._request_json("/prices-and-arrivals/market-price/lastweek")

    assert result == {"ok": True}
    assert call_count == 2


def test_http_429_is_classified_as_service_error_in_try_fetch(monkeypatch):
    """AgmarknetRateLimitError must propagate through try_fetch as error_kind='service'."""
    from urllib.error import HTTPError

    def always_429(*_args, **_kwargs):
        raise HTTPError(url="", code=429, msg="Too Many Requests", hdrs=None, fp=None)

    monkeypatch.setattr(agmarknet_client, "urlopen", always_429)
    monkeypatch.setattr(agmarknet_client.time, "sleep", lambda _s: None)

    result = agmarknet_client.try_fetch_market_prices(
        commodity="Tomato",
        state="Karnataka",
        district="Mysuru",
    )

    assert result.available is False
    assert result.error_kind == "service"
    assert "429" in (result.error_message or "")


def test_price_cache_avoids_repeated_requests(monkeypatch):
    """Calling fetch twice for the same market and commodity within TTL must reuse cache."""
    call_counts = {"count": 0}

    def fake_request(path: str, *, params=None):
        if path.endswith("/filters"):
            return _filters()
        call_counts["count"] += 1
        return _report()

    monkeypatch.setattr(agmarknet_client, "_request_json", fake_request)

    res1 = agmarknet_client.fetch_market_prices(
        limit=5, commodity="Tomato", state="Karnataka", district="Mysuru"
    )
    assert len(res1.records) == 1
    assert call_counts["count"] == 1

    # Second call should use cache and not increment request count
    res2 = agmarknet_client.fetch_market_prices(
        limit=5, commodity="Tomato", state="Karnataka", district="Mysuru"
    )
    assert len(res2.records) == 1
    assert call_counts["count"] == 1


def test_partial_results_preserved_when_later_market_fails(monkeypatch):
    """If one market succeeds and a subsequent market encounters a rate limit, the successful records are preserved."""
    request_index = 0

    def fake_request(path: str, *, params=None):
        nonlocal request_index
        if path.endswith("/filters"):
            return _filters()
        request_index += 1
        if request_index == 1:
            return _report()
        raise agmarknet_client.AgmarknetRateLimitError("Rate limit reached")

    monkeypatch.setattr(agmarknet_client, "_request_json", fake_request)

    # State-wide query checking multiple markets
    result = agmarknet_client.fetch_market_prices(
        limit=10, commodity="Tomato", state="Karnataka"
    )

    assert result.available is True
    assert len(result.records) >= 1
    assert result.records[0].market == "Mysuru APMC"

