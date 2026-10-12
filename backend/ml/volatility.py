"""Market price volatility and risk assessment module."""

from __future__ import annotations

import numpy as np
from typing import Literal
from pydantic import BaseModel, Field

from models.market_models import MarketPrice


class VolatilityMetrics(BaseModel):
    """Statistical volatility indicators for an APMC market."""
    commodity: str
    market: str
    sample_size: int
    mean_price: float
    min_observed_price: float
    max_observed_price: float
    price_spread: float
    coefficient_of_variation: float
    risk_level: Literal["STABLE", "MODERATE", "HIGH"]
    summary: str


def compute_market_volatility(
    commodity: str,
    market: str,
    observations: list[MarketPrice],
) -> VolatilityMetrics:
    """Calculate price volatility across reported observations."""
    prices = [
        rec.recommendation_price_per_kg
        for rec in observations
        if rec.recommendation_price_per_kg is not None and rec.recommendation_price_per_kg > 0
    ]

    if not prices:
        raise ValueError(f"No price data available to assess volatility for {commodity} in {market}.")

    arr = np.array(prices, dtype=float)
    mean_p = float(np.mean(arr))
    min_p = float(np.min(arr))
    max_p = float(np.max(arr))
    spread = max_p - min_p
    std_p = float(np.std(arr)) if len(arr) > 1 else 0.0
    cv = (std_p / mean_p) if mean_p > 0 else 0.0

    if cv < 0.08:
        risk = "STABLE"
        desc = "Prices have remained very steady with low intraday or day-to-day variance."
    elif cv < 0.20:
        risk = "MODERATE"
        desc = "Moderate day-to-day price movement; regular market fluctuations."
    else:
        risk = "HIGH"
        desc = "High price swings detected. Farmers should exercise caution and monitor daily mandi arrivals."

    return VolatilityMetrics(
        commodity=commodity,
        market=market,
        sample_size=len(prices),
        mean_price=round(mean_p, 2),
        min_observed_price=round(min_p, 2),
        max_observed_price=round(max_p, 2),
        price_spread=round(spread, 2),
        coefficient_of_variation=round(cv, 4),
        risk_level=risk,
        summary=desc,
    )
