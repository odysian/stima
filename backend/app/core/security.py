"""Auth security primitives: password hashing, JWTs, and refresh-token hashing."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import sha256
from hmac import compare_digest
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jwt import InvalidTokenError

from app.core.config import get_settings

_password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    """Return an Argon2id hash for a plain-text password."""
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a plain-text password against an Argon2id hash."""
    try:
        return _password_hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def _expiry(expires_delta: timedelta) -> datetime:
    return datetime.now(timezone.utc) + expires_delta


def create_access_token(
    subject: str,
    expires_delta: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Create a signed short-lived access token."""
    settings = get_settings()
    effective_expiry = expires_delta or timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload: dict[str, Any] = {
        "sub": subject,
        "type": "access",
        "exp": _expiry(effective_expiry),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(
    subject: str,
    expires_delta: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Create a signed refresh token."""
    settings = get_settings()
    effective_expiry = expires_delta or timedelta(days=settings.refresh_token_expire_days)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": "refresh",
        "exp": _expiry(effective_expiry),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT token."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except InvalidTokenError as exc:
        raise ValueError("Invalid token") from exc
    if not isinstance(payload, dict):
        raise ValueError("Invalid token payload")
    return payload


def hash_token(token: str) -> str:
    """Hash a raw refresh token before persistence."""
    return sha256(token.encode("utf-8")).hexdigest()


def verify_token_hash(raw_token: str, stored_token_hash: str) -> bool:
    """Constant-time verification for token hash comparisons."""
    return compare_digest(hash_token(raw_token), stored_token_hash)
