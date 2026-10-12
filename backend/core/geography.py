"""Supported application geography."""

KARNATAKA_STATE = "Karnataka"
MYSURU_DISCOVERY_MARKETS = (
    "Mysuru APMC",
    "Nanjangud APMC",
    "Hunsur APMC",
    "T. Narasipura APMC",
)


def is_mysuru_location(value: str) -> bool:
    return " ".join(value.split()).casefold() in {"mysuru", "mysore"}
