"""Sell Now vs. Hold Timing Advisor for farmers."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Literal

from ml.models import DayReturnBreakdown, TimingAdviceRequest, TimingAdviceResponse
from ml.price_tracker import track_and_fetch_real_prices
from ml.price_forecaster import forecast_market_prices

# Default daily harvest quality & weight degradation rates (ambient storage without cold chain)
# Percentage loss per day (0.015 = 1.5% loss per day)
_CROP_DAILY_LOSS_RATES: dict[str, float] = {
    "tomato": 0.020,     # High perishability: ~2% / day
    "chilli": 0.018,
    "capsicum": 0.018,
    "coriander": 0.035,
    "brinjal": 0.015,
    "cabbage": 0.010,    # Medium perishability: ~1% / day
    "cauliflower": 0.012,
    "carrot": 0.008,
    "cucumber": 0.015,
    "potato": 0.003,     # Durable: ~0.3% / day
    "onion": 0.004,      # Durable: ~0.4% / day
    "garlic": 0.002,
    "maize": 0.002,
    "wheat": 0.001,
    "rice": 0.001,
    "paddy": 0.001,
}

_DEFAULT_LOSS_RATE = 0.010  # 1% default for unlisted crops


def get_crop_daily_loss_rate(commodity: str, custom_rate: float | None = None) -> float:
    """Return the expected fraction of produce lost per day of ambient storage."""
    if custom_rate is not None:
        return max(0.0, min(1.0, float(custom_rate) / 100.0))
    key = commodity.strip().lower()
    for name, rate in _CROP_DAILY_LOSS_RATES.items():
        if name in key:
            return rate
    return _DEFAULT_LOSS_RATE


def evaluate_selling_timing(request: TimingAdviceRequest) -> TimingAdviceResponse:
    """Analyze real market price trends and calculate the optimal selling day."""
    # 1. Fetch real market price observations
    observations = track_and_fetch_real_prices(
        commodity=request.commodity,
        market=request.market,
    )

    if not observations:
        raise ValueError(f"No real market price observations available for {request.commodity} in {request.market}.")

    # 2. Run price forecaster
    forecast = forecast_market_prices(
        commodity=request.commodity,
        market=request.market,
        observations=observations,
        days_ahead=request.days_ahead,
    )

    loss_rate = get_crop_daily_loss_rate(request.commodity, request.custom_daily_loss_percent)
    latest_price = forecast.latest_real_price_per_kg
    latest_date = forecast.latest_observation_date

    # 3. Calculate Day 0 (Immediate Sell)
    day0_quantity = request.quantity_kg
    day0_gross = day0_quantity * latest_price
    day0_storage = 0.0
    day0_transport = request.transport_cost
    day0_net = max(0.0, day0_gross - day0_storage - day0_transport)

    breakdown: list[DayReturnBreakdown] = [
        DayReturnBreakdown(
            day_offset=0,
            date=latest_date,
            expected_price_per_kg=round(latest_price, 2),
            effective_quantity_kg=round(day0_quantity, 2),
            expected_gross_revenue=round(day0_gross, 2),
            storage_cost=0.0,
            transport_cost=round(day0_transport, 2),
            expected_net_return=round(day0_net, 2),
            net_return_diff_vs_now=0.0,
        )
    ]

    best_day_offset = 0
    best_net_return = day0_net
    best_date = latest_date

    # 4. Calculate for each future day
    for pt in forecast.forecast_points:
        day_t = pt.day_offset
        eff_qty = max(0.0, request.quantity_kg * (1.0 - loss_rate * day_t))
        gross = eff_qty * pt.predicted_price_per_kg
        storage = request.quantity_kg * request.storage_cost_per_kg_per_day * day_t
        transport = request.transport_cost
        net = max(0.0, gross - storage - transport)
        diff = net - day0_net

        breakdown.append(
            DayReturnBreakdown(
                day_offset=day_t,
                date=pt.date,
                expected_price_per_kg=pt.predicted_price_per_kg,
                effective_quantity_kg=round(eff_qty, 2),
                expected_gross_revenue=round(gross, 2),
                storage_cost=round(storage, 2),
                transport_cost=round(transport, 2),
                expected_net_return=round(net, 2),
                net_return_diff_vs_now=round(diff, 2),
            )
        )

        # We look for a meaningful improvement (> 1.5% higher return)
        if net > best_net_return:
            best_net_return = net
            best_day_offset = day_t
            best_date = pt.date

    # 5. Recommendation decision
    net_gain = best_net_return - day0_net
    pct_gain = (net_gain / day0_net * 100.0) if day0_net > 0 else 0.0

    # Minimum threshold to recommend holding (at least 2% gain or ₹150)
    if best_day_offset > 0 and (pct_gain >= 2.0 or net_gain >= 150.0):
        recommendation: Literal["SELL_NOW", "HOLD"] = "HOLD"
        explanation = (
            f"Hold recommendation: Price for {request.commodity} is projected to rise to "
            f"₹{breakdown[best_day_offset].expected_price_per_kg:.2f}/kg on {best_date} "
            f"(in {best_day_offset} days). After accounting for {loss_rate*100*best_day_offset:.1f}% "
            f"storage weight/spoilage loss, holding offers an estimated net profit gain of "
            f"+₹{net_gain:.2f} (+{pct_gain:.1f}%)."
        )
    else:
        recommendation = "SELL_NOW"
        best_day_offset = 0
        best_net_return = day0_net
        best_date = latest_date
        net_gain = 0.0
        pct_gain = 0.0
        if forecast.trend_direction == "FALLING":
            explanation = (
                f"Sell immediately: The market price in {request.market} is softening. "
                f"Holding risks further price declines on top of daily storage and spoilage losses."
            )
        else:
            explanation = (
                f"Sell now: Projected price changes over the next few days do not sufficiently offset "
                f"the daily spoilage loss ({loss_rate*100:.1f}%/day) and storage costs. "
                f"Selling immediately locks in ₹{latest_price:.2f}/kg safely."
            )

    # Risk level classification
    if forecast.confidence_level == "LOW":
        risk_level = "HIGH"
    elif loss_rate >= 0.02:
        risk_level = "MODERATE"
    else:
        risk_level = "LOW"

    return TimingAdviceResponse(
        commodity=request.commodity,
        market=request.market,
        recommendation=recommendation,
        optimal_sell_day_offset=best_day_offset,
        optimal_sell_date=best_date,
        current_net_return=round(day0_net, 2),
        optimal_net_return=round(best_net_return, 2),
        net_gain_amount=round(net_gain, 2),
        net_gain_percentage=round(pct_gain, 2),
        explanation=explanation,
        breakdown_by_day=breakdown,
        risk_level=risk_level,
    )
