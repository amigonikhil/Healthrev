"""Tests for the Whoop client (OAuth + paginated fetch) using a mock transport."""

from __future__ import annotations

import httpx
import pytest

from app.wearables.metrics import WearableMetric
from app.wearables.whoop import WhoopClient


def _make_client(handler) -> WhoopClient:
    transport = httpx.MockTransport(handler)
    http = httpx.Client(transport=transport)
    return WhoopClient(client_id="cid", client_secret="csecret", http=http)


def test_authorization_url_contains_required_params():
    client = _make_client(lambda req: httpx.Response(200, json={}))
    url = client.authorization_url(state="abc", redirect_uri="https://app/cb")
    assert url.startswith(WhoopClient.AUTH_URL)
    assert "client_id=cid" in url
    assert "state=abc" in url
    assert "response_type=code" in url
    assert "offline" in url  # needed for a refresh token


def test_exchange_code_parses_tokens():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/oauth/oauth2/token")
        body = request.content.decode()
        assert "grant_type=authorization_code" in body
        return httpx.Response(
            200,
            json={
                "access_token": "at",
                "refresh_token": "rt",
                "expires_in": 3600,
                "scope": "read:recovery read:sleep offline",
            },
        )

    client = _make_client(handler)
    tokens = client.exchange_code(code="xyz", redirect_uri="https://app/cb")
    assert tokens.access_token == "at"
    assert tokens.refresh_token == "rt"
    assert tokens.expires_at is not None
    assert "read:recovery" in tokens.scopes


def test_refresh_uses_refresh_grant():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = request.content.decode()
        return httpx.Response(200, json={"access_token": "at2", "expires_in": 3600})

    client = _make_client(handler)
    tokens = client.refresh(refresh_token="rt")
    assert "grant_type=refresh_token" in seen["body"]
    assert tokens.access_token == "at2"


def test_fetch_samples_paginates_and_normalizes():
    recovery_page1 = {
        "records": [
            {
                "score_state": "SCORED",
                "created_at": "2026-06-01T08:00:00.000Z",
                "score": {"resting_heart_rate": 55, "hrv_rmssd_milli": 40, "recovery_score": 60},
            }
        ],
        "next_token": "TOKEN2",
    }
    recovery_page2 = {
        "records": [
            {
                "score_state": "SCORED",
                "created_at": "2026-06-02T08:00:00.000Z",
                "score": {"resting_heart_rate": 56, "hrv_rmssd_milli": 41, "recovery_score": 62},
            }
        ],
        "next_token": None,
    }
    sleep_page = {
        "records": [
            {
                "score_state": "SCORED",
                "start": "2026-06-01T23:00:00.000Z",
                "end": "2026-06-02T07:00:00.000Z",
                "score": {
                    "stage_summary": {
                        "total_in_bed_time_milli": 28_800_000,
                        "total_awake_time_milli": 1_800_000,
                    },
                    "sleep_efficiency_percentage": 90,
                    "respiratory_rate": 15,
                },
            }
        ],
        "next_token": None,
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if "/recovery" in request.url.path:
            if request.url.params.get("nextToken") == "TOKEN2":
                return httpx.Response(200, json=recovery_page2)
            return httpx.Response(200, json=recovery_page1)
        if "/sleep" in request.url.path:
            return httpx.Response(200, json=sleep_page)
        return httpx.Response(404)

    client = _make_client(handler)
    samples = client.fetch_samples(access_token="at", since=None)

    # 2 recovery days x 3 metrics + 1 sleep x 3 metrics = 9 samples.
    assert len(samples) == 9
    metrics = {s.metric for s in samples}
    assert WearableMetric.SLEEP_DURATION in metrics
    assert WearableMetric.RECOVERY_SCORE in metrics


def test_fetch_raises_on_http_error():
    client = _make_client(lambda req: httpx.Response(401, json={"error": "unauthorized"}))
    with pytest.raises(httpx.HTTPStatusError):
        client.fetch_samples(access_token="bad", since=None)
