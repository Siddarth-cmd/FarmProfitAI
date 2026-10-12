import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

from models.market_models import MarketPrice

# Default DB location – project root data/observations.db
_DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "observations.db"

def _db_path() -> Path:
    """Return the SQLite database file path.

    Configurable via the BACKEND_DB_PATH environment variable.
    """
    return Path(os.getenv("BACKEND_DB_PATH", _DEFAULT_DB_PATH))

def _ensure_db() -> sqlite3.Connection:
    """Open a connection and ensure the observations table exists.

    The table uses a composite primary key that uniquely identifies an
    observation for a given provider on a specific market‑date.
    """
    db_path = _db_path()
    # Ensure parent directory exists
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), detect_types=sqlite3.PARSE_DECLTYPES)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS observations (
            commodity TEXT NOT NULL,
            variety TEXT,
            state TEXT NOT NULL,
            district TEXT NOT NULL,
            market TEXT NOT NULL,
            date TEXT NOT NULL,                -- ISO date (YYYY-MM-DD)
            min_price REAL,
            max_price REAL,
            modal_price REAL,
            observation_price_per_kg REAL,
            price_type TEXT,
            source_provider TEXT,
            source_unit TEXT,
            source_price_value REAL,
            retrieved_at TEXT NOT NULL,       -- UTC timestamp of ingestion
            provider TEXT NOT NULL,
            PRIMARY KEY (commodity, variety, state, district, market, date, provider)
        )
        """
    )
    conn.commit()
    return conn

def get_connection() -> sqlite3.Connection:
    """Public accessor – returns a connection with the schema ready.
    Caller is responsible for closing the connection.
    """
    return _ensure_db()

def upsert_observation(record: MarketPrice, provider: str, retrieved_at: datetime) -> None:
    """Insert or replace a market observation.

    The composite primary key guarantees that the same observation (same
    commodity/variety/state/district/market/date/provider) is stored only once.
    Different dates are preserved as separate rows.
    """
    conn = get_connection()
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO observations (
                commodity, variety, state, district, market, date,
                min_price, max_price, modal_price, observation_price_per_kg,
                price_type, source_provider, source_unit, source_price_value,
                retrieved_at, provider
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record.commodity,
                record.variety,
                record.state,
                record.district,
                record.market,
                record.date.isoformat(),
                record.min_price,
                record.max_price,
                record.modal_price,
                record.observation_price_per_kg,
                record.price_type,
                record.source_provider,
                record.source_unit,
                record.source_price_value,
                retrieved_at.isoformat(),
                provider,
            ),
        )
        conn.commit()
    finally:
        conn.close()

def _row_to_market_price(row: sqlite3.Row) -> MarketPrice:
    """Convert a DB row to a MarketPrice instance.
    All fields map directly; the date string is parsed back to a date.
    """
    from datetime import date
    return MarketPrice(
        commodity=row["commodity"],
        variety=row["variety"],
        state=row["state"],
        district=row["district"],
        market=row["market"],
        date=date.fromisoformat(row["date"]),
        min_price=row["min_price"],
        max_price=row["max_price"],
        modal_price=row["modal_price"],
        observation_price_per_kg=row["observation_price_per_kg"],
        price_type=row["price_type"] or "modal_price",
        source_provider=row["source_provider"],
        source_unit=row["source_unit"],
        source_price_value=row["source_price_value"],
    )

def query_observations(
    *,
    commodity: Optional[str] = None,
    district: Optional[str] = None,
    market: Optional[str] = None,
    state: Optional[str] = None,
    max_age_days: int = 7,
) -> List[MarketPrice]:
    """Return stored observations that satisfy the supplied filters.

    * ``max_age_days`` limits how old a record may be (based on ``retrieved_at``).
    * All filter arguments are optional – ``None`` means "ignore that filter".
    """
    conn = get_connection()
    try:
        conn.row_factory = sqlite3.Row
        query = "SELECT * FROM observations WHERE 1=1"
        params: List = []
        if commodity:
            query += " AND commodity = ?"
            params.append(commodity)
        if district:
            query += " AND district = ?"
            params.append(district)
        if market:
            query += " AND market = ?"
            params.append(market)
        if state:
            query += " AND state = ?"
            params.append(state)
        cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
        query += " AND datetime(retrieved_at) >= datetime(?)"
        params.append(cutoff.isoformat())
        cur = conn.execute(query, params)
        rows = cur.fetchall()
        return [_row_to_market_price(row) for row in rows]
    finally:
        conn.close()
