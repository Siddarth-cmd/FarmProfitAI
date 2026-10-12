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
    shared_rate_type: Literal["per_kg", "per_crate", "per_bag"] = "per_kg"
    shared_rate: float | None = Field(default=None, ge=0)
    crate_capacity_kg: float = Field(default=25.0, gt=0)  # Standard Karnataka tomato/vegetable crate: 25 kg
    bag_capacity_kg: float = Field(default=50.0, gt=0)    # Standard onion/potato gunny bag: 50 kg
    
    # Shared-load distance-based rate per kg per km if shared_rate not directly given
    shared_rate_per_kg_per_km: float = Field(default=0.03, ge=0)  # e.g., ₹0.03/kg/km (~₹30 for 1000kg over 1km)

    journey: str = "one_way"
    distance_unit: str = "km"
    rate_is_illustrative: bool = True

    @field_validator("vehicle_rate_per_km", "vehicle_capacity_kg", "crate_capacity_kg", "bag_capacity_kg", "shared_rate_per_kg_per_km")
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
            shared_rate_type=os.getenv("LOGISTICS_SHARED_RATE_TYPE", "per_kg"),  # type: ignore
            shared_rate_per_kg_per_km=float(os.getenv("LOGISTICS_SHARED_RATE_PER_KG_PER_KM", "0.03")),
        )
