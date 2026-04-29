"""Profile repository operations on the shared auth user model."""

from __future__ import annotations

from decimal import Decimal
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
    ) -> User | None:
        """Update onboarding-relevant user profile fields and return the updated user."""
        values: dict[str, str | Decimal | None] = {
            "business_name": business_name,
            "first_name": first_name,
            "last_name": last_name,
            "trade_type": trade_type,
        }
        if update_timezone:
            values["timezone"] = timezone
        if update_phone_number:
            values["phone_number"] = phone_number
        if update_business_address_line1:
            values["business_address_line1"] = business_address_line1
        if update_business_address_line2:
            values["business_address_line2"] = business_address_line2
        if update_business_city:
            values["business_city"] = business_city
        if update_business_state:
            values["business_state"] = business_state
        if update_business_postal_code:
            values["business_postal_code"] = business_postal_code
        if update_default_tax_rate:
            values["default_tax_rate"] = default_tax_rate

        result = await self._session.execute(
            update(User).where(User.id == user_id).values(**values).returning(User)
        )
        return result.scalar_one_or_none()

    async def update_logo_path(self, *, user_id: UUID, path: str) -> User | None:
        """Persist one user's current logo object path."""
        result = await self._session.execute(
            update(User).where(User.id == user_id).values(logo_path=path).returning(User)
        )
        return result.scalar_one_or_none()

    async def clear_logo_path(self, *, user_id: UUID) -> User | None:
        """Clear the stored logo path for one user."""
        result = await self._session.execute(
            update(User).where(User.id == user_id).values(logo_path=None).returning(User)
        )
        return result.scalar_one_or_none()

    async def commit(self) -> None:
        """Commit pending profile writes."""
        await self._session.commit()
