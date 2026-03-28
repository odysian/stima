"""Persistence helpers for internal admin analytics."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.event_logs.models import EventLog


@dataclass(slots=True)
class AdminEventCountRecord:
    """One aggregated admin analytics row."""

    event_name: str
    date: date
    count: int


class AdminRepository:
    """Query-only repository for internal analytics data."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_event_counts(
        self,
        *,
        start_date: date,
        end_date: date,
        event_name: str | None,
    ) -> list[AdminEventCountRecord]:
        """Return pilot event counts grouped by event name and UTC day."""
        utc_day = sa.cast(sa.func.timezone("UTC", EventLog.created_at), sa.Date)
        statement = (
            sa.select(
                EventLog.event_name,
                utc_day.label("date"),
                sa.func.count(EventLog.id).label("event_count"),
            )
            .where(utc_day >= start_date, utc_day <= end_date)
            .group_by(EventLog.event_name, utc_day)
            .order_by(utc_day.asc(), EventLog.event_name.asc())
        )
        if event_name is not None:
            statement = statement.where(EventLog.event_name == event_name)

        rows = (await self._db.execute(statement)).all()
        return [
            AdminEventCountRecord(
                event_name=row.event_name,
                date=row.date,
                count=row.event_count,
            )
            for row in rows
        ]
