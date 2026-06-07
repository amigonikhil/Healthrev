"""Shared wearable domain types.

These mirror the enums/tables in `supabase/migrations/0002_wearables.sql`. The
normalized `WearableSample` is the single shape every provider (cloud or
on-device) maps into, so downstream trend/fusion code (M4) never sees
provider-specific payloads.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum


class WearableProvider(str, Enum):
    """Mirror of the `wearable_provider` DB enum. Keep in sync."""

    WHOOP = "whoop"
    OURA = "oura"
    FITBIT = "fitbit"
    GARMIN = "garmin"
    APPLE_HEALTH = "apple_health"
    HEALTH_CONNECT = "health_connect"


class WearableMetric(str, Enum):
    """Mirror of the `wearable_metric` DB enum. Keep in sync."""

    RESTING_HEART_RATE = "resting_heart_rate"
    HRV = "hrv"
    SLEEP_DURATION = "sleep_duration"
    SLEEP_EFFICIENCY = "sleep_efficiency"
    RECOVERY_SCORE = "recovery_score"
    STEPS = "steps"
    RESPIRATORY_RATE = "respiratory_rate"


# Canonical unit per metric. Providers convert into these during normalization
# so values are comparable across sources.
CANONICAL_UNITS: dict[WearableMetric, str] = {
    WearableMetric.RESTING_HEART_RATE: "bpm",
    WearableMetric.HRV: "ms",
    WearableMetric.SLEEP_DURATION: "min",
    WearableMetric.SLEEP_EFFICIENCY: "percent",
    WearableMetric.RECOVERY_SCORE: "percent",
    WearableMetric.STEPS: "count",
    WearableMetric.RESPIRATORY_RATE: "breaths_per_min",
}


@dataclass(frozen=True)
class WearableSample:
    """A single normalized wearable measurement."""

    provider: WearableProvider
    metric: WearableMetric
    value: float
    start_time: datetime
    end_time: datetime
    unit: str = ""
    # Stable identity for idempotent upserts (provider + metric + window).
    dedup_key: str = ""

    def __post_init__(self) -> None:
        # Fill canonical unit if the caller omitted it.
        if not self.unit:
            object.__setattr__(self, "unit", CANONICAL_UNITS[self.metric])
        if self.end_time < self.start_time:
            raise ValueError("end_time must be >= start_time")
        if not self.dedup_key:
            object.__setattr__(self, "dedup_key", self._default_dedup_key())

    def _default_dedup_key(self) -> str:
        start = self.start_time.astimezone(UTC).isoformat()
        return f"{self.provider.value}:{self.metric.value}:{start}"


@dataclass
class WearableConnection:
    """An OAuth (or on-device) link to a provider for one user."""

    id: str
    user_id: str
    provider: WearableProvider
    status: str = "connected"
    provider_user_id: str | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    token_expires_at: datetime | None = None
    scopes: list[str] = field(default_factory=list)
    last_sync_at: datetime | None = None
