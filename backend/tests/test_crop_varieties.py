import pytest
from datetime import date, datetime, timezone
import db
from models.market_models import MarketPrice


def test_extract_genuine_variety_filters():
    # APMC and market combinations
    assert db.extract_genuine_variety("Bangarpet APMC - Tomato", commodity="Tomato", market="Bangarpet APMC") is None
    assert db.extract_genuine_variety("Bengaluru APMC - Onion", commodity="Onion", market="Bengaluru APMC") is None
    assert db.extract_genuine_variety("Kolar APMC - Other", commodity="Tomato") is None
    assert db.extract_genuine_variety("Belur APMC - Hybrid", commodity="Tomato") == "Hybrid"
    assert db.extract_genuine_variety("Hassan APMC - Local", commodity="Potato") == "Local"
    assert db.extract_genuine_variety("Pune - Puna", commodity="Onion") == "Puna"
    
    # Raw market names without hyphens
    assert db.extract_genuine_variety("Bangarpet APMC", commodity="Tomato") is None
    assert db.extract_genuine_variety("Bengaluru Mandi", commodity="Onion") is None

    # Raw commodity names
    assert db.extract_genuine_variety("Tomato", commodity="Tomato") is None
    assert db.extract_genuine_variety("Onion", commodity="Onion") is None
    assert db.extract_genuine_variety("Potato", commodity="Potato") is None

    # Generic placeholders
    assert db.extract_genuine_variety("Other", commodity="Tomato") is None
    assert db.extract_genuine_variety("General", commodity="Onion") is None
    assert db.extract_genuine_variety("Average", commodity="Maize") is None
    assert db.extract_genuine_variety("FAQ", commodity="Wheat") is None

    # Valid genuine varieties
    assert db.extract_genuine_variety("Hybrid", commodity="Tomato") == "Hybrid"
    assert db.extract_genuine_variety("Local", commodity="Tomato") == "Local"
    assert db.extract_genuine_variety("Bangalore-Samall", commodity="Onion") == "Bangalore-Samall"
    assert db.extract_genuine_variety("Beelary-Red", commodity="Onion") == "Beelary-Red"
    assert db.extract_genuine_variety("Bombay (U.P.)", commodity="Onion") == "Bombay (U.P.)"


def test_get_varieties_for_crop_excludes_markets_and_returns_genuine(tmp_path, monkeypatch):
    test_db = tmp_path / "test_varieties.db"
    monkeypatch.setenv("BACKEND_DB_PATH", str(test_db))

    now = datetime.now(timezone.utc)
    # Insert dirty records with market-commodity combinations and valid records
    records = [
        MarketPrice(
            commodity="Tomato",
            variety="Bangarpet APMC - Tomato",
            state="Karnataka",
            district="Kolar",
            market="Bangarpet APMC",
            date="2026-10-10",
            min_price=20.0,
            modal_price=24.0,
            max_price=28.0,
            source_provider="agmarknet.gov.in",
        ),
        MarketPrice(
            commodity="Tomato",
            variety="Belur APMC - Hybrid",
            state="Karnataka",
            district="Hassan",
            market="Belur APMC",
            date="2026-10-10",
            min_price=22.0,
            modal_price=25.0,
            max_price=30.0,
            source_provider="agmarknet.gov.in",
        ),
        MarketPrice(
            commodity="Tomato",
            variety="Local",
            state="Karnataka",
            district="Bengaluru",
            market="Bengaluru APMC",
            date="2026-10-10",
            min_price=18.0,
            modal_price=21.0,
            max_price=25.0,
            source_provider="agmarknet.gov.in",
        ),
        MarketPrice(
            commodity="Tomato",
            variety="Kolar APMC - Other",
            state="Karnataka",
            district="Kolar",
            market="Kolar APMC",
            date="2026-10-10",
            min_price=15.0,
            modal_price=18.0,
            max_price=20.0,
            source_provider="agmarknet.gov.in",
        ),
        MarketPrice(
            commodity="Onion",
            variety="Bengaluru APMC - Onion",
            state="Karnataka",
            district="Bengaluru",
            market="Bengaluru APMC",
            date="2026-10-10",
            min_price=30.0,
            modal_price=35.0,
            max_price=40.0,
            source_provider="agmarknet.gov.in",
        ),
        MarketPrice(
            commodity="Onion",
            variety="Puna",
            state="Karnataka",
            district="Belagavi",
            market="Belagavi APMC",
            date="2026-10-10",
            min_price=28.0,
            modal_price=32.0,
            max_price=36.0,
            source_provider="agmarknet.gov.in",
        ),
    ]

    for r in records:
        db.upsert_observation(r, retrieved_at=now, provider="agmarknet.gov.in")

    tomato_varieties = db.get_varieties_for_crop("Tomato")
    assert "Bangarpet APMC - Tomato" not in tomato_varieties
    assert "Kolar APMC - Other" not in tomato_varieties
    assert "Bangarpet APMC" not in tomato_varieties
    assert "Tomato" not in tomato_varieties
    assert "Other" not in tomato_varieties
    # Genuine varieties must be present
    assert "Hybrid" in tomato_varieties
    assert "Local" in tomato_varieties
    assert sorted(tomato_varieties) == ["Hybrid", "Local"]

    # Onion varieties
    onion_varieties = db.get_varieties_for_crop("Onion")
    assert "Bengaluru APMC - Onion" not in onion_varieties
    assert "Onion" not in onion_varieties
    assert onion_varieties == ["Puna"]

    # Crop change to an unknown or empty crop
    assert db.get_varieties_for_crop("UnknownCrop") == []
    assert db.get_varieties_for_crop("") == []


