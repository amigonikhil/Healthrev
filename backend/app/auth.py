"""Authentication — verify the Supabase-issued JWT on each request.

Supabase Auth mints HS256 JWTs signed with the project's JWT secret. We verify
the signature and expiry and expose the authenticated user id. We never trust
an unverified `sub` claim.
"""

from __future__ import annotations

from dataclasses import dataclass

import jwt
from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str | None = None


class TokenError(Exception):
    """Raised when a bearer token is missing or invalid."""


def _extract_bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise TokenError("missing or malformed Authorization header")
    return authorization.split(" ", 1)[1].strip()


def verify_token(token: str, secret: str) -> AuthenticatedUser:
    """Verify a Supabase HS256 JWT and return the authenticated user.

    Pure aside from reading the clock for expiry; unit-testable with a known
    secret. Raises `TokenError` on any verification failure.
    """
    if not secret:
        # Fail closed: never accept tokens when no secret is configured.
        raise TokenError("server JWT secret is not configured")
    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="authenticated",
            options={"require": ["sub", "exp"]},
        )
    except jwt.PyJWTError as exc:  # noqa: BLE001 - normalise to our error type
        raise TokenError("invalid token") from exc

    sub = claims.get("sub")
    if not sub:
        raise TokenError("token missing subject")
    return AuthenticatedUser(id=str(sub), email=claims.get("email"))


async def get_current_user(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> AuthenticatedUser:
    """FastAPI dependency: the verified current user, or HTTP 401."""
    try:
        token = _extract_bearer(authorization)
        return verify_token(token, settings.supabase_jwt_secret)
    except TokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
