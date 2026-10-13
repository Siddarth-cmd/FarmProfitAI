"""Curated Karnataka market identities used by the farmer selector."""

import json
import re
from pathlib import Path

from models.market_models import MarketCatalogueEntry, MarketPrice

CATALOGUE_SOURCE = "Agmarknet Karnataka market filter catalogue"
CATALOGUE_PATH = Path(__file__).resolve().parent.parent / "data" / "karnataka_market_catalogue.json"

_ALIASES = {
    "bangalore": "bengaluru",
    "belgaum": "belagavi",
    "bellary": "ballari",
    "bijapur": "vijayapura",
    "chickkaballapura": "chikkaballapur",
    "chikkaballapura": "chikkaballapur",
    "chikmagalur": "chikkamagaluru",
    "gulbarga": "kalaburagi",
    "mysore": "mysuru",
    "ramanagara": "ramanagar",
    "shimoga": "shivamogga",
    "tumkur": "tumakuru",
}



def normalize_catalogue_name(value: str) -> str:
    """Return a stable key for matching provider records to catalogue identities."""
    cleaned = re.sub(r"\bapmc\b", " ", value.strip().casefold())
    cleaned = re.sub(r"[^a-z0-9]+", " ", cleaned).strip()
    parts = [_ALIASES.get(part, part) for part in cleaned.split()]
    return " ".join(parts)


def same_catalogue_identity(record: MarketPrice, entry: MarketCatalogueEntry) -> bool:
    """Match only the same normalized district and market identity."""
    return (
        normalize_catalogue_name(record.state) == normalize_catalogue_name(entry.state)
        and normalize_catalogue_name(record.district) == normalize_catalogue_name(entry.district)
        and normalize_catalogue_name(record.market) == normalize_catalogue_name(entry.name)
    )


def catalogue_entry_matches_name(entry: MarketCatalogueEntry, name: str) -> bool:
    """Return True when a user/provider name refers to this catalogue entry."""
    return normalize_catalogue_name(entry.name) == normalize_catalogue_name(name)


def find_catalogue_entries(names: list[str] | tuple[str, ...]) -> list[MarketCatalogueEntry]:
    """Resolve selected display names to curated catalogue entries."""
    entries = load_karnataka_market_catalogue()
    return [
        entry
        for entry in entries
        if any(catalogue_entry_matches_name(entry, name) for name in names)
    ]


def load_karnataka_market_catalogue() -> list[MarketCatalogueEntry]:
    with CATALOGUE_PATH.open("r", encoding="utf-8") as handle:
        records = json.load(handle)
    return [
        MarketCatalogueEntry(
            **record,
            source=CATALOGUE_SOURCE,
        )
        for record in records
    ]
