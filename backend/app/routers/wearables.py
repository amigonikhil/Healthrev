"""Wearable pipe endpoints (M1) — Whoop first.

Flow:
  POST /wearables/{provider}/connect   -> authenticated; returns Whoop consent URL
  GET  /wearables/{provider}/callback  -> Whoop redirect; exchanges code, stores tokens
  POST /wearables/{provider}/sync      -> authenticated + consent; pulls & stores samples
  GET  /wearables/samples              -> authenticated + consent; lists samples
  GET  /wearables/providers            -> authenticated; provider/connection status
  DELETE /wearables/{provider}         -> authenticated; revokes the connection

Connecting and syncing require valid `wearable_sync` consent (DPDPA). Reads and
writes are audited via the consent gate; sample values are never logged.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse

from app.auth import AuthenticatedUser, get_current_user
from app.config import Settings, get_settings
from app.dependencies import (
    ConsentGrant,
    get_client_factory,
    get_repository,
    get_wearable_service,
    require_consent,
)
from app.repository import Repository
from app.schemas import (
    WearableConnectionStatusResponse,
    WearableConnectResponse,
    WearableProviderInfo,
    WearableSampleResponse,
    WearableSyncResponse,
)
from app.security.audit import AuditAction, build_audit_entry
from app.security.consent import ConsentPurpose
from app.wearables.metrics import WearableProvider
from app.wearables.provider import WearableClient
from app.wearables.service import InvalidOAuthState, WearableService

router = APIRouter(prefix="/wearables", tags=["wearables"])

# Providers with a working client in M1.
_SUPPORTED = {WearableProvider.WHOOP}


@router.get("/providers", response_model=list[WearableProviderInfo])
async def list_providers(
    user: AuthenticatedUser = Depends(get_current_user),
    repo: Repository = Depends(get_repository),
) -> list[WearableProviderInfo]:
    out: list[WearableProviderInfo] = []
    for provider in WearableProvider:
        conn = repo.get_connection(user.id, provider)
        out.append(
            WearableProviderInfo(
                provider=provider.value,
                supported=provider in _SUPPORTED,
                connected=conn is not None,
                last_sync_at=conn.last_sync_at if conn else None,
            )
        )
    return out


@router.post("/{provider}/connect", response_model=WearableConnectResponse)
async def connect(
    provider: WearableProvider,
    grant: ConsentGrant = Depends(
        require_consent(ConsentPurpose.WEARABLE_SYNC, action=AuditAction.DATA_WRITE)
    ),
    settings: Settings = Depends(get_settings),
    service: WearableService = Depends(get_wearable_service),
    factory: Callable[[WearableProvider], WearableClient] = Depends(get_client_factory),
) -> WearableConnectResponse:
    client = factory(provider)  # 400 if unsupported
    state = service.make_oauth_state(user_id=grant.user.id, provider=provider)
    url = client.authorization_url(state=state, redirect_uri=settings.whoop_redirect_uri)
    return WearableConnectResponse(authorization_url=url, state=state)


@router.get("/{provider}/callback")
async def callback(
    provider: WearableProvider,
    code: str = Query(...),
    state: str = Query(...),
    settings: Settings = Depends(get_settings),
    repo: Repository = Depends(get_repository),
    service: WearableService = Depends(get_wearable_service),
    factory: Callable[[WearableProvider], WearableClient] = Depends(get_client_factory),
) -> JSONResponse:
    # The callback is unauthenticated (Whoop -> browser redirect); the user is
    # recovered from the signed state rather than a JWT.
    bad_request = status.HTTP_400_BAD_REQUEST
    try:
        user_id, state_provider = service.parse_oauth_state(state)
    except InvalidOAuthState as exc:
        raise HTTPException(status_code=bad_request, detail="Invalid state") from exc
    if state_provider != provider:
        raise HTTPException(status_code=bad_request, detail="State/provider mismatch")

    client = factory(provider)
    tokens = client.exchange_code(code=code, redirect_uri=settings.whoop_redirect_uri)
    connection = service.save_connection(user_id=user_id, provider=provider, tokens=tokens)

    repo.record_audit(
        build_audit_entry(
            action=AuditAction.DATA_WRITE,
            user_id=user_id,
            purpose=ConsentPurpose.WEARABLE_SYNC,
            resource_type="wearable_connection",
            metadata={"provider": provider.value, "scopes_count": len(connection.scopes)},
        )
    )
    return JSONResponse({"status": "connected", "provider": provider.value})


@router.post("/{provider}/sync", response_model=WearableSyncResponse)
async def sync(
    provider: WearableProvider,
    grant: ConsentGrant = Depends(
        require_consent(ConsentPurpose.WEARABLE_SYNC, action=AuditAction.DATA_WRITE)
    ),
    repo: Repository = Depends(get_repository),
    service: WearableService = Depends(get_wearable_service),
    factory: Callable[[WearableProvider], WearableClient] = Depends(get_client_factory),
) -> WearableSyncResponse:
    client = factory(provider)
    try:
        new_count = service.sync(user_id=grant.user.id, provider=provider, client=client)
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active {provider.value} connection",
        ) from exc

    repo.record_audit(
        build_audit_entry(
            action=AuditAction.DATA_WRITE,
            user_id=grant.user.id,
            purpose=ConsentPurpose.WEARABLE_SYNC,
            resource_type="wearable_sample",
            consent_id=grant.consent_id,
            # Count only — never the values.
            metadata={"provider": provider.value, "new_samples": new_count},
        )
    )
    return WearableSyncResponse(
        provider=provider.value,
        new_samples=new_count,
        synced_at=datetime.now(UTC),
    )


@router.get("/samples", response_model=list[WearableSampleResponse])
async def list_samples(
    grant: ConsentGrant = Depends(require_consent(ConsentPurpose.WEARABLE_SYNC)),
    repo: Repository = Depends(get_repository),
) -> list[WearableSampleResponse]:
    return [
        WearableSampleResponse(
            provider=s.provider.value,
            metric=s.metric.value,
            value=s.value,
            unit=s.unit,
            start_time=s.start_time,
            end_time=s.end_time,
        )
        for s in repo.list_samples(grant.user.id)
    ]


@router.delete("/{provider}", response_model=WearableConnectionStatusResponse)
async def disconnect(
    provider: WearableProvider,
    user: AuthenticatedUser = Depends(get_current_user),
    repo: Repository = Depends(get_repository),
) -> WearableConnectionStatusResponse:
    conn = repo.revoke_connection(user.id, provider)
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active {provider.value} connection",
        )
    repo.record_audit(
        build_audit_entry(
            action=AuditAction.DATA_DELETE,
            user_id=user.id,
            purpose=ConsentPurpose.WEARABLE_SYNC,
            resource_type="wearable_connection",
            metadata={"provider": provider.value},
        )
    )
    return WearableConnectionStatusResponse(provider=provider.value, status=conn.status)
