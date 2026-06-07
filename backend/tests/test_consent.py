"""Tests for the pure consent-evaluation rule."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.security.consent import (
    ConsentDecision,
    ConsentPurpose,
    ConsentRecord,
    ConsentStatus,
    DenyReason,
    evaluate_consent,
)

NOW = datetime(2026, 6, 7, 12, 0, tzinfo=UTC)


def _consent(**overrides) -> ConsentRecord:
    base = dict(
        id="consent-1",
        user_id="user-1",
        purpose=ConsentPurpose.MARKER_STORAGE,
        status=ConsentStatus.GRANTED,
        policy_version="v1",
        granted_at=NOW - timedelta(days=1),
        expires_at=None,
        revoked_at=None,
    )
    base.update(overrides)
    return ConsentRecord(**base)


def test_valid_consent_is_allowed():
    decision = evaluate_consent(_consent(), ConsentPurpose.MARKER_STORAGE, now=NOW)
    assert decision == ConsentDecision.allow("consent-1")


def test_missing_consent_denied():
    decision = evaluate_consent(None, ConsentPurpose.MARKER_STORAGE, now=NOW)
    assert decision.allowed is False
    assert decision.reason == DenyReason.NO_CONSENT


def test_wrong_purpose_denied():
    decision = evaluate_consent(_consent(), ConsentPurpose.WEARABLE_SYNC, now=NOW)
    assert decision.allowed is False
    assert decision.reason == DenyReason.WRONG_PURPOSE


def test_revoked_status_denied():
    c = _consent(status=ConsentStatus.REVOKED, revoked_at=NOW - timedelta(hours=1))
    decision = evaluate_consent(c, ConsentPurpose.MARKER_STORAGE, now=NOW)
    assert decision.reason == DenyReason.REVOKED


def test_revoked_timestamp_without_status_still_denied():
    # Defence in depth: revoked_at set even if status drifted.
    c = _consent(revoked_at=NOW - timedelta(hours=1))
    decision = evaluate_consent(c, ConsentPurpose.MARKER_STORAGE, now=NOW)
    assert decision.reason == DenyReason.REVOKED


def test_expired_consent_denied():
    c = _consent(expires_at=NOW - timedelta(seconds=1))
    decision = evaluate_consent(c, ConsentPurpose.MARKER_STORAGE, now=NOW)
    assert decision.reason == DenyReason.EXPIRED


def test_expiry_is_inclusive_at_boundary():
    # expires_at == now → treated as expired (<=).
    c = _consent(expires_at=NOW)
    decision = evaluate_consent(c, ConsentPurpose.MARKER_STORAGE, now=NOW)
    assert decision.reason == DenyReason.EXPIRED


def test_future_expiry_allowed():
    c = _consent(expires_at=NOW + timedelta(days=30))
    decision = evaluate_consent(c, ConsentPurpose.MARKER_STORAGE, now=NOW)
    assert decision.allowed is True


def test_naive_expiry_treated_as_utc():
    c = _consent(expires_at=datetime(2026, 6, 8, 12, 0))  # naive
    decision = evaluate_consent(c, ConsentPurpose.MARKER_STORAGE, now=NOW)
    assert decision.allowed is True


@pytest.mark.parametrize("purpose", list(ConsentPurpose))
def test_each_purpose_requires_matching_consent(purpose):
    c = _consent(purpose=purpose)
    assert evaluate_consent(c, purpose, now=NOW).allowed is True
