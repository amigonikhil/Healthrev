"""Symmetric encryption for secrets at rest (OAuth tokens).

Wearable OAuth tokens must never be stored in plaintext. The application
encrypts them with Fernet (AES-128-CBC + HMAC) using a key supplied via the
environment (`TOKEN_ENCRYPTION_KEY`) — never hard-coded. The DB columns hold
only the resulting ciphertext.
"""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken


class TokenCipherError(RuntimeError):
    """Raised when encryption/decryption cannot be performed."""


class TokenCipher:
    """Encrypts/decrypts short secrets (OAuth tokens) with a Fernet key."""

    def __init__(self, key: str) -> None:
        if not key:
            # Fail closed: refuse to operate without a configured key rather
            # than silently storing plaintext.
            raise TokenCipherError("TOKEN_ENCRYPTION_KEY is not configured")
        try:
            self._fernet = Fernet(key.encode() if isinstance(key, str) else key)
        except (ValueError, TypeError) as exc:
            raise TokenCipherError("TOKEN_ENCRYPTION_KEY is not a valid Fernet key") from exc

    def encrypt(self, plaintext: str | None) -> str | None:
        if plaintext is None:
            return None
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str | None) -> str | None:
        if ciphertext is None:
            return None
        try:
            return self._fernet.decrypt(ciphertext.encode()).decode()
        except InvalidToken as exc:
            raise TokenCipherError("token could not be decrypted (wrong key or corrupt)") from exc

    @staticmethod
    def generate_key() -> str:
        """Generate a fresh Fernet key (for ops/setup, not used at runtime)."""
        return Fernet.generate_key().decode()
