"""Tests for the demo-only endpoints and their DEMO_MODE gating."""

from __future__ import annotations


def test_demo_disabled_by_default(client):
    # conftest does not set DEMO_MODE, so demo routes must 404.
    assert client.post("/demo/token").status_code == 404
    assert client.get("/demo").status_code == 404


def test_demo_token_and_flow_when_enabled(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("DEMO_MODE", "1")
    get_settings.cache_clear()

    # Page renders.
    page = client.get("/demo")
    assert page.status_code == 200
    assert "Chronic Health Tracker" in page.text

    # Token mints and actually works against a gated endpoint.
    tok = client.post("/demo/token")
    assert tok.status_code == 200
    token = tok.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # No consent yet → 403.
    assert client.get("/wearables/samples", headers=headers).status_code == 403

    # Grant consent, then the minted token can push and read.
    client.post(
        "/consents",
        json={"purpose": "wearable_sync", "policy_version": "v1"},
        headers=headers,
    )
    push = client.post(
        "/wearables/device/apple_health/samples",
        json={
            "samples": [
                {
                    "metric": "steps",
                    "value": 1000,
                    "start_time": "2026-06-06T00:00:00Z",
                    "end_time": "2026-06-06T01:00:00Z",
                }
            ]
        },
        headers=headers,
    )
    assert push.status_code == 200
    assert push.json()["new_samples"] == 1

    get_settings.cache_clear()
