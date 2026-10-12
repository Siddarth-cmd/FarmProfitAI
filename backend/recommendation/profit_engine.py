import math

from models.profit_models import (
    MarketComparison,
    ProfitRequest,
    ProfitResult,
    RealizableProfitBreakdown,
)


def calculate_gross_revenue(quantity_kg: float, price_per_kg: float) -> float:
    return quantity_kg * price_per_kg


def calculate_net_return(
    gross_revenue: float, transportation_cost: float, other_costs: float
) -> float:
    return gross_revenue - transportation_cost - other_costs


def calculate_realizable_profit(
    harvest_quantity_kg: float,
    price_per_kg: float,
    transportation_cost: float,
    other_costs: float,
    loss_percentage: float | None = None,
) -> RealizableProfitBreakdown:
    """Calculate realizable net return without inventing an unprovided loss rate."""

    values = {
        "harvest quantity": harvest_quantity_kg,
        "price per kg": price_per_kg,
        "transportation cost": transportation_cost,
        "other costs": other_costs,
    }
    for label, value in values.items():
        if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ValueError(f"{label} must be a nonnegative finite number")

    if loss_percentage is not None and (
        not isinstance(loss_percentage, (int, float))
        or not math.isfinite(loss_percentage)
        or loss_percentage < 0
        or loss_percentage > 100
    ):
        raise ValueError("loss percentage must be between 0 and 100")

    assumed_loss = 0.0 if loss_percentage is None else float(loss_percentage)
    estimated_loss_kg = harvest_quantity_kg * assumed_loss / 100
    saleable_quantity_kg = harvest_quantity_kg - estimated_loss_kg
    gross_revenue = saleable_quantity_kg * price_per_kg
    net_return = gross_revenue - transportation_cost - other_costs

    return RealizableProfitBreakdown(
        harvest_quantity_kg=float(harvest_quantity_kg),
        estimated_loss_kg=estimated_loss_kg,
        saleable_quantity_kg=saleable_quantity_kg,
        price_per_kg=float(price_per_kg),
        gross_revenue=gross_revenue,
        transportation_cost=float(transportation_cost),
        other_costs=float(other_costs),
        net_return=net_return,
        loss_percentage=None if loss_percentage is None else float(loss_percentage),
        losses_provided=loss_percentage is not None,
        loss_data_status=(
            "provided"
            if loss_percentage is not None
            else "not_provided_zero_baseline"
        ),
    )


def _build_explanation(request: ProfitRequest, ranked: list[MarketComparison]) -> str:
    best = ranked[0]
    if len(ranked) == 1:
        return (
            f"For {request.quantity_kg} kg of {request.crop} from {request.location}, "
            f"{best.name} is the only market provided. Expected net return is "
            f"{best.net_return} after transportation ({best.transportation_cost}) "
            f"and other costs ({best.other_costs})."
        )

    runner_up = ranked[1]
    advantage = best.net_return - runner_up.net_return
    if advantage == 0:
        return (
            f"For {request.quantity_kg} kg of {request.crop} from {request.location}, "
            f"{best.name} is recommended. It ties {runner_up.name} with a net return "
            f"of {best.net_return}."
        )

    return (
        f"For {request.quantity_kg} kg of {request.crop} from {request.location}, "
        f"sell at {best.name}. It has the highest net return of {best.net_return} "
        f"(price {best.price_per_kg} per kg, transportation {best.transportation_cost}, "
        f"other costs {best.other_costs}), which is {advantage} more than "
        f"{runner_up.name} ({runner_up.net_return})."
    )


def calculate_profits(request: ProfitRequest) -> ProfitResult:
    """Validate via the request model, score every market, and pick the best net return."""

    comparisons: list[MarketComparison] = []
    for market in request.markets:
        breakdown = calculate_realizable_profit(
            harvest_quantity_kg=request.quantity_kg,
            price_per_kg=market.price_per_kg,
            transportation_cost=market.transportation_cost,
            other_costs=market.other_costs,
            loss_percentage=request.loss_percentage,
        )
        comparisons.append(
            MarketComparison(
                name=market.name,
                price_per_kg=market.price_per_kg,
                transportation_cost=market.transportation_cost,
                other_costs=market.other_costs,
                gross_revenue=breakdown.gross_revenue,
                net_return=breakdown.net_return,
                rank=0,
                harvest_quantity_kg=breakdown.harvest_quantity_kg,
                estimated_loss_kg=breakdown.estimated_loss_kg,
                saleable_quantity_kg=breakdown.saleable_quantity_kg,
                loss_percentage=breakdown.loss_percentage,
                losses_provided=breakdown.losses_provided,
                loss_data_status=breakdown.loss_data_status,
                loss_data_scope=breakdown.loss_data_scope,
            )
        )

    ranked = sorted(comparisons, key=lambda item: item.net_return, reverse=True)
    numbered = [
        item.model_copy(update={"rank": index})
        for index, item in enumerate(ranked, start=1)
    ]
    best = numbered[0]

    return ProfitResult(
        crop=request.crop,
        quantity_kg=request.quantity_kg,
        location=request.location,
        comparisons=numbered,
        recommended_market=best.name,
        recommended_net_return=best.net_return,
        explanation=_build_explanation(request, numbered),
    )
