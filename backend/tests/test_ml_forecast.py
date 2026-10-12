from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from main import app
from models.market_models import MarketPrice
from ml.price_forecaster import forecast_market_prices
from ml.timing_advisor import evaluate_selling_timing
from ml.volatility import compute_market_volatility
from ml.models import TimingAdviceRequest


@pytest.fixture
def client():
    return TestClient(app)


def _sample_price_series(base_price: float = 20.0, trend_step: float = 1.0, count: int = 5) -> list[MarketPrice]:
    """Generate realistic date-stamped market observations."""
    base_date = date(2026, 10, 5)
    records = []
    for i in range(count):
        records.append(
            MarketPrice(
                commodity="Tomato",
                variety="Local",
                state="Karnataka",
                district="Bengaluru",
                market="Bengaluru APMC",
                date=base_date + timedelta(days=i),
                min_price=base_price + trend_step * i - 2,
                modal_price=base_price + trend_step * i,
                max_price=base_price + trend_step * i + 2,
                observation_price_per_kg=base_price + trend_step * i,
                source_provider="agmarknet.gov.in",
            )
        )
    return records


def test_forecast_market_prices_rising_trend():
    observations = _sample_price_series(base_price=20.0, trend_step=2.0, count=6)
    result = forecast_market_prices(
        commodity="Tomato",
        market="Bengaluru APMC",
        observations=observations,
        days_ahead=7,
    )

    assert result.commodity == "Tomato"
    assert result.market == "Bengaluru APMC"
    assert result.historical_observations_count == 6
    assert result.latest_real_price_per_kg == 30.0
    assert result.trend_direction == "RISING"
    assert result.confidence_level == "MEDIUM"
    assert len(result.forecast_points) == 7
    # Verify upper bounds exceed lower bounds
    for pt in result.forecast_points:
        assert pt.upper_bound >= pt.predicted_price_per_kg >= pt.lower_bound
        assert pt.predicted_price_per_kg > 0


def test_forecast_market_prices_falling_trend():
    observations = _sample_price_series(base_price=40.0, trend_step=-2.5, count=6)
    result = forecast_market_prices(
        commodity="Tomato",
        market="Bengaluru APMC",
        observations=observations,
        days_ahead=5,
    )

    assert result.trend_direction == "FALLING"
    assert len(result.forecast_points) == 5
    assert result.forecast_points[0].predicted_price_per_kg < result.latest_real_price_per_kg


def test_forecast_sparse_observations():
    single_record = [
        MarketPrice(
            commodity="Onion",
            state="Karnataka",
            district="Hassan",
            market="Hassan APMC",
            date=date(2026, 10, 10),
            modal_price=35.0,
            source_provider="agmarknet.gov.in",
        )
    ]
    result = forecast_market_prices(
        commodity="Onion",
        market="Hassan APMC",
        observations=single_record,
        days_ahead=3,
    )

    assert result.confidence_level == "LOW"
    assert result.trend_direction == "STABLE"
    assert len(result.forecast_points) == 3
    assert result.forecast_points[0].predicted_price_per_kg == 35.0


def test_timing_advisor_recommends_hold_when_prices_surge():
    # Price rising by ₹2.5/kg daily on Tomato
    rising_records = _sample_price_series(base_price=15.0, trend_step=2.5, count=6)
    with patch("ml.timing_advisor.track_and_fetch_real_prices", return_value=rising_records):
        req = TimingAdviceRequest(
            commodity="Tomato",
            market="Bengaluru APMC",
            quantity_kg=1000.0,
            transport_cost=500.0,
            storage_cost_per_kg_per_day=0.10,
            days_ahead=7,
        )
        advice = evaluate_selling_timing(req)

        assert advice.recommendation == "HOLD"
        assert advice.optimal_sell_day_offset > 0
        assert advice.net_gain_amount > 0
        assert len(advice.breakdown_by_day) == 8  # Day 0 + 7 future days


def test_timing_advisor_recommends_sell_now_when_prices_fall():
    # Price dropping rapidly
    falling_records = _sample_price_series(base_price=35.0, trend_step=-3.0, count=6)
    with patch("ml.timing_advisor.track_and_fetch_real_prices", return_value=falling_records):
        req = TimingAdviceRequest(
            commodity="Tomato",
            market="Bengaluru APMC",
            quantity_kg=500.0,
            transport_cost=300.0,
            days_ahead=5,
        )
        advice = evaluate_selling_timing(req)

        assert advice.recommendation == "SELL_NOW"
        assert advice.optimal_sell_day_offset == 0
        assert advice.net_gain_amount == 0.0


def test_market_volatility_calculation():
    observations = _sample_price_series(base_price=20.0, trend_step=1.0, count=5)
    metrics = compute_market_volatility("Tomato", "Bengaluru APMC", observations)

    assert metrics.sample_size == 5
    assert metrics.mean_price == 22.0
    assert metrics.min_observed_price == 20.0
    assert metrics.max_observed_price == 24.0
    assert metrics.price_spread == 4.0
    assert metrics.risk_level in {"STABLE", "MODERATE"}


def test_forecast_api_get_prices(client):
    observations = _sample_price_series(base_price=25.0, trend_step=1.0, count=4)
    with patch("api.forecast.track_and_fetch_real_prices", return_value=observations):
        response = client.get(
            "/forecast/prices",
            params={"commodity": "Tomato", "market": "Bengaluru APMC", "days": 5},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["commodity"] == "Tomato"
        assert data["market"] == "Bengaluru APMC"
        assert len(data["forecast_points"]) == 5
        assert "trend_direction" in data


def test_forecast_api_not_found(client):
    with patch("api.forecast.track_and_fetch_real_prices", return_value=[]):
        response = client.get(
            "/forecast/prices",
            params={"commodity": "UnknownCrop", "market": "NonExistentMarket"},
        )
        assert response.status_code == 404


def test_forecast_api_timing_advice_post(client):
    observations = _sample_price_series(base_price=20.0, trend_step=2.0, count=5)
    with patch("ml.timing_advisor.track_and_fetch_real_prices", return_value=observations):
        payload = {
            "commodity": "Tomato",
            "market": "Bengaluru APMC",
            "quantity_kg": 1000.0,
            "transport_cost": 400.0,
            "storage_cost_per_kg_per_day": 0.05,
            "days_ahead": 7,
        }
        response = client.post("/forecast/timing-advice", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["recommendation"] in {"SELL_NOW", "HOLD"}
        assert "breakdown_by_day" in data
        assert len(data["breakdown_by_day"]) == 8


def test_forecast_api_volatility(client):
    observations = _sample_price_series(base_price=25.0, trend_step=1.0, count=5)
    with patch("api.forecast.track_and_fetch_real_prices", return_value=observations):
        response = client.get(
            "/forecast/volatility",
            params={"commodity": "Tomato", "market": "Bengaluru APMC"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["commodity"] == "Tomato"
        assert "coefficient_of_variation" in data
        assert "risk_level" in data
