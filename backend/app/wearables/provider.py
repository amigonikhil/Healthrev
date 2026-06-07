"""Swappable wearable-provider interface.

Mirrors the `LabExtractor` pattern from CLAUDE.md: every provider hides behind
one interface so providers are interchangeable and testable. M1 ships the Whoop
implementation; Oura/Fitbit slot in later without touching the router.

The HTTP transport is injected (an `httpx.Client`) so unit tests drive the
OAuth/fetch logic against a `MockTransport` with no network.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime

from app.wearables.metrics import WearableProvider, WearableSample


@dataclass(frozen=True)
class OAuthTokens:
    access_token: str
    refresh_token: str | None
    expires_at: datetime | None
    scopes: list[str]
    provider_user_id: str | None = None


class WearableClient(ABC):
    """Interface every cloud-wearable provider implements."""

    provider: WearableProvider

    @abstractmethod
    def authorization_url(self, *, state: str, redirect_uri: str) -> str:
        """Build the provider's OAuth consent URL."""

    @abstractmethod
    def exchange_code(self, *, code: str, redirect_uri: str) -> OAuthTokens:
        """Exchange an authorization code for tokens."""

    @abstractmethod
    def refresh(self, *, refresh_token: str) -> OAuthTokens:
        """Refresh an expired access token."""

    @abstractmethod
    def fetch_samples(
        self, *, access_token: str, since: datetime | None
    ) -> list[WearableSample]:
        """Fetch and normalize samples recorded since `since` (None = recent)."""
