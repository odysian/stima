"""Profile repository operations on the shared auth user model."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.auth.models import User


class ProfileRepository:
    """Persist and query user profile fields via SQLAlchemy async sessions."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_user_by_id(self, user_id: UUID) -> User | None:
        """Fetch a user profile by id."""
        result = await self._session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

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
    ) -> User | None:
        """Update onboarding-relevant user profile fields and return the updated user."""
        values: dict[str, str | None] = {
            "business_name": business_name,
            "first_name": first_name,
            "last_name": last_name,
            "trade_type": trade_type,
        }
        if update_timezone:
            values["timezone"] = timezone

        result = await self._session.execute(
            update(User).where(User.id == user_id).values(**values).returning(User)
        )
        return result.scalar_one_or_none()

    async def commit(self) -> None:
        """Commit pending profile writes."""
        await self._session.commit()
