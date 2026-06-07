"""End-to-end API tests: auth → consent gate → audit trail."""

from __future__ import annotations


def test_health_is_public(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_markers_requires_auth(client):
    resp = client.get("/markers")
    assert resp.status_code == 401


def test_markers_denied_without_consent(client, auth_header):
    resp = client.get("/markers", headers=auth_header())
    assert resp.status_code == 403
    assert "consent" in resp.json()["detail"].lower()


def test_full_consent_flow(client, auth_header):
    headers = auth_header()

    # Grant marker_storage consent.
    grant = client.post(
        "/consents",
        json={"purpose": "marker_storage", "policy_version": "v1"},
        headers=headers,
    )
    assert grant.status_code == 201
    assert grant.json()["status"] == "granted"

    # Now the guarded endpoint is reachable.
    markers = client.get("/markers", headers=headers)
    assert markers.status_code == 200
    body = markers.json()
    assert body["items"] == []
    assert body["authorised_by_consent"]

    # The access (and the grant) left an audit trail — and no PHI.
    audit = client.get("/audit", headers=headers)
    assert audit.status_code == 200
    actions = [e["action"] for e in audit.json()]
    assert "consent.grant" in actions
    assert "data.read" in actions

    # Revoke → guarded endpoint blocked again.
    revoke = client.delete("/consents/marker_storage", headers=headers)
    assert revoke.status_code == 200
    assert revoke.json()["status"] == "revoked"

    blocked = client.get("/markers", headers=headers)
    assert blocked.status_code == 403


def test_consent_is_purpose_specific(client, auth_header):
    headers = auth_header()
    # Consent for a different purpose does not unlock marker reads.
    client.post(
        "/consents",
        json={"purpose": "wearable_sync", "policy_version": "v1"},
        headers=headers,
    )
    resp = client.get("/markers", headers=headers)
    assert resp.status_code == 403


def test_one_users_consent_does_not_leak_to_another(client, auth_header):
    client.post(
        "/consents",
        json={"purpose": "marker_storage", "policy_version": "v1"},
        headers=auth_header(user_id="user-1"),
    )
    # A different user still has no consent.
    resp = client.get("/markers", headers=auth_header(user_id="user-2"))
    assert resp.status_code == 403
