"""Recommendation API endpoints."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field, field_validator

from models.market_models import MarketErrorDetails, MarketPrice
from recommendation.recommendation_engine import (
    RecommendationResult,
    recommend_market,
)
from services.data_gov_client import try_fetch_market_prices

router = APIRouter(tags=["Recommendation"])


class RecommendationRequest(BaseModel):
    """Farmer selling request for optimal market recommendation."""

    crop: str = Field(min_length=1, description="Crop or commodity name (e.g. Tomato)")
    quantity_kg: float = Field(gt=0, description="Produce quantity in kilograms (must be > 0)")
    farmer_location: str = Field(min_length=1, description="Farmer origin location")
    transportation_costs: dict[str, float] = Field(
        default_factory=dict,
        description="Known transportation costs mapped by market name",
    )
    other_costs: float | dict[str, float] = Field(
        default=0.0,
        description="Other selling costs (flat amount or mapped by market)",
    )
    state: str | None = Field(default=None, description="Optional state filter for market data")
    district: str | None = Field(default=None, description="Optional district filter for market data")
    markets: list[MarketPrice] | None = Field(
        default=None,
        description="Optional pre-fetched candidate market prices",
    )

    @field_validator("crop", "farmer_location")
    @classmethod
    def text_not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    @field_validator("transportation_costs")
    @classmethod
    def validate_transport_costs(cls, value: dict[str, float]) -> dict[str, float]:
        for market, cost in value.items():
            if cost < 0:
                raise ValueError(f"transportation cost for '{market}' must be non-negative")
        return value

    @field_validator("other_costs")
    @classmethod
    def validate_other_costs(cls, value: float | dict[str, float]) -> float | dict[str, float]:
        if isinstance(value, (int, float)):
            if value < 0:
                raise ValueError("other_costs must be non-negative")
            return float(value)
        if isinstance(value, dict):
            for market, cost in value.items():
                if cost < 0:
                    raise ValueError(f"other_cost for '{market}' must be non-negative")
            return value
        raise ValueError("other_costs must be a number or a mapping")


class RecommendationResponse(BaseModel):
    """Response contract communicating availability and market recommendation."""

    available: bool = True
    recommendation: RecommendationResult | None = None
    error: MarketErrorDetails | None = None


@router.post("/recommend", response_model=RecommendationResponse)
def create_recommendation(request: RecommendationRequest) -> RecommendationResponse:
    """Recommend the optimal selling market maximizing expected net return.

    Fetches relevant market prices from the market-data layer (or uses explicitly provided markets),
    computes transportation and net returns using the Recommendation Engine, and returns an explainable recommendation.
    """
    if request.markets is not None:
        candidate_markets = request.markets
    else:
        fetch_result = try_fetch_market_prices(
            commodity=request.crop,
            state=request.state,
            district=request.district,
            limit=20,
        )

        if not fetch_result.available:
            return RecommendationResponse(
                available=False,
                recommendation=None,
                error=MarketErrorDetails(
                    kind=fetch_result.error_kind or "service",
                    message=fetch_result.error_message
                    or "Market data service is unavailable.",
                ),
            )

        candidate_markets = fetch_result.records

    if not candidate_markets:
        return RecommendationResponse(
            available=False,
            recommendation=None,
            error=MarketErrorDetails(
                kind="data",
                message=f"No usable market records found for crop '{request.crop}' to generate a recommendation.",
            ),
        )

    result = recommend_market(
        crop=request.crop,
        quantity_kg=request.quantity_kg,
        farmer_location=request.farmer_location,
        markets=candidate_markets,
        transportation_costs=request.transportation_costs,
        other_costs=request.other_costs,
    )

    if result.recommended_market is None:
        return RecommendationResponse(
            available=False,
            recommendation=None,
            error=MarketErrorDetails(
                kind="data",
                message=result.explanation
                or f"No valid market records available for {request.crop}.",
            ),
        )

    return RecommendationResponse(
        available=True,
        recommendation=result,
        error=None,
    )
