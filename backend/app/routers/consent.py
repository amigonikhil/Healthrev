"""Consent management endpoints: grant, list, revoke.

These are the only writes to consent. Granting and revoking are themselves
audited (consent.grant / consent.revoke).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import AuthenticatedUser, get_current_user
from app.dependencies import get_repository
from app.repository import Repository
from app.schemas import ConsentGrantRequest, ConsentResponse
from app.security.audit import AuditAction, build_audit_entry
from app.security.consent import ConsentPurpose, ConsentRecord

router = APIRouter(prefix="/consents", tags=["consent"])


def _to_response(record: ConsentRecord) -> ConsentResponse:
    return ConsentResponse(
        id=record.id,
        purpose=record.purpose,
        status=record.status,
        policy_version=record.policy_version,
        granted_at=record.granted_at,
        expires_at=record.expires_at,
        revoked_at=record.revoked_at,
    )


@router.post("", response_model=ConsentResponse, status_code=status.HTTP_201_CREATED)
async def grant_consent(
    body: ConsentGrantRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    repo: Repository = Depends(get_repository),
) -> ConsentResponse:
    record = repo.grant_consent(
        user_id=user.id,
        purpose=body.purpose,
        policy_version=body.policy_version,
        expires_at=body.expires_at,
    )
    repo.record_audit(
        build_audit_entry(
            action=AuditAction.CONSENT_GRANT,
            user_id=user.id,
            purpose=body.purpose,
            consent_id=record.id,
            metadata={"policy_version": body.policy_version},
        )
    )
    return _to_response(record)


@router.delete("/{purpose}", response_model=ConsentResponse)
async def revoke_consent(
    purpose: ConsentPurpose,
    user: AuthenticatedUser = Depends(get_current_user),
    repo: Repository = Depends(get_repository),
) -> ConsentResponse:
    record = repo.revoke_consent(user.id, purpose)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active consent to revoke for purpose '{purpose.value}'",
        )
    repo.record_audit(
        build_audit_entry(
            action=AuditAction.CONSENT_REVOKE,
            user_id=user.id,
            purpose=purpose,
            consent_id=record.id,
        )
    )
    return _to_response(record)
