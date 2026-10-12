from __future__ import annotations

from datetime import date
import math

from pydantic import BaseModel, Field, field_validator, model_validator
from core.geography import KARNATAKA_STATE


class MarketPrice(BaseModel):
    """Normalized market-price observation.

    Legacy min/max/modal values are INR per kilogram when supplied.
    Observation providers should use ``observation_price_per_kg`` instead of
    pretending a single observation is a modal price or a price range.
    This model does not fetch or invent market data, and it does not convert units.
    """

    commodity: str = Field(min_length=1)
    variety: str | None = None
    state: str = Field(min_length=1)
    district: str = Field(min_length=1)
    market: str = Field(min_length=1)
    date: date
    min_price: float | None = Field(default=None, ge=0)
    max_price: float | None = Field(default=None, ge=0)
    modal_price: float | None = Field(default=None, ge=0)
    observation_price_per_kg: float | None = Field(default=None, ge=0)
    price_type: str = "modal_price"
    source_provider: str | None = None
    source_unit: str | None = None
    source_price_value: float | None = Field(default=None, ge=0)
    is_stale: bool = False
    freshness_status: str = "not_evaluated"
    confidence_level: str = "medium"  # "high", "medium", "low"
    data_age_days: int | None = None
    retrieved_at: str | None = None

    @property
    def recommendation_price_per_kg(self) -> float | None:
        """Return the explicit price usable by the recommendation engine."""
        return self.observation_price_per_kg if self.observation_price_per_kg is not None else self.modal_price

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
        if self.observation_price_per_kg is None and self.modal_price is None:
            raise ValueError("a modal_price or observation_price_per_kg is required")
        for value in (
            self.min_price,
            self.modal_price,
            self.max_price,
            self.observation_price_per_kg,
            self.source_price_value,
        ):
            if value is not None and not math.isfinite(value):
                raise ValueError("prices must be finite numbers")
        if (
            self.min_price is not None
            and self.modal_price is not None
            and self.max_price is not None
            and not (self.min_price <= self.modal_price <= self.max_price)
        ):
            raise ValueError("prices must satisfy min_price <= modal_price <= max_price")
        return self


class MarketErrorDetails(BaseModel):
    """Upstream error details when market data is unavailable."""

    kind: str
    message: str


class MarketFilterOption(BaseModel):
    """A safe, display-ready Agmarknet geography option."""

    id: int
    name: str = Field(min_length=1)
    state_id: int | None = None


class MarketCommodityOption(BaseModel):
    """A safe, display-ready commodity option from provider metadata."""

    id: int
    name: str = Field(min_length=1)


class MarketFiltersResponse(BaseModel):
    """Geography options used by the Market Explorer."""

    available: bool = True
    states: list[MarketFilterOption] = Field(default_factory=list)
    districts: list[MarketFilterOption] = Field(default_factory=list)
    commodities: list[MarketCommodityOption] = Field(default_factory=list)
    locations: list["VerifiedLocationOption"] = Field(default_factory=list)
    error: MarketErrorDetails | None = None


class VerifiedLocationOption(BaseModel):
    """Canonical location backed by the local verified-coordinate dataset."""

    name: str = Field(min_length=1)
    state: str | None = None
    district: str | None = None
    source: str = Field(min_length=1)


class MarketsResponse(BaseModel):
    """Response envelope for the /markets endpoint communicating upstream availability."""

    available: bool = True
    records: list[MarketPrice] = Field(default_factory=list)
    count: int = 0
    source: str | None = "data.gov.in"
    using_fallback: bool = False
    skipped_invalid: int = 0
    error: MarketErrorDetails | None = None


class MarketCatalogueEntry(BaseModel):
    """Curated Karnataka market identity, separate from price observations."""

    id: int
    name: str = Field(min_length=1)
    district: str = Field(min_length=1)
    state: str = KARNATAKA_STATE
    source: str = Field(min_length=1)
    price_available: bool = False


class MarketCatalogueResponse(BaseModel):
    """Catalogue identities with optional current crop-price availability."""

    available: bool = True
    entries: list[MarketCatalogueEntry] = Field(default_factory=list)
    source: str = Field(min_length=1)
    price_source: str | None = None
    price_data_available: bool = False
    error: MarketErrorDetails | None = None
