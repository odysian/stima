"""Invoice repository operations.

This module owns invoice persistence and read models for authenticated users.
It returns detail/list summaries plus PDF render context, but leaves HTTP errors
and higher-level workflow rules to the service layer.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, tzinfo
from decimal import Decimal
from typing import cast
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.features.auth.models import User
from app.features.customers.models import Customer
from app.features.event_logs.models import EventLog
from app.features.jobs.models import JobRecord, JobStatus
from app.features.quotes.models import Document, LineItem, QuoteStatus
from app.features.quotes.repository import QuoteRenderContext, QuoteRenderLineItem
from app.features.quotes.schemas import LineItemDraft
from app.shared.address_formatting import format_address, format_address_lines
from app.shared.pricing import (
    DiscountType,
    PricingInput,
    calculate_breakdown_from_persisted,
    calculate_line_item_sum,
)

_INVOICE_DOC_TYPE = "invoice"
_PUBLIC_INVOICE_STATUSES = (
    QuoteStatus.SENT,
    QuoteStatus.PAID,
    QuoteStatus.VOID,
)


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
    tax_rate: Decimal | None
    discount_type: str | None
    discount_value: Decimal | None
    deposit_amount: Decimal | None
    notes: str | None
    due_date: date | None
    shared_at: datetime | None
    share_token: str | None
    share_token_expires_at: datetime | None
    share_token_revoked_at: datetime | None
    source_document_id: UUID | None
    source_quote_number: str | None
    line_items: list[LineItem]
    created_at: datetime
    updated_at: datetime
    pdf_artifact_path: str | None
    pdf_artifact_revision: int
    pdf_artifact_job_id: UUID | None
    pdf_artifact_job_status: JobStatus | None
    pdf_artifact_terminal_error: str | None


@dataclass(slots=True)
class InvoiceListItemSummary:
    """Summary row returned by the invoice list query."""

    id: UUID
    customer_id: UUID
    customer_name: str
    doc_number: str
    title: str | None
    status: str
    total_amount: Decimal | None
    due_date: date | None
    created_at: datetime
    source_document_id: UUID | None


@dataclass(slots=True)
class InvoiceEmailContext:
    """Invoice and contact fields required for transactional email delivery."""

    invoice_id: UUID
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
    due_date: date | None
    share_token: str | None


@dataclass(slots=True)
class InvoicePublicShareRecord:
    """Lifecycle metadata resolved for one invoice share token."""

    invoice_id: UUID
    user_id: UUID
    customer_id: UUID
    status: QuoteStatus
    share_token_created_at: datetime | None
    share_token_expires_at: datetime | None
    share_token_revoked_at: datetime | None


@dataclass(slots=True)
class InvoiceFirstViewTransition:
    """Identifiers needed when the first public invoice view is recorded."""

    invoice_id: UUID
    user_id: UUID
    customer_id: UUID


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

    async def list_by_user(
        self,
        user_id: UUID,
        customer_id: UUID | None = None,
    ) -> list[InvoiceListItemSummary]:
        """Return invoice summaries for a user ordered newest-first."""
        statement = (
            select(
                Document.id,
                Document.customer_id,
                Customer.name.label("customer_name"),
                Document.doc_number,
                Document.title,
                Document.status,
                Document.total_amount,
                Document.due_date,
                Document.created_at,
                Document.source_document_id,
            )
            .join(Customer, Customer.id == Document.customer_id)
            .where(
                Document.user_id == user_id,
                Document.doc_type == _INVOICE_DOC_TYPE,
                Document.archived_at.is_(None),
            )
            .order_by(Document.created_at.desc(), Document.doc_sequence.desc())
        )
        if customer_id is not None:
            statement = statement.where(Document.customer_id == customer_id)

        result = await self._session.execute(statement)
        return [
            InvoiceListItemSummary(
                id=row.id,
                customer_id=cast(UUID, row.customer_id),
                customer_name=row.customer_name,
                doc_number=row.doc_number,
                title=row.title,
                status=(
                    row.status.value if isinstance(row.status, QuoteStatus) else str(row.status)
                ),
                total_amount=row.total_amount,
                due_date=row.due_date,
                created_at=row.created_at,
                source_document_id=row.source_document_id,
            )
            for row in result.all()
        ]

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

    async def get_owned_document_by_id(self, document_id: UUID, user_id: UUID) -> Document | None:
        """Return one owned document of any type, including line items."""
        result = await self._session.execute(
            select(Document)
            .where(
                Document.id == document_id,
                Document.user_id == user_id,
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
            select(
                Document,
                Customer,
                source_quote,
                JobRecord.status,
                JobRecord.terminal_error,
            )
            .join(Customer, Customer.id == Document.customer_id)
            .outerjoin(
                source_quote,
                (source_quote.id == Document.source_document_id)
                & (source_quote.doc_type == "quote"),
            )
            .outerjoin(JobRecord, JobRecord.id == Document.pdf_artifact_job_id)
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

        (
            document,
            customer,
            quote,
            pdf_artifact_job_status,
            pdf_artifact_terminal_error,
        ) = row
        return InvoiceDetailRow(
            id=document.id,
            customer_id=cast(UUID, document.customer_id),
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
            tax_rate=document.tax_rate,
            discount_type=document.discount_type,
            discount_value=document.discount_value,
            deposit_amount=document.deposit_amount,
            notes=document.notes,
            due_date=document.due_date,
            shared_at=document.shared_at,
            share_token=document.share_token,
            share_token_expires_at=document.share_token_expires_at,
            share_token_revoked_at=document.share_token_revoked_at,
            source_document_id=document.source_document_id,
            source_quote_number=quote.doc_number if quote is not None else None,
            line_items=document.line_items,
            created_at=document.created_at,
            updated_at=document.updated_at,
            pdf_artifact_path=document.pdf_artifact_path,
            pdf_artifact_revision=document.pdf_artifact_revision,
            pdf_artifact_job_id=document.pdf_artifact_job_id,
            pdf_artifact_job_status=pdf_artifact_job_status,
            pdf_artifact_terminal_error=pdf_artifact_terminal_error,
        )

    async def get_email_context(
        self,
        invoice_id: UUID,
        user_id: UUID,
    ) -> InvoiceEmailContext | None:
        """Return the invoice and contact fields needed to send an invoice email."""
        result = await self._session.execute(
            select(Document, Customer, User)
            .join(Customer, Customer.id == Document.customer_id)
            .join(User, User.id == Document.user_id)
            .where(
                Document.id == invoice_id,
                Document.user_id == user_id,
                Document.doc_type == _INVOICE_DOC_TYPE,
            )
        )
        row = result.one_or_none()
        if row is None:
            return None

        document, customer, user = row
        return InvoiceEmailContext(
            invoice_id=document.id,
            user_id=document.user_id,
            customer_id=cast(UUID, document.customer_id),
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
            due_date=document.due_date,
            share_token=document.share_token,
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
        """Return PDF render context for an active invoice share token."""
        result = await self._session.execute(
            select(Document, Customer, User)
            .join(Customer, Customer.id == Document.customer_id)
            .join(User, User.id == Document.user_id)
            .where(
                Document.share_token == share_token,
                Document.doc_type == _INVOICE_DOC_TYPE,
                Document.status.in_(_PUBLIC_INVOICE_STATUSES),
            )
            .options(selectinload(Document.line_items))
        )
        row = result.one_or_none()
        if row is None:
            return None

        document, customer, user = row
        return _build_render_context(document=document, customer=customer, user=user)

    async def get_public_share_record(
        self,
        share_token: str,
    ) -> InvoicePublicShareRecord | None:
        """Return invoice share lifecycle metadata for one token regardless of status."""
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
                Document.doc_type == _INVOICE_DOC_TYPE,
            )
        )
        row = result.one_or_none()
        if row is None:
            return None

        return InvoicePublicShareRecord(
            invoice_id=row.id,
            user_id=row.user_id,
            customer_id=cast(UUID, row.customer_id),
            status=cast(QuoteStatus, row.status),
            share_token_created_at=row.share_token_created_at,
            share_token_expires_at=row.share_token_expires_at,
            share_token_revoked_at=row.share_token_revoked_at,
        )

    async def mark_first_public_view_by_share_token(
        self,
        share_token: str,
        *,
        viewed_at: datetime,
    ) -> InvoiceFirstViewTransition | None:
        """Set the invoice first-view timestamp exactly once for an active token."""
        row = await self._session.execute(
            update(Document)
            .where(
                Document.share_token == share_token,
                Document.doc_type == _INVOICE_DOC_TYPE,
                Document.status.in_(_PUBLIC_INVOICE_STATUSES),
                Document.invoice_first_viewed_at.is_(None),
            )
            .values(
                invoice_first_viewed_at=viewed_at,
                last_public_accessed_at=viewed_at,
            )
            .returning(Document.id, Document.user_id, Document.customer_id)
        )
        updated_row = row.one_or_none()
        if updated_row is None:
            return None

        return InvoiceFirstViewTransition(
            invoice_id=updated_row.id,
            user_id=updated_row.user_id,
            customer_id=cast(UUID, updated_row.customer_id),
        )

    async def touch_last_public_accessed_at_by_share_token(
        self,
        share_token: str,
        *,
        accessed_at: datetime,
    ) -> None:
        """Update the last successful public access timestamp for one invoice token."""
        await self._session.execute(
            update(Document)
            .where(
                Document.share_token == share_token,
                Document.doc_type == _INVOICE_DOC_TYPE,
            )
            .values(last_public_accessed_at=accessed_at)
        )

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
            customer_id=cast(UUID, source_quote.customer_id),
            doc_type=_INVOICE_DOC_TYPE,
            doc_sequence=next_sequence,
            doc_number=f"I-{next_sequence:03d}",
            title=source_quote.title,
            source_document_id=source_quote.id,
            status=QuoteStatus.DRAFT,
            source_type=source_quote.source_type,
            transcript=source_quote.transcript,
            total_amount=source_quote.total_amount,
            tax_rate=source_quote.tax_rate,
            discount_type=source_quote.discount_type,
            discount_value=source_quote.discount_value,
            deposit_amount=source_quote.deposit_amount,
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
        tax_rate: float | None,
        discount_type: str | None,
        discount_value: float | None,
        deposit_amount: float | None,
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
            tax_rate=_to_decimal(tax_rate),
            discount_type=discount_type,
            discount_value=_to_decimal(discount_value),
            deposit_amount=_to_decimal(deposit_amount),
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

    async def update(
        self,
        *,
        invoice: Document,
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
        due_date: date | None,
        update_due_date: bool,
    ) -> Document:
        """Apply partial invoice updates and optional full line-item replacement."""
        if update_title:
            invoice.title = title
        if update_total_amount:
            invoice.total_amount = _to_decimal(total_amount)
        if update_tax_rate:
            invoice.tax_rate = _to_decimal(tax_rate)
        if update_discount_type:
            invoice.discount_type = discount_type
        if update_discount_value:
            invoice.discount_value = _to_decimal(discount_value)
        if update_deposit_amount:
            invoice.deposit_amount = _to_decimal(deposit_amount)
        if update_notes:
            invoice.notes = notes
        if update_due_date:
            invoice.due_date = due_date

        if replace_line_items and line_items is not None:
            await self._replace_line_items(invoice.id, line_items)

        await self._session.flush()
        await self.refresh(invoice)
        return invoice

    async def invalidate_pdf_artifact(self, invoice: Document) -> str | None:
        """Invalidate one invoice artifact by clearing durable state and bumping revision."""
        previous_path = invoice.pdf_artifact_path
        invoice.pdf_artifact_path = None
        invoice.pdf_artifact_job_id = None
        invoice.pdf_artifact_revision += 1
        await self._session.flush()
        return previous_path

    async def archive_by_id(self, *, invoice_id: UUID, user_id: UUID) -> bool:
        """Archive one owned invoice when it is not already archived."""
        row = await self._session.execute(
            update(Document)
            .where(
                Document.id == invoice_id,
                Document.user_id == user_id,
                Document.doc_type == _INVOICE_DOC_TYPE,
                Document.archived_at.is_(None),
            )
            .values(archived_at=func.now())
            .returning(Document.id)
        )
        return row.scalar_one_or_none() is not None

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

    async def get_latest_invoice_event_at(
        self,
        *,
        user_id: UUID,
        invoice_id: UUID,
        event_name: str,
    ) -> datetime | None:
        """Return the latest event timestamp recorded for one invoice/event pair."""
        return await self._session.scalar(
            select(EventLog.created_at)
            .where(
                EventLog.user_id == user_id,
                EventLog.event_name == event_name,
                EventLog.metadata_json["invoice_id"].as_string() == str(invoice_id),
            )
            .order_by(EventLog.created_at.desc())
            .limit(1)
        )

    async def persist_invoice_event(
        self,
        *,
        user_id: UUID,
        invoice_id: UUID,
        customer_id: UUID,
        event_name: str,
    ) -> None:
        """Persist one invoice event for duplicate-send throttling."""
        self._session.add(
            EventLog(
                user_id=user_id,
                event_name=event_name,
                metadata_json={
                    "invoice_id": str(invoice_id),
                    "customer_id": str(customer_id),
                },
            )
        )
        await self._session.flush()

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
    business_address_lines = format_address_lines(
        user.business_address_line1,
        user.business_address_line2,
        user.business_city,
        user.business_state,
        user.business_postal_code,
    )
    customer_address_lines = format_address_lines(
        customer.address_line1,
        customer.address_line2,
        customer.city,
        customer.state,
        customer.postal_code,
    )
    customer_address = format_address(
        customer.address_line1,
        customer.address_line2,
        customer.city,
        customer.state,
        customer.postal_code,
    )
    if customer_address is None and customer.address is not None:
        normalized_legacy_address = customer.address.strip()
        customer_address = normalized_legacy_address or None

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
        customer_id=cast(UUID, document.customer_id),
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
        customer_address=customer_address,
        doc_number=document.doc_number,
        doc_label="Invoice",
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
        business_address_lines=business_address_lines,
        customer_address_lines=customer_address_lines,
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
