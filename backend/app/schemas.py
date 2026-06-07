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
