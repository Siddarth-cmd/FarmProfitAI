from datetime import date

import pytest
from pydantic import ValidationError

from models.market_models import MarketPrice
from services.market_data_service import normalize_market_price, normalize_market_prices


def _valid_record(**overrides) -> dict:
    payload = {
        "commodity": "Tomato",
        "variety": "Local",
        "state": "Maharashtra",
        "district": "Nashik",
        "market": "Nashik",
        "date": "2026-10-08",
        "min_price": 16,
        "max_price": 22,
        "modal_price": 20,
    }
    payload.update(overrides)
    return payload


def test_valid_market_price():
    record = MarketPrice.model_validate(_valid_record())

    assert record.commodity == "Tomato"
    assert record.variety == "Local"
    assert record.date == date(2026, 10, 8)
    assert record.min_price == 16
    assert record.modal_price == 20
    assert record.max_price == 22


def test_variety_is_optional():
    record = MarketPrice.model_validate(_valid_record(variety=None))
    assert record.variety is None


def test_service_normalizes_valid_records():
    records = normalize_market_prices(
        [
            _valid_record(),
            _valid_record(market="  Pune  ", variety="  "),
        ]
    )

    assert len(records) == 2
    assert records[0].modal_price == 20
    assert records[1].market == "Pune"
    assert records[1].variety is None


def test_service_rejects_invalid_record():
    with pytest.raises(ValidationError):
        normalize_market_price(_valid_record(modal_price=-1))


def test_negative_prices_are_rejected():
    for field in ("min_price", "max_price", "modal_price"):
        with pytest.raises(ValidationError):
            MarketPrice.model_validate(_valid_record(**{field: -0.01}))


def test_invalid_price_range_is_rejected():
    with pytest.raises(ValidationError):
        MarketPrice.model_validate(_valid_record(min_price=21, modal_price=20, max_price=22))

    with pytest.raises(ValidationError):
        MarketPrice.model_validate(_valid_record(min_price=16, modal_price=23, max_price=22))


def test_invalid_date_is_rejected():
    with pytest.raises(ValidationError):
        MarketPrice.model_validate(_valid_record(date="2026-13-40"))
