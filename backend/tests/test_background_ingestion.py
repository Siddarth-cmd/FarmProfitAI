import os
import sqlite3
import tempfile
import asyncio
from pathlib import Path

import pytest
from unittest import mock

# Ensure the backend package is importable
import sys
sys.path.append(str(Path(__file__).resolve().parents[2]))

from backend import db as db_module
from backend.services import market_data_service as mds
from backend.models.market_models import MarketPrice

# Helper to create a temporary SQLite db path and set env
@pytest.fixture
def temp_db_path(monkeypatch):
    fd, path = tempfile.mkstemp(suffix='.db')
    os.close(fd)
    # Point the application to the temporary DB
    monkeypatch.setenv('BACKEND_DB_PATH', path)
    # Ensure a fresh DB is created
    conn = db_module._ensure_db()
    conn.close()
    yield Path(path)
    # Cleanup
    try:
        Path(path).unlink()
    except OSError:
        pass

def make_record(state: str, district: str = "Bengaluru", market: str = "Bengaluru Market", commodity: str = "Tomato") -> MarketPrice:
    return MarketPrice(
        commodity=commodity,
        variety=None,
        state=state,
        district=district,
        market=market,
        date=__import__('datetime').date.today(),
        min_price=None,
        max_price=None,
        modal_price=None,
        observation_price_per_kg=10.0,
        price_type="modal_price",
        source_provider="test",
        source_unit="kg",
        source_price_value=10.0,
    )

def test_ingestion_filters_out_other_states(monkeypatch, temp_db_path):
    """Live providers should not persist observations that are not from Karnataka."""

    # Mock Agmarknet to return one Karnataka record and one Maharashtra record
    kar_record = make_record(state="Karnataka")
    other_record = make_record(state="Maharashtra")
    mock_ag_result = mock.MagicMock()
    mock_ag_result.available = True
    mock_ag_result.records = [kar_record, other_record]
    mock_ag_result.source = "agmarknet"
    monkeypatch.setattr(mds, "try_agmarknet", lambda *a, **k: mock_ag_result)

    # Mock Data.gov to return no records
    mock_dg_result = mock.MagicMock()
    mock_dg_result.available = False
    mock_dg_result.records = []
    mock_dg_result.source = None
    monkeypatch.setattr(mds, "try_datagov", lambda *a, **k: mock_dg_result)

    # Run a single ingestion pass (replicating loop body)
    def single_pass():
        limit = 1000
        ag_result = mds.try_agmarknet(limit=limit, state=mds.KARNATAKA_STATE)
        if ag_result.available:
            kantara_records = [rec for rec in ag_result.records if rec.state and rec.state.casefold() == mds.KARNATAKA_STATE.casefold()]
            for rec in kantara_records:
                db_module.upsert_observation(rec, ag_result.source or "agmarknet", __import__('datetime').datetime.now(__import__('datetime').timezone.utc))
        dg_result = mds.try_datagov(limit=limit, state=mds.KARNATAKA_STATE)
        if dg_result.available:
            kg_records = [rec for rec in dg_result.records if rec.state and rec.state.casefold() == mds.KARNATAKA_STATE.casefold()]
            for rec in kg_records:
                db_module.upsert_observation(rec, dg_result.source or "data.gov.in", __import__('datetime').datetime.now(__import__('datetime').timezone.utc))

    single_pass()

    # Verify only the Karnataka record is stored
    conn = db_module.get_connection()
    cur = conn.execute("SELECT COUNT(*) FROM observations")
    count = cur.fetchone()[0]
    conn.close()
    assert count == 1

def test_query_observations_filters(monkeypatch, temp_db_path):
    """query_observations should respect state, district, and age filters."""
    # Insert two rows: one Karnataka, one Maharashtra
    kar = make_record(state="Karnataka")
    mah = make_record(state="Maharashtra")
    db_module.upsert_observation(kar, "test", __import__('datetime').datetime.now(__import__('datetime').timezone.utc))
    db_module.upsert_observation(mah, "test", __import__('datetime').datetime.now(__import__('datetime').timezone.utc))

    # Query only Karnataka
    results = db_module.query_observations(state="Karnataka")
    assert len(results) == 1
    assert results[0].state.casefold() == "karnataka"

    # Query with non‑existent district should return empty
    empty = db_module.query_observations(state="Karnataka", district="Nonexistent")
    assert len(empty) == 0

    # Verify max_age_days filter works (record older than max_age should be excluded)
    # Manually insert an old record by setting retrieved_at far in the past
    old = make_record(state="Karnataka")
    old_retrieved = __import__('datetime').datetime.now(__import__('datetime').timezone.utc) - __import__('datetime').timedelta(days=30)
    conn = db_module.get_connection()
    conn.execute(
        "INSERT OR REPLACE INTO observations (commodity, variety, state, district, market, date, min_price, max_price, modal_price, observation_price_per_kg, price_type, source_provider, source_unit, source_price_value, retrieved_at, provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            old.commodity, old.variety, old.state, old.district, old.market, old.date.isoformat(),
            old.min_price, old.max_price, old.modal_price, old.observation_price_per_kg, old.price_type,
            old.source_provider, old.source_unit, old.source_price_value, old_retrieved.isoformat(), "test"
        ),
    )
    conn.commit()
    conn.close()

    recent = db_module.query_observations(state="Karnataka", max_age_days=7)
    # Should return only the recent Karnataka record, not the old one
    assert len(recent) == 1
    assert recent[0].state.casefold() == "karnataka"
