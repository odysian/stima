"""Auth service unit tests."""

from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError

from app.features.auth.models import User
from app.features.auth.service import AuthService, ConflictError


class _IntegrityErrorRepository:
    async def get_user_by_email(self, email: str) -> User | None:
        return None

    async def create_user(self, email: str, password_hash: str) -> User:
        raise IntegrityError("insert failed", None, None)

    async def commit(self) -> None:
        return None


@pytest.mark.asyncio
async def test_register_translates_race_duplicate_to_conflict() -> None:
    """Handle duplicate email races even when pre-check misses in the same window."""
    service = AuthService(repository=_IntegrityErrorRepository())

    with pytest.raises(ConflictError) as exc:
        await service.register(email="user@example.com", password="StrongPass123!")

    assert exc.value.status_code == 409
    assert exc.value.detail == "Email is already registered"
