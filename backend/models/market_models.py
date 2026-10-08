from datetime import date

from pydantic import BaseModel, Field, field_validator, model_validator


class MarketPrice(BaseModel):
    """Normalized market-price observation.

    ``modal_price`` is the price FarmProfit uses for the initial recommendation.
    This model does not fetch or invent market data.
    """

    commodity: str = Field(min_length=1)
    variety: str | None = None
    state: str = Field(min_length=1)
    district: str = Field(min_length=1)
    market: str = Field(min_length=1)
    date: date
    min_price: float = Field(ge=0)
    max_price: float = Field(ge=0)
    modal_price: float = Field(ge=0)

    @field_validator("commodity", "state", "district", "market")
    @classmethod
    def required_text_not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    @field_validator("variety")
    @classmethod
    def optional_variety(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @model_validator(mode="after")
    def prices_in_order(self) -> "MarketPrice":
        if not (self.min_price <= self.modal_price <= self.max_price):
            raise ValueError("prices must satisfy min_price <= modal_price <= max_price")
        return self
