"""Profile service orchestration for profile reads and onboarding updates."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol
from uuid import UUID

from app.features.auth.models import User
from app.integrations.storage import StorageNotFoundError, StorageServiceProtocol
from app.shared.image_signatures import detect_image_content_type
from app.shared.input_limits import MAX_LOGO_SIZE_BYTES

_LOGO_FILENAME = "logo"
LOGGER = logging.getLogger(__name__)


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
        phone_number: str | None,
        update_phone_number: bool,
        business_address_line1: str | None,
        update_business_address_line1: bool,
        business_address_line2: str | None,
        update_business_address_line2: bool,
        business_city: str | None,
        update_business_city: bool,
        business_state: str | None,
        update_business_state: bool,
        business_postal_code: str | None,
        update_business_postal_code: bool,
        timezone: str | None,
        update_timezone: bool,
        default_tax_rate: Decimal | None,
        update_default_tax_rate: bool,
    ) -> User | None: ...

    async def update_logo_path(self, *, user_id: UUID, path: str) -> User | None: ...

    async def clear_logo_path(self, *, user_id: UUID) -> User | None: ...

    async def commit(self) -> None: ...


class PdfArtifactRepositoryProtocol(Protocol):
    """Structural protocol for cross-document artifact invalidation."""

    async def invalidate_for_user(self, *, user_id: UUID) -> list[str]: ...


class ProfileService:
    """Coordinate profile domain rules with persistence operations."""

    def __init__(
        self,
        *,
        repository: ProfileRepositoryProtocol,
        pdf_artifact_repository: PdfArtifactRepositoryProtocol,
        storage_service: StorageServiceProtocol,
    ) -> None:
        self._repository = repository
        self._pdf_artifact_repository = pdf_artifact_repository
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
        phone_number: str | None,
        update_phone_number: bool,
        business_address_line1: str | None,
        update_business_address_line1: bool,
        business_address_line2: str | None,
        update_business_address_line2: bool,
        business_city: str | None,
        update_business_city: bool,
        business_state: str | None,
        update_business_state: bool,
        business_postal_code: str | None,
        update_business_postal_code: bool,
        timezone: str | None,
        update_timezone: bool,
        default_tax_rate: float | None,
        update_default_tax_rate: bool,
    ) -> User:
        """Persist onboarding fields and return the updated user profile."""
        invalidate_artifacts = _profile_render_inputs_changed(
            user=user,
            business_name=business_name,
            first_name=first_name,
            last_name=last_name,
            phone_number=phone_number,
            update_phone_number=update_phone_number,
            business_address_line1=business_address_line1,
            update_business_address_line1=update_business_address_line1,
            business_address_line2=business_address_line2,
            update_business_address_line2=update_business_address_line2,
            business_city=business_city,
            update_business_city=update_business_city,
            business_state=business_state,
            update_business_state=update_business_state,
            business_postal_code=business_postal_code,
            update_business_postal_code=update_business_postal_code,
            timezone=timezone,
            update_timezone=update_timezone,
        )
        updated_profile = await self._repository.update_user_fields(
            user_id=user.id,
            business_name=business_name,
            first_name=first_name,
            last_name=last_name,
            trade_type=trade_type,
            phone_number=phone_number,
            update_phone_number=update_phone_number,
            business_address_line1=business_address_line1,
            update_business_address_line1=update_business_address_line1,
            business_address_line2=business_address_line2,
            update_business_address_line2=update_business_address_line2,
            business_city=business_city,
            update_business_city=update_business_city,
            business_state=business_state,
            update_business_state=update_business_state,
            business_postal_code=business_postal_code,
            update_business_postal_code=update_business_postal_code,
            timezone=timezone,
            update_timezone=update_timezone,
            default_tax_rate=_normalize_default_tax_rate(default_tax_rate),
            update_default_tax_rate=update_default_tax_rate,
        )
        if updated_profile is None:
            raise ProfileServiceError(detail="Profile not found", status_code=404)

        artifact_paths_to_delete: list[str] = []
        if invalidate_artifacts:
            artifact_paths_to_delete = await self._pdf_artifact_repository.invalidate_for_user(
                user_id=user.id
            )
        await self._repository.commit()
        await self._delete_artifacts(artifact_paths_to_delete)
        return updated_profile

    async def upload_logo(self, user: User, *, content: bytes) -> User:
        """Validate, store, and persist the authenticated user's logo."""
        if len(content) > MAX_LOGO_SIZE_BYTES:
            raise ProfileServiceError(
                detail=f"Logo must be {_format_byte_limit(MAX_LOGO_SIZE_BYTES)} or smaller",
                status_code=422,
            )

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

        artifact_paths_to_delete = await self._pdf_artifact_repository.invalidate_for_user(
            user_id=user.id
        )
        await self._repository.commit()
        await self._delete_artifacts(artifact_paths_to_delete)
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
        artifact_paths_to_delete = await self._pdf_artifact_repository.invalidate_for_user(
            user_id=user.id
        )
        await self._repository.commit()
        await self._delete_artifacts(artifact_paths_to_delete)

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

    async def _delete_artifacts(self, object_paths: list[str]) -> None:
        for object_path in object_paths:
            try:
                await asyncio.to_thread(self._storage_service.delete, object_path)
            except Exception:  # noqa: BLE001
                LOGGER.warning("Failed to delete invalidated profile PDF artifact", exc_info=True)


def _normalize_default_tax_rate(value: float | None) -> Decimal | None:
    if value is None:
        return None
    normalized = Decimal(str(value))
    if normalized == Decimal("0"):
        return None
    return normalized


def _profile_render_inputs_changed(
    *,
    user: User,
    business_name: str,
    first_name: str,
    last_name: str,
    phone_number: str | None,
    update_phone_number: bool,
    business_address_line1: str | None,
    update_business_address_line1: bool,
    business_address_line2: str | None,
    update_business_address_line2: bool,
    business_city: str | None,
    update_business_city: bool,
    business_state: str | None,
    update_business_state: bool,
    business_postal_code: str | None,
    update_business_postal_code: bool,
    timezone: str | None,
    update_timezone: bool,
) -> bool:
    return any(
        (
            user.business_name != business_name,
            user.first_name != first_name,
            user.last_name != last_name,
            update_phone_number and user.phone_number != phone_number,
            update_business_address_line1 and user.business_address_line1 != business_address_line1,
            update_business_address_line2 and user.business_address_line2 != business_address_line2,
            update_business_city and user.business_city != business_city,
            update_business_state and user.business_state != business_state,
            update_business_postal_code and user.business_postal_code != business_postal_code,
            update_timezone and user.timezone != timezone,
        )
    )


def _format_byte_limit(byte_limit: int) -> str:
    megabytes = byte_limit / (1024 * 1024)
    if megabytes.is_integer():
        return f"{int(megabytes)} MB"

    return f"{megabytes:.1f} MB"
