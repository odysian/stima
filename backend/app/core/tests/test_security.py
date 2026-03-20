"""Security helper unit tests."""

from datetime import timedelta

import pytest
from app.core import security


def test_password_hash_and_verify_round_trip() -> None:
    password = "StrongPassword123!"

    hashed = security.hash_password(password)

    assert hashed != password
    assert security.verify_password(password, hashed) is True
    assert security.verify_password("incorrect", hashed) is False


def test_verify_password_returns_false_for_invalid_hash() -> None:
    assert security.verify_password("any-password", "not-a-valid-hash") is False


def test_token_hash_helpers() -> None:
    token = "refresh-token-value"
    token_hash = security.hash_token(token)

    assert security.verify_token_hash(token, token_hash) is True
    assert security.verify_token_hash("different-token", token_hash) is False


def test_access_token_round_trip() -> None:
    token = security.create_access_token(
        subject="user-123",
        expires_delta=timedelta(minutes=5),
        extra_claims={"role": "owner"},
    )

    payload = security.decode_token(token)

    assert payload["sub"] == "user-123"
    assert payload["type"] == "access"
    assert payload["role"] == "owner"


def test_access_token_reserved_claims_cannot_be_overridden() -> None:
    token = security.create_access_token(
        subject="user-123",
        expires_delta=timedelta(minutes=5),
        extra_claims={
            "sub": "attacker",
            "type": "refresh",
            "exp": 0,
            "scope": "quotes:read",
        },
    )

    payload = security.decode_token(token)

    assert payload["sub"] == "user-123"
    assert payload["type"] == "access"
    assert payload["scope"] == "quotes:read"


def test_refresh_token_round_trip() -> None:
    token = security.create_refresh_token(
        subject="user-456",
        expires_delta=timedelta(days=1),
    )

    payload = security.decode_token(token)

    assert payload["sub"] == "user-456"
    assert payload["type"] == "refresh"


def test_decode_invalid_token_raises_value_error() -> None:
    with pytest.raises(ValueError):
        security.decode_token("not-a-jwt")
