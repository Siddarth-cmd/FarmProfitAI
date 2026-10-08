from pydantic import BaseModel, Field, field_validator


class MarketOption(BaseModel):
    """One selling option supplied by the caller (not fetched here)."""

    name: str = Field(min_length=1)
    price_per_kg: float = Field(ge=0)
    transportation_cost: float = Field(ge=0)
    other_costs: float = Field(ge=0)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("market name must not be blank")
        return stripped


class ProfitRequest(BaseModel):
    """Farmer input plus the market options to compare."""

    crop: str = Field(min_length=1)
    quantity_kg: float = Field(gt=0)
    location: str = Field(min_length=1)
    markets: list[MarketOption] = Field(min_length=1)

    @field_validator("crop", "location")
    @classmethod
    def text_not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped


class MarketComparison(BaseModel):
    """Per-market totals for a comparison table."""

    name: str
    price_per_kg: float
    transportation_cost: float
    other_costs: float
    gross_revenue: float
    net_return: float
    rank: int


class ProfitResult(BaseModel):
    """Ranked market comparison and the recommended option."""

    crop: str
    quantity_kg: float
    location: str
    comparisons: list[MarketComparison]
    recommended_market: str
    recommended_net_return: float
    explanation: str
