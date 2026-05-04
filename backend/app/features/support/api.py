"""Support API endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.core.config import get_settings
from app.features.auth.models import User
from app.features.support.schemas import SupportContactRequest
from app.features.support.service import SupportContactService, SupportContactServiceError
from app.shared.dependencies import get_current_user, get_support_contact_service, require_csrf
from app.shared.rate_limit import get_user_key, limiter

router = APIRouter(prefix="/support", tags=["support"])


class SupportContactResponse(BaseModel):
    """Serializable success payload for support contact submissions."""

    message: str


@router.post(
    "/contact",
    response_model=SupportContactResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_csrf)],
)
@limiter.limit(lambda: get_settings().support_contact_rate_limit, key_func=get_user_key)
async def create_support_contact(
    request: Request,
    payload: SupportContactRequest,
    user: Annotated[User, Depends(get_current_user)],
    support_contact_service: Annotated[
        SupportContactService,
        Depends(get_support_contact_service),
    ],
) -> SupportContactResponse:
    """Send one support contact message for the authenticated user."""
    del request
    try:
        await support_contact_service.send_contact_message(
            user=user,
            category=payload.category,
            message=payload.message,
        )
    except SupportContactServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return SupportContactResponse(message="Thanks — your message was sent.")
