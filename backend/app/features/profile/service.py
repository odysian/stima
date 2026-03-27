"""Profile service orchestration for profile reads and onboarding updates."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from app.features.auth.models import User
from app.integrations.storage import StorageNotFoundError, StorageServiceProtocol
from app.shared.image_signatures import detect_image_content_type

MAX_LOGO_BYTES = 2 * 1024 * 1024
_LOGO_FILENAME = "logo"


@dataclass(frozen=True, slots=True)
class ProfileLogo:
    """Logo bytes and MIME type returned to the API layer."""

    content: bytes
    content_type: str


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

    async def update_logo_path(self, *, user_id: UUID, path: str) -> User | None: ...

    async def clear_logo_path(self, *, user_id: UUID) -> User | None: ...

    async def commit(self) -> None: ...


class ProfileService:
    """Coordinate profile domain rules with persistence operations."""

    def __init__(
        self,
        *,
        repository: ProfileRepositoryProtocol,
        storage_service: StorageServiceProtocol,
    ) -> None:
        self._repository = repository
        self._storage_service = storage_service

    async def get_profile(self, user: User) -> User:
        """Return the latest persisted profile state for the authenticated user."""
        return await self._get_required_profile(user.id)

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

    async def upload_logo(self, user: User, *, content: bytes) -> User:
        """Validate, store, and persist the authenticated user's logo."""
        if len(content) > MAX_LOGO_BYTES:
            raise ProfileServiceError(detail="Logo must be 2 MB or smaller", status_code=422)

        content_type = detect_image_content_type(content)
        if content_type is None:
            raise ProfileServiceError(detail="Logo must be a JPEG or PNG image", status_code=422)

        try:
            object_path = await asyncio.to_thread(
                self._storage_service.upload,
                prefix=f"logos/{user.id}",
                filename=_LOGO_FILENAME,
                data=content,
                content_type=content_type,
            )
        except Exception as exc:  # noqa: BLE001
            raise ProfileServiceError(detail="Unable to upload logo", status_code=500) from exc
        updated_profile = await self._repository.update_logo_path(user_id=user.id, path=object_path)
        if updated_profile is None:
            raise ProfileServiceError(detail="Profile not found", status_code=404)

        await self._repository.commit()
        return updated_profile

    async def delete_logo(self, user: User) -> None:
        """Delete the authenticated user's stored logo and clear its DB reference."""
        profile = await self._get_required_profile(user.id)
        if profile.logo_path is None:
            raise ProfileServiceError(detail="Logo not found", status_code=404)

        try:
            await asyncio.to_thread(self._storage_service.delete, profile.logo_path)
        except Exception as exc:  # noqa: BLE001
            raise ProfileServiceError(detail="Unable to delete logo", status_code=500) from exc

        updated_profile = await self._repository.clear_logo_path(user_id=user.id)
        if updated_profile is None:
            raise ProfileServiceError(detail="Profile not found", status_code=404)
        await self._repository.commit()

    async def get_logo(self, user: User) -> ProfileLogo:
        """Fetch and validate the authenticated user's logo bytes."""
        profile = await self._get_required_profile(user.id)
        if profile.logo_path is None:
            raise ProfileServiceError(detail="Logo not found", status_code=404)

        try:
            logo_bytes = await asyncio.to_thread(
                self._storage_service.fetch_bytes,
                profile.logo_path,
            )
        except StorageNotFoundError as exc:
            raise ProfileServiceError(detail="Logo not found", status_code=404) from exc

        content_type = detect_image_content_type(logo_bytes)
        if content_type is None:
            raise ProfileServiceError(detail="Stored logo is invalid", status_code=500)

        return ProfileLogo(content=logo_bytes, content_type=content_type)

    async def _get_required_profile(self, user_id: UUID) -> User:
        profile = await self._repository.get_user_by_id(user_id)
        if profile is None:
            raise ProfileServiceError(detail="Profile not found", status_code=404)
        return profile
