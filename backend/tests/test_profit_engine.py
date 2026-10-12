import pytest
from pydantic import ValidationError

from models.profit_models import MarketOption, ProfitRequest
from recommendation.profit_engine import calculate_profits
from recommendation.profit_engine import calculate_realizable_profit


def _request(**overrides) -> ProfitRequest:
    payload = {
        "crop": "tomato",
        "quantity_kg": 100,
        "location": "Nashik",
        "markets": [
            {
                "name": "Local Mandi",
                "price_per_kg": 20,
                "transportation_cost": 200,
                "other_costs": 50,
            }
        ],
    }
    payload.update(overrides)
    return ProfitRequest.model_validate(payload)


def test_normal_calculation():
    result = calculate_profits(_request())
    comparison = result.comparisons[0]

    assert comparison.gross_revenue == 2000
    assert comparison.net_return == 1750
    assert comparison.rank == 1
    assert result.recommended_market == "Local Mandi"
    assert result.recommended_net_return == 1750
    assert "Local Mandi" in result.explanation
    assert "1750" in result.explanation


def test_multiple_market_comparison():
    request = _request(
        markets=[
            {
                "name": "Nearby Market",
                "price_per_kg": 18,
                "transportation_cost": 100,
                "other_costs": 40,
            },
            {
                "name": "City Market",
                "price_per_kg": 22,
                "transportation_cost": 400,
                "other_costs": 80,
            },
            {
                "name": "Highway Yard",
                "price_per_kg": 21,
                "transportation_cost": 250,
                "other_costs": 30,
            },
        ]
    )
    result = calculate_profits(request)
    by_name = {item.name: item for item in result.comparisons}

    assert by_name["Nearby Market"].gross_revenue == 1800
    assert by_name["Nearby Market"].net_return == 1660
    assert by_name["City Market"].gross_revenue == 2200
    assert by_name["City Market"].net_return == 1720
    assert by_name["Highway Yard"].gross_revenue == 2100
    assert by_name["Highway Yard"].net_return == 1820

    assert [item.name for item in result.comparisons] == [
        "Highway Yard",
        "City Market",
        "Nearby Market",
    ]
    assert [item.rank for item in result.comparisons] == [1, 2, 3]


def test_zero_quantity_is_rejected():
    with pytest.raises(ValidationError):
        _request(quantity_kg=0)


def test_negative_quantity_is_rejected():
    with pytest.raises(ValidationError):
        _request(quantity_kg=-10)


def test_negative_price_is_rejected():
    with pytest.raises(ValidationError):
        MarketOption(
            name="Any Market",
            price_per_kg=-1,
            transportation_cost=0,
            other_costs=0,
        )


def test_recommendation_selects_highest_net_return():
    request = _request(
        quantity_kg=50,
        markets=[
            {
                "name": "Low Price Close",
                "price_per_kg": 10,
                "transportation_cost": 20,
                "other_costs": 10,
            },
            {
                "name": "High Price Far",
                "price_per_kg": 16,
                "transportation_cost": 200,
                "other_costs": 50,
            },
            {
                "name": "Best Net",
                "price_per_kg": 14,
                "transportation_cost": 40,
                "other_costs": 20,
            },
        ],
    )
    result = calculate_profits(request)

    assert result.recommended_market == "Best Net"
    assert result.recommended_net_return == 640
    assert result.comparisons[0].name == "Best Net"
    assert "Best Net" in result.explanation
    assert "High Price Far" in result.explanation


@pytest.mark.parametrize("loss_percentage", [None, 0])
def test_realizable_profit_omitted_or_zero_loss(loss_percentage):
    result = calculate_realizable_profit(100, 20, 200, 50, loss_percentage)

    assert result.harvest_quantity_kg == 100
    assert result.estimated_loss_kg == 0
    assert result.saleable_quantity_kg == 100
    assert result.gross_revenue == 2000
    assert result.net_return == 1750
    assert result.losses_provided is (loss_percentage is not None)


def test_realizable_profit_positive_loss():
    result = calculate_realizable_profit(100, 20, 200, 50, 10)

    assert result.estimated_loss_kg == 10
    assert result.saleable_quantity_kg == 90
    assert result.gross_revenue == 1800
    assert result.net_return == 1550
    assert result.losses_provided is True


def test_realizable_profit_full_loss():
    result = calculate_realizable_profit(100, 20, 200, 50, 100)

    assert result.saleable_quantity_kg == 0
    assert result.gross_revenue == 0
    assert result.net_return == -250


def test_realizable_profit_zero_costs():
    result = calculate_realizable_profit(100, 20, 0, 0)

    assert result.net_return == 2000


@pytest.mark.parametrize(
    ("quantity", "price", "transport", "other"),
    [
        (-1, 20, 0, 0),
        (100, -1, 0, 0),
        (100, 20, -1, 0),
        (100, 20, 0, -1),
    ],
)
def test_realizable_profit_rejects_negative_values(quantity, price, transport, other):
    with pytest.raises(ValueError, match="nonnegative"):
        calculate_realizable_profit(quantity, price, transport, other)


@pytest.mark.parametrize("loss_percentage", [-0.1, 100.1])
def test_realizable_profit_rejects_invalid_loss_percentage(loss_percentage):
    with pytest.raises(ValueError, match="between 0 and 100"):
        calculate_realizable_profit(100, 20, 0, 0, loss_percentage)


def test_calculate_profits_uses_realizable_breakdown():
    result = calculate_profits(_request(loss_percentage=25))
    comparison = result.comparisons[0]

    assert comparison.estimated_loss_kg == 25
    assert comparison.saleable_quantity_kg == 75
    assert comparison.gross_revenue == 1500
    assert comparison.net_return == 1250
    assert comparison.losses_provided is True
