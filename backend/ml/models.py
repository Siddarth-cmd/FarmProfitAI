from __future__ import annotations

from datetime import date
from typing import Literal
from pydantic import BaseModel, Field


class ForecastPoint(BaseModel):
    """A single forecasted day price point."""
    date: date
    day_offset: int
    predicted_price_per_kg: float = Field(ge=0)
    lower_bound: float = Field(ge=0)
    upper_bound: float = Field(ge=0)


class PriceForecastResponse(BaseModel):
    """Result of real-time market price tracking and forecasting."""
    commodity: str
    market: str
    state: str = "Karnataka"
    district: str | None = None
    historical_observations_count: int
    latest_real_price_per_kg: float = Field(ge=0)
    latest_observation_date: date
    trend_direction: Literal["RISING", "FALLING", "STABLE"]
    confidence_level: Literal["HIGH", "MEDIUM", "LOW"]
    forecast_points: list[ForecastPoint]
    summary_explanation: str
    source: str = "Real-time Agmarknet APMC Observation Stream"


class DayReturnBreakdown(BaseModel):
    """Breakdown of financial return for selling on day t."""
    day_offset: int
    date: date
    expected_price_per_kg: float
    effective_quantity_kg: float
    expected_gross_revenue: float
    storage_cost: float
    transport_cost: float
    expected_net_return: float
    net_return_diff_vs_now: float


class TimingAdviceRequest(BaseModel):
    """Input parameters for Sell Now vs. Hold recommendation."""
    commodity: str = Field(min_length=1)
    market: str = Field(min_length=1)
    quantity_kg: float = Field(gt=0)
    farmer_location: str | None = None
    transport_cost: float = Field(default=0.0, ge=0)
    storage_cost_per_kg_per_day: float = Field(default=0.0, ge=0)
    custom_daily_loss_percent: float | None = Field(default=None, ge=0, le=100)
    days_ahead: int = Field(default=7, ge=1, le=14)


class TimingAdviceResponse(BaseModel):
    """Actionable recommendation on when to sell produce."""
    commodity: str
    market: str
    recommendation: Literal["SELL_NOW", "HOLD"]
    optimal_sell_day_offset: int
    optimal_sell_date: date
    current_net_return: float
    optimal_net_return: float
    net_gain_amount: float
    net_gain_percentage: float
    explanation: str
    breakdown_by_day: list[DayReturnBreakdown]
    risk_level: Literal["LOW", "MODERATE", "HIGH"]
