"""Profile service orchestration for profile reads and onboarding updates."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from app.features.auth.models import User


class ProfileServiceError(Exception):
    """Profile-domain exception mapped to an HTTP status code."""

    def __init__(self, *, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class ProfileRepositoryProtocol(Protocol):
    """Structural protocol for profile repository dependencies."""

    async def get_user_by_id(self, user_id: UUID) -> User | None: ...

    async def update_user_fields(
        self,
        *,
        user_id: UUID,
        business_name: str,
        first_name: str,
        last_name: str,
        trade_type: str,
        timezone: str | None,
        update_timezone: bool,
    ) -> User | None: ...

    async def commit(self) -> None: ...


class ProfileService:
    """Coordinate profile domain rules with persistence operations."""

    def __init__(self, repository: ProfileRepositoryProtocol) -> None:
        self._repository = repository

    async def get_profile(self, user: User) -> User:
        """Return the latest persisted profile state for the authenticated user."""
        profile = await self._repository.get_user_by_id(user.id)
        if profile is None:
            raise ProfileServiceError(detail="Profile not found", status_code=404)
        return profile

    async def update_profile(
        self,
        user: User,
        *,
        business_name: str,
        first_name: str,
        last_name: str,
        trade_type: str,
        timezone: str | None,
        update_timezone: bool,
    ) -> User:
        """Persist onboarding fields and return the updated user profile."""
        updated_profile = await self._repository.update_user_fields(
            user_id=user.id,
            business_name=business_name,
            first_name=first_name,
            last_name=last_name,
            trade_type=trade_type,
            timezone=timezone,
            update_timezone=update_timezone,
        )
        if updated_profile is None:
            raise ProfileServiceError(detail="Profile not found", status_code=404)

        await self._repository.commit()
        return updated_profile
