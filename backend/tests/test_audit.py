"""Tests for PHI-safe audit-entry construction and the append-only sink."""

from __future__ import annotations

import pytest

from app.security.audit import (
    AuditAction,
    InMemoryAuditSink,
    PhiLeakError,
    build_audit_entry,
)
from app.security.consent import ConsentPurpose


def test_build_entry_minimal():
    entry = build_audit_entry(action=AuditAction.AUTH_LOGIN, user_id="user-1")
    assert entry.action == AuditAction.AUTH_LOGIN
    assert entry.user_id == "user-1"
    assert entry.metadata == {}


def test_entry_serialises_to_row():
    entry = build_audit_entry(
        action=AuditAction.DATA_READ,
        user_id="user-1",
        purpose=ConsentPurpose.MARKER_STORAGE,
        consent_id="consent-1",
    )
    row = entry.to_row()
    assert row["action"] == "data.read"
    assert row["purpose"] == "marker_storage"
    assert row["consent_id"] == "consent-1"
    assert "created_at" in row


@pytest.mark.parametrize("bad_key", ["glucose", "hba1c", "value", "email", "DOB"])
def test_phi_metadata_rejected(bad_key):
    with pytest.raises(PhiLeakError):
        build_audit_entry(
            action=AuditAction.DATA_WRITE,
            user_id="user-1",
            metadata={bad_key: 123},
        )


def test_phi_error_message_does_not_leak_value():
    try:
        build_audit_entry(
            action=AuditAction.DATA_WRITE,
            user_id="user-1",
            metadata={"glucose": 5.4},
        )
    except PhiLeakError as exc:
        assert "5.4" not in str(exc)
        assert "glucose" in str(exc)  # key name is fine; value is not
    else:
        pytest.fail("expected PhiLeakError")


def test_safe_metadata_allowed():
    entry = build_audit_entry(
        action=AuditAction.DATA_READ,
        user_id="user-1",
        metadata={"count": 3, "request_id": "abc"},
    )
    assert entry.metadata["count"] == 3


def test_sink_is_append_only_ordered():
    sink = InMemoryAuditSink()
    for i in range(3):
        sink.record(build_audit_entry(action=AuditAction.DATA_READ, user_id=f"u{i}"))
    assert len(sink.entries) == 3
    assert [e.user_id for e in sink.entries] == ["u0", "u1", "u2"]
