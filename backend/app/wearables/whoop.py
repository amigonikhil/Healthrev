"""Whoop wearable client — OAuth2 + paginated fetch, normalized to samples.

The `httpx.Client` is injected so tests exercise this against a mock transport.
Endpoints are class constants: Whoop evolves its API, so confirm these against
current Whoop developer docs before production (per CLAUDE.md).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx

from app.wearables.metrics import WearableProvider, WearableSample
from app.wearables.provider import OAuthTokens, WearableClient
from app.wearables.whoop_normalize import normalize_recovery, normalize_sleep

# Offline scope is what yields a refresh token.
DEFAULT_SCOPES = ["read:recovery", "read:sleep", "read:cycles", "offline"]


class WhoopClient(WearableClient):
    provider = WearableProvider.WHOOP

    AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth"
    TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token"
    API_BASE = "https://api.prod.whoop.com/developer"
    RECOVERY_PATH = "/v1/recovery"
    SLEEP_PATH = "/v1/activity/sleep"

    def __init__(
        self,
        *,
        client_id: str,
        client_secret: str,
        http: httpx.Client | None = None,
        scopes: list[str] | None = None,
    ) -> None:
        self._client_id = client_id
        self._client_secret = client_secret
        self._scopes = scopes or DEFAULT_SCOPES
        # Caller may inject a client (tests use httpx.MockTransport).
        self._http = http or httpx.Client(timeout=15.0)

    # -- OAuth -----------------------------------------------------------------

    def authorization_url(self, *, state: str, redirect_uri: str) -> str:
        params = {
            "response_type": "code",
            "client_id": self._client_id,
            "redirect_uri": redirect_uri,
            "scope": " ".join(self._scopes),
            "state": state,
        }
        return f"{self.AUTH_URL}?{urlencode(params)}"

    def exchange_code(self, *, code: str, redirect_uri: str) -> OAuthTokens:
        return self._token_request(
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
            }
        )

    def refresh(self, *, refresh_token: str) -> OAuthTokens:
        return self._token_request(
            {
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                # Whoop requires the scope on refresh to re-issue a refresh token.
                "scope": " ".join(self._scopes),
            }
        )

    def _token_request(self, extra: dict) -> OAuthTokens:
        data = {
            "client_id": self._client_id,
            "client_secret": self._client_secret,
            **extra,
        }
        resp = self._http.post(self.TOKEN_URL, data=data)
        resp.raise_for_status()
        payload = resp.json()
        expires_at = None
        if "expires_in" in payload:
            expires_at = datetime.now(UTC) + timedelta(
                seconds=int(payload["expires_in"])
            )
        scope = payload.get("scope", "")
        return OAuthTokens(
            access_token=payload["access_token"],
            refresh_token=payload.get("refresh_token"),
            expires_at=expires_at,
            scopes=scope.split() if scope else list(self._scopes),
        )

    # -- Data ------------------------------------------------------------------

    def fetch_samples(
        self, *, access_token: str, since: datetime | None
    ) -> list[WearableSample]:
        samples: list[WearableSample] = []
        samples += self._fetch_collection(
            self.RECOVERY_PATH, access_token, since, normalize_recovery
        )
        samples += self._fetch_collection(self.SLEEP_PATH, access_token, since, normalize_sleep)
        return samples

    def _fetch_collection(self, path, access_token, since, normalize):
        headers = {"Authorization": f"Bearer {access_token}"}
        url = f"{self.API_BASE}{path}"
        params: dict[str, str] = {"limit": "25"}
        if since is not None:
            params["start"] = since.astimezone(UTC).isoformat()

        out: list[WearableSample] = []
        next_token: str | None = None
        # Bound pagination defensively so a misbehaving API can't loop forever.
        for _ in range(50):
            page_params = dict(params)
            if next_token:
                page_params["nextToken"] = next_token
            resp = self._http.get(url, headers=headers, params=page_params)
            resp.raise_for_status()
            body = resp.json()
            out += normalize(body.get("records", []))
            next_token = body.get("next_token")
            if not next_token:
                break
        return out
