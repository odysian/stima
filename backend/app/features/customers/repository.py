"""Customer repository operations."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.customers.models import Customer
from app.features.quotes.models import Document


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

    async def count_documents_by_type_for_customer(
        self,
        *,
        user_id: UUID,
        customer_id: UUID,
    ) -> tuple[int, int]:
        """Return related quote and invoice counts for one user-owned customer."""
        result = await self._session.execute(
            select(Document.doc_type, func.count(Document.id))
            .where(
                Document.user_id == user_id,
                Document.customer_id == customer_id,
                Document.doc_type.in_(("quote", "invoice")),
            )
            .group_by(Document.doc_type)
        )
        counts = {doc_type: count for doc_type, count in result.all()}
        return int(counts.get("quote", 0)), int(counts.get("invoice", 0))

    async def verify_customer_document_cascade(self) -> bool:
        """Verify live FK behavior deletes documents when customers are removed."""
        definition = await self._session.scalar(
            text(
                """
                SELECT pg_get_constraintdef(constraint_def.oid)
                FROM pg_constraint AS constraint_def
                JOIN pg_class AS child_table ON child_table.oid = constraint_def.conrelid
                JOIN pg_namespace AS child_schema ON child_schema.oid = child_table.relnamespace
                JOIN pg_class AS parent_table ON parent_table.oid = constraint_def.confrelid
                JOIN pg_attribute AS child_column
                  ON child_column.attrelid = child_table.oid
                 AND child_column.attnum = ANY(constraint_def.conkey)
                WHERE constraint_def.contype = 'f'
                  AND child_schema.nspname = current_schema()
                  AND child_table.relname = 'documents'
                  AND parent_table.relname = 'customers'
                  AND child_column.attname = 'customer_id'
                ORDER BY constraint_def.oid DESC
                LIMIT 1
                """
            )
        )
        if definition is None:
            return False
        return "ON DELETE CASCADE" in definition.upper()

    async def delete(self, customer: Customer) -> None:
        """Delete one customer entity."""
        await self._session.delete(customer)

    async def commit(self) -> None:
        """Commit pending customer writes."""
        await self._session.commit()
