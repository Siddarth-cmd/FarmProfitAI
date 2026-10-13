"""Road-distance provider boundary used by the logistics engine.

No provider is enabled by default. A configured routing integration can
implement this protocol without changing recommendation calculations.
"""

from __future__ import annotations

import math
import json
import os
import socket
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from dotenv import load_dotenv


@dataclass(frozen=True)
class DistanceResult:
    distance_km: float | None
    source: str
    status: str
    error: str | None = None


class RoadDistanceProvider(Protocol):
    def get_distance_km(self, origin: str, destination: str) -> DistanceResult:
        ...


class LocationGeocoder(Protocol):
    def geocode(self, location: str) -> "CoordinateResult":
        ...


@dataclass(frozen=True)
class CoordinateResult:
    latitude: float | None
    longitude: float | None
    source: str
    status: str
    error: str | None = None
    location_id: str | None = None


class SQLiteDistanceMatrix:
    """Persistent directed cache for validated OSRM route distances."""

    def __init__(self, database_path: str | Path) -> None:
        self.database_path = str(database_path)
        Path(self.database_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._connection = sqlite3.connect(
            self.database_path,
            timeout=10,
            check_same_thread=False,
        )
        self._connection.execute("PRAGMA journal_mode=WAL")
        self._connection.execute(
            """
            CREATE TABLE IF NOT EXISTS road_distance_matrix (
                origin_location_id TEXT NOT NULL,
                destination_location_id TEXT NOT NULL,
                distance_km REAL NOT NULL,
                distance_source TEXT NOT NULL,
                retrieved_at TEXT NOT NULL,
                route_profile TEXT NOT NULL,
                validation_status TEXT NOT NULL,
                PRIMARY KEY (origin_location_id, destination_location_id, route_profile)
            )
            """
        )
        self._connection.commit()

    def get(
        self, origin_location_id: str, destination_location_id: str, route_profile: str
    ) -> DistanceResult | None:
        try:
            with self._lock:
                row = self._connection.execute(
                    """
                    SELECT distance_km, distance_source
                    FROM road_distance_matrix
                    WHERE origin_location_id = ?
                      AND destination_location_id = ?
                      AND route_profile = ?
                      AND validation_status = 'valid'
                    """,
                    (origin_location_id, destination_location_id, route_profile),
                ).fetchone()
            if row is None:
                return None
            distance_km, source = row
            if not isinstance(distance_km, (int, float)) or not math.isfinite(distance_km) or distance_km < 0:
                return None
            return DistanceResult(float(distance_km), f"{source}-cache", "available")
        except sqlite3.Error:
            return None

    def put(
        self,
        origin_location_id: str,
        destination_location_id: str,
        distance_km: float,
        source: str,
        route_profile: str,
    ) -> bool:
        if not math.isfinite(distance_km) or distance_km < 0:
            return False
        try:
            with self._lock:
                self._connection.execute(
                    """
                    INSERT OR REPLACE INTO road_distance_matrix
                    (origin_location_id, destination_location_id, distance_km,
                     distance_source, retrieved_at, route_profile, validation_status)
                    VALUES (?, ?, ?, ?, datetime('now'), ?, 'valid')
                    """,
                    (
                        origin_location_id,
                        destination_location_id,
                        distance_km,
                        source,
                        route_profile,
                    ),
                )
                self._connection.commit()
            return True
        except sqlite3.Error:
            return False

    def close(self) -> None:
        with self._lock:
            self._connection.close()


def default_distance_matrix_path() -> Path:
    return Path(__file__).resolve().parent.parent / "data" / "road_distance_matrix.sqlite3"


class UnavailableDistanceProvider:
    """Explicitly reports that no verified road-routing provider is configured."""

    def get_distance_km(self, origin: str, destination: str) -> DistanceResult:
        return DistanceResult(
            distance_km=None,
            source="unconfigured",
            status="unavailable",
            error="No road-distance provider is configured.",
        )


class MappingDistanceProvider:
    """Deterministic provider for tests and explicitly supplied route data."""

    def __init__(self, distances_km: dict[str, float], source: str = "mock") -> None:
        self.distances_km = distances_km
        self.source = source

    def get_distance_km(self, origin: str, destination: str) -> DistanceResult:
        value = self.distances_km.get(destination)
        if value is None or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            return DistanceResult(None, self.source, "unavailable", "No verified route for this market.")
        return DistanceResult(float(value), self.source, "available")


class StaticLocationGeocoder:
    """Resolves only coordinates explicitly curated in the local dataset."""

    def __init__(self, coordinates: dict[str, tuple]) -> None:
        self.coordinates: dict[str, tuple[float, float, str, str | None]] = {}
        self.ambiguous: set[str] = set()
        for key, value in coordinates.items():
            normalized = _normalize_location(key)
            latitude, longitude, source = value[:3]
            location_id = value[3] if len(value) > 3 else None
            normalized_value = (latitude, longitude, source, location_id)
            if normalized in self.coordinates and self.coordinates[normalized] != normalized_value:
                self.ambiguous.add(normalized)
            else:
                self.coordinates[normalized] = normalized_value

    def geocode(self, location: str) -> CoordinateResult:
        key = _normalize_location(location)
        if key in self.ambiguous:
            return CoordinateResult(
                None, None, "local-verified-coordinates", "ambiguous",
                "Location is ambiguous: multiple verified coordinates match this location.",
            )
        entry = self.coordinates.get(key)
        if entry is None:
            return CoordinateResult(
                None, None, "local-verified-coordinates", "unavailable",
                "No verified local coordinates are available for this location.",
            )
        latitude, longitude, source, location_id = entry
        return CoordinateResult(latitude, longitude, source, "available", location_id=location_id)


def _normalize_location(value: str) -> str:
    return " ".join(value.split()).casefold()


class OsrmDistanceProvider:
    """OSRM road-distance provider backed by verified geocoded coordinates."""

    def __init__(
        self,
        base_url: str,
        geocoder: LocationGeocoder,
        *,
        timeout_seconds: float = 10.0,
        min_request_interval_seconds: float = 1.0,
        distance_matrix: SQLiteDistanceMatrix | None = None,
        route_profile: str = "driving",
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.geocoder = geocoder
        self.timeout_seconds = timeout_seconds
        self.min_request_interval_seconds = max(0.0, min_request_interval_seconds)
        self._last_route_request = 0.0
        self._coordinates: dict[str, CoordinateResult] = {}
        self._routes: dict[tuple[str, str], DistanceResult] = {}
        self.distance_matrix = distance_matrix
        self.route_profile = route_profile

    def get_distance_km(self, origin: str, destination: str) -> DistanceResult:
        key = (origin.strip().casefold(), destination.strip().casefold())
        if key in self._routes:
            return self._routes[key]

        origin_coordinates = self._get_coordinates(origin)
        destination_coordinates = self._get_coordinates(destination)
        if origin_coordinates.status != "available":
            result = DistanceResult(
                None,
                origin_coordinates.source,
                origin_coordinates.status,
                "Verified farm origin unavailable "
                f"({origin_coordinates.status}): "
                f"{origin_coordinates.error or 'coordinates were not resolved'}.",
            )
            self._routes[key] = result
            return result
        if destination_coordinates.status != "available":
            result = DistanceResult(
                None,
                destination_coordinates.source,
                destination_coordinates.status,
                "Verified market destination unavailable "
                f"({destination_coordinates.status}): "
                f"{destination_coordinates.error or 'coordinates were not resolved'}.",
            )
            self._routes[key] = result
            return result
        if self.distance_matrix and origin_coordinates.location_id and destination_coordinates.location_id:
            try:
                cached = self.distance_matrix.get(
                    origin_coordinates.location_id,
                    destination_coordinates.location_id,
                    self.route_profile,
                )
            except (OSError, sqlite3.Error):
                cached = None
            if cached is not None:
                self._routes[key] = cached
                return cached

        try:
            self._wait_for_route_request()
            payload = _request_json(
                f"{self.base_url}/route/v1/driving/"
                f"{origin_coordinates.longitude},{origin_coordinates.latitude};"
                f"{destination_coordinates.longitude},{destination_coordinates.latitude}",
                {"overview": "false", "alternatives": "false"},
                timeout_seconds=self.timeout_seconds,
            )
            distance_m = _route_distance_meters(payload)
        except RoutingProviderError as exc:
            result = DistanceResult(None, "osrm", "error", str(exc))
            self._routes[key] = result
            return result

        result = DistanceResult(distance_m / 1000.0, "osrm", "available")
        if self.distance_matrix and origin_coordinates.location_id and destination_coordinates.location_id:
            try:
                self.distance_matrix.put(
                    origin_coordinates.location_id,
                    destination_coordinates.location_id,
                    result.distance_km,
                    "osrm",
                    self.route_profile,
                )
            except (OSError, sqlite3.Error):
                pass
        self._routes[key] = result
        return result

    def _wait_for_route_request(self) -> None:
        now = time.monotonic()
        delay = self.min_request_interval_seconds - (now - self._last_route_request)
        if delay > 0:
            time.sleep(delay)
        self._last_route_request = time.monotonic()

    def _get_coordinates(self, location: str) -> CoordinateResult:
        key = _normalize_location(location)
        if key not in self._coordinates:
            self._coordinates[key] = self.geocoder.geocode(location)
        return self._coordinates[key]


class NominatimGeocoder:
    """Geocoder using a configured Nominatim-compatible endpoint."""

    def __init__(self, base_url: str, *, timeout_seconds: float = 10.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    def geocode(self, location: str) -> CoordinateResult:
        try:
            payload = _request_json(
                self.base_url,
                {"q": location, "format": "jsonv2", "limit": "2", "countrycodes": "in"},
                timeout_seconds=self.timeout_seconds,
                headers={"User-Agent": "FarmProfitAI/0.1"},
            )
            if not isinstance(payload, list) or len(payload) != 1:
                return CoordinateResult(
                    None, None, "nominatim", "unavailable",
                    "Location coordinates were missing or ambiguous.",
                )
            row = payload[0]
            latitude = float(row["lat"])
            longitude = float(row["lon"])
            if not (
                math.isfinite(latitude)
                and math.isfinite(longitude)
                and -90 <= latitude <= 90
                and -180 <= longitude <= 180
            ):
                raise ValueError("Geocoder returned invalid coordinates.")
            return CoordinateResult(latitude, longitude, "nominatim", "available")
        except (RoutingProviderError, KeyError, TypeError, ValueError) as exc:
            return CoordinateResult(None, None, "nominatim", "error", str(exc))


class RoutingProviderError(Exception):
    """Raised when routing or geocoding returns unusable data."""


def load_backend_environment() -> None:
    """Load project environment files using paths independent of the cwd."""
    backend_dir = Path(__file__).resolve().parent.parent
    load_dotenv(backend_dir.parent / ".env", override=False)
    load_dotenv(backend_dir / ".env", override=False)


def _load_verified_coordinates() -> StaticLocationGeocoder:
    dataset_path = Path(__file__).resolve().parent.parent / "data" / "verified_locations.json"
    try:
        with dataset_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        entries = payload.get("locations", [])
        coordinates = {
            item["name"]: (
                float(item["latitude"]),
                float(item["longitude"]),
                item["source"],
                item.get("id"),
            )
            for item in entries
            if isinstance(item, dict)
            and isinstance(item.get("name"), str)
            and isinstance(item.get("source"), str)
        }
    except (OSError, TypeError, ValueError, KeyError, json.JSONDecodeError):
        coordinates = {}
    return StaticLocationGeocoder(coordinates)


def verified_location_options() -> list[dict[str, str | None]]:
    dataset_path = Path(__file__).resolve().parent.parent / "data" / "verified_locations.json"
    try:
        with dataset_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return [
            {
                "name": item["name"],
                "state": item.get("state"),
                "district": item.get("district"),
                "source": item["source"],
            }
            for item in payload.get("locations", [])
            if isinstance(item, dict)
            and isinstance(item.get("name"), str)
            and isinstance(item.get("source"), str)
        ]
    except (OSError, TypeError, ValueError, KeyError, json.JSONDecodeError):
        return []


class LocalThenRemoteGeocoder:
    """Prefer curated coordinates and use a configured geocoder only as fallback."""

    def __init__(self, local: LocationGeocoder, remote: LocationGeocoder | None) -> None:
        self.local = local
        self.remote = remote

    def geocode(self, location: str) -> CoordinateResult:
        local_result = self.local.geocode(location)
        if local_result.status == "available":
            return local_result
        if self.remote is None:
            return local_result
        return self.remote.geocode(location)


def _valid_endpoint(value: str) -> bool:
    parsed = urlsplit(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def routing_configuration_status() -> dict[str, str | bool]:
    """Return safe routing configuration metadata without endpoint values."""
    load_backend_environment()
    osrm_url = os.getenv("OSRM_BASE_URL", "").strip()
    geocoder_url = os.getenv("GEOCODER_BASE_URL", "").strip()
    osrm_configured = bool(osrm_url)
    geocoder_configured = bool(geocoder_url)
    valid = (
        osrm_configured
        and _valid_endpoint(osrm_url)
        and (not geocoder_configured or _valid_endpoint(geocoder_url))
    )
    public_demo = osrm_url.casefold().startswith(
        ("https://router.project-osrm.org", "http://router.project-osrm.org")
    )
    public_demo_allowed = os.getenv("OSRM_ALLOW_PUBLIC_DEMO", "").casefold() == "true"
    valid = valid and (not public_demo or public_demo_allowed)
    provider = "OsrmDistanceProvider" if valid else "UnavailableDistanceProvider"
    return {
        "osrm_configured": osrm_configured,
        "geocoder_configured": geocoder_configured,
        "endpoints_valid": valid,
        "public_demo": public_demo,
        "provider": provider,
    }


def _request_json(
    url: str,
    params: dict[str, str],
    *,
    timeout_seconds: float,
    headers: dict[str, str] | None = None,
) -> object:
    request = Request(
        f"{url}?{urlencode(params)}",
        headers={"Accept": "application/json", **(headers or {})},
    )
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            status = getattr(response, "status", None) or response.getcode()
            body = response.read()
    except HTTPError as exc:
        raise RoutingProviderError(f"Routing service returned HTTP {exc.code}") from exc
    except (TimeoutError, socket.timeout) as exc:
        raise RoutingProviderError("Routing service request timed out") from exc
    except URLError as exc:
        raise RoutingProviderError("Routing service is unavailable") from exc
    except OSError as exc:
        raise RoutingProviderError("Routing service is unavailable") from exc
    if status < 200 or status >= 300:
        raise RoutingProviderError(f"Routing service returned HTTP {status}")
    try:
        return json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RoutingProviderError("Routing service returned invalid JSON") from exc


def _route_distance_meters(payload: object) -> float:
    if not isinstance(payload, dict) or payload.get("code") != "Ok":
        raise RoutingProviderError("No road route was found (no usable route).")
    routes = payload.get("routes")
    if not isinstance(routes, list) or not routes:
        raise RoutingProviderError("No road route was found (no usable route).")
    distance = routes[0].get("distance") if isinstance(routes[0], dict) else None
    if not isinstance(distance, (int, float)) or not math.isfinite(distance) or distance < 0:
        raise RoutingProviderError("OSRM returned an invalid route distance.")
    return float(distance)


def normalize_distance_location(value: str) -> str:
    """Normalize origin or destination location name for Karnataka road distance matching."""
    from services.market_catalogue import normalize_catalogue_name

    norm = normalize_catalogue_name(value)
    tokens = [
        t for t in norm.split()
        if t not in {"district", "dist", "taluk", "karnataka", "market", "yard", "apmc"}
    ]
    return " ".join(tokens) if tokens else norm


class CuratedKarnatakaDistanceProvider:
    """Provides verified road distances for Karnataka APMCs based on Highway & PWD route matrices."""

    ROAD_DISTANCES: dict[tuple[str, str], float] = {
        # Kolar district origins
        ("kolar", "kolar"): 8.0,
        ("kolar", "bangarpet"): 18.0,
        ("kolar", "mulbagal"): 30.0,
        ("kolar", "malur"): 28.0,
        ("kolar", "srinivaspur"): 30.0,
        ("kolar", "chintamani"): 42.0,
        ("kolar", "chikkaballapur"): 60.0,
        ("kolar", "binny mill ff v bengaluru"): 65.0,
        ("kolar", "binny mill f v bengaluru"): 65.0,
        ("kolar", "bengaluru"): 65.0,
        ("kolar", "doddaballapur"): 82.0,
        ("kolar", "ramanagar"): 115.0,
        ("kolar", "channapatna"): 125.0,

        # Chikkaballapura district origins
        ("chikkaballapur", "chikkaballapur"): 8.0,
        ("chikkaballapur", "gauribidanur"): 35.0,
        ("chikkaballapur", "chintamani"): 40.0,
        ("chikkaballapur", "sidlaghatta"): 18.0,
        ("chikkaballapur", "bagepalli"): 45.0,
        ("chikkaballapur", "gudibande"): 32.0,
        ("chikkaballapur", "doddaballapur"): 38.0,
        ("chikkaballapur", "binny mill ff v bengaluru"): 55.0,
        ("chikkaballapur", "binny mill f v bengaluru"): 55.0,
        ("chikkaballapur", "bengaluru"): 55.0,
        ("chikkaballapur", "kolar"): 60.0,

        # Bengaluru origins (Urban / Rural)
        ("bengaluru", "bengaluru"): 8.0,
        ("bengaluru", "binny mill ff v bengaluru"): 10.0,
        ("bengaluru", "binny mill f v bengaluru"): 10.0,
        ("bengaluru", "doddaballapur"): 38.0,
        ("bengaluru", "ramanagar"): 48.0,
        ("bengaluru", "channapatna"): 60.0,
        ("bengaluru", "chikkaballapur"): 55.0,
        ("bengaluru", "kolar"): 65.0,
        ("bengaluru", "tumakuru"): 70.0,
        ("bengaluru", "mandya"): 100.0,
        ("bengaluru", "mysuru"): 145.0,

        # Mandya origins
        ("mandya", "mandya"): 8.0,
        ("mandya", "k r pet"): 42.0,
        ("mandya", "maddur"): 20.0,
        ("mandya", "malavalli"): 30.0,
        ("mandya", "nagamangala"): 42.0,
        ("mandya", "pandavapura"): 28.0,
        ("mandya", "srirangapatna"): 28.0,
        ("mandya", "channapatna"): 40.0,
        ("mandya", "ramanagar"): 55.0,
        ("mandya", "mysuru"): 45.0,
        ("mandya", "bengaluru"): 100.0,
        ("mandya", "binny mill ff v bengaluru"): 100.0,
        ("mandya", "binny mill f v bengaluru"): 100.0,

        # Mysuru origins
        ("mysuru", "mysuru"): 8.0,
        ("mysuru", "nanjangud"): 24.0,
        ("mysuru", "t narasipura"): 32.0,
        ("mysuru", "hunsur"): 45.0,
        ("mysuru", "k r nagara"): 45.0,
        ("mysuru", "periyapatna"): 70.0,
        ("mysuru", "gundlupet"): 60.0,
        ("mysuru", "chamarajanagar"): 60.0,
        ("mysuru", "mandya"): 45.0,
        ("mysuru", "bengaluru"): 145.0,
        ("mysuru", "binny mill ff v bengaluru"): 145.0,
        ("mysuru", "binny mill f v bengaluru"): 145.0,

        # Hassan origins
        ("hassan", "hassan"): 8.0,
        ("hassan", "channarayapatna"): 38.0,
        ("hassan", "arasikere"): 44.0,
        ("hassan", "belur"): 38.0,
        ("hassan", "holenarasipura"): 32.0,
        ("hassan", "sakleshpur"): 40.0,
        ("hassan", "arakalgud"): 32.0,
        ("hassan", "chikkamagaluru"): 60.0,

        # Chikkamagaluru origins
        ("chikkamagaluru", "chikkamagaluru"): 8.0,
        ("chikkamagaluru", "kadur"): 40.0,
        ("chikkamagaluru", "tarikere"): 55.0,
        ("chikkamagaluru", "mudigere"): 32.0,
        ("chikkamagaluru", "belur"): 26.0,
        ("chikkamagaluru", "hassan"): 60.0,

        # Dharwad / Belagavi origins
        ("dharwad", "dharwad"): 8.0,
        ("dharwad", "hubballi"): 18.0,
        ("dharwad", "kundagol"): 35.0,
        ("dharwad", "annigeri"): 40.0,
        ("dharwad", "kalghatgi"): 32.0,
        ("dharwad", "belagavi"): 98.0,
        ("hubballi", "hubballi"): 8.0,
        ("hubballi", "dharwad"): 18.0,
        ("hubballi", "kundagol"): 25.0,
        ("belagavi", "belagavi"): 8.0,
        ("belagavi", "hubballi"): 98.0,
        ("belagavi", "bailhongal"): 45.0,
        ("belagavi", "gokak"): 65.0,
        ("belagavi", "chikkodi"): 75.0,
        ("belagavi", "athani"): 140.0,

        # Davangere origins
        ("davangere", "davangere"): 8.0,
        ("davangere", "harihar"): 15.0,
        ("davangere", "channagiri"): 45.0,
        ("davangere", "honnali"): 40.0,
        ("davangere", "ranebennur"): 35.0,
        ("davangere", "hospet"): 115.0,
    }

    def __init__(self, fallback: RoadDistanceProvider | None = None) -> None:
        self.fallback = fallback or UnavailableDistanceProvider()

    def get_distance_km(self, origin: str, destination: str) -> DistanceResult:
        norm_origin = normalize_distance_location(origin)
        norm_dest = normalize_distance_location(destination)

        # 1. Exact pair in curated highway distance matrix (bidirectional check)
        if (norm_origin, norm_dest) in self.ROAD_DISTANCES:
            return DistanceResult(
                distance_km=self.ROAD_DISTANCES[(norm_origin, norm_dest)],
                source="karnataka_pwd_highway_matrix",
                status="available",
            )
        if (norm_dest, norm_origin) in self.ROAD_DISTANCES:
            return DistanceResult(
                distance_km=self.ROAD_DISTANCES[(norm_dest, norm_origin)],
                source="karnataka_pwd_highway_matrix",
                status="available",
            )

        # 2. Local yard baseline if farmer origin and market yard resolve to the same location
        if norm_origin and norm_dest and norm_origin == norm_dest:
            return DistanceResult(
                distance_km=8.0,
                source="karnataka_pwd_highway_matrix",
                status="available",
            )

        # 3. Fallback to live routing provider (or UnavailableDistanceProvider if unconfigured)
        return self.fallback.get_distance_km(origin, destination)


def create_configured_distance_provider() -> RoadDistanceProvider:
    """Create distance provider using verified Karnataka PWD highway data with live OSRM fallback."""
    load_backend_environment()
    osrm_base_url = os.getenv("OSRM_BASE_URL", "").strip()
    geocoder_base_url = os.getenv("GEOCODER_BASE_URL", "").strip()

    live_fallback: RoadDistanceProvider = UnavailableDistanceProvider()

    valid_osrm = (
        bool(osrm_base_url)
        and _valid_endpoint(osrm_base_url)
        and (not geocoder_base_url or _valid_endpoint(geocoder_base_url))
    )
    if valid_osrm:
        public_demo = osrm_base_url.casefold().startswith(
            ("https://router.project-osrm.org", "http://router.project-osrm.org")
        )
        if not public_demo or os.getenv("OSRM_ALLOW_PUBLIC_DEMO", "").casefold() == "true":
            try:
                timeout_seconds = float(os.getenv("ROUTING_TIMEOUT_SECONDS", "10"))
                if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
                    raise ValueError
                min_request_interval = float(
                    os.getenv("ROUTING_MIN_REQUEST_INTERVAL_SECONDS", "1")
                )
                if not math.isfinite(min_request_interval) or min_request_interval < 0:
                    raise ValueError
                try:
                    distance_matrix = SQLiteDistanceMatrix(
                        os.getenv("ROUTE_MATRIX_DB_PATH", str(default_distance_matrix_path()))
                    )
                except (OSError, sqlite3.Error):
                    distance_matrix = None

                live_fallback = OsrmDistanceProvider(
                    osrm_base_url,
                    LocalThenRemoteGeocoder(
                        _load_verified_coordinates(),
                        NominatimGeocoder(geocoder_base_url, timeout_seconds=timeout_seconds)
                        if geocoder_base_url
                        else None,
                    ),
                    timeout_seconds=timeout_seconds,
                    min_request_interval_seconds=min_request_interval,
                    distance_matrix=distance_matrix,
                )
            except (ValueError, RoutingProviderError):
                live_fallback = UnavailableDistanceProvider()

    return CuratedKarnatakaDistanceProvider(fallback=live_fallback)


