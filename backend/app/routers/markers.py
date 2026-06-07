"""Sample health-data endpoint, guarded by the consent gate.

This is a placeholder for the marker storage/read features built in M2+. It
exists in M0 only to prove the compliance path end-to-end: it cannot be reached
without authentication AND a valid `marker_storage` consent, and reaching it
writes an audit entry. It returns NO PHI in M0.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import ConsentGrant, require_consent
from app.security.consent import ConsentPurpose

router = APIRouter(prefix="/markers", tags=["markers"])


@router.get("")
async def list_markers(
    grant: ConsentGrant = Depends(require_consent(ConsentPurpose.MARKER_STORAGE)),
) -> dict:
    """List stored markers (none yet in M0). Proves the gate + audit path."""
    return {
        "items": [],
        "authorised_by_consent": grant.consent_id,
        "purpose": grant.purpose.value,
    }
