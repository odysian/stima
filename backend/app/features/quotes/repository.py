"""Quote repository operations."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.features.customers.models import Customer
from app.features.quotes.models import Document, LineItem
from app.features.quotes.schemas import LineItemDraft


class QuoteRepository:
    """Persist and query quote documents using SQLAlchemy async sessions."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def customer_exists_for_user(self, *, user_id: UUID, customer_id: UUID) -> bool:
        """Return true when the customer belongs to the given authenticated user."""
        customer = await self._session.scalar(
            select(Customer.id).where(
                Customer.id == customer_id,
                Customer.user_id == user_id,
            )
        )
        return customer is not None

    async def list_by_user(self, user_id: UUID) -> list[Document]:
        """Return all quotes for a user ordered newest-first."""
        result = await self._session.scalars(
            select(Document)
            .where(Document.user_id == user_id)
            .options(selectinload(Document.line_items))
            .order_by(Document.created_at.desc(), Document.doc_sequence.desc())
        )
        return list(result)

    async def get_by_id(self, quote_id: UUID, user_id: UUID) -> Document | None:
        """Return one quote owned by a user, including line items."""
        result = await self._session.execute(
            select(Document)
            .where(
                Document.id == quote_id,
                Document.user_id == user_id,
            )
            .options(selectinload(Document.line_items))
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        user_id: UUID,
        customer_id: UUID,
        transcript: str,
        line_items: list[LineItemDraft],
        total_amount: float | None,
        notes: str | None,
        source_type: str,
    ) -> Document:
        """Create a quote and optional line items for the owning user."""
        next_sequence = await self._next_doc_sequence_for_user(user_id)
        document = Document(
            user_id=user_id,
            customer_id=customer_id,
            doc_sequence=next_sequence,
            doc_number=f"Q-{next_sequence:03d}",
            source_type=source_type,
            transcript=transcript,
            total_amount=_to_decimal(total_amount),
            notes=notes,
        )
        self._session.add(document)
        await self._session.flush()

        if line_items:
            await self._replace_line_items(document.id, line_items)
            await self._session.flush()

        await self._session.refresh(document)
        await self._session.refresh(document, attribute_names=["line_items"])
        return document

    async def update(
        self,
        *,
        document: Document,
        total_amount: float | None,
        update_total_amount: bool,
        notes: str | None,
        update_notes: bool,
        line_items: list[LineItemDraft] | None,
        replace_line_items: bool,
    ) -> Document:
        """Apply partial quote updates and optional full line-item replacement."""
        if update_total_amount:
            document.total_amount = _to_decimal(total_amount)
        if update_notes:
            document.notes = notes

        if replace_line_items and line_items is not None:
            await self._replace_line_items(document.id, line_items)

        await self._session.flush()
        await self._session.refresh(document)
        await self._session.refresh(document, attribute_names=["line_items"])
        return document

    async def commit(self) -> None:
        """Commit pending quote writes."""
        await self._session.commit()

    async def rollback(self) -> None:
        """Rollback pending quote writes."""
        await self._session.rollback()

    async def _next_doc_sequence_for_user(self, user_id: UUID) -> int:
        next_sequence = await self._session.scalar(
            select(func.coalesce(func.max(Document.doc_sequence), 0) + 1).where(
                Document.user_id == user_id
            )
        )
        if next_sequence is None:
            return 1
        return int(next_sequence)

    async def _replace_line_items(
        self,
        document_id: UUID,
        items: list[LineItemDraft],
    ) -> None:
        await self._session.execute(delete(LineItem).where(LineItem.document_id == document_id))

        for index, item in enumerate(items):
            self._session.add(
                LineItem(
                    document_id=document_id,
                    description=item.description,
                    details=item.details,
                    price=_to_decimal(item.price),
                    sort_order=index,
                )
            )


def _to_decimal(value: float | None) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))
