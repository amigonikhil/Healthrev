"""Shared FastAPI dependencies: the repository and the consent gate.

`require_consent(purpose)` is the single guard every health-data endpoint uses.
It (1) evaluates consent via the pure rule, (2) denies with HTTP 403 if invalid,
and (3) writes a `data.read` audit entry on success. This is how the DPDPA rule
"every read requires valid consent + leaves an audit trail" is enforced in one
place rather than scattered across handlers.
"""

from __future__ import annotations

from collections.abc import Callable, Coroutine
from dataclasses import dataclass
from typing import Any

from fastapi import Depends, HTTPException, status

from app.auth import AuthenticatedUser, get_current_user
from app.config import Settings, get_settings
from app.repository import InMemoryRepository, Repository
from app.security.audit import AuditAction, InMemoryAuditSink, build_audit_entry
from app.security.consent import ConsentPurpose, evaluate_consent
from app.security.crypto import TokenCipher
from app.wearables.metrics import WearableProvider
from app.wearables.provider import WearableClient
from app.wearables.service import WearableService
from app.wearables.whoop import WhoopClient

# Process-wide singletons for the M0 in-memory backend. A later module swaps the
# repository for a Supabase-backed one by changing only this factory.
_audit_sink = InMemoryAuditSink()
_repository: Repository = InMemoryRepository(_audit_sink)


def get_repository() -> Repository:
    return _repository


# -- Wearables (M1) -----------------------------------------------------------


def get_token_cipher(settings: Settings = Depends(get_settings)) -> TokenCipher:
    return TokenCipher(settings.token_encryption_key)


def get_wearable_service(
    repo: Repository = Depends(get_repository),
    cipher: TokenCipher = Depends(get_token_cipher),
) -> WearableService:
    return WearableService(repo, cipher)


def build_wearable_client(provider: WearableProvider, settings: Settings) -> WearableClient:
    """Construct the provider client. Only Whoop is wired in M1."""
    if provider == WearableProvider.WHOOP:
        return WhoopClient(
            client_id=settings.whoop_client_id,
            client_secret=settings.whoop_client_secret,
        )
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Provider '{provider.value}' is not supported yet",
    )


def get_client_factory(
    settings: Settings = Depends(get_settings),
) -> Callable[[WearableProvider], WearableClient]:
    """Factory dependency so tests can override client construction (mock HTTP)."""

    def factory(provider: WearableProvider) -> WearableClient:
        return build_wearable_client(provider, settings)

    return factory


@dataclass(frozen=True)
class ConsentGrant:
    """Proof that the current request is authorised for a purpose."""

    user: AuthenticatedUser
    purpose: ConsentPurpose
    consent_id: str


def require_consent(
    purpose: ConsentPurpose,
    *,
    action: AuditAction = AuditAction.DATA_READ,
) -> Callable[..., Coroutine[Any, Any, ConsentGrant]]:
    """Build a dependency that enforces consent for `purpose` and audits access.

    `action` distinguishes reads from writes (e.g. a wearable sync is a write)
    so the audit trail records what actually happened.
    """

    async def _dependency(
        user: AuthenticatedUser = Depends(get_current_user),
        repo: Repository = Depends(get_repository),
    ) -> ConsentGrant:
        consent = repo.get_active_consent(user.id, purpose)
        decision = evaluate_consent(consent, purpose)
        if not decision.allowed:
            # 403, not 401: the user is authenticated but lacks valid consent.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"No valid consent for purpose '{purpose.value}'",
            )
        # Leave the audit trail. Metadata is non-PHI only.
        repo.record_audit(
            build_audit_entry(
                action=action,
                user_id=user.id,
                purpose=purpose,
                consent_id=decision.consent_id,
                metadata={"gate": "require_consent"},
            )
        )
        assert decision.consent_id is not None
        return ConsentGrant(user=user, purpose=purpose, consent_id=decision.consent_id)

    return _dependency
