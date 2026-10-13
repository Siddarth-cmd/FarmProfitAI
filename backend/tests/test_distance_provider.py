"""Unit and regression tests for road-distance providers and factory."""

import pytest

from services.distance_provider import (
    CuratedKarnatakaDistanceProvider,
    DistanceResult,
    MappingDistanceProvider,
    OsrmDistanceProvider,
    UnavailableDistanceProvider,
    create_configured_distance_provider,
    normalize_distance_location,
)


def test_normalize_distance_location_handles_aliases_and_suffixes():
    assert normalize_distance_location("Mysore") == "mysuru"
    assert normalize_distance_location("Mysuru APMC") == "mysuru"
    assert normalize_distance_location("Mysuru, Karnataka") == "mysuru"
    assert normalize_distance_location("Mysore District") == "mysuru"
    assert normalize_distance_location("Hunsur APMC Market Yard") == "hunsur"
    assert normalize_distance_location("Bangalore") == "bengaluru"
    assert normalize_distance_location("Belgaum APMC") == "belagavi"


def test_curated_karnataka_distance_provider_known_pairs():
    provider = CuratedKarnatakaDistanceProvider()

    # Exact Mysuru district pairs
    res_hunsur = provider.get_distance_km("Mysuru", "Hunsur APMC")
    assert res_hunsur.status == "available"
    assert res_hunsur.distance_km == 45.0
    assert res_hunsur.source == "karnataka_pwd_highway_matrix"

    res_nanjangud = provider.get_distance_km("Mysuru", "Nanjangud APMC")
    assert res_nanjangud.status == "available"
    assert res_nanjangud.distance_km == 24.0

    res_tnarasipura = provider.get_distance_km("Mysuru", "T. Narasipura APMC")
    assert res_tnarasipura.status == "available"
    assert res_tnarasipura.distance_km == 32.0

    # Symmetric bidirectional resolution
    res_reverse = provider.get_distance_km("Hunsur APMC", "Mysuru")
    assert res_reverse.status == "available"
    assert res_reverse.distance_km == 45.0

    # Same location baseline
    res_same = provider.get_distance_km("Mysore", "Mysuru APMC")
    assert res_same.status == "available"
    assert res_same.distance_km == 8.0

    # Inter-district curated routes
    res_mandya_mysuru = provider.get_distance_km("Mandya", "Mysuru APMC")
    assert res_mandya_mysuru.status == "available"
    assert res_mandya_mysuru.distance_km == 45.0


def test_curated_karnataka_distance_provider_delegates_to_fallback():
    mock_fallback = MappingDistanceProvider({"Delhi": 2200.0}, source="mock_live")
    provider = CuratedKarnatakaDistanceProvider(fallback=mock_fallback)

    # Known curated route uses curated highway data
    assert provider.get_distance_km("Mysuru", "Hunsur APMC").distance_km == 45.0

    # Uncurated route delegates to fallback
    res = provider.get_distance_km("Mysuru", "Delhi")
    assert res.status == "available"
    assert res.distance_km == 2200.0
    assert res.source == "mock_live"


def test_curated_karnataka_distance_provider_safe_on_unknown():
    provider = CuratedKarnatakaDistanceProvider()

    # Completely unknown route returns unavailable without fabricating
    res = provider.get_distance_km("Mysuru", "Unknown Mandi Location")
    assert res.status == "unavailable"
    assert res.distance_km is None
    assert "No road-distance provider is configured" in (res.error or "")


def test_create_configured_distance_provider_default_environment(monkeypatch):
    monkeypatch.setenv("OSRM_BASE_URL", "")
    monkeypatch.setenv("GEOCODER_BASE_URL", "")

    provider = create_configured_distance_provider()
    assert isinstance(provider, CuratedKarnatakaDistanceProvider)
    assert isinstance(provider.fallback, UnavailableDistanceProvider)

    # Curated highway routes work out of the box
    res = provider.get_distance_km("Mysuru", "Hunsur APMC")
    assert res.status == "available"
    assert res.distance_km == 45.0

    # Uncurated routes safely report unavailable
    res_unknown = provider.get_distance_km("Mysuru", "Nowhere APMC")
    assert res_unknown.status == "unavailable"
    assert res_unknown.distance_km is None


def test_create_configured_distance_provider_with_osrm_configured(monkeypatch):
    monkeypatch.setenv("OSRM_BASE_URL", "http://127.0.0.1:5000")
    monkeypatch.setenv("GEOCODER_BASE_URL", "")
    monkeypatch.setenv("ROUTING_TIMEOUT_SECONDS", "5")
    monkeypatch.setenv("ROUTING_MIN_REQUEST_INTERVAL_SECONDS", "0")

    provider = create_configured_distance_provider()
    assert isinstance(provider, CuratedKarnatakaDistanceProvider)
    assert isinstance(provider.fallback, OsrmDistanceProvider)
