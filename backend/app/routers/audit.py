"""Audit-trail read endpoint (DPDPA transparency).

A user can read their own access trail. The log is append-only; there is no
endpoint to mutate it.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import AuthenticatedUser, get_current_user
from app.dependencies import get_repository
from app.repository import Repository
from app.schemas import AuditEntryResponse

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditEntryResponse])
async def list_my_audit(
    user: AuthenticatedUser = Depends(get_current_user),
    repo: Repository = Depends(get_repository),
) -> list[AuditEntryResponse]:
    return [
        AuditEntryResponse(
            action=e.action.value,
            actor=e.actor,
            resource_type=e.resource_type,
            resource_id=e.resource_id,
            purpose=e.purpose,
            consent_id=e.consent_id,
            created_at=e.created_at,
        )
        for e in repo.list_audit(user.id)
    ]
