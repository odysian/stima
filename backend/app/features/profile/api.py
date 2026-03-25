"""Profile API endpoints for authenticated profile reads and updates."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.features.auth.models import User
from app.features.profile.schemas import ProfileResponse, ProfileUpdateRequest
from app.features.profile.service import ProfileService, ProfileServiceError
from app.shared.dependencies import get_current_user, get_profile_service, require_csrf

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileResponse)
async def get_profile(
    user: Annotated[User, Depends(get_current_user)],
    profile_service: Annotated[ProfileService, Depends(get_profile_service)],
) -> ProfileResponse:
    """Return the authenticated user's profile."""
    try:
        profile = await profile_service.get_profile(user)
    except ProfileServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return ProfileResponse.model_validate(profile)


@router.patch(
    "",
    response_model=ProfileResponse,
    dependencies=[Depends(require_csrf)],
)
async def update_profile(
    payload: ProfileUpdateRequest,
    user: Annotated[User, Depends(get_current_user)],
    profile_service: Annotated[ProfileService, Depends(get_profile_service)],
) -> ProfileResponse:
    """Update onboarding profile fields for the authenticated user."""
    try:
        profile = await profile_service.update_profile(
            user,
            business_name=payload.business_name,
            first_name=payload.first_name,
            last_name=payload.last_name,
            trade_type=payload.trade_type.value,
            timezone=payload.timezone,
            update_timezone="timezone" in payload.model_fields_set,
        )
    except ProfileServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return ProfileResponse.model_validate(profile)
