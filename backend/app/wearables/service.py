"""Wearable orchestration: connect, refresh tokens, sync samples.

Ties together the provider client, the token cipher, and the repository. Tokens
are decrypted only in memory for the duration of a call and re-encrypted before
storage. Sample values are never logged.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.repository import Repository
from app.security.crypto import TokenCipher
from app.wearables.metrics import WearableConnection, WearableProvider
from app.wearables.provider import OAuthTokens, WearableClient


class InvalidOAuthState(ValueError):
    """Raised when an OAuth callback `state` can't be verified."""


class WearableService:
    def __init__(self, repo: Repository, cipher: TokenCipher) -> None:
        self._repo = repo
        self._cipher = cipher

    # -- OAuth state -----------------------------------------------------------
    # The state is Fernet-encrypted (authenticated) so the unauthenticated OAuth
    # callback can recover & trust the originating user without a server session.

    def make_oauth_state(self, *, user_id: str, provider: WearableProvider) -> str:
        token = self._cipher.encrypt(f"{user_id}|{provider.value}|{uuid.uuid4().hex}")
        assert token is not None
        return token

    def parse_oauth_state(self, state: str) -> tuple[str, WearableProvider]:
        try:
            raw = self._cipher.decrypt(state)
            user_id, provider_value, _nonce = raw.split("|", 2)
            return user_id, WearableProvider(provider_value)
        except Exception as exc:  # noqa: BLE001 - normalise to one error type
            raise InvalidOAuthState("invalid or tampered OAuth state") from exc

    def save_connection(
        self,
        *,
        user_id: str,
        provider: WearableProvider,
        tokens: OAuthTokens,
    ) -> WearableConnection:
        """Persist a new/updated connection with encrypted tokens."""
        connection = WearableConnection(
            id="",
            user_id=user_id,
            provider=provider,
            status="connected",
            provider_user_id=tokens.provider_user_id,
            access_token=self._cipher.encrypt(tokens.access_token),
            refresh_token=self._cipher.encrypt(tokens.refresh_token),
            token_expires_at=tokens.expires_at,
            scopes=list(tokens.scopes),
        )
        return self._repo.upsert_connection(connection)

    def _valid_access_token(
        self, client: WearableClient, connection: WearableConnection
    ) -> str:
        """Return a usable plaintext access token, refreshing if expired."""
        expired = (
            connection.token_expires_at is not None
            and connection.token_expires_at <= datetime.now(UTC)
        )
        if expired and connection.refresh_token:
            refresh_plain = self._cipher.decrypt(connection.refresh_token)
            new_tokens = client.refresh(refresh_token=refresh_plain)
            connection.access_token = self._cipher.encrypt(new_tokens.access_token)
            # Whoop rotates refresh tokens; keep the previous one if none returned.
            if new_tokens.refresh_token:
                connection.refresh_token = self._cipher.encrypt(new_tokens.refresh_token)
            connection.token_expires_at = new_tokens.expires_at
            connection.scopes = list(new_tokens.scopes) or connection.scopes
            self._repo.upsert_connection(connection)

        plain = self._cipher.decrypt(connection.access_token)
        if not plain:
            raise ValueError("connection has no usable access token")
        return plain

    def sync(
        self,
        *,
        user_id: str,
        provider: WearableProvider,
        client: WearableClient,
    ) -> int:
        """Fetch new samples since last sync and store them. Returns NEW count."""
        connection = self._repo.get_connection(user_id, provider)
        if connection is None:
            raise LookupError(f"no active {provider.value} connection")

        access_token = self._valid_access_token(client, connection)
        samples = client.fetch_samples(
            access_token=access_token, since=connection.last_sync_at
        )
        new_count = self._repo.upsert_samples(user_id, samples)

        connection.last_sync_at = datetime.now(UTC)
        self._repo.upsert_connection(connection)
        return new_count
