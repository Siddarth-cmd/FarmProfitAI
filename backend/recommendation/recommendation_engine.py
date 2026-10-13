"""Core FarmProfit recommendation engine.

Recommends the selling market that maximizes expected net return for a farmer's
crop, quantity, and location, taking into account market prices and transportation costs.
Reuses the profit calculation engine to avoid duplicate calculation logic.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from datetime import date
from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel, Field, ValidationError

from models.market_models import MarketPrice
from models.profit_models import MarketComparison, MarketOption, ProfitRequest
from recommendation.profit_engine import calculate_profits
from core.logistics import (
    LogisticsConfig,
    calculate_dedicated_vehicle_transport,
    calculate_shared_load_transport,
)
from services.distance_provider import RoadDistanceProvider


@runtime_checkable
class TransportationCostProvider(Protocol):
    """Interface for supplying transportation costs between locations."""

    def get_transportation_cost(
        self,
        farmer_location: str,
        market_name: str,
        quantity_kg: float,
    ) -> float:
        """Return the estimated transportation cost in INR."""
        ...


class DictTransportationCostProvider:
    """Provides transportation costs from an explicit mapping."""

    def __init__(
        self,
        costs: Mapping[str, float] | None = None,
        default_cost: float = 0.0,
    ) -> None:
        self.costs = dict(costs) if costs else {}
        self.default_cost = max(0.0, float(default_cost))

    def get_transportation_cost(
        self,
        farmer_location: str,
        market_name: str,
        quantity_kg: float,
    ) -> float:
        # 1. Exact match
        if market_name in self.costs:
            return max(0.0, float(self.costs[market_name]))

        # 2. Case-insensitive / stripped match
        cleaned = market_name.strip().lower()
        for key, val in self.costs.items():
            if key.strip().lower() == cleaned:
                return max(0.0, float(val))

        # 3. Base market name without parentheses (e.g. "Nashik" from "Nashik (Local)")
        base_name = market_name.split("(")[0].strip().lower()
        for key, val in self.costs.items():
            if key.strip().lower() == base_name:
                return max(0.0, float(val))

        return self.default_cost


class FlatRateTransportationCostProvider:
    """Provides a flat transportation cost across all markets."""

    def __init__(self, cost: float = 0.0) -> None:
        self.cost = max(0.0, float(cost))

    def get_transportation_cost(
        self,
        farmer_location: str,
        market_name: str,
        quantity_kg: float,
    ) -> float:
        return self.cost


class PerKgRateTransportationCostProvider:
    """Provides transportation cost as a rate per kg (e.g., ₹1.5/kg)."""

    def __init__(
        self,
        rates: Mapping[str, float] | None = None,
        default_rate: float = 0.0,
    ) -> None:
        self.rates = dict(rates) if rates else {}
        self.default_rate = max(0.0, float(default_rate))

    def get_transportation_cost(
        self,
        farmer_location: str,
        market_name: str,
        quantity_kg: float,
    ) -> float:
        rate = self.rates.get(market_name, self.default_rate)
        return max(0.0, float(rate * quantity_kg))


def resolve_transportation_cost_provider(
    provider_or_costs: TransportationCostProvider | Mapping[str, float] | float | None,
) -> TransportationCostProvider:
    """Normalize transportation cost input into a TransportationCostProvider."""
    if provider_or_costs is None:
        return DictTransportationCostProvider({}, default_cost=0.0)
    if isinstance(provider_or_costs, (int, float)):
        return FlatRateTransportationCostProvider(float(provider_or_costs))
    if isinstance(provider_or_costs, Mapping):
        return DictTransportationCostProvider(provider_or_costs)
    if callable(getattr(provider_or_costs, "get_transportation_cost", None)):
        return provider_or_costs
    raise TypeError(
        f"Expected TransportationCostProvider, Mapping, float, or None, got {type(provider_or_costs).__name__}"
    )


class RecommendationResult(BaseModel):
    """Result of market recommendation maximizing net return."""

    crop: str
    quantity_kg: float
    farmer_location: str
    recommended_market: str | None = None
    expected_gross_revenue: float = 0.0
    transportation_cost: float = 0.0
    other_costs: float = 0.0
    expected_net_return: float = 0.0
    ranked_markets: list[MarketComparison] = Field(default_factory=list)
    alternatives: list[MarketComparison] = Field(default_factory=list)
    market_dates: dict[str, date] = Field(default_factory=dict)
    loss_percentage: float | None = None
    losses_provided: bool = False
    estimated_loss_kg: float = 0.0
    saleable_quantity_kg: float = 0.0
    loss_data_status: str = "not_provided_zero_baseline"
    loss_data_scope: str = "request_level"
    explanation: str = ""
    incomplete_markets: list[MarketComparison] = Field(default_factory=list)

    @property
    def gross_revenue(self) -> float:
        return self.expected_gross_revenue

    @property
    def net_return(self) -> float:
        return self.expected_net_return

    @property
    def alternative_markets(self) -> list[MarketComparison]:
        return self.alternatives

    @property
    def ranking_of_alternatives(self) -> list[MarketComparison]:
        return self.alternatives


def _format_currency(amount: float) -> str:
    if amount == int(amount):
        return f"₹{int(amount):,}"
    return f"₹{amount:,.2f}"


def _format_quantity(quantity_kg: float) -> str:
    if quantity_kg == int(quantity_kg):
        return f"{int(quantity_kg):,}"
    return f"{quantity_kg:,.2f}"


def _build_recommendation_explanation(
    crop: str,
    quantity_kg: float,
    farmer_location: str,
    ranked: list[MarketComparison],
) -> str:
    if not ranked:
        return f"No market price data available for {crop} to make a recommendation."

    best = ranked[0]
    qty_str = _format_quantity(quantity_kg)
    best_net_str = _format_currency(best.net_return)

    if len(ranked) == 1:
        return (
            f"{best.name} is recommended as the only available market for your {qty_str} kg of {crop} "
            f"from {farmer_location}. Expected net return is {best_net_str} "
            f"(market price ₹{best.price_per_kg:.2f}/kg, transportation cost {_format_currency(best.transportation_cost)})."
        )

    runner_up = ranked[1]
    # Check if another market offers a higher price per kg than the recommended one
    higher_price_markets = [
        m for m in ranked[1:] if m.price_per_kg > best.price_per_kg
    ]

    if higher_price_markets:
        highest_price_market = max(higher_price_markets, key=lambda m: m.price_per_kg)
        advantage = best.net_return - highest_price_market.net_return
        adv_str = _format_currency(advantage)

        return (
            f"Although {highest_price_market.name} offers a slightly higher market price "
            f"(₹{highest_price_market.price_per_kg:.2f}/kg vs ₹{best.price_per_kg:.2f}/kg), "
            f"{best.name} is recommended because its lower transportation cost gives an estimated "
            f"{adv_str} higher net return for your {qty_str} kg of {crop}."
        )

    advantage = best.net_return - runner_up.net_return
    if advantage == 0:
        return (
            f"{best.name} is recommended for your {qty_str} kg of {crop} from {farmer_location}. "
            f"It ties with {runner_up.name} with an estimated net return of {best_net_str}."
        )

    adv_str = _format_currency(advantage)
    return (
        f"{best.name} is recommended for your {qty_str} kg of {crop} from {farmer_location}. "
        f"It gives the highest estimated net return of {best_net_str} "
        f"(market price ₹{best.price_per_kg:.2f}/kg, transportation cost {_format_currency(best.transportation_cost)}), "
        f"which is {adv_str} higher than {runner_up.name}."
    )


def _resolve_other_cost(
    other_costs: float | Mapping[str, float] | None,
    market_name: str,
) -> float:
    if other_costs is None:
        return 0.0
    if isinstance(other_costs, (int, float)):
        return max(0.0, float(other_costs))
    if isinstance(other_costs, Mapping):
        val = other_costs.get(market_name, 0.0)
        return max(0.0, float(val))
    return 0.0


def _mapped_cost(costs: Mapping[str, float] | None, market_name: str) -> float | None:
    if not isinstance(costs, Mapping) or not costs:
        return None
    for key, value in costs.items():
        if key.strip().lower() == market_name.strip().lower():
            return float(value)
        if key.split("(")[0].strip().lower() == market_name.split("(")[0].strip().lower():
            return float(value)
    return None


def recommend_market(
    crop: str,
    quantity_kg: float,
    farmer_location: str,
    markets: Sequence[MarketPrice | Mapping[str, Any]] | None = None,
    transportation_costs: TransportationCostProvider | Mapping[str, float] | float | None = None,
    transportation_cost_provider: TransportationCostProvider | None = None,
    other_costs: float | Mapping[str, float] | None = None,
    loss_percentage: float | None = None,
    distance_provider: RoadDistanceProvider | None = None,
    logistics_config: LogisticsConfig | None = None,
    transportation_cost_basis: str | Mapping[str, str] | None = None,
) -> RecommendationResult:
    """Recommend the market maximizing expected net return.

    Reuses calculate_profits from the profit engine to compute gross revenue,
    net return, and market rankings.
    """
    if not isinstance(crop, str) or not crop.strip():
        raise ValueError("crop must not be blank")

    if not isinstance(farmer_location, str) or not farmer_location.strip():
        raise ValueError("farmer_location must not be blank")

    try:
        qty = float(quantity_kg)
    except (TypeError, ValueError) as exc:
        raise ValueError("quantity_kg must be a valid number") from exc

    if not math.isfinite(qty) or qty <= 0:
        raise ValueError("quantity_kg must be greater than zero")
    if loss_percentage is not None and (
        not isinstance(loss_percentage, (int, float))
        or not math.isfinite(loss_percentage)
        or loss_percentage < 0
        or loss_percentage > 100
    ):
        raise ValueError("loss percentage must be between 0 and 100")

    crop_clean = crop.strip()
    location_clean = farmer_location.strip()

    # Empty market list handled safely
    if not markets:
        return RecommendationResult(
            crop=crop_clean,
            quantity_kg=qty,
            farmer_location=location_clean,
            recommended_market=None,
            expected_gross_revenue=0.0,
            transportation_cost=0.0,
            other_costs=0.0,
            expected_net_return=0.0,
            ranked_markets=[],
            alternatives=[],
            explanation=f"No market price data available for {crop_clean} to make a recommendation.",
        )

    transport_provider = resolve_transportation_cost_provider(
        transportation_cost_provider if transportation_cost_provider is not None else transportation_costs
    )
    logistics = logistics_config or LogisticsConfig()
    incomplete_markets: list[MarketComparison] = []
    route_results: dict[str, Any] = {}
    basis_by_market: dict[str, str] = {}
    transport_rates: dict[str, tuple[float, str, bool, int]] = {}

    # Validate and deduplicate candidate market prices safely
    valid_by_market: dict[str, MarketPrice] = {}
    for item in markets:
        rec: MarketPrice | None = None
        if isinstance(item, MarketPrice):
            rec = item
        elif isinstance(item, Mapping):
            try:
                rec = MarketPrice.model_validate(item)
            except (ValidationError, TypeError, ValueError):
                continue
        elif hasattr(item, "market") and (
            hasattr(item, "recommendation_price_per_kg")
            or hasattr(item, "modal_price")
        ):
            try:
                if getattr(item, "recommendation_price_per_kg", None) is None:
                    continue
                rec = item
            except Exception:
                continue

        if rec is None or not getattr(rec, "market", "").strip():
            continue

        price_per_kg = getattr(rec, "recommendation_price_per_kg", None)
        if price_per_kg is None:
            price_per_kg = getattr(rec, "modal_price", None)
        if (
            price_per_kg is None
            or not isinstance(price_per_kg, (int, float))
            or not math.isfinite(price_per_kg)
            or price_per_kg < 0
        ):
            continue

        m_name = rec.market.strip()
        if m_name in valid_by_market:
            existing = valid_by_market[m_name]
            existing_date = getattr(existing, "date", None)
            new_date = getattr(rec, "date", None)
            if new_date and existing_date and new_date > existing_date:
                valid_by_market[m_name] = rec
        else:
            valid_by_market[m_name] = rec

    if not valid_by_market:
        return RecommendationResult(
            crop=crop_clean,
            quantity_kg=qty,
            farmer_location=location_clean,
            recommended_market=None,
            expected_gross_revenue=0.0,
            transportation_cost=0.0,
            other_costs=0.0,
            expected_net_return=0.0,
            ranked_markets=[],
            alternatives=[],
            explanation=f"No valid market price data available for {crop_clean} to make a recommendation.",
        )

    # Convert candidate market prices to MarketOptions for the Profit Engine
    market_options: list[MarketOption] = []
    for m_name, rec in valid_by_market.items():
        price_per_kg = getattr(rec, "recommendation_price_per_kg", None)
        if price_per_kg is None:
            price_per_kg = getattr(rec, "modal_price", None)
        if price_per_kg is None or not math.isfinite(price_per_kg):
            continue
        quoted_cost = (
            _mapped_cost(transportation_costs, m_name)
            if isinstance(transportation_costs, Mapping)
            else None
        )
        if quoted_cost is not None:
            t_cost = quoted_cost
            cost_basis = (
                transportation_cost_basis.get(m_name, "actual_quote")
                if isinstance(transportation_cost_basis, Mapping)
                else transportation_cost_basis or "actual_quote"
            )
            if cost_basis not in {"actual_quote", "estimated"}:
                raise ValueError("transportation cost basis must be actual_quote or estimated")
            basis_by_market[m_name] = cost_basis
            distance_result = None
            trips_required = None
            estimated_cost = None
        elif distance_provider is not None:
            try:
                distance_result = distance_provider.get_distance_km(location_clean, m_name)
            except (TimeoutError, OSError, ValueError) as exc:
                distance_result = type(
                    "_DistanceFailure",
                    (),
                    {
                        "distance_km": None,
                        "source": "routing_provider",
                        "status": "error",
                        "error": str(exc) or "Road distance provider failed.",
                    },
                )()
            route_results[m_name] = distance_result
            if (
                distance_result.distance_km is None
                or not math.isfinite(distance_result.distance_km)
                or distance_result.distance_km < 0
            ):
                incomplete_markets.append(
                    MarketComparison(
                        name=m_name,
                        price_per_kg=float(price_per_kg),
                        transportation_cost=0.0,
                        other_costs=_resolve_other_cost(other_costs, m_name),
                        gross_revenue=0.0,
                        net_return=0.0,
                        rank=0,
                        price_type=rec.price_type,
                        is_stale=rec.is_stale,
                        freshness_status=rec.freshness_status,
                        distance_source=distance_result.source,
                        distance_status=distance_result.status,
                        transport_cost_basis="unavailable",
                        transport_error=distance_result.error or "Road distance unavailable.",
                        comparable=False,
                    )
                )
                continue
            if logistics.transport_mode == "shared_load":
                estimated_cost, rate_applied, rate_unit, rate_is_estimate, transport_err = (
                    calculate_shared_load_transport(
                        qty,
                        distance_result.distance_km,
                        logistics,
                    )
                )
                trips_required = 1
            else:
                estimated_cost, rate_applied, rate_unit, rate_is_estimate, trips_required, transport_err = (
                    calculate_dedicated_vehicle_transport(
                        qty,
                        distance_result.distance_km,
                        logistics,
                    )
                )

            if estimated_cost is None or not math.isfinite(estimated_cost) or estimated_cost < 0:
                incomplete_markets.append(
                    MarketComparison(
                        name=m_name,
                        price_per_kg=float(price_per_kg),
                        transportation_cost=0.0,
                        other_costs=_resolve_other_cost(other_costs, m_name),
                        gross_revenue=0.0,
                        net_return=0.0,
                        rank=0,
                        price_type=rec.price_type,
                        is_stale=rec.is_stale,
                        freshness_status=rec.freshness_status,
                        distance_source=distance_result.source,
                        distance_status=distance_result.status,
                        distance_km=distance_result.distance_km,
                        transport_mode=logistics.transport_mode,
                        rate_applied=rate_applied,
                        rate_unit=rate_unit,
                        rate_is_estimate=rate_is_estimate,
                        transport_cost_basis="unavailable",
                        transport_error=transport_err or distance_result.error or "Road distance unavailable.",
                        comparable=False,
                    )
                )
                continue

            t_cost = estimated_cost
            cost_basis = "estimated"
            basis_by_market[m_name] = cost_basis
            transport_rates[m_name] = (rate_applied, rate_unit, rate_is_estimate, trips_required)
        else:
            if (
                transportation_cost_provider is None
                and (
                    transportation_costs is None
                    or isinstance(transportation_costs, Mapping)
                    and not transportation_costs
                )
            ):
                incomplete_markets.append(
                    MarketComparison(
                        name=m_name,
                        price_per_kg=float(price_per_kg),
                        transportation_cost=0.0,
                        other_costs=_resolve_other_cost(other_costs, m_name),
                        gross_revenue=0.0,
                        net_return=0.0,
                        rank=0,
                        price_type=rec.price_type,
                        is_stale=rec.is_stale,
                        freshness_status=rec.freshness_status,
                        transport_cost_basis="unavailable",
                        transport_error=(
                            "Transport cost unavailable. Enter an actual transport quote "
                            "to compare net profit."
                        ),
                        comparable=False,
                    )
                )
                continue
            # Preserve legacy direct callers that explicitly supplied a provider or cost.
            t_cost = transport_provider.get_transportation_cost(
                farmer_location=location_clean,
                market_name=m_name,
                quantity_kg=qty,
            )
            cost_basis = "actual_quote"
            distance_result = None
            trips_required = None
            estimated_cost = None
        o_cost = _resolve_other_cost(other_costs, m_name)
        market_options.append(
            MarketOption(
                name=m_name,
                price_per_kg=float(price_per_kg),
                transportation_cost=float(t_cost),
                other_costs=float(o_cost),
            )
        )

    if not market_options:
        errors = [market.transport_error for market in incomplete_markets if market.transport_error]
        affected_markets = ", ".join(market.name for market in incomplete_markets)
        if errors and all("provider is configured" in error.lower() for error in errors):
            explanation = (
                "No comparable market has a verified transport cost or road route. "
                "No road-distance provider is configured. Enter an actual transport quote "
                f"for a market before comparing net profit. "
                f"Affected markets: {affected_markets}."
            )
        elif errors:
            first_error = errors[0]
            error_lower = first_error.lower()
            if "geocoding unavailable" in error_lower:
                detail = (
                    "Transport cost is unavailable for the selected market. "
                    "Enter an actual transport quote to compare net profit."
                )
            elif "no road route was found" in error_lower:
                detail = (
                    "Transport cost is unavailable for the selected market. "
                    "Enter an actual transport quote to compare net profit."
                )
            else:
                detail = f"Route lookup failed: {first_error}"
            explanation = (
                f"No comparable market has a verified transport cost. {detail} "
                f"Affected markets: {affected_markets}."
            )
        else:
            explanation = (
                "No comparable market has a verified transport cost. "
                f"Affected markets: {affected_markets}."
            )
        return RecommendationResult(
            crop=crop_clean,
            quantity_kg=qty,
            farmer_location=location_clean,
            recommended_market=None,
            ranked_markets=[],
            alternatives=[],
            incomplete_markets=incomplete_markets,
            explanation=explanation,
        )

    # Reuse existing Profit Engine
    profit_request = ProfitRequest(
        crop=crop_clean,
        quantity_kg=qty,
        location=location_clean,
        markets=market_options,
        loss_percentage=loss_percentage,
    )
    profit_result = calculate_profits(profit_request)

    comparison_metadata = {rec.market: rec for rec in valid_by_market.values()}
    for comparison in profit_result.comparisons:
        source_record = comparison_metadata.get(comparison.name)
        if source_record is not None:
            comparison.price_type = source_record.price_type
            comparison.is_stale = source_record.is_stale
            comparison.freshness_status = source_record.freshness_status
            comparison.confidence_level = getattr(source_record, "confidence_level", "medium")
            comparison.data_age_days = getattr(source_record, "data_age_days", None)
            comparison.observation_date = str(source_record.date) if getattr(source_record, "date", None) else None
            comparison.source_provider = getattr(source_record, "source_provider", None)
            comparison.transport_mode = logistics.transport_mode
            if comparison.name in transport_rates:
                r_app, r_unit, r_est, trips = transport_rates[comparison.name]
                comparison.rate_applied = r_app
                comparison.rate_unit = r_unit
                comparison.rate_is_estimate = r_est
                comparison.trips_required = trips
            if distance_provider is not None and _mapped_cost(transportation_costs, comparison.name) is None:
                distance_result = route_results[comparison.name]
                comparison.distance_km = distance_result.distance_km
                comparison.distance_source = distance_result.source
                comparison.distance_status = distance_result.status
                comparison.vehicle_capacity_kg = logistics.vehicle_capacity_kg
                comparison.vehicle_rate_per_km = logistics.vehicle_rate_per_km
                comparison.estimated_transport_cost = comparison.transportation_cost
                comparison.transport_cost_basis = basis_by_market[comparison.name]
            elif _mapped_cost(transportation_costs, comparison.name) is not None:
                comparison.transport_cost_basis = basis_by_market[comparison.name]
                comparison.rate_unit = "quote"
                comparison.rate_applied = comparison.transportation_cost
                comparison.rate_is_estimate = False

    best = profit_result.comparisons[0]
    alternatives = profit_result.comparisons[1:]
    explanation = _build_recommendation_explanation(
        crop=crop_clean,
        quantity_kg=qty,
        farmer_location=location_clean,
        ranked=profit_result.comparisons,
    )

    return RecommendationResult(
        crop=crop_clean,
        quantity_kg=qty,
        farmer_location=location_clean,
        recommended_market=best.name,
        expected_gross_revenue=best.gross_revenue,
        transportation_cost=best.transportation_cost,
        other_costs=best.other_costs,
        expected_net_return=best.net_return,
        ranked_markets=profit_result.comparisons,
        alternatives=alternatives,
        loss_percentage=best.loss_percentage,
        losses_provided=best.losses_provided,
        estimated_loss_kg=best.estimated_loss_kg,
        saleable_quantity_kg=best.saleable_quantity_kg,
        loss_data_status=best.loss_data_status,
        loss_data_scope=best.loss_data_scope,
        explanation=explanation,
        incomplete_markets=incomplete_markets,
    )


class RecommendationEngine:
    """Stateful recommendation service configured with a transportation cost provider."""

    def __init__(
        self,
        transportation_cost_provider: TransportationCostProvider | Mapping[str, float] | float | None = None,
    ) -> None:
        self.transportation_cost_provider = resolve_transportation_cost_provider(
            transportation_cost_provider
        )

    def recommend(
        self,
        crop: str,
        quantity_kg: float,
        farmer_location: str,
        markets: Sequence[MarketPrice | Mapping[str, Any]] | None = None,
        other_costs: float | Mapping[str, float] | None = None,
        loss_percentage: float | None = None,
    ) -> RecommendationResult:
        return recommend_market(
            crop=crop,
            quantity_kg=quantity_kg,
            farmer_location=farmer_location,
            markets=markets,
            transportation_cost_provider=self.transportation_cost_provider,
            other_costs=other_costs,
            loss_percentage=loss_percentage,
        )
