from collections.abc import Mapping, Sequence

from models.market_models import MarketPrice

MarketPriceInput = MarketPrice | Mapping[str, object]


def normalize_market_price(record: MarketPriceInput) -> MarketPrice:
    """Validate and normalize a single market-price record. Does not fetch data."""

    return MarketPrice.model_validate(record)


def normalize_market_prices(records: Sequence[MarketPriceInput]) -> list[MarketPrice]:
    """Validate and normalize many market-price records. Does not fetch data."""

    return [normalize_market_price(record) for record in records]
