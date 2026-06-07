"""Test fixtures: a known JWT secret, a fresh app, and reset in-memory state."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import jwt
import pytest

TEST_JWT_SECRET = "test-secret-do-not-use-in-prod-0123456789abcdef"


@pytest.fixture(autouse=True)
def _env_and_reset(monkeypatch):
    """Configure the JWT secret and reset module-level in-memory singletons."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
    monkeypatch.setenv("ENVIRONMENT", "test")

    from app.config import get_settings

    get_settings.cache_clear()

    # Reset the in-memory repository/audit sink so tests don't bleed state.
    import app.dependencies as deps
    from app.repository import InMemoryRepository
    from app.security.audit import InMemoryAuditSink

    sink = InMemoryAuditSink()
    deps._audit_sink = sink
    deps._repository = InMemoryRepository(sink)
    yield
    get_settings.cache_clear()


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


@pytest.fixture
def auth_header():
    def _make(user_id: str = "user-1", email: str = "u@example.com") -> dict[str, str]:
        claims = {
            "sub": user_id,
            "email": email,
            "aud": "authenticated",
            "exp": datetime.now(UTC) + timedelta(hours=1),
        }
        token = jwt.encode(claims, TEST_JWT_SECRET, algorithm="HS256")
        return {"Authorization": f"Bearer {token}"}

    return _make
