"""Data access boundary.

M0 ships an in-memory implementation so the API, consent gate, and audit trail
can be exercised end-to-end (and tested) without a live Supabase project. The
`Repository` Protocol is the seam a Supabase-backed implementation will satisfy
in a later module — the routers and consent gate depend only on the Protocol.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Protocol

from app.security.audit import AuditEntry, AuditSink
from app.security.consent import ConsentPurpose, ConsentRecord, ConsentStatus


class Repository(Protocol):
    def get_active_consent(
        self, user_id: str, purpose: ConsentPurpose
    ) -> ConsentRecord | None: ...

    def grant_consent(
        self,
        user_id: str,
        purpose: ConsentPurpose,
        policy_version: str,
        expires_at: datetime | None,
    ) -> ConsentRecord: ...

    def revoke_consent(self, user_id: str, purpose: ConsentPurpose) -> ConsentRecord | None: ...

    def record_audit(self, entry: AuditEntry) -> None: ...

    def list_audit(self, user_id: str) -> list[AuditEntry]: ...


class InMemoryRepository:
    """Reference implementation backed by dicts. Not for production."""

    def __init__(self, audit_sink: AuditSink) -> None:
        self._consents: dict[str, ConsentRecord] = {}
        self._audit_sink = audit_sink
        self._counter = 0

    def _next_id(self, prefix: str) -> str:
        self._counter += 1
        return f"{prefix}-{self._counter}"

    @staticmethod
    def _key(user_id: str, purpose: ConsentPurpose) -> str:
        return f"{user_id}:{purpose.value}"

    def get_active_consent(
        self, user_id: str, purpose: ConsentPurpose
    ) -> ConsentRecord | None:
        record = self._consents.get(self._key(user_id, purpose))
        if record is None:
            return None
        if record.status == ConsentStatus.REVOKED:
            return None
        return record

    def grant_consent(
        self,
        user_id: str,
        purpose: ConsentPurpose,
        policy_version: str,
        expires_at: datetime | None,
    ) -> ConsentRecord:
        from datetime import datetime as _dt

        record = ConsentRecord(
            id=self._next_id("consent"),
            user_id=user_id,
            purpose=purpose,
            status=ConsentStatus.GRANTED,
            policy_version=policy_version,
            granted_at=_dt.now(UTC),
            expires_at=expires_at,
            revoked_at=None,
        )
        self._consents[self._key(user_id, purpose)] = record
        return record

    def revoke_consent(self, user_id: str, purpose: ConsentPurpose) -> ConsentRecord | None:
        from datetime import datetime as _dt

        existing = self._consents.get(self._key(user_id, purpose))
        if existing is None or existing.status == ConsentStatus.REVOKED:
            return None
        revoked = ConsentRecord(
            id=existing.id,
            user_id=existing.user_id,
            purpose=existing.purpose,
            status=ConsentStatus.REVOKED,
            policy_version=existing.policy_version,
            granted_at=existing.granted_at,
            expires_at=existing.expires_at,
            revoked_at=_dt.now(UTC),
        )
        self._consents[self._key(user_id, purpose)] = revoked
        return revoked

    def record_audit(self, entry: AuditEntry) -> None:
        self._audit_sink.record(entry)

    def list_audit(self, user_id: str) -> list[AuditEntry]:
        return [e for e in getattr(self._audit_sink, "entries", ()) if e.user_id == user_id]
