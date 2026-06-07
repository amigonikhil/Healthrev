"""End-to-end wearables API: consent gate, connect/callback/sync/samples flow."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.wearables.metrics import WearableMetric, WearableProvider, WearableSample
from app.wearables.provider import OAuthTokens, WearableClient


class FakeWhoopClient(WearableClient):
    """A scripted provider client so the API flow runs without network."""

    provider = WearableProvider.WHOOP

    def __init__(self) -> None:
        self.refreshed = False

    def authorization_url(self, *, state: str, redirect_uri: str) -> str:
        return f"https://whoop.test/auth?state={state}&redirect_uri={redirect_uri}"

    def exchange_code(self, *, code: str, redirect_uri: str) -> OAuthTokens:
        return OAuthTokens(
            access_token="access-1",
            refresh_token="refresh-1",
            expires_at=datetime(2030, 1, 1, tzinfo=UTC),
            scopes=["read:recovery", "read:sleep", "offline"],
            provider_user_id="whoop-user-9",
        )

    def refresh(self, *, refresh_token: str) -> OAuthTokens:
        self.refreshed = True
        return OAuthTokens("access-2", "refresh-2", datetime(2030, 1, 1, tzinfo=UTC), ["offline"])

    def fetch_samples(self, *, access_token, since):
        ts = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)
        return [
            WearableSample(WearableProvider.WHOOP, WearableMetric.RESTING_HEART_RATE, 54, ts, ts),
            WearableSample(WearableProvider.WHOOP, WearableMetric.HRV, 48.0, ts, ts),
        ]


@pytest.fixture
def wearable_client(client):
    """TestClient with the provider factory overridden to a fake client."""
    from app.dependencies import get_client_factory
    from app.main import app

    fake = FakeWhoopClient()
    app.dependency_overrides[get_client_factory] = lambda: (lambda provider: fake)
    yield client, fake
    app.dependency_overrides.clear()


def _grant_wearable_consent(client, headers):
    resp = client.post(
        "/consents",
        json={"purpose": "wearable_sync", "policy_version": "v1"},
        headers=headers,
    )
    assert resp.status_code == 201


def test_connect_requires_consent(wearable_client, auth_header):
    client, _ = wearable_client
    resp = client.post("/wearables/whoop/connect", headers=auth_header())
    assert resp.status_code == 403


def test_full_wearable_flow(wearable_client, auth_header):
    client, _ = wearable_client
    headers = auth_header()
    _grant_wearable_consent(client, headers)

    # Connect → get the consent URL + signed state.
    connect = client.post("/wearables/whoop/connect", headers=headers)
    assert connect.status_code == 200
    state = connect.json()["state"]
    assert "whoop.test/auth" in connect.json()["authorization_url"]

    # OAuth callback (unauthenticated; user recovered from signed state).
    cb = client.get(f"/wearables/whoop/callback?code=abc&state={state}")
    assert cb.status_code == 200
    assert cb.json()["status"] == "connected"

    # Provider now shows connected.
    resp = client.get("/wearables/providers", headers=headers)
    providers = {p["provider"]: p for p in resp.json()}
    assert providers["whoop"]["connected"] is True
    assert providers["whoop"]["supported"] is True

    # Sync pulls samples.
    sync = client.post("/wearables/whoop/sync", headers=headers)
    assert sync.status_code == 200
    assert sync.json()["new_samples"] == 2

    # Samples are readable (consent-gated).
    samples = client.get("/wearables/samples", headers=headers)
    assert samples.status_code == 200
    metrics = {s["metric"] for s in samples.json()}
    assert metrics == {"resting_heart_rate", "hrv"}

    # Re-sync is idempotent (dedup_key) → no new rows.
    resync = client.post("/wearables/whoop/sync", headers=headers)
    assert resync.json()["new_samples"] == 0

    # Audit trail recorded writes, with counts only (no PHI values).
    audit = client.get("/audit", headers=headers).json()
    write_entries = [e for e in audit if e["action"] == "data.write"]
    assert write_entries  # connect + sync produced writes


def test_samples_denied_without_consent(wearable_client, auth_header):
    client, _ = wearable_client
    resp = client.get("/wearables/samples", headers=auth_header())
    assert resp.status_code == 403


def test_callback_rejects_tampered_state(wearable_client, auth_header):
    client, _ = wearable_client
    resp = client.get("/wearables/whoop/callback?code=abc&state=not-a-valid-state")
    assert resp.status_code == 400


def test_sync_without_connection_is_404(wearable_client, auth_header):
    client, _ = wearable_client
    headers = auth_header()
    _grant_wearable_consent(client, headers)
    resp = client.post("/wearables/whoop/sync", headers=headers)
    assert resp.status_code == 404


def test_disconnect_revokes(wearable_client, auth_header):
    client, _ = wearable_client
    headers = auth_header()
    _grant_wearable_consent(client, headers)
    client.post("/wearables/whoop/connect", headers=headers)
    state = client.post("/wearables/whoop/connect", headers=headers).json()["state"]
    client.get(f"/wearables/whoop/callback?code=abc&state={state}")

    dele = client.delete("/wearables/whoop", headers=headers)
    assert dele.status_code == 200
    assert dele.json()["status"] == "revoked"

    # Now disconnected.
    resp = client.get("/wearables/providers", headers=headers)
    providers = {p["provider"]: p for p in resp.json()}
    assert providers["whoop"]["connected"] is False
    assert client.post("/wearables/whoop/sync", headers=headers).status_code == 404
