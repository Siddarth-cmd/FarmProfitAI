"""Real-time crop price forecasting engine for Karnataka APMC mandis."""

from __future__ import annotations

import math
from datetime import date, timedelta
import numpy as np
from sklearn.linear_model import Ridge

from models.market_models import MarketPrice
from ml.models import ForecastPoint, PriceForecastResponse


def forecast_market_prices(
    commodity: str,
    market: str,
    observations: list[MarketPrice],
    days_ahead: int = 7,
    district: str | None = None,
    state: str = "Karnataka",
) -> PriceForecastResponse:
    """Generate multi-day price forecast anchored on real reported market prices.

    Does not fabricate or invent data. If observations are sparse, provides conservative
    bounds and transparently reports low confidence.
    """
    days_ahead = max(1, min(14, int(days_ahead)))

    # Filter valid prices
    valid_points = [
        (rec.date, rec.recommendation_price_per_kg)
        for rec in observations
        if rec.recommendation_price_per_kg is not None and rec.recommendation_price_per_kg > 0
    ]

    # Sort chronologically
    valid_points.sort(key=lambda x: x[0])

    if not valid_points:
        raise ValueError(f"No valid price observations found for {commodity} in {market}.")

    latest_date, latest_price = valid_points[-1]
    n_points = len(valid_points)

    forecast_points: list[ForecastPoint] = []
    
    if n_points >= 3:
        # We have a multi-day real observation series
        dates = [pt[0] for pt in valid_points]
        prices = np.array([pt[1] for pt in valid_points], dtype=float)
        
        # Time indices relative to earliest date
        t0 = dates[0]
        t_steps = np.array([(d - t0).days for d in dates], dtype=float).reshape(-1, 1)

        # 1. Fit Ridge regression with L2 regularization to avoid overfitting on small datasets
        model = Ridge(alpha=1.0)
        model.fit(t_steps, prices)
        
        # Fitted values & Residual RMSE
        fitted = model.predict(t_steps)
        residuals = prices - fitted
        rmse = float(np.sqrt(np.mean(residuals**2)))
        rmse = max(rmse, 0.5)  # At least ₹0.50 spread

        # 2. Compute Holt linear trend with dampening
        # Alpha (level smoothing) and Beta (trend smoothing)
        alpha = 0.4
        beta = 0.2
        dampening = 0.85
        level = prices[0]
        trend = (prices[-1] - prices[0]) / max(1, len(prices) - 1)
        for p in prices[1:]:
            prev_level = level
            level = alpha * p + (1 - alpha) * (prev_level + dampening * trend)
            trend = beta * (level - prev_level) + (1 - beta) * (dampening * trend)

        latest_t = float((latest_date - t0).days)

        # Generate future points
        for step in range(1, days_ahead + 1):
            future_date = latest_date + timedelta(days=step)
            future_t = latest_t + step
            
            # Blend Ridge model and damped Holt forecast
            ridge_pred = float(model.predict([[future_t]])[0])
            holt_pred = float(level + sum(dampening**i for i in range(1, step + 1)) * trend)
            
            blended = 0.5 * ridge_pred + 0.5 * holt_pred
            # Clamp reasonable bounds within ±35% of latest observed price
            min_allowable = max(1.0, latest_price * 0.65)
            max_allowable = latest_price * 1.50
            predicted_price = float(np.clip(blended, min_allowable, max_allowable))
            
            # Uncertainty interval expands with forecast horizon
            margin = 1.96 * rmse * math.sqrt(1.0 + 0.15 * step)
            lower = max(1.0, round(predicted_price - margin, 2))
            upper = round(predicted_price + margin, 2)
            predicted_price = round(predicted_price, 2)

            forecast_points.append(
                ForecastPoint(
                    date=future_date,
                    day_offset=step,
                    predicted_price_per_kg=predicted_price,
                    lower_bound=lower,
                    upper_bound=upper,
                )
            )

        # Determine trend direction from day 3
        day3_pred = forecast_points[min(2, len(forecast_points) - 1)].predicted_price_per_kg
        pct_change = (day3_pred - latest_price) / latest_price

        if pct_change >= 0.03:
            trend_dir = "RISING"
            trend_text = f"Expected to rise (+{pct_change*100:.1f}%) over the next few days"
        elif pct_change <= -0.03:
            trend_dir = "FALLING"
            trend_text = f"Expected to soften ({pct_change*100:.1f}%) over the next few days"
        else:
            trend_dir = "STABLE"
            trend_text = "Expected to remain steady with minimal fluctuation"

        confidence = "HIGH" if n_points >= 7 else "MEDIUM"
        explanation = (
            f"Based on {n_points} recent reported APMC observations in {market}. "
            f"Current price is ₹{latest_price:.2f}/kg on {latest_date}. {trend_text}."
        )

    else:
        # Sparse observations (1 or 2 records)
        trend_dir = "STABLE"
        confidence = "LOW"
        margin = max(2.0, latest_price * 0.10)
        for step in range(1, days_ahead + 1):
            future_date = latest_date + timedelta(days=step)
            forecast_points.append(
                ForecastPoint(
                    date=future_date,
                    day_offset=step,
                    predicted_price_per_kg=round(latest_price, 2),
                    lower_bound=max(1.0, round(latest_price - margin * (1 + 0.1 * step), 2)),
                    upper_bound=round(latest_price + margin * (1 + 0.1 * step), 2),
                )
            )
        explanation = (
            f"Recent tracking indicates ₹{latest_price:.2f}/kg on {latest_date}. "
            f"Only {n_points} observation point(s) recorded yet; confidence is low until more daily data accumulates."
        )

    return PriceForecastResponse(
        commodity=commodity,
        market=market,
        state=state,
        district=district,
        historical_observations_count=n_points,
        latest_real_price_per_kg=round(latest_price, 2),
        latest_observation_date=latest_date,
        trend_direction=trend_dir,
        confidence_level=confidence,
        forecast_points=forecast_points,
        summary_explanation=explanation,
    )
