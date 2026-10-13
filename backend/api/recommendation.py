"""Recommendation API endpoints."""

from __future__ import annotations

import math
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field, field_validator, model_validator
from core.logistics import (
    LogisticsConfig,
    calculate_dedicated_vehicle_transport,
    calculate_shared_load_transport,
)
from core.geography import KARNATAKA_STATE

from models.market_models import MarketErrorDetails, MarketPrice
from recommendation.recommendation_engine import (
    RecommendationResult,
    recommend_market,
)
from services.market_data_service import fetch_market_prices_with_fallback
from services.market_catalogue import (
    load_karnataka_market_catalogue,
    normalize_catalogue_name,
    same_catalogue_identity,
)

router = APIRouter(tags=["Recommendation"])


class CropItem(BaseModel):
    """One commodity item within a multi-commodity harvest."""
    crop: str = Field(min_length=1)
    quantity_kg: float = Field(gt=0)
    loss_percentage: float | None = Field(default=None, ge=0, le=100)


class RecommendationRequest(BaseModel):
    """Farmer selling request for optimal market recommendation."""

    crop: str | None = Field(default=None, description="Crop name (for single-crop request)")
    quantity_kg: float | None = Field(default=None, description="Produce quantity in kg")
    crops: list[CropItem] | None = Field(default=None, description="Optional multi-commodity harvest list")
    farmer_location: str = Field(min_length=1, description="Farmer origin location")
    
    # Transport options
    transport_mode: Literal["dedicated_vehicle", "shared_load"] = "dedicated_vehicle"
    shared_rate_type: Literal["per_kg", "per_crate", "per_bag", "per_kg_per_km"] = "per_kg_per_km"
    shared_pricing_basis: Literal["distance_based", "fixed_trip"] = "distance_based"
    shared_rate: float | None = Field(default=None, ge=0)
    shared_rate_per_kg_per_km: float | None = Field(default=None, ge=0)
    
    transportation_costs: dict[str, float] = Field(
        default_factory=dict,
        description="Known transportation costs mapped by market name",
    )
    other_costs: float | dict[str, float] = Field(
        default=0.0,
        description="Other selling costs (flat amount or mapped by market)",
    )
    loss_percentage: float | None = Field(
        default=None,
        ge=0,
        le=100,
        description="Optional estimated harvest loss percentage",
    )
    state: str | None = Field(default=None, description="Optional state filter for market data")
    district: str | None = Field(default=None, description="Optional district filter for market data")
    markets: list[MarketPrice] | None = Field(
        default=None,
        description="Optional pre-fetched candidate market prices",
    )
    selected_markets: list[str] | None = Field(
        default=None,
        description=(
            "Optional explicit market names to compare. An empty list enables "
            "automatic discovery; omitted preserves legacy behavior."
        ),
    )
    vehicle_rate_per_km: float | None = Field(default=None, ge=0)
    vehicle_capacity_kg: float | None = Field(default=None, gt=0)
    transportation_cost_basis: str | dict[str, str] | None = Field(default=None)

    @field_validator("farmer_location")
    @classmethod
    def text_not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    @field_validator("crop")
    @classmethod
    def crop_not_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("crop must not be blank")
        return value

    @field_validator("quantity_kg")
    @classmethod
    def quantity_positive(cls, value: float | None) -> float | None:
        if value is not None and value <= 0:
            raise ValueError("quantity must be greater than 0")
        return value

    @model_validator(mode="after")
    def validate_request_integrity(self) -> "RecommendationRequest":
        if not self.crops and not self.crop:
            raise ValueError("crop or crops must be provided")
        if not self.crops and self.quantity_kg is None:
            raise ValueError("quantity_kg must be provided for single crop")
        if self.state and self.state.strip().casefold() != KARNATAKA_STATE.casefold():
            raise ValueError(f"Only {KARNATAKA_STATE} market data is supported.")
        if self.markets and any(
            market.state.strip().casefold() != KARNATAKA_STATE.casefold()
            for market in self.markets
        ):
            raise ValueError(f"All market records must be in {KARNATAKA_STATE}.")
        return self

    @field_validator("selected_markets")
    @classmethod
    def validate_selected_markets(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned: list[str] = []
        seen: set[str] = set()
        for market in value:
            name = market.strip()
            if not name:
                raise ValueError("selected market names must not be blank")
            key = name.casefold()
            if key not in seen:
                cleaned.append(name)
                seen.add(key)
        return cleaned

    @field_validator("transportation_costs")
    @classmethod
    def validate_transport_costs(cls, value: dict[str, float]) -> dict[str, float]:
        for market, cost in value.items():
            if not math.isfinite(cost) or cost < 0:
                raise ValueError(f"transportation cost for '{market}' must be non-negative")
        return value

    @field_validator("other_costs")
    @classmethod
    def validate_other_costs(cls, value: float | dict[str, float]) -> float | dict[str, float]:
        if isinstance(value, (int, float)):
            if not math.isfinite(value) or value < 0:
                raise ValueError("other_costs must be non-negative")
            return float(value)
        if isinstance(value, dict):
            for market, cost in value.items():
                if not math.isfinite(cost) or cost < 0:
                    raise ValueError(f"other_cost for '{market}' must be non-negative")
            return value
        raise ValueError("other_costs must be a number or a mapping")


class RecommendationResponse(BaseModel):
    """Response contract communicating availability and market recommendation."""

    available: bool = True
    recommendation: RecommendationResult | None = None
    error: MarketErrorDetails | None = None
    source: str | None = None
    using_fallback: bool = False


@router.post("/recommend", response_model=RecommendationResponse)
def create_recommendation(request: RecommendationRequest) -> RecommendationResponse:
    """Recommend the optimal selling market maximizing expected net return.

    Fetches relevant market prices from the market-data layer (or uses explicitly provided markets),
    computes transportation and net returns using the Recommendation Engine, and returns an explainable recommendation.
    """
    explicit_market_names = request.selected_markets
    if explicit_market_names is None and request.markets is None and request.transportation_costs:
        explicit_market_names = list(request.transportation_costs)

    # Build logistics configuration supporting shared-load vs dedicated vehicle
    rate_is_illustrative = True
    if request.transport_mode == "shared_load":
        if request.shared_rate_per_kg_per_km is not None:
            resolved_shared_rate_per_kg_per_km = float(request.shared_rate_per_kg_per_km)
            rate_is_illustrative = False
        elif request.shared_rate is not None and request.shared_rate_type in ("per_kg", "per_kg_per_km"):
            resolved_shared_rate_per_kg_per_km = float(request.shared_rate)
            rate_is_illustrative = False
        else:
            resolved_shared_rate_per_kg_per_km = 0.03
            rate_is_illustrative = (request.shared_rate is None)
    elif request.transport_mode == "dedicated_vehicle":
        resolved_shared_rate_per_kg_per_km = 0.03
        if request.vehicle_rate_per_km is not None:
            rate_is_illustrative = False
    else:
        resolved_shared_rate_per_kg_per_km = 0.03

    logistics = (
        LogisticsConfig(
            transport_mode=request.transport_mode,
            vehicle_rate_per_km=request.vehicle_rate_per_km if request.vehicle_rate_per_km is not None else 15.0,
            vehicle_capacity_kg=request.vehicle_capacity_kg if request.vehicle_capacity_kg is not None else 500.0,
            shared_rate_type=request.shared_rate_type,
            shared_pricing_basis=request.shared_pricing_basis,
            shared_rate=request.shared_rate,
            shared_rate_per_kg_per_km=resolved_shared_rate_per_kg_per_km,
            rate_is_illustrative=rate_is_illustrative,
        )
        if request.vehicle_rate_per_km is not None or request.vehicle_capacity_kg is not None or request.transport_mode != "dedicated_vehicle" or request.shared_rate is not None or request.shared_rate_per_kg_per_km is not None
        else LogisticsConfig.from_environment()
    )

    # Determine whether this is a multi-crop request
    crops_to_process = request.crops or []
    if not crops_to_process:
        if not request.crop or not request.quantity_kg or request.quantity_kg <= 0:
            return RecommendationResponse(
                available=False,
                recommendation=None,
                error=MarketErrorDetails(
                    kind="validation",
                    message="Please specify either a crop and quantity or a list of crops.",
                ),
            )
        crops_to_process = [
            CropItem(
                crop=request.crop,
                quantity_kg=request.quantity_kg,
                loss_percentage=request.loss_percentage,
            )
        ]

    # If single-crop request, run through standard pipeline
    if len(crops_to_process) == 1:
        single_crop = crops_to_process[0]
        if request.markets is not None:
            candidate_markets = request.markets
            data_source = "request"
            using_fallback = False
        else:
            fetch_result = fetch_market_prices_with_fallback(
                commodity=single_crop.crop,
                state=KARNATAKA_STATE,
                district=None if explicit_market_names else request.district,
                market_names=explicit_market_names,
                limit=20,
            )
            if not fetch_result.available:
                return RecommendationResponse(
                    available=False,
                    recommendation=None,
                    error=MarketErrorDetails(
                        kind=fetch_result.error_kind or "service",
                        message=fetch_result.error_message or "Market data service is unavailable.",
                    ),
                    source=fetch_result.source,
                    using_fallback=fetch_result.using_fallback,
                )
            candidate_markets = fetch_result.records
            if explicit_market_names:
                catalogue_entries = load_karnataka_market_catalogue()
                requested_entries = [
                    entry for entry in catalogue_entries
                    if normalize_catalogue_name(entry.name) in {normalize_catalogue_name(name) for name in explicit_market_names}
                ]
                selected_by_key = {normalize_catalogue_name(name): name for name in explicit_market_names}
                for entry in requested_entries:
                    selected_by_key.setdefault(normalize_catalogue_name(entry.name), entry.name)

                matched_markets = []
                for record in candidate_markets:
                    selected_name = selected_by_key.get(normalize_catalogue_name(record.market))
                    if selected_name is None:
                        selected_entry = next(
                            (entry for entry in requested_entries if same_catalogue_identity(record, entry)),
                            None,
                        )
                        if selected_entry is not None:
                            selected_name = selected_entry.name
                    if selected_name is not None:
                        matched_markets.append(record.model_copy(update={"market": selected_name}))
                candidate_markets = matched_markets
            data_source = fetch_result.source
            using_fallback = fetch_result.using_fallback

        if not candidate_markets:
            return RecommendationResponse(
                available=False,
                recommendation=None,
                error=MarketErrorDetails(
                    kind="data",
                    message=f"No usable market records found for crop '{single_crop.crop}' to generate a recommendation.",
                ),
                source=data_source,
                using_fallback=using_fallback,
            )

        result = recommend_market(
            crop=single_crop.crop,
            quantity_kg=single_crop.quantity_kg,
            farmer_location=request.farmer_location,
            markets=candidate_markets,
            transportation_costs=request.transportation_costs,
            other_costs=request.other_costs,
            loss_percentage=single_crop.loss_percentage,
            logistics_config=logistics,
            transportation_cost_basis=request.transportation_cost_basis,
        )
        result.market_dates = {
            item.market: item.date
            for item in candidate_markets
            if item.market in {market.name for market in result.ranked_markets}
        }
    else:
        # --- Multi-Commodity Combined Harvest Calculation ---
        # 1. Fetch prices for each commodity across eligible markets
        commodity_records: dict[str, list[MarketPrice]] = {}
        total_quantity = sum(c.quantity_kg for c in crops_to_process)
        all_sources: set[str] = set()
        any_fallback = False

        for c_item in crops_to_process:
            c_res = fetch_market_prices_with_fallback(
                commodity=c_item.crop,
                state=KARNATAKA_STATE,
                district=None if explicit_market_names else request.district,
                market_names=explicit_market_names,
                limit=30,
            )
            if not c_res.available or not c_res.records:
                return RecommendationResponse(
                    available=False,
                    recommendation=None,
                    error=MarketErrorDetails(
                        kind="data",
                        message=f"No valid price records available for crop '{c_item.crop}' to compute combined harvest returns.",
                    ),
                    source=c_res.source,
                    using_fallback=c_res.using_fallback,
                )
            if c_res.source:
                all_sources.add(c_res.source)
            if c_res.using_fallback:
                any_fallback = True
            commodity_records[c_item.crop] = c_res.records

        # 2. Find destinations that have valid records for ALL commodities in the harvest
        # Map by normalized market name
        market_commodity_prices: dict[str, dict[str, MarketPrice]] = {}
        for c_item in crops_to_process:
            for rec in commodity_records[c_item.crop]:
                m_key = rec.market.strip()
                if m_key not in market_commodity_prices:
                    market_commodity_prices[m_key] = {}
                market_commodity_prices[m_key][c_item.crop] = rec

        # Only destinations that have price data for ALL requested crops
        eligible_markets = {
            m_key: price_map
            for m_key, price_map in market_commodity_prices.items()
            if all(c_item.crop in price_map for c_item in crops_to_process)
        }

        if not eligible_markets:
            crop_list = ", ".join(c.crop for c in crops_to_process)
            return RecommendationResponse(
                available=False,
                recommendation=None,
                error=MarketErrorDetails(
                    kind="data",
                    message=f"No destination currently has reported price records for all selected crops ({crop_list}).",
                ),
                source=", ".join(all_sources),
                using_fallback=any_fallback,
            )

        # 3. Calculate combined revenue and shared trip transportation
        from services.distance_provider import create_configured_distance_provider
        dist_provider = create_configured_distance_provider()
        ranked_comparisons: list[MarketComparison] = []
        market_dates_map: dict[str, date] = {}

        for m_name, price_map in eligible_markets.items():
            combined_gross = 0.0
            crop_breakdowns = []
            
            for c_item in crops_to_process:
                rec = price_map[c_item.crop]
                market_dates_map[m_name] = rec.date
                price_kg = rec.recommendation_price_per_kg or rec.modal_price or 0.0
                assumed_loss = c_item.loss_percentage or 0.0
                loss_kg = c_item.quantity_kg * assumed_loss / 100.0
                saleable_kg = c_item.quantity_kg - loss_kg
                item_rev = saleable_kg * price_kg
                combined_gross += item_rev
                crop_breakdowns.append({
                    "crop": c_item.crop,
                    "harvest_quantity_kg": c_item.quantity_kg,
                    "saleable_quantity_kg": saleable_kg,
                    "price_per_kg": price_kg,
                    "gross_revenue": item_rev,
                    "confidence_level": getattr(rec, "confidence_level", "medium"),
                    "date": str(rec.date),
                })

            # Calculate shared-trip transport cost for the total combined weight
            quoted = request.transportation_costs.get(m_name)
            rate_applied = None
            rate_unit = None
            rate_is_estimate = False
            trips_count = 1
            if quoted is not None:
                combined_transport = float(quoted)
                basis = "actual_quote"
                dist_km = None
                rate_applied = combined_transport
                rate_unit = "quote"
            elif dist_provider is not None:
                try:
                    d_res = dist_provider.get_distance_km(request.farmer_location.strip(), m_name)
                    dist_km = d_res.distance_km
                except Exception:
                    dist_km = None
                
                if dist_km is None:
                    continue
                
                if logistics.transport_mode == "shared_load":
                    cost, rate_applied, rate_unit, rate_is_estimate, _ = calculate_shared_load_transport(
                        total_quantity, dist_km, logistics
                    )
                    combined_transport = cost if cost is not None else 0.0
                    trips_count = 1
                else:
                    cost, rate_applied, rate_unit, rate_is_estimate, trips_count, _ = calculate_dedicated_vehicle_transport(
                        total_quantity, dist_km, logistics
                    )
                    combined_transport = cost if cost is not None else 0.0
                basis = "estimated"
            else:
                combined_transport = 0.0
                basis = "unavailable"
                dist_km = None

            o_cost = request.other_costs if isinstance(request.other_costs, (int, float)) else request.other_costs.get(m_name, 0.0)
            net_ret = combined_gross - combined_transport - o_cost

            # Aggregate confidence: if any is low -> low; else if any is medium -> medium; else high
            confidences = [cb["confidence_level"] for cb in crop_breakdowns]
            overall_conf = "low" if "low" in confidences else ("medium" if "medium" in confidences else "high")

            ranked_comparisons.append(
                MarketComparison(
                    name=m_name,
                    price_per_kg=round(combined_gross / total_quantity, 2) if total_quantity > 0 else 0.0,
                    transportation_cost=combined_transport,
                    other_costs=o_cost,
                    gross_revenue=combined_gross,
                    net_return=net_ret,
                    rank=0,
                    harvest_quantity_kg=total_quantity,
                    saleable_quantity_kg=sum(cb["saleable_quantity_kg"] for cb in crop_breakdowns),
                    distance_km=dist_km,
                    transport_mode=logistics.transport_mode,
                    rate_applied=rate_applied,
                    rate_unit=rate_unit,
                    rate_is_estimate=rate_is_estimate,
                    trips_required=trips_count,
                    transport_cost_basis=basis,
                    confidence_level=overall_conf,
                    crop_breakdowns=crop_breakdowns,
                )
            )

        if not ranked_comparisons:
            return RecommendationResponse(
                available=False,
                recommendation=None,
                error=MarketErrorDetails(
                    kind="routing",
                    message="Could not calculate road routes or transport costs for the combined harvest.",
                ),
            )

        # Sort by highest net return
        ranked_comparisons.sort(key=lambda x: x.net_return, reverse=True)
        for idx, comp in enumerate(ranked_comparisons, start=1):
            comp.rank = idx

        best_m = ranked_comparisons[0]
        crop_names_str = " + ".join(f"{c.quantity_kg}kg {c.crop}" for c in crops_to_process)
        explanation = (
            f"For your combined harvest of {crop_names_str} from {request.farmer_location}, "
            f"{best_m.name} offers the highest combined net return of ₹{round(best_m.net_return):,} "
            f"(Gross revenue ₹{round(best_m.gross_revenue):,} - Shared freight ₹{round(best_m.transportation_cost):,})."
        )

        result = RecommendationResult(
            crop=" + ".join(c.crop for c in crops_to_process),
            quantity_kg=total_quantity,
            farmer_location=request.farmer_location,
            recommended_market=best_m.name,
            expected_gross_revenue=best_m.gross_revenue,
            transportation_cost=best_m.transportation_cost,
            other_costs=best_m.other_costs,
            expected_net_return=best_m.net_return,
            ranked_markets=ranked_comparisons,
            alternatives=ranked_comparisons[1:],
            explanation=explanation,
            market_dates=market_dates_map,
        )
        data_source = ", ".join(all_sources)
        using_fallback = any_fallback

    if result.recommended_market is None:
        return RecommendationResponse(
            available=False,
            recommendation=None,
            error=MarketErrorDetails(
                kind="data",
                message=result.explanation
                or f"No valid market records available for {request.crop}.",
            ),
            source=data_source,
            using_fallback=using_fallback,
        )

    return RecommendationResponse(
        available=True,
        recommendation=result,
        error=None,
        source=data_source,
        using_fallback=using_fallback,
    )
