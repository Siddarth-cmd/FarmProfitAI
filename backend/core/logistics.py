"""Validated configuration for load-aware transport estimates."""

from __future__ import annotations

import math
import os
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class LogisticsConfig(BaseModel):
    """Vehicle-wide or shared-load transport assumptions."""

    transport_mode: Literal["dedicated_vehicle", "shared_load"] = "dedicated_vehicle"
    # Dedicated vehicle options
    vehicle_rate_per_km: float = Field(default=15.0, ge=0)
    vehicle_capacity_kg: float = Field(default=500.0, gt=0)
    
    # Shared load options
    shared_rate_type: Literal["per_kg", "per_crate", "per_bag", "per_kg_per_km"] = "per_kg_per_km"
    shared_pricing_basis: Literal["distance_based", "fixed_trip"] = "distance_based"
    shared_rate: float | None = Field(default=None, ge=0)
    crate_capacity_kg: float = Field(default=25.0, gt=0)  # Standard Karnataka tomato/vegetable crate: 25 kg
    bag_capacity_kg: float = Field(default=50.0, gt=0)    # Standard onion/potato gunny bag: 50 kg
    max_shared_capacity_kg: float = Field(default=2500.0, gt=0)  # Standard rural shared tempo/pickup max payload: ~2,500 kg
    
    # Shared-load distance-based rate per kg per km if shared_rate not directly given
    shared_rate_per_kg_per_km: float = Field(default=0.03, ge=0)  # e.g., ₹0.03/kg/km (~₹30 for 1000kg over 1km)

    journey: str = "one_way"
    distance_unit: str = "km"
    rate_is_illustrative: bool = True

    @field_validator("vehicle_rate_per_km", "vehicle_capacity_kg", "crate_capacity_kg", "bag_capacity_kg", "shared_rate_per_kg_per_km", "max_shared_capacity_kg")
    @classmethod
    def finite_value(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("logistics values must be finite")
        return float(value)

    @classmethod
    def from_environment(cls) -> "LogisticsConfig":
        return cls(
            transport_mode=os.getenv("LOGISTICS_TRANSPORT_MODE", "dedicated_vehicle"),  # type: ignore
            vehicle_rate_per_km=float(os.getenv("LOGISTICS_VEHICLE_RATE_PER_KM", "15")),
            vehicle_capacity_kg=float(os.getenv("LOGISTICS_VEHICLE_CAPACITY_KG", "500")),
            shared_rate_type=os.getenv("LOGISTICS_SHARED_RATE_TYPE", "per_kg_per_km"),  # type: ignore
            shared_pricing_basis=os.getenv("LOGISTICS_SHARED_PRICING_BASIS", "distance_based"),  # type: ignore
            shared_rate_per_kg_per_km=float(os.getenv("LOGISTICS_SHARED_RATE_PER_KG_PER_KM", "0.03")),
        )


def calculate_shared_load_transport(
    quantity_kg: float,
    distance_km: float | None,
    config: LogisticsConfig,
) -> tuple[float | None, float, str, bool, str | None]:
    """Calculate shared-load transport cost.

    Returns:
        (estimated_cost, rate_applied, rate_unit, rate_is_estimate, error_message)
    """
    if quantity_kg <= 0:
        return 0.0, 0.0, "₹/kg/km", False, None

    if config.shared_pricing_basis == "fixed_trip":
        # Flat full trip rate - do NOT multiply by distance again
        if config.shared_rate_type == "per_crate":
            rate = config.shared_rate if config.shared_rate is not None else 30.0
            is_estimate = config.shared_rate is None
            crates = math.ceil(quantity_kg / config.crate_capacity_kg)
            cost = crates * rate
            return cost, rate, "₹/crate", is_estimate, None
        elif config.shared_rate_type == "per_bag":
            rate = config.shared_rate if config.shared_rate is not None else 50.0
            is_estimate = config.shared_rate is None
            bags = math.ceil(quantity_kg / config.bag_capacity_kg)
            cost = bags * rate
            return cost, rate, "₹/bag", is_estimate, None
        else:  # per_kg
            rate = config.shared_rate if config.shared_rate is not None else 1.5
            is_estimate = config.shared_rate is None
            cost = quantity_kg * rate
            return cost, rate, "₹/kg", is_estimate, None

    # distance_based
    if distance_km is None or not math.isfinite(distance_km) or distance_km < 0:
        return None, config.shared_rate_per_kg_per_km, "₹/kg/km", config.rate_is_illustrative, "Road distance unavailable"

    if config.shared_rate_type == "per_crate":
        if config.shared_rate is not None:
            rate_crate_km = config.shared_rate
            is_estimate = False
        else:
            rate_crate_km = config.shared_rate_per_kg_per_km * config.crate_capacity_kg
            is_estimate = True
        # Convert entered rate into an equivalent per-kilogram rate before applying distance calculation
        rate_per_kg_km = rate_crate_km / config.crate_capacity_kg
        cost = quantity_kg * rate_per_kg_km * distance_km
        return cost, rate_crate_km, "₹/crate/km", is_estimate, None

    elif config.shared_rate_type == "per_bag":
        if config.shared_rate is not None:
            rate_bag_km = config.shared_rate
            is_estimate = False
        else:
            rate_bag_km = config.shared_rate_per_kg_per_km * config.bag_capacity_kg
            is_estimate = True
        # Convert entered rate into an equivalent per-kilogram rate before applying distance calculation
        rate_per_kg_km = rate_bag_km / config.bag_capacity_kg
        cost = quantity_kg * rate_per_kg_km * distance_km
        return cost, rate_bag_km, "₹/bag/km", is_estimate, None

    else:
        # Standard per_kg_per_km
        if config.shared_rate is not None:
            rate_per_kg_km = config.shared_rate
            is_estimate = False
        elif not config.rate_is_illustrative and config.shared_rate_per_kg_per_km is not None:
            rate_per_kg_km = config.shared_rate_per_kg_per_km
            is_estimate = False
        else:
            rate_per_kg_km = config.shared_rate_per_kg_per_km or 0.03
            is_estimate = True
        cost = quantity_kg * rate_per_kg_km * distance_km
        return cost, rate_per_kg_km, "₹/kg/km", is_estimate, None


def calculate_dedicated_vehicle_transport(
    quantity_kg: float,
    distance_km: float | None,
    config: LogisticsConfig,
) -> tuple[float | None, float, str, bool, int, str | None]:
    """Calculate dedicated vehicle transport cost.

    Returns:
        (estimated_cost, rate_applied, rate_unit, rate_is_estimate, trips_required, error_message)
    """
    trips = max(1, math.ceil(quantity_kg / config.vehicle_capacity_kg))
    rate = config.vehicle_rate_per_km
    is_estimate = config.rate_is_illustrative

    if distance_km is None or not math.isfinite(distance_km) or distance_km < 0:
        return None, rate, "₹/km", is_estimate, trips, "Road distance unavailable"

    cost = trips * distance_km * rate
    return cost, rate, "₹/km", is_estimate, trips, None
