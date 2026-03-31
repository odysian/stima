"""Invoice repository operations."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, tzinfo
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.features.auth.models import User
from app.features.customers.models import Customer
from app.features.quotes.models import Document, LineItem, QuoteStatus
from app.features.quotes.repository import QuoteRenderContext, QuoteRenderLineItem
from app.features.quotes.schemas import LineItemDraft

_INVOICE_DOC_TYPE = "invoice"
_SENT_INVOICE_STATUS = QuoteStatus.SENT


@dataclass(slots=True)
class InvoiceDetailRow:
    """Detail row returned by the invoice detail query."""

    id: UUID
    customer_id: UUID
    customer_name: str
    customer_email: str | None
    customer_phone: str | None
    doc_number: str
    title: str | None
    status: str
    total_amount: Decimal | None
    notes: str | None
    due_date: date | None
    shared_at: datetime | None
    share_token: str | None
    source_document_id: UUID | None
    source_quote_number: str | None
    line_items: list[LineItem]
    created_at: datetime
    updated_at: datetime


class InvoiceRepository:
    """Persist and query invoice documents using SQLAlchemy async sessions."""

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

    async def get_by_id(self, invoice_id: UUID, user_id: UUID) -> Document | None:
        """Return one invoice owned by a user, including line items."""
        result = await self._session.execute(
            select(Document)
            .where(
                Document.id == invoice_id,
                Document.user_id == user_id,
                Document.doc_type == _INVOICE_DOC_TYPE,
            )
            .options(selectinload(Document.line_items))
        )
        return result.scalar_one_or_none()

    async def get_by_source_document_id(
        self,
        *,
        source_document_id: UUID,
        user_id: UUID,
    ) -> Document | None:
        """Return the invoice linked to one source quote, if present."""
        result = await self._session.execute(
            select(Document)
            .where(
                Document.user_id == user_id,
                Document.doc_type == _INVOICE_DOC_TYPE,
                Document.source_document_id == source_document_id,
            )
            .options(selectinload(Document.line_items))
        )
        return result.scalar_one_or_none()

    async def get_detail_by_id(self, invoice_id: UUID, user_id: UUID) -> InvoiceDetailRow | None:
        """Return one invoice detail row with customer and source quote fields."""
        source_quote = aliased(Document)
        result = await self._session.execute(
            select(Document, Customer, source_quote)
            .join(Customer, Customer.id == Document.customer_id)
            .outerjoin(
                source_quote,
                (source_quote.id == Document.source_document_id)
                & (source_quote.doc_type == "quote"),
            )
            .where(
                Document.id == invoice_id,
                Document.user_id == user_id,
                Document.doc_type == _INVOICE_DOC_TYPE,
            )
            .options(selectinload(Document.line_items))
        )
        row = result.one_or_none()
        if row is None:
            return None

        document, customer, quote = row
        return InvoiceDetailRow(
            id=document.id,
            customer_id=document.customer_id,
            customer_name=customer.name,
            customer_email=customer.email,
            customer_phone=customer.phone,
            doc_number=document.doc_number,
            title=document.title,
            status=(
                document.status.value
                if isinstance(document.status, QuoteStatus)
                else str(document.status)
            ),
            total_amount=document.total_amount,
            notes=document.notes,
            due_date=document.due_date,
            shared_at=document.shared_at,
            share_token=document.share_token,
            source_document_id=document.source_document_id,
            source_quote_number=quote.doc_number if quote is not None else None,
            line_items=document.line_items,
            created_at=document.created_at,
            updated_at=document.updated_at,
        )

    async def get_render_context(
        self,
        invoice_id: UUID,
        user_id: UUID,
    ) -> QuoteRenderContext | None:
        """Return PDF render context for a user-owned invoice."""
        result = await self._session.execute(
            select(Document, Customer, User)
            .join(Customer, Customer.id == Document.customer_id)
            .join(User, User.id == Document.user_id)
            .where(
                Document.id == invoice_id,
                Document.user_id == user_id,
                Document.doc_type == _INVOICE_DOC_TYPE,
            )
            .options(selectinload(Document.line_items))
        )
        row = result.one_or_none()
        if row is None:
            return None

        document, customer, user = row
        return _build_render_context(document=document, customer=customer, user=user)

    async def get_render_context_by_share_token(
        self,
        share_token: str,
    ) -> QuoteRenderContext | None:
        """Return PDF render context for a sent invoice share token."""
        result = await self._session.execute(
            select(Document, Customer, User)
            .join(Customer, Customer.id == Document.customer_id)
            .join(User, User.id == Document.user_id)
            .where(
                Document.share_token == share_token,
                Document.doc_type == _INVOICE_DOC_TYPE,
                Document.status == _SENT_INVOICE_STATUS,
            )
            .options(selectinload(Document.line_items))
        )
        row = result.one_or_none()
        if row is None:
            return None

        document, customer, user = row
        return _build_render_context(document=document, customer=customer, user=user)

    async def create_from_quote(
        self,
        *,
        source_quote: Document,
        due_date: date,
    ) -> Document:
        """Create an invoice by inheriting the core fields from a source quote."""
        next_sequence = await self.get_next_doc_sequence_for_type(
            user_id=source_quote.user_id,
            doc_type=_INVOICE_DOC_TYPE,
        )
        invoice = Document(
            user_id=source_quote.user_id,
            customer_id=source_quote.customer_id,
            doc_type=_INVOICE_DOC_TYPE,
            doc_sequence=next_sequence,
            doc_number=f"I-{next_sequence:03d}",
            title=source_quote.title,
            source_document_id=source_quote.id,
            status=QuoteStatus.DRAFT,
            source_type=source_quote.source_type,
            transcript=source_quote.transcript,
            total_amount=source_quote.total_amount,
            notes=source_quote.notes,
            due_date=due_date,
        )
        self._session.add(invoice)
        await self._session.flush()

        copied_items = [
            LineItemDraft(
                description=line_item.description,
                details=line_item.details,
                price=float(line_item.price) if line_item.price is not None else None,
            )
            for line_item in source_quote.line_items
        ]
        if copied_items:
            await self._replace_line_items(invoice.id, copied_items)
            await self._session.flush()

        await self.refresh(invoice)
        return invoice

    async def create(
        self,
        *,
        user_id: UUID,
        customer_id: UUID,
        title: str | None,
        transcript: str,
        line_items: list[LineItemDraft],
        total_amount: float | None,
        notes: str | None,
        source_type: str,
        due_date: date,
    ) -> Document:
        """Create a direct invoice and optional line items for the owning user."""
        next_sequence = await self.get_next_doc_sequence_for_type(
            user_id=user_id,
            doc_type=_INVOICE_DOC_TYPE,
        )
        invoice = Document(
            user_id=user_id,
            customer_id=customer_id,
            doc_type=_INVOICE_DOC_TYPE,
            doc_sequence=next_sequence,
            doc_number=f"I-{next_sequence:03d}",
            title=title,
            source_document_id=None,
            status=QuoteStatus.DRAFT,
            source_type=source_type,
            transcript=transcript,
            total_amount=_to_decimal(total_amount),
            notes=notes,
            due_date=due_date,
        )
        self._session.add(invoice)
        await self._session.flush()

        if line_items:
            await self._replace_line_items(invoice.id, line_items)
            await self._session.flush()

        await self.refresh(invoice)
        return invoice

    async def update_due_date(self, *, invoice: Document, due_date: date) -> Document:
        """Update the due date for an editable invoice."""
        invoice.due_date = due_date
        await self._session.flush()
        await self.refresh(invoice)
        return invoice

    async def mark_ready_if_draft(self, *, invoice_id: UUID, user_id: UUID) -> None:
        """Transition invoice status to ready when previewing a draft invoice."""
        await self._session.execute(
            update(Document)
            .where(
                Document.id == invoice_id,
                Document.user_id == user_id,
                Document.doc_type == _INVOICE_DOC_TYPE,
                Document.status == QuoteStatus.DRAFT,
            )
            .values(status=QuoteStatus.READY)
        )

    async def commit(self) -> None:
        """Commit pending invoice writes."""
        await self._session.commit()

    async def refresh(self, invoice: Document) -> Document:
        """Refresh an invoice instance with line items."""
        await self._session.refresh(invoice)
        await self._session.refresh(invoice, attribute_names=["line_items"])
        return invoice

    async def rollback(self) -> None:
        """Rollback pending invoice writes."""
        await self._session.rollback()

    async def get_next_doc_sequence_for_type(self, *, user_id: UUID, doc_type: str) -> int:
        """Return the next display sequence for one user/doc-type pair."""
        next_sequence = await self._session.scalar(
            select(func.coalesce(func.max(Document.doc_sequence), 0) + 1).where(
                Document.user_id == user_id,
                Document.doc_type == doc_type,
            )
        )
        if next_sequence is None:
            return 1
        return int(next_sequence)

    async def _replace_line_items(self, document_id: UUID, items: list[LineItemDraft]) -> None:
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


def build_default_due_date() -> date:
    """Return the default invoice due date used during conversion."""
    return datetime.now(UTC).date() + timedelta(days=30)


def _build_render_context(
    *,
    document: Document,
    customer: Customer,
    user: User,
) -> QuoteRenderContext:
    return QuoteRenderContext(
        quote_id=document.id,
        user_id=document.user_id,
        customer_id=document.customer_id,
        business_name=user.business_name,
        first_name=user.first_name,
        last_name=user.last_name,
        phone_number=user.phone_number,
        contractor_email=user.email,
        logo_path=user.logo_path,
        logo_data_uri=None,
        customer_name=customer.name,
        customer_phone=customer.phone,
        customer_email=customer.email,
        customer_address=customer.address,
        doc_number=document.doc_number,
        doc_label="Invoice",
        title=document.title,
        status=document.status.value,
        total_amount=document.total_amount,
        notes=document.notes,
        due_date=_format_document_date(document.due_date, user.timezone),
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
        issued_date=_format_timestamp(document.created_at, user.timezone),
        updated_date=_format_timestamp(document.updated_at, user.timezone),
    )


def _format_timestamp(value: datetime, timezone: str | None) -> str:
    resolved_tz: tzinfo = UTC
    if timezone:
        try:
            resolved_tz = ZoneInfo(timezone)
        except ZoneInfoNotFoundError:
            resolved_tz = UTC

    return value.astimezone(resolved_tz).strftime("%b %d, %Y")


def _format_document_date(value: date | None, timezone: str | None) -> str | None:
    if value is None:
        return None
    del timezone
    return value.strftime("%b %d, %Y")
