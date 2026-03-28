"""Service layer for internal admin analytics."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.repository import AdminEventCountRecord, AdminRepository
from app.core.database import get_db


@dataclass(slots=True)
class AdminEventsResult:
    """Service return payload for admin analytics."""

    events: list[AdminEventCountRecord]
    total: int


class AdminServiceError(Exception):
    """Typed admin service error surfaced by the router."""

    def __init__(self, *, detail: str, status_code: int) -> None:
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


class AdminService:
    """Orchestrate internal analytics queries and transport-safe validation."""

    def __init__(self, repository: AdminRepository) -> None:
        self._repository = repository

    async def get_event_counts(
        self,
        *,
        start_date: date,
        end_date: date,
        event_name: str | None,
    ) -> AdminEventsResult:
        """Validate the request and return aggregated event counts."""
        if start_date > end_date:
            raise AdminServiceError(
                detail="start_date must be on or before end_date",
                status_code=422,
            )

        events = await self._repository.list_event_counts(
            start_date=start_date,
            end_date=end_date,
            event_name=event_name,
        )
        return AdminEventsResult(events=events, total=sum(event.count for event in events))


def get_admin_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminService:
    """Build a request-scoped admin analytics service."""
    return AdminService(repository=AdminRepository(db))
