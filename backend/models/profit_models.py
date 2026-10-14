from typing import Any, Literal

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
    loss_percentage: float | None = Field(default=None, ge=0, le=100)

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
    harvest_quantity_kg: float = 0.0
    estimated_loss_kg: float = 0.0
    saleable_quantity_kg: float = 0.0
    loss_percentage: float | None = None
    losses_provided: bool = False
    loss_data_status: Literal["provided", "not_provided_zero_baseline"] = (
        "not_provided_zero_baseline"
    )
    loss_data_scope: Literal["request_level"] = "request_level"
    price_type: str = "modal_price"
    is_stale: bool = False
    freshness_status: str = "not_evaluated"
    confidence_level: str = "medium"  # "high", "medium", "low"
    data_age_days: int | None = None
    observation_date: str | None = None
    source_provider: str | None = None
    distance_km: float | None = None
    distance_source: str = "unavailable"
    distance_status: str = "unavailable"
    transport_mode: Literal["dedicated_vehicle", "shared_load"] = "dedicated_vehicle"
    shared_rate_applied: float | None = None
    vehicle_capacity_kg: float | None = None
    vehicle_rate_per_km: float | None = None
    trips_required: int | None = None
    rate_applied: float | None = None
    rate_unit: str | None = None
    rate_is_estimate: bool = False
    estimated_transport_cost: float | None = None
    transport_cost_basis: Literal["actual_quote", "estimated", "unavailable"] = "unavailable"
    transport_error: str | None = None
    comparable: bool = True
    crop_breakdowns: list[dict[str, Any]] = []
    shared_pricing_basis: str | None = None
    shared_units_count: int | None = None
    load_capacity_warning: str | None = None


class RealizableProfitBreakdown(BaseModel):
    """Explainable realizable-return calculation for one market."""

    harvest_quantity_kg: float
    estimated_loss_kg: float
    saleable_quantity_kg: float
    price_per_kg: float
    gross_revenue: float
    transportation_cost: float
    other_costs: float
    net_return: float
    loss_percentage: float | None = None
    losses_provided: bool = False
    loss_data_status: Literal["provided", "not_provided_zero_baseline"] = (
        "not_provided_zero_baseline"
    )
    loss_data_scope: Literal["request_level"] = "request_level"


class ProfitResult(BaseModel):
    """Ranked market comparison and the recommended option."""

    crop: str
    quantity_kg: float
    location: str
    comparisons: list[MarketComparison]
    recommended_market: str
    recommended_net_return: float
    explanation: str
    is_multi_crop: bool = False
    total_quantity_kg: float | None = None
    crop_breakdowns: dict[str, list[dict[str, Any]]] = {}
    confidence_level: str = "medium"
