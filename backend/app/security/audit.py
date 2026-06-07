"""Audit logging — append-only record of health-data access. NO PHI.

`build_audit_entry` is a pure function that constructs a sanitised audit record;
it raises if the supplied metadata could carry PHI. The persistence layer
(`AuditSink`) is abstracted so tests use an in-memory sink and production writes
to the `audit_log` table via Supabase.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Protocol

from app.security.consent import ConsentPurpose


class AuditAction(str, Enum):
    """Mirror of the `audit_action` enum in the DB. Keep in sync."""

    CONSENT_GRANT = "consent.grant"
    CONSENT_REVOKE = "consent.revoke"
    DATA_READ = "data.read"
    DATA_WRITE = "data.write"
    DATA_DELETE = "data.delete"
    EXPORT_REQUEST = "export.request"
    AUTH_LOGIN = "auth.login"


# Metadata keys that would smuggle PHI into the audit log. The audit log records
# *that* access happened, never the health values involved.
_FORBIDDEN_METADATA_KEYS = {
    "value",
    "values",
    "marker_value",
    "result",
    "glucose",
    "hba1c",
    "insulin",
    "ldl",
    "hdl",
    "triglycerides",
    "name",
    "display_name",
    "dob",
    "email",
}


class PhiLeakError(ValueError):
    """Raised when audit metadata appears to contain PHI."""


@dataclass(frozen=True)
class AuditEntry:
    action: AuditAction
    user_id: str | None
    actor: str = "user"
    resource_type: str | None = None
    resource_id: str | None = None
    purpose: ConsentPurpose | None = None
    consent_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_row(self) -> dict[str, Any]:
        """Serialise to a dict matching the `audit_log` table columns."""
        return {
            "action": self.action.value,
            "user_id": self.user_id,
            "actor": self.actor,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "purpose": self.purpose.value if self.purpose else None,
            "consent_id": self.consent_id,
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat(),
        }


def _assert_no_phi(metadata: dict[str, Any]) -> None:
    leaked = {k for k in metadata if k.lower() in _FORBIDDEN_METADATA_KEYS}
    if leaked:
        # Note: we do NOT include the offending values in the message — that
        # would itself leak PHI into logs.
        raise PhiLeakError(f"audit metadata contains forbidden key(s): {sorted(leaked)}")


def build_audit_entry(
    *,
    action: AuditAction,
    user_id: str | None,
    actor: str = "user",
    resource_type: str | None = None,
    resource_id: str | None = None,
    purpose: ConsentPurpose | None = None,
    consent_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditEntry:
    """Build a PHI-safe audit entry, rejecting metadata that looks like PHI."""
    metadata = metadata or {}
    _assert_no_phi(metadata)
    return AuditEntry(
        action=action,
        user_id=user_id,
        actor=actor,
        resource_type=resource_type,
        resource_id=resource_id,
        purpose=purpose,
        consent_id=consent_id,
        metadata=metadata,
    )


class AuditSink(Protocol):
    """Where audit entries are persisted. Implementations must be append-only."""

    def record(self, entry: AuditEntry) -> None: ...


class InMemoryAuditSink:
    """Append-only sink for tests and local development."""

    def __init__(self) -> None:
        self._entries: list[AuditEntry] = []

    def record(self, entry: AuditEntry) -> None:
        self._entries.append(entry)

    @property
    def entries(self) -> tuple[AuditEntry, ...]:
        return tuple(self._entries)
