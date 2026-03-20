"""Auth service unit tests."""

from __future__ import annotations

from typing import cast

import pytest
from sqlalchemy.exc import IntegrityError

from app.features.auth.models import User
from app.features.auth.repository import RefreshRotationResult
from app.features.auth.service import (
    AuthRepositoryProtocol,
    AuthService,
    ConflictError,
)


class _IntegrityErrorRepository:
    async def get_user_by_email(self, email: str) -> User | None:
        return None

    async def create_user(self, email: str, password_hash: str) -> User:
        raise IntegrityError("insert failed", {}, Exception("duplicate"))

    async def commit(self) -> None:
        return None

    async def get_user_by_id(self, user_id: object) -> User | None:
        return None

    async def create_refresh_token(
        self,
        *,
        user_id: object,
        token_hash: str,
        expires_at: object,
    ) -> object:
        return object()

    async def consume_and_rotate_refresh_token(
        self,
        *,
        consumed_token_hash: str,
        replacement_token_hash: str,
        replacement_expires_at: object,
        user_id: object,
        now: object,
    ) -> RefreshRotationResult:
        raise NotImplementedError()

    async def revoke_refresh_token(self, *, token_hash: str, revoked_at: object) -> None:
        return None


@pytest.mark.asyncio
async def test_register_translates_race_duplicate_to_conflict() -> None:
    """Handle duplicate email races even when pre-check misses in the same window."""
    service = AuthService(repository=cast(AuthRepositoryProtocol, _IntegrityErrorRepository()))

    with pytest.raises(ConflictError) as exc:
        await service.register(email="user@example.com", password="StrongPass123!")

    assert exc.value.status_code == 409
    assert exc.value.detail == "Email is already registered"
