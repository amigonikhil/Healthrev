"""Tests for at-rest token encryption."""

from __future__ import annotations

import pytest
from cryptography.fernet import Fernet

from app.security.crypto import TokenCipher, TokenCipherError


def test_round_trip():
    cipher = TokenCipher(Fernet.generate_key().decode())
    plaintext = "whoop-access-token-123"
    ct = cipher.encrypt(plaintext)
    assert ct != plaintext  # never stored in the clear
    assert cipher.decrypt(ct) == plaintext


def test_none_passthrough():
    cipher = TokenCipher(Fernet.generate_key().decode())
    assert cipher.encrypt(None) is None
    assert cipher.decrypt(None) is None


def test_missing_key_fails_closed():
    with pytest.raises(TokenCipherError):
        TokenCipher("")


def test_invalid_key_rejected():
    with pytest.raises(TokenCipherError):
        TokenCipher("not-a-valid-fernet-key")


def test_wrong_key_cannot_decrypt():
    a = TokenCipher(Fernet.generate_key().decode())
    b = TokenCipher(Fernet.generate_key().decode())
    ct = a.encrypt("secret")
    with pytest.raises(TokenCipherError):
        b.decrypt(ct)