def test_variety_endpoint_and_recommendation_compatibility(client, tmp_path, monkeypatch):
    """Test endpoint response and ensure recommendation engine accepts variety."""
    from unittest.mock import patch
    from services.data_gov_client import MarketDataFetchResult

    test_db = tmp_path / "test_api_var.db"
    monkeypatch.setenv("BACKEND_DB_PATH", str(test_db))

    now = datetime.now(timezone.utc)
    r1 = MarketPrice(
        commodity="Tomato",
        variety="Belur APMC - Hybrid",
        state="Karnataka",
        district="Hassan",
        market="Belur APMC",
        date="2026-10-10",
        min_price=22.0,
        modal_price=25.0,
        max_price=30.0,
        source_provider="agmarknet.gov.in",
    )
    db.upsert_observation(r1, retrieved_at=now, provider="agmarknet.gov.in")

    resp = client.get("/crops/Tomato/varieties")
    assert resp.status_code == 200
    data = resp.json()
    assert data["crop"] == "Tomato"
    assert data["varieties"] == ["Hybrid"]
    assert "Belur APMC - Hybrid" not in data["varieties"]

    mock_records = [
        MarketPrice(
            commodity="Tomato",
            variety="Hybrid",
            state="Karnataka",
            district="Hassan",
            market="Belur APMC",
            date="2026-10-10",
            min_price=22.0,
            modal_price=25.0,
            max_price=30.0,
            source_provider="agmarknet.gov.in",
        )
    ]

    # Recommendation payload with variety
    payload_with_variety = {
        "crop": "Tomato",
        "variety": "Hybrid",
        "quantity_kg": 500,
        "farmer_location": "Hassan",
        "state": "Karnataka",
        "district": "Hassan",
        "selected_markets": ["Belur APMC"],
        "transportation_costs": {"Belur APMC": 500},
        "other_costs": 100,
    }
    with patch(
        "api.recommendation.fetch_market_prices_with_fallback",
        return_value=MarketDataFetchResult(records=mock_records, available=True),
    ):
        rec_resp = client.post("/recommend", json=payload_with_variety)
        assert rec_resp.status_code == 200
        rec_data = rec_resp.json()
        assert rec_data["available"] is True
        assert rec_data["recommendation"]["recommended_market"] == "Belur APMC"
        assert rec_data["recommendation"]["crop"] == "Tomato"
        assert rec_data["recommendation"]["variety"] == "Hybrid"

    # Recommendation payload without variety (All varieties / Any)
    payload_without_variety = {
        "crop": "Tomato",
        "quantity_kg": 500,
        "farmer_location": "Hassan",
        "state": "Karnataka",
        "district": "Hassan",
        "selected_markets": ["Belur APMC"],
        "transportation_costs": {"Belur APMC": 500},
        "other_costs": 100,
    }
    with patch(
        "api.recommendation.fetch_market_prices_with_fallback",
        return_value=MarketDataFetchResult(records=mock_records, available=True),
    ):
        rec_resp2 = client.post("/recommend", json=payload_without_variety)
        assert rec_resp2.status_code == 200
        rec_data2 = rec_resp2.json()
        assert rec_data2["available"] is True
        assert rec_data2["recommendation"]["recommended_market"] == "Belur APMC"

