"""API request/response models. No PHI fields here in M0."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.security.consent import ConsentPurpose, ConsentStatus


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
