"""Consent evaluation — the gate in front of every health-data read.

The core decision is a *pure function* (`evaluate_consent`) so it can be unit
tested exhaustively without a database or network. The DB/HTTP layers fetch a
consent record and feed it here; this module owns the rule.

DPDPA rule (mirrors `supabase/migrations/0001_foundation.sql`): a read is
permitted only when a consent exists that is granted, not revoked, not expired,
and matches the requested purpose.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum


class ConsentPurpose(str, Enum):
    """Mirror of the `consent_purpose` enum in the DB. Keep in sync."""

    WEARABLE_SYNC = "wearable_sync"
    LAB_REPORT_INGESTION = "lab_report_ingestion"
    MARKER_STORAGE = "marker_storage"
    TREND_ANALYSIS = "trend_analysis"
    NOTIFICATIONS = "notifications"


class ConsentStatus(str, Enum):
    GRANTED = "granted"
    REVOKED = "revoked"


@dataclass(frozen=True)
class ConsentRecord:
    """A consent row as seen by the application layer."""

    id: str
    user_id: str
    purpose: ConsentPurpose
    status: ConsentStatus
    policy_version: str
    granted_at: datetime
    expires_at: datetime | None = None
    revoked_at: datetime | None = None


class DenyReason(str, Enum):
    NO_CONSENT = "no_consent"
    WRONG_PURPOSE = "wrong_purpose"
    REVOKED = "revoked"
    EXPIRED = "expired"


@dataclass(frozen=True)
class ConsentDecision:
    allowed: bool
    consent_id: str | None = None
    reason: DenyReason | None = None

    @classmethod
    def allow(cls, consent_id: str) -> ConsentDecision:
        return cls(allowed=True, consent_id=consent_id)

    @classmethod
    def deny(cls, reason: DenyReason) -> ConsentDecision:
        return cls(allowed=False, reason=reason)


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _as_aware(dt: datetime) -> datetime:
    """Treat naive datetimes as UTC so comparisons never raise."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


def evaluate_consent(
    consent: ConsentRecord | None,
    purpose: ConsentPurpose,
    *,
    now: datetime | None = None,
) -> ConsentDecision:
    """Decide whether `consent` authorises an action for `purpose` at `now`.

    Pure and side-effect free. Pass `now` in tests; defaults to current UTC time.
    """
    now = _as_aware(now) if now is not None else _utcnow()

    if consent is None:
        return ConsentDecision.deny(DenyReason.NO_CONSENT)

    if consent.purpose != purpose:
        return ConsentDecision.deny(DenyReason.WRONG_PURPOSE)

    if consent.status == ConsentStatus.REVOKED or consent.revoked_at is not None:
        return ConsentDecision.deny(DenyReason.REVOKED)

    if consent.expires_at is not None and _as_aware(consent.expires_at) <= now:
        return ConsentDecision.deny(DenyReason.EXPIRED)

    return ConsentDecision.allow(consent.id)
