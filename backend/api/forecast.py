"""FastAPI endpoints for AI/ML real-time price tracking, forecasting, and timing advice."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import ValidationError

from ml.models import (
    PriceForecastResponse,
    TimingAdviceRequest,
    TimingAdviceResponse,
)
from ml.price_tracker import track_and_fetch_real_prices
from ml.price_forecaster import forecast_market_prices
from ml.timing_advisor import evaluate_selling_timing
from ml.volatility import VolatilityMetrics, compute_market_volatility
from core.geography import KARNATAKA_STATE

router = APIRouter(prefix="/forecast", tags=["Forecasting & Timing AI"])


@router.get("/prices", response_model=PriceForecastResponse)
def get_price_forecast(
    commodity: str = Query(..., min_length=1, description="Commodity name (e.g. Tomato)"),
    market: str = Query(..., min_length=1, description="APMC Market name (e.g. Bengaluru APMC)"),
    district: str | None = Query(default=None, description="Optional district name"),
    days: int = Query(default=7, ge=1, le=14, description="Number of days to forecast ahead"),
) -> PriceForecastResponse:
    """Return real-time APMC market tracking and multi-day price forecast.

    Always uses real Agmarknet observations without fabricating numbers.
    """
    try:
        observations = track_and_fetch_real_prices(
            commodity=commodity,
            market=market,
            district=district,
            state=KARNATAKA_STATE,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch market data: {exc}")

    if not observations:
        raise HTTPException(
            status_code=404,
            detail=f"No real market observations found for {commodity} in market '{market}'.",
        )

    try:
        return forecast_market_prices(
            commodity=commodity,
            market=market,
            observations=observations,
            days_ahead=days,
            district=district,
            state=KARNATAKA_STATE,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/timing-advice", response_model=TimingAdviceResponse)
def get_timing_advice(request: TimingAdviceRequest) -> TimingAdviceResponse:
    """Evaluate whether a farmer should sell produce now or hold for higher net return.

    Accounts for projected price movement, daily storage spoilage/weight loss, and storage costs.
    """
    try:
        return evaluate_selling_timing(request)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Timing evaluation failed: {exc}")


@router.get("/volatility", response_model=VolatilityMetrics)
def get_market_volatility(
    commodity: str = Query(..., min_length=1, description="Commodity name"),
    market: str = Query(..., min_length=1, description="APMC Market name"),
    district: str | None = Query(default=None),
) -> VolatilityMetrics:
    """Return price volatility indicators and risk level based on reported market prices."""
    try:
        observations = track_and_fetch_real_prices(
            commodity=commodity,
            market=market,
            district=district,
            state=KARNATAKA_STATE,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch market data: {exc}")

    if not observations:
        raise HTTPException(
            status_code=404,
            detail=f"No real market observations found for {commodity} in market '{market}'.",
        )

    try:
        return compute_market_volatility(
            commodity=commodity,
            market=market,
            observations=observations,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
