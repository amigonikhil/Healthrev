"""Tests for on-device (HealthKit / Health Connect) sample ingestion."""

from __future__ import annotations


def _grant_wearable_consent(client, headers):
    resp = client.post(
        "/consents",
        json={"purpose": "wearable_sync", "policy_version": "v1"},
        headers=headers,
    )
    assert resp.status_code == 201


def _payload():
    return {
        "samples": [
            {
                "metric": "steps",
                "value": 8421,
                "unit": "count",
                "start_time": "2026-06-01T00:00:00Z",
                "end_time": "2026-06-01T23:59:59Z",
            },
            {
                "metric": "resting_heart_rate",
                "value": 58,
                "start_time": "2026-06-01T06:00:00Z",
                "end_time": "2026-06-01T06:00:00Z",
            },
        ]
    }


def test_ingest_requires_consent(client, auth_header):
    resp = client.post(
        "/wearables/device/apple_health/samples", json=_payload(), headers=auth_header()
    )
    assert resp.status_code == 403


def test_ingest_stores_and_is_idempotent(client, auth_header):
    headers = auth_header()
    _grant_wearable_consent(client, headers)

    first = client.post("/wearables/device/apple_health/samples", json=_payload(), headers=headers)
    assert first.status_code == 200
    assert first.json()["new_samples"] == 2
    assert first.json()["provider"] == "apple_health"

    # Re-push identical samples → deduped, no new rows.
    again = client.post("/wearables/device/apple_health/samples", json=_payload(), headers=headers)
    assert again.json()["new_samples"] == 0

    # Samples are readable and include the steps metric (device-only).
    samples = client.get("/wearables/samples", headers=headers).json()
    metrics = {s["metric"] for s in samples}
    assert "steps" in metrics
    # Default unit was filled for the RHR sample that omitted it.
    rhr = next(s for s in samples if s["metric"] == "resting_heart_rate")
    assert rhr["unit"] == "bpm"


def test_ingest_creates_device_connection(client, auth_header):
    headers = auth_header()
    _grant_wearable_consent(client, headers)
    client.post("/wearables/device/health_connect/samples", json=_payload(), headers=headers)

    resp = client.get("/wearables/providers", headers=headers)
    providers = {p["provider"]: p for p in resp.json()}
    assert providers["health_connect"]["connected"] is True


def test_ingest_rejects_cloud_provider(client, auth_header):
    headers = auth_header()
    _grant_wearable_consent(client, headers)
    resp = client.post("/wearables/device/whoop/samples", json=_payload(), headers=headers)
    assert resp.status_code == 400
    assert "cloud provider" in resp.json()["detail"]


def test_ingest_rejects_bad_metric(client, auth_header):
    headers = auth_header()
    _grant_wearable_consent(client, headers)
    bad = {"samples": [{"metric": "blood_pressure", "value": 1,
                        "start_time": "2026-06-01T00:00:00Z", "end_time": "2026-06-01T00:00:00Z"}]}
    resp = client.post("/wearables/device/apple_health/samples", json=bad, headers=headers)
    assert resp.status_code == 422


def test_ingest_rejects_inverted_window(client, auth_header):
    headers = auth_header()
    _grant_wearable_consent(client, headers)
    bad = {"samples": [{"metric": "steps", "value": 1,
                        "start_time": "2026-06-02T00:00:00Z", "end_time": "2026-06-01T00:00:00Z"}]}
    resp = client.post("/wearables/device/apple_health/samples", json=bad, headers=headers)
    assert resp.status_code == 422
