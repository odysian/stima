"""Quote repository operations."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, tzinfo
from decimal import Decimal
from typing import cast
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.features.auth.models import User
from app.features.customers.models import Customer
from app.features.event_logs.models import EventLog
from app.features.quotes.models import Document, LineItem, QuoteStatus
from app.features.quotes.schemas import LineItemDraft
from app.shared.pricing import (
    DiscountType,
    PricingInput,
    calculate_breakdown_from_persisted,
    calculate_line_item_sum,
)

_PUBLIC_QUOTE_STATUSES = (
    QuoteStatus.SHARED,
    QuoteStatus.VIEWED,
    QuoteStatus.APPROVED,
    QuoteStatus.DECLINED,
)
_QUOTE_DOC_TYPE = "quote"


@dataclass(slots=True)
class LinkedInvoiceSummary:
    """Compact invoice summary shown from quote detail."""

    id: UUID
    doc_number: str
    status: str
    due_date: date | None
    total_amount: Decimal | None
    created_at: datetime


@dataclass(slots=True)
class QuoteRenderLineItem:
    """Line item payload required by PDF rendering."""

    description: str
    details: str | None
    price: Decimal | None


@dataclass(slots=True)
class QuoteRenderContext:
    """Template context loaded in one repository call for PDF rendering."""

    quote_id: UUID
    user_id: UUID
    customer_id: UUID
    business_name: str | None
    first_name: str | None
    last_name: str | None
    phone_number: str | None
    contractor_email: str | None
    logo_path: str | None
    logo_data_uri: str | None
    customer_name: str
    customer_phone: str | None
    customer_email: str | None
    customer_address: str | None
    doc_number: str
    doc_label: str
    title: str | None
    status: str
    total_amount: Decimal | None
    subtotal_amount: Decimal | None
    discount_type: str | None
    discount_value: Decimal | None
    discount_amount: Decimal | None
    tax_rate: Decimal | None
    tax_amount: Decimal | None
    deposit_amount: Decimal | None
    balance_due: Decimal | None
    notes: str | None
    due_date: str | None
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
    title: str | None
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
    title: str | None
    status: str
    source_type: str
    transcript: str
    total_amount: Decimal | None
    tax_rate: Decimal | None
    discount_type: str | None
    discount_value: Decimal | None
    deposit_amount: Decimal | None
    notes: str | None
    shared_at: datetime | None
    share_token: str | None
    line_items: list[LineItem]
    created_at: datetime
    updated_at: datetime
    linked_invoice: LinkedInvoiceSummary | None


@dataclass(slots=True)
class QuoteEmailContext:
    """Quote and contact fields required for transactional email delivery."""

    quote_id: UUID
    user_id: UUID
    customer_id: UUID
    business_name: str | None
    first_name: str | None
    last_name: str | None
    contractor_email: str
    contractor_phone: str | None
    customer_name: str
    customer_email: str | None
    doc_number: str
    title: str | None
    status: str
    total_amount: Decimal | None
    share_token: str | None


@dataclass(slots=True)
class QuoteViewTransition:
    """Identifiers needed when the first public view updates quote status."""

    quote_id: UUID
    user_id: UUID
    customer_id: UUID


@dataclass(slots=True)
class PublicShareRecord:
    """Lifecycle metadata resolved for one quote share token."""

    document_id: UUID
    user_id: UUID
    customer_id: UUID
    status: QuoteStatus
    share_token_created_at: datetime | None
    share_token_expires_at: datetime | None
    share_token_revoked_at: datetime | None


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
                Document.title,
                Document.status,
                Document.total_amount,
                line_item_count.label("item_count"),
                Document.created_at,
            )
            .join(Customer, Customer.id == Document.customer_id)
            .where(
                Document.user_id == user_id,
                Document.doc_type == _QUOTE_DOC_TYPE,
            )
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
                title=row.title,
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
                Document.doc_type == _QUOTE_DOC_TYPE,
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
                Document.doc_type == _QUOTE_DOC_TYPE,
            )
            .options(selectinload(Document.line_items))
        )
        row = result.one_or_none()
        if row is None:
            return None

        document, customer = row
        linked_invoice = await self.get_linked_invoice_summary(
            source_document_id=document.id,
            user_id=user_id,
        )

        return QuoteDetailRow(
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
            source_type=document.source_type,
            transcript=document.transcript,
            total_amount=document.total_amount,
            tax_rate=document.tax_rate,
            discount_type=document.discount_type,
            discount_value=document.discount_value,
            deposit_amount=document.deposit_amount,
            notes=document.notes,
            shared_at=document.shared_at,
            share_token=document.share_token,
            line_items=document.line_items,
            created_at=document.created_at,
            updated_at=document.updated_at,
            linked_invoice=linked_invoice,
        )

    async def get_email_context(self, quote_id: UUID, user_id: UUID) -> QuoteEmailContext | None:
        """Return the quote and contact fields needed to send a quote email."""
        result = await self._session.execute(
            select(Document, Customer, User)
            .join(Customer, Customer.id == Document.customer_id)
            .join(User, User.id == Document.user_id)
            .where(
                Document.id == quote_id,
                Document.user_id == user_id,
                Document.doc_type == _QUOTE_DOC_TYPE,
            )
        )
        row = result.one_or_none()
        if row is None:
            return None

        document, customer, user = row
        return QuoteEmailContext(
            quote_id=document.id,
            user_id=document.user_id,
            customer_id=document.customer_id,
            business_name=user.business_name,
            first_name=user.first_name,
            last_name=user.last_name,
            contractor_email=user.email,
            contractor_phone=user.phone_number,
            customer_name=customer.name,
            customer_email=customer.email,
            doc_number=document.doc_number,
            title=document.title,
            status=(
                document.status.value
                if isinstance(document.status, QuoteStatus)
                else str(document.status)
            ),
            total_amount=document.total_amount,
            share_token=document.share_token,
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
                Document.doc_type == _QUOTE_DOC_TYPE,
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
            .where(
                Document.share_token == share_token,
                Document.doc_type == _QUOTE_DOC_TYPE,
                Document.status.in_(_PUBLIC_QUOTE_STATUSES),
            )
            .options(selectinload(Document.line_items))
        )
        row = result.one_or_none()
        if row is None:
            return None

        document, customer, user = row
        return _build_render_context(document=document, customer=customer, user=user)

    async def get_public_share_record(self, share_token: str) -> PublicShareRecord | None:
        """Return quote share lifecycle metadata for one token regardless of status."""
        result = await self._session.execute(
            select(
                Document.id,
                Document.user_id,
                Document.customer_id,
                Document.status,
                Document.share_token_created_at,
                Document.share_token_expires_at,
                Document.share_token_revoked_at,
            ).where(
                Document.share_token == share_token,
                Document.doc_type == _QUOTE_DOC_TYPE,
            )
        )
        row = result.one_or_none()
        if row is None:
            return None

        return PublicShareRecord(
            document_id=row.id,
            user_id=row.user_id,
            customer_id=row.customer_id,
            status=cast(QuoteStatus, row.status),
            share_token_created_at=row.share_token_created_at,
            share_token_expires_at=row.share_token_expires_at,
            share_token_revoked_at=row.share_token_revoked_at,
        )

    async def transition_to_viewed_by_share_token(
        self,
        share_token: str,
        *,
        accessed_at: datetime,
    ) -> QuoteViewTransition | None:
        """Mark a shared quote as viewed once and return ids when the write occurred."""
        row = await self._session.execute(
            update(Document)
            .where(
                Document.share_token == share_token,
                Document.doc_type == _QUOTE_DOC_TYPE,
                Document.status == QuoteStatus.SHARED,
            )
            .values(
                status=QuoteStatus.VIEWED,
                last_public_accessed_at=accessed_at,
            )
            .returning(Document.id, Document.user_id, Document.customer_id)
        )
        updated_row = row.one_or_none()
        if updated_row is None:
            return None

        return QuoteViewTransition(
            quote_id=updated_row.id,
            user_id=updated_row.user_id,
            customer_id=updated_row.customer_id,
        )

    async def touch_last_public_accessed_at_by_share_token(
        self,
        share_token: str,
        *,
        accessed_at: datetime,
    ) -> None:
        """Update the last successful public access timestamp for one quote token."""
        await self._session.execute(
            update(Document)
            .where(
                Document.share_token == share_token,
                Document.doc_type == _QUOTE_DOC_TYPE,
            )
            .values(last_public_accessed_at=accessed_at)
        )

    async def mark_ready_if_not_shared(self, *, quote_id: UUID, user_id: UUID) -> None:
        """Transition quote status to ready unless the quote is already shared."""
        await self._session.execute(
            update(Document)
            .where(
                Document.id == quote_id,
                Document.user_id == user_id,
                Document.doc_type == _QUOTE_DOC_TYPE,
                Document.status == QuoteStatus.DRAFT,
            )
            .values(status=QuoteStatus.READY)
        )

    async def set_quote_outcome(
        self,
        *,
        quote_id: UUID,
        user_id: UUID,
        status: QuoteStatus,
        allowed_current_statuses: tuple[QuoteStatus, ...],
    ) -> Document | None:
        """Persist an approved/declined outcome if the quote is still eligible."""
        updated_document_id = await self._session.scalar(
            update(Document)
            .where(
                Document.id == quote_id,
                Document.user_id == user_id,
                Document.doc_type == _QUOTE_DOC_TYPE,
                Document.status.in_(allowed_current_statuses),
            )
            .values(status=status)
            .returning(Document.id)
        )
        if updated_document_id is None:
            return None

        return await self.get_by_id(quote_id, user_id)

    async def get_latest_quote_event_at(
        self,
        *,
        user_id: UUID,
        quote_id: UUID,
        event_name: str,
    ) -> datetime | None:
        """Return the latest pilot event timestamp for one quote/event combination."""
        return await self._session.scalar(
            select(EventLog.created_at)
            .where(
                EventLog.user_id == user_id,
                EventLog.event_name == event_name,
                EventLog.metadata_json["quote_id"].as_string() == str(quote_id),
            )
            .order_by(EventLog.created_at.desc())
            .limit(1)
        )

    async def persist_quote_event(
        self,
        *,
        user_id: UUID,
        quote_id: UUID,
        customer_id: UUID,
        event_name: str,
    ) -> None:
        """Stage one quote-scoped pilot event row; caller should commit the session."""
        self._session.add(
            EventLog(
                user_id=user_id,
                event_name=event_name,
                metadata_json={
                    "quote_id": str(quote_id),
                    "customer_id": str(customer_id),
                },
            )
        )
        await self._session.flush()

    async def create(
        self,
        *,
        user_id: UUID,
        customer_id: UUID,
        title: str | None,
        transcript: str,
        line_items: list[LineItemDraft],
        total_amount: float | None,
        tax_rate: float | None,
        discount_type: str | None,
        discount_value: float | None,
        deposit_amount: float | None,
        notes: str | None,
        source_type: str,
    ) -> Document:
        """Create a quote and optional line items for the owning user."""
        next_sequence = await self.get_next_doc_sequence_for_type(
            user_id=user_id,
            doc_type=_QUOTE_DOC_TYPE,
        )
        document = Document(
            user_id=user_id,
            customer_id=customer_id,
            doc_type=_QUOTE_DOC_TYPE,
            doc_sequence=next_sequence,
            doc_number=f"Q-{next_sequence:03d}",
            title=title,
            source_type=source_type,
            transcript=transcript,
            total_amount=_to_decimal(total_amount),
            tax_rate=_to_decimal(tax_rate),
            discount_type=discount_type,
            discount_value=_to_decimal(discount_value),
            deposit_amount=_to_decimal(deposit_amount),
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
        title: str | None,
        update_title: bool,
        total_amount: float | None,
        update_total_amount: bool,
        tax_rate: float | None,
        update_tax_rate: bool,
        discount_type: str | None,
        update_discount_type: bool,
        discount_value: float | None,
        update_discount_value: bool,
        deposit_amount: float | None,
        update_deposit_amount: bool,
        notes: str | None,
        update_notes: bool,
        line_items: list[LineItemDraft] | None,
        replace_line_items: bool,
    ) -> Document:
        """Apply partial quote updates and optional full line-item replacement."""
        if update_title:
            document.title = title
        if update_total_amount:
            document.total_amount = _to_decimal(total_amount)
        if update_tax_rate:
            document.tax_rate = _to_decimal(tax_rate)
        if update_discount_type:
            document.discount_type = discount_type
        if update_discount_value:
            document.discount_value = _to_decimal(discount_value)
        if update_deposit_amount:
            document.deposit_amount = _to_decimal(deposit_amount)
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

    async def get_linked_invoice_summary(
        self,
        *,
        source_document_id: UUID,
        user_id: UUID,
    ) -> LinkedInvoiceSummary | None:
        """Return the linked invoice summary for one quote, if present."""
        invoice = await self._session.execute(
            select(
                Document.id,
                Document.doc_number,
                Document.status,
                Document.due_date,
                Document.total_amount,
                Document.created_at,
            ).where(
                Document.user_id == user_id,
                Document.doc_type == "invoice",
                Document.source_document_id == source_document_id,
            )
        )
        row = invoice.one_or_none()
        if row is None:
            return None

        return LinkedInvoiceSummary(
            id=row.id,
            doc_number=row.doc_number,
            status=row.status.value if isinstance(row.status, QuoteStatus) else str(row.status),
            due_date=row.due_date,
            total_amount=row.total_amount,
            created_at=row.created_at,
        )

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
    pricing_breakdown = calculate_breakdown_from_persisted(
        PricingInput(
            total_amount=document.total_amount,
            discount_type=cast(DiscountType | None, document.discount_type),
            discount_value=document.discount_value,
            tax_rate=document.tax_rate,
            deposit_amount=document.deposit_amount,
        ),
        line_item_sum=calculate_line_item_sum(
            [line_item.price for line_item in document.line_items]
        ),
    )
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
        doc_label="Quote",
        title=document.title,
        status=document.status.value,
        total_amount=document.total_amount,
        subtotal_amount=pricing_breakdown.subtotal,
        discount_type=pricing_breakdown.discount_type,
        discount_value=pricing_breakdown.discount_value,
        discount_amount=pricing_breakdown.discount_amount,
        tax_rate=pricing_breakdown.tax_rate,
        tax_amount=pricing_breakdown.tax_amount,
        deposit_amount=pricing_breakdown.deposit_amount,
        balance_due=pricing_breakdown.balance_due,
        notes=document.notes,
        due_date=(
            document.due_date.strftime("%b %d, %Y") if document.due_date is not None else None
        ),
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
