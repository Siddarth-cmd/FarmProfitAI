from models.profit_models import (
    MarketComparison,
    ProfitRequest,
    ProfitResult,
)


def calculate_gross_revenue(quantity_kg: float, price_per_kg: float) -> float:
    return quantity_kg * price_per_kg


def calculate_net_return(
    gross_revenue: float, transportation_cost: float, other_costs: float
) -> float:
    return gross_revenue - transportation_cost - other_costs


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
        gross_revenue = calculate_gross_revenue(request.quantity_kg, market.price_per_kg)
        net_return = calculate_net_return(
            gross_revenue, market.transportation_cost, market.other_costs
        )
        comparisons.append(
            MarketComparison(
                name=market.name,
                price_per_kg=market.price_per_kg,
                transportation_cost=market.transportation_cost,
                other_costs=market.other_costs,
                gross_revenue=gross_revenue,
                net_return=net_return,
                rank=0,
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
