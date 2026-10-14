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
        retrieved_at=row["retrieved_at"] if "retrieved_at" in row.keys() else None,
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
        if commodity and commodity.strip():
            c_clean = commodity.strip()
            query += " AND (LOWER(commodity) = LOWER(?) OR LOWER(commodity) LIKE LOWER(?) OR LOWER(variety) LIKE LOWER(?))"
            params.extend([c_clean, f"{c_clean}%", f"%{c_clean}%"])
        if district and district.strip():
            query += " AND LOWER(district) = LOWER(?)"
            params.append(district.strip())
        if market and market.strip():
            m_clean = market.strip()
            # Match exact, or with/without "APMC" suffix
            m_no_apmc = m_clean.lower().replace(" apmc", "").strip()
            query += " AND (LOWER(market) = LOWER(?) OR LOWER(REPLACE(market, ' APMC', '')) = LOWER(?))"
            params.extend([m_clean, m_no_apmc])
        if state and state.strip():
            query += " AND LOWER(state) = LOWER(?)"
            params.append(state.strip())
        cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
        query += " AND datetime(retrieved_at) >= datetime(?)"
        params.append(cutoff.isoformat())
        query += " ORDER BY date DESC"
        cur = conn.execute(query, params)
        rows = cur.fetchall()
        return [_row_to_market_price(row) for row in rows]
    finally:
        conn.close()


def get_distinct_crops() -> list[str]:
    """Return distinct supported crops (commodities) from the observations database."""
    conn = get_connection()
    try:
        cur = conn.execute(
            """
            SELECT DISTINCT TRIM(commodity)
            FROM observations
            WHERE commodity IS NOT NULL
              AND LENGTH(TRIM(commodity)) > 1
            ORDER BY TRIM(commodity) COLLATE NOCASE ASC
            """
        )
        seen = set()
        crops: list[str] = []
        for (crop,) in cur.fetchall():
            if not crop:
                continue
            cleaned = crop.strip()
            # Ignore search-token fragments if any exist in the database
            if cleaned.lower() in ("o", "on", "oni", "onio"):
                continue
            if cleaned.lower() not in seen:
                seen.add(cleaned.lower())
                crops.append(cleaned)
        return crops
    finally:
        conn.close()


def extract_genuine_variety(
    raw_variety: str | None,
    commodity: str | None = None,
    market: str | None = None,
) -> str | None:
    """Extract and validate genuine cultivar variety from raw report strings.

    Agmarknet market reports commonly format the variety column as
    'Market Name - Variety' (e.g. 'Belur APMC - Hybrid', 'Bangarpet APMC - Tomato').
    When no variety is recorded, the commodity name or market is often repeated.
    This function parses genuine varieties (e.g. 'Hybrid', 'Local', 'Puna', 'Jalander')
    and returns None when the entry is a market name, commodity name, or placeholder.
    """
    if not raw_variety or not isinstance(raw_variety, str):
        return None
    text = raw_variety.strip()
    if not text:
        return None

    # Handle 'Market - Variety' patterns
    if " - " in text:
        parts = [p.strip() for p in text.split(" - ") if p.strip()]
        candidate = parts[-1] if len(parts) >= 2 else text
    elif " -" in text:
        parts = [p.strip() for p in text.split(" -") if p.strip()]
        candidate = parts[-1] if len(parts) >= 2 else text
    elif "-" in text and any(w in text.upper() for w in ("APMC", "MKT", "MARKET")):
        parts = [p.strip() for p in text.split("-") if p.strip()]
        candidate = parts[-1] if len(parts) >= 2 else text
    else:
        candidate = text

    candidate = candidate.strip()
    if not candidate:
        return None

    cand_lower = candidate.casefold()

    # Filter out market names, APMC identifiers, and Mandi text
    if any(m_id in candidate.upper() for m_id in ("APMC", "MARKET", "MANDI", "SUB-MARKET")):
        return None

    if market and cand_lower == market.strip().casefold():
        return None

    # Filter out commodity names (e.g. 'Tomato', 'Onion', 'Potato')
    if commodity and cand_lower == commodity.strip().casefold():
        return None

    known_crops = {
        "tomato", "onion", "potato", "maize", "green chilli", "green chilly",
        "chilli", "capsicum", "cabbage", "carrot", "bengal gram", "wheat", "rice",
    }
    if cand_lower in known_crops:
        return None

    # Filter out generic placeholder categories that are not genuine cultivar varieties
    if cand_lower in ("other", "others", "general", "faq", "all", "none", "null", "average"):
        return None

    return candidate


def get_varieties_for_crop(crop: str) -> list[str]:
    """Return distinct recorded genuine varieties associated with the selected crop."""
    if not crop or not crop.strip():
        return []
    clean_crop = crop.strip()
    conn = get_connection()
    try:
        cur = conn.execute(
            """
            SELECT DISTINCT TRIM(variety)
            FROM observations
            WHERE LOWER(TRIM(commodity)) = LOWER(TRIM(?))
              AND variety IS NOT NULL
              AND TRIM(variety) != ''
            ORDER BY TRIM(variety) COLLATE NOCASE ASC
            """,
            (clean_crop,),
        )
        seen = set()
        varieties: list[str] = []
        for (raw_variety,) in cur.fetchall():
            if not raw_variety:
                continue
            genuine = extract_genuine_variety(raw_variety, commodity=clean_crop)
            if genuine and genuine.lower() not in seen:
                seen.add(genuine.lower())
                varieties.append(genuine)
        varieties.sort(key=lambda v: v.casefold())
        return varieties
    finally:
        conn.close()

