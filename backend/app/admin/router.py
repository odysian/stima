"""Internal admin analytics endpoints."""

from __future__ import annotations

from datetime import date
from hmac import compare_digest
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import APIKeyHeader
from pydantic import BaseModel

from app.admin.service import AdminService, AdminServiceError, get_admin_service
from app.core.config import get_settings
from app.shared.rate_limit import get_ip_key, limiter

router = APIRouter(prefix="/admin")
_ADMIN_API_KEY_HEADER = APIKeyHeader(name="X-Admin-Key", auto_error=False)


class AdminEventsQuery(BaseModel):
    """Query params for admin event aggregation."""

    start_date: date
    end_date: date
    event_name: str | None = None


class AdminEventCount(BaseModel):
    """One aggregated event count row."""

    event_name: str
    date: date
    count: int


class AdminEventsResponse(BaseModel):
    """Admin analytics response payload."""

    events: list[AdminEventCount]
    total: int


def require_admin_api_key(
    admin_key: Annotated[str | None, Depends(_ADMIN_API_KEY_HEADER)],
) -> None:
    """Require the configured internal API key for admin routes."""
    settings = get_settings()
    if (
        admin_key is None
        or settings.admin_api_key is None
        or not compare_digest(admin_key, settings.admin_api_key)
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


@router.get(
    "/events",
    response_model=AdminEventsResponse,
    include_in_schema=False,
    dependencies=[Depends(require_admin_api_key)],
)
@limiter.limit("10/minute", key_func=get_ip_key)
async def get_event_counts(
    request: Request,
    query: Annotated[AdminEventsQuery, Depends()],
    admin_service: Annotated[AdminService, Depends(get_admin_service)],
) -> AdminEventsResponse:
    """Return pilot event counts grouped by event name and UTC day."""
    del request
    try:
        result = await admin_service.get_event_counts(
            start_date=query.start_date,
            end_date=query.end_date,
            event_name=query.event_name,
        )
    except AdminServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return AdminEventsResponse(
        events=[
            AdminEventCount(
                event_name=event.event_name,
                date=event.date,
                count=event.count,
            )
            for event in result.events
        ],
        total=result.total,
    )
