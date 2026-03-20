"""Customer repository operations."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.customers.models import Customer


class CustomerRepository:
    """Persist and query customers using SQLAlchemy async sessions."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_by_user(self, user_id: UUID) -> list[Customer]:
        """Return all customers owned by the given user."""
        result = await self._session.scalars(
            select(Customer)
            .where(Customer.user_id == user_id)
            .order_by(Customer.created_at.desc(), Customer.id.desc())
        )
        return list(result)

    async def get_by_id(self, customer_id: UUID, user_id: UUID) -> Customer | None:
        """Return a single customer scoped to the owning user."""
        result = await self._session.execute(
            select(Customer).where(
                Customer.id == customer_id,
                Customer.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        user_id: UUID,
        name: str,
        phone: str | None,
        email: str | None,
        address: str | None,
    ) -> Customer:
        """Create a customer record for the user."""
        customer = Customer(
            user_id=user_id,
            name=name,
            phone=phone,
            email=email,
            address=address,
        )
        self._session.add(customer)
        await self._session.flush()
        await self._session.refresh(customer)
        return customer

    async def update(self, customer: Customer, **fields: str | None) -> Customer:
        """Update explicit fields on a customer record."""
        for field_name, value in fields.items():
            setattr(customer, field_name, value)
        await self._session.flush()
        await self._session.refresh(customer)
        return customer

    async def commit(self) -> None:
        """Commit pending customer writes."""
        await self._session.commit()
