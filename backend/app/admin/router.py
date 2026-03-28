"""Internal admin analytics endpoints."""

from __future__ import annotations

from datetime import date
from hmac import compare_digest
from typing import Annotated

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.features.event_logs.models import EventLog

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
async def get_event_counts(
    query: Annotated[AdminEventsQuery, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminEventsResponse:
    """Return pilot event counts grouped by event name and UTC day."""
    if query.start_date > query.end_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="start_date must be on or before end_date",
        )

    utc_day = sa.cast(sa.func.timezone("UTC", EventLog.created_at), sa.Date)
    statement = (
        sa.select(
            EventLog.event_name,
            utc_day.label("date"),
            sa.func.count(EventLog.id).label("event_count"),
        )
        .where(utc_day >= query.start_date, utc_day <= query.end_date)
        .group_by(EventLog.event_name, utc_day)
        .order_by(utc_day.asc(), EventLog.event_name.asc())
    )
    if query.event_name is not None:
        statement = statement.where(EventLog.event_name == query.event_name)

    rows = (await db.execute(statement)).all()
    events = [
        AdminEventCount(
            event_name=row.event_name,
            date=row.date,
            count=row.event_count,
        )
        for row in rows
    ]
    return AdminEventsResponse(
        events=events,
        total=sum(event.count for event in events),
    )
