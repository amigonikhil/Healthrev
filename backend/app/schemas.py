"""API request/response models. No PHI fields here in M0."""

from __future__ import annotations

from datetime import datetime
from math import isfinite

from pydantic import BaseModel, Field, field_validator, model_validator

from app.security.consent import ConsentPurpose, ConsentStatus
from app.wearables.metrics import WearableMetric


class ConsentGrantRequest(BaseModel):
    purpose: ConsentPurpose
    policy_version: str = Field(..., min_length=1, max_length=64)
    expires_at: datetime | None = None


class ConsentResponse(BaseModel):
    id: str
    purpose: ConsentPurpose
    status: ConsentStatus
    policy_version: str
    granted_at: datetime
    expires_at: datetime | None
    revoked_at: datetime | None


class AuditEntryResponse(BaseModel):
    action: str
    actor: str
    resource_type: str | None
    resource_id: str | None
    purpose: ConsentPurpose | None
    consent_id: str | None
    created_at: datetime


class HealthCheckResponse(BaseModel):
    status: str
    environment: str


# -- Wearables (M1) -----------------------------------------------------------


class WearableConnectResponse(BaseModel):
    """The provider consent URL the client should open, plus the bound state."""

    authorization_url: str
    state: str


class WearableSyncResponse(BaseModel):
    provider: str
    new_samples: int
    synced_at: datetime


class WearableProviderInfo(BaseModel):
    provider: str
    supported: bool
    connected: bool
    last_sync_at: datetime | None = None


class WearableConnectionStatusResponse(BaseModel):
    provider: str
    status: str


class WearableSampleResponse(BaseModel):
    """A normalized sample. This is the user's own health data, returned over an
    authenticated, consent-gated channel; values must never be logged."""

    provider: str
    metric: str
    value: float
    unit: str
    start_time: datetime
    end_time: datetime


class DeviceSampleIn(BaseModel):
    """One sample pushed from an on-device bridge (HealthKit / Health Connect).

    Apple/Google health data has no cloud API, so the mobile app reads it
    on-device and pushes it here (architectural constraint #1)."""

    metric: WearableMetric
    value: float
    start_time: datetime
    end_time: datetime
    unit: str | None = None

    @field_validator("value")
    @classmethod
    def _finite(cls, v: float) -> float:
        if not isfinite(v):
            raise ValueError("value must be a finite number")
        return v

    @model_validator(mode="after")
    def _window_ok(self) -> DeviceSampleIn:
        if self.end_time < self.start_time:
            raise ValueError("end_time must be >= start_time")
        return self


class DeviceSamplesIngest(BaseModel):
    samples: list[DeviceSampleIn] = Field(..., min_length=1, max_length=1000)
