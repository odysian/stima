"""Quote repository operations."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, tzinfo
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.features.auth.models import User
from app.features.customers.models import Customer
from app.features.quotes.models import Document, LineItem, QuoteStatus
from app.features.quotes.schemas import LineItemDraft


@dataclass(slots=True)
class QuoteRenderLineItem:
    """Line item payload required by PDF rendering."""

    description: str
    details: str | None
    price: Decimal | None


@dataclass(slots=True)
class QuoteRenderContext:
    """Template context loaded in one repository call for PDF rendering."""

    business_name: str | None
    first_name: str | None
    last_name: str | None
    customer_name: str
    customer_phone: str | None
    customer_email: str | None
    customer_address: str | None
    doc_number: str
    status: str
    total_amount: Decimal | None
    notes: str | None
    line_items: list[QuoteRenderLineItem]
    created_at: datetime
    updated_at: datetime
    issued_date: str
    updated_date: str

    @property
    def has_meaningful_update(self) -> bool:
        """Return true when updated timestamp differs from created by > 5 minutes."""
        return (self.updated_at - self.created_at).total_seconds() > 300


@dataclass(slots=True)
class QuoteListItemSummary:
    """Summary row returned by the quote list query."""

    id: UUID
    customer_id: UUID
    customer_name: str
    doc_number: str
    status: str
    total_amount: Decimal | None
    item_count: int
    created_at: datetime


@dataclass(slots=True)
class QuoteDetailRow:
    """Detail row returned by the quote detail query."""

    id: UUID
    customer_id: UUID
    customer_name: str
    customer_email: str | None
    customer_phone: str | None
    doc_number: str
    status: str
    source_type: str
    transcript: str
    total_amount: Decimal | None
    notes: str | None
    shared_at: datetime | None
    share_token: str | None
    line_items: list[LineItem]
    created_at: datetime
    updated_at: datetime


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

    async def list_by_user(
        self,
        user_id: UUID,
        customer_id: UUID | None = None,
    ) -> list[QuoteListItemSummary]:
        """Return quote summaries for a user ordered newest-first."""
        line_item_count = (
            select(func.count(LineItem.id))
            .where(LineItem.document_id == Document.id)
            .correlate(Document)
            .scalar_subquery()
        )
        statement = (
            select(
                Document.id,
                Document.customer_id,
                Customer.name.label("customer_name"),
                Document.doc_number,
                Document.status,
                Document.total_amount,
                line_item_count.label("item_count"),
                Document.created_at,
            )
            .join(Customer, Customer.id == Document.customer_id)
            .where(Document.user_id == user_id)
            .order_by(Document.created_at.desc(), Document.doc_sequence.desc())
        )
        if customer_id is not None:
            statement = statement.where(Document.customer_id == customer_id)

        result = await self._session.execute(statement)
        return [
            QuoteListItemSummary(
                id=row.id,
                customer_id=row.customer_id,
                customer_name=row.customer_name,
                doc_number=row.doc_number,
                status=(
                    row.status.value if isinstance(row.status, QuoteStatus) else str(row.status)
                ),
                total_amount=row.total_amount,
                item_count=int(row.item_count),
                created_at=row.created_at,
            )
            for row in result
        ]

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

    async def get_detail_by_id(self, quote_id: UUID, user_id: UUID) -> QuoteDetailRow | None:
        """Return one quote detail row with customer contact fields."""
        result = await self._session.execute(
            select(Document, Customer)
            .join(Customer, Customer.id == Document.customer_id)
            .where(
                Document.id == quote_id,
                Document.user_id == user_id,
            )
            .options(selectinload(Document.line_items))
        )
        row = result.one_or_none()
        if row is None:
            return None

        document, customer = row
        return QuoteDetailRow(
            id=document.id,
            customer_id=document.customer_id,
            customer_name=customer.name,
            customer_email=customer.email,
            customer_phone=customer.phone,
            doc_number=document.doc_number,
            status=(
                document.status.value
                if isinstance(document.status, QuoteStatus)
                else str(document.status)
            ),
            source_type=document.source_type,
            transcript=document.transcript,
            total_amount=document.total_amount,
            notes=document.notes,
            shared_at=document.shared_at,
            share_token=document.share_token,
            line_items=document.line_items,
            created_at=document.created_at,
            updated_at=document.updated_at,
        )

    async def get_render_context(self, quote_id: UUID, user_id: UUID) -> QuoteRenderContext | None:
        """Return PDF render context for a user-owned quote."""
        result = await self._session.execute(
            select(Document, Customer, User)
            .join(Customer, Customer.id == Document.customer_id)
            .join(User, User.id == Document.user_id)
            .where(
                Document.id == quote_id,
                Document.user_id == user_id,
            )
            .options(selectinload(Document.line_items))
        )
        row = result.one_or_none()
        if row is None:
            return None

        document, customer, user = row
        return _build_render_context(document=document, customer=customer, user=user)

    async def get_render_context_by_share_token(
        self, share_token: str
    ) -> QuoteRenderContext | None:
        """Return PDF render context for a public share token."""
        result = await self._session.execute(
            select(Document, Customer, User)
            .join(Customer, Customer.id == Document.customer_id)
            .join(User, User.id == Document.user_id)
            .where(Document.share_token == share_token)
            .options(selectinload(Document.line_items))
        )
        row = result.one_or_none()
        if row is None:
            return None

        document, customer, user = row
        return _build_render_context(document=document, customer=customer, user=user)

    async def mark_ready_if_not_shared(self, *, quote_id: UUID, user_id: UUID) -> None:
        """Transition quote status to ready unless the quote is already shared."""
        await self._session.execute(
            update(Document)
            .where(
                Document.id == quote_id,
                Document.user_id == user_id,
                Document.status != QuoteStatus.SHARED,
            )
            .values(status=QuoteStatus.READY)
        )

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

    async def delete(self, document_id: UUID) -> None:
        """Hard-delete a quote document; line items are removed by cascade."""
        await self._session.execute(delete(Document).where(Document.id == document_id))

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

    async def refresh(self, document: Document) -> Document:
        """Refresh a quote instance with line items."""
        await self._session.refresh(document)
        await self._session.refresh(document, attribute_names=["line_items"])
        return document

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


def _build_render_context(
    *,
    document: Document,
    customer: Customer,
    user: User,
) -> QuoteRenderContext:
    return QuoteRenderContext(
        business_name=user.business_name,
        first_name=user.first_name,
        last_name=user.last_name,
        customer_name=customer.name,
        customer_phone=customer.phone,
        customer_email=customer.email,
        customer_address=customer.address,
        doc_number=document.doc_number,
        status=document.status.value,
        total_amount=document.total_amount,
        notes=document.notes,
        line_items=[
            QuoteRenderLineItem(
                description=line_item.description,
                details=line_item.details,
                price=line_item.price,
            )
            for line_item in document.line_items
        ],
        created_at=document.created_at,
        updated_at=document.updated_at,
        issued_date=_format_quote_date(document.created_at, user.timezone),
        updated_date=_format_quote_date(document.updated_at, user.timezone),
    )


def _format_quote_date(value: datetime, timezone: str | None) -> str:
    resolved_tz: tzinfo = UTC
    if timezone:
        try:
            resolved_tz = ZoneInfo(timezone)
        except ZoneInfoNotFoundError:
            resolved_tz = UTC

    return value.astimezone(resolved_tz).strftime("%b %d, %Y")
