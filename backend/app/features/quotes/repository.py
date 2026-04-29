"""Quote repository operations."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, tzinfo
from decimal import Decimal
from typing import Any, cast
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.features.auth.models import User
from app.features.customers.models import Customer
from app.features.event_logs.models import EventLog
from app.features.jobs.models import JobRecord, JobStatus
from app.features.quotes.models import Document, LineItem, QuoteStatus
from app.features.quotes.schemas import LineItemDraft
from app.shared.address_formatting import format_address, format_address_lines
from app.shared.pricing import (
    DiscountType,
    PricingInput,
    calculate_breakdown_from_persisted,
    derive_document_subtotal_from_line_items,
)

_PUBLIC_QUOTE_STATUSES = (
    QuoteStatus.SHARED,
    QuoteStatus.VIEWED,
    QuoteStatus.APPROVED,
    QuoteStatus.DECLINED,
)
_QUOTE_DOC_TYPE = "quote"
_INVOICE_DOC_TYPE = "invoice"
_CUSTOMER_REASSIGNABLE_STATUSES = frozenset(
    {
        QuoteStatus.DRAFT.value,
        QuoteStatus.READY.value,
    }
)


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
    business_address_lines: list[str] = field(default_factory=list)
    customer_address_lines: list[str] = field(default_factory=list)


@dataclass(slots=True)
class QuoteListItemSummary:
    """Summary row returned by the quote list query."""

    id: UUID
    customer_id: UUID | None
    customer_name: str | None
    doc_number: str
    title: str | None
    status: str
    total_amount: Decimal | None
    item_count: int
    requires_customer_assignment: bool
    can_reassign_customer: bool
    created_at: datetime


@dataclass(slots=True)
class QuoteReuseLineItemPreview:
    """Minimal line item preview payload for quote reuse cards."""

    description: str
    price: Decimal | None


@dataclass(slots=True)
class QuoteReuseCandidateSummary:
    """Quote summary payload tailored for reuse candidate selection."""

    id: UUID
    title: str | None
    doc_number: str
    customer_id: UUID | None
    customer_name: str | None
    total_amount: Decimal | None
    created_at: datetime
    status: str
    line_item_previews: list[QuoteReuseLineItemPreview]
    line_item_count: int
    more_line_item_count: int


@dataclass(slots=True)
class QuoteDetailRow:
    """Detail row returned by the quote detail query."""

    id: UUID
    customer_id: UUID | None
    customer_name: str | None
    customer_email: str | None
    customer_phone: str | None
    doc_number: str
    title: str | None
    status: str
    source_type: str
    transcript: str
    extraction_tier: str | None
    extraction_degraded_reason_code: str | None
    extraction_review_metadata: dict[str, Any] | None
    total_amount: Decimal | None
    tax_rate: Decimal | None
    discount_type: str | None
    discount_value: Decimal | None
    deposit_amount: Decimal | None
    notes: str | None
    shared_at: datetime | None
    share_token: str | None
    share_token_expires_at: datetime | None
    share_token_revoked_at: datetime | None
    line_items: list[LineItem]
    created_at: datetime
    updated_at: datetime
    requires_customer_assignment: bool
    can_reassign_customer: bool
    linked_invoice: LinkedInvoiceSummary | None
    pdf_artifact_path: str | None
    pdf_artifact_revision: int
    pdf_artifact_job_id: UUID | None
    pdf_artifact_job_status: JobStatus | None
    pdf_artifact_terminal_error: str | None


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
        linked_invoice = aliased(Document)
        line_item_count = (
            select(func.count(LineItem.id))
            .where(LineItem.document_id == Document.id)
            .correlate(Document)
            .scalar_subquery()
        )
        has_linked_invoice = (
            select(linked_invoice.id)
            .where(
                linked_invoice.user_id == user_id,
                linked_invoice.doc_type == _INVOICE_DOC_TYPE,
                linked_invoice.source_document_id == Document.id,
            )
            .exists()
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
                has_linked_invoice.label("has_linked_invoice"),
                Document.created_at,
            )
            .outerjoin(Customer, Customer.id == Document.customer_id)
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
                requires_customer_assignment=row.customer_id is None,
                can_reassign_customer=_can_reassign_customer(
                    status=(
                        row.status.value if isinstance(row.status, QuoteStatus) else str(row.status)
                    ),
                    has_linked_invoice=bool(row.has_linked_invoice),
                ),
                created_at=row.created_at,
            )
            for row in result
        ]

    async def list_reuse_candidates(
        self,
        user_id: UUID,
        *,
        customer_id: UUID | None = None,
        q: str | None = None,
    ) -> list[QuoteReuseCandidateSummary]:
        """Return quote summaries with capped line-item previews for reuse pickers."""
        statement = (
            select(
                Document.id,
                Document.title,
                Document.doc_number,
                Document.customer_id,
                Customer.name.label("customer_name"),
                Document.total_amount,
                Document.created_at,
                Document.status,
            )
            .outerjoin(Customer, Customer.id == Document.customer_id)
            .where(
                Document.user_id == user_id,
                Document.doc_type == _QUOTE_DOC_TYPE,
            )
            .order_by(Document.created_at.desc(), Document.doc_sequence.desc())
        )
        if customer_id is not None:
            statement = statement.where(Document.customer_id == customer_id)

        normalized_query = (q or "").strip()
        if normalized_query:
            like_pattern = f"%{normalized_query}%"
            statement = statement.where(
                or_(
                    Customer.name.ilike(like_pattern),
                    Document.title.ilike(like_pattern),
                    Document.doc_number.ilike(like_pattern),
                )
            )

        result = await self._session.execute(statement)
        quote_rows = result.all()
        if not quote_rows:
            return []

        quote_ids = [row.id for row in quote_rows]
        line_item_result = await self._session.execute(
            select(
                LineItem.document_id,
                LineItem.description,
                LineItem.price,
            )
            .where(LineItem.document_id.in_(quote_ids))
            .order_by(
                LineItem.document_id.asc(),
                LineItem.sort_order.asc(),
                LineItem.created_at.asc(),
            )
        )

        line_item_count_by_quote: dict[UUID, int] = {}
        previews_by_quote: dict[UUID, list[QuoteReuseLineItemPreview]] = {}
        for line_item_row in line_item_result:
            quote_id = line_item_row.document_id
            line_item_count_by_quote[quote_id] = line_item_count_by_quote.get(quote_id, 0) + 1
            previews = previews_by_quote.setdefault(quote_id, [])
            if len(previews) < 3:
                previews.append(
                    QuoteReuseLineItemPreview(
                        description=line_item_row.description,
                        price=line_item_row.price,
                    )
                )

        candidates: list[QuoteReuseCandidateSummary] = []
        for row in quote_rows:
            previews = previews_by_quote.get(row.id, [])
            line_item_count = line_item_count_by_quote.get(row.id, 0)
            status = row.status.value if isinstance(row.status, QuoteStatus) else str(row.status)
            candidates.append(
                QuoteReuseCandidateSummary(
                    id=row.id,
                    title=row.title,
                    doc_number=row.doc_number,
                    customer_id=row.customer_id,
                    customer_name=row.customer_name,
                    total_amount=row.total_amount,
                    created_at=row.created_at,
                    status=status,
                    line_item_previews=previews,
                    line_item_count=line_item_count,
                    more_line_item_count=max(line_item_count - len(previews), 0),
                )
            )
        return candidates

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

    async def get_by_id_for_update(self, quote_id: UUID, user_id: UUID) -> Document | None:
        """Return one quote row with a write lock for serialized mutations."""
        result = await self._session.execute(
            select(Document)
            .where(
                Document.id == quote_id,
                Document.user_id == user_id,
                Document.doc_type == _QUOTE_DOC_TYPE,
            )
            .with_for_update()
            .options(selectinload(Document.line_items))
        )
        return result.scalar_one_or_none()

    async def get_detail_by_id(self, quote_id: UUID, user_id: UUID) -> QuoteDetailRow | None:
        """Return one quote detail row with customer contact fields."""
        result = await self._session.execute(
            select(Document, Customer, JobRecord.status, JobRecord.terminal_error)
            .outerjoin(Customer, Customer.id == Document.customer_id)
            .outerjoin(JobRecord, JobRecord.id == Document.pdf_artifact_job_id)
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

        document, customer, pdf_artifact_job_status, pdf_artifact_terminal_error = row
        linked_invoice = await self.get_linked_invoice_summary(
            source_document_id=document.id,
            user_id=user_id,
        )
        status = (
            document.status.value
            if isinstance(document.status, QuoteStatus)
            else str(document.status)
        )

        return QuoteDetailRow(
            id=document.id,
            customer_id=document.customer_id,
            customer_name=customer.name if customer is not None else None,
            customer_email=customer.email if customer is not None else None,
            customer_phone=customer.phone if customer is not None else None,
            doc_number=document.doc_number,
            title=document.title,
            status=status,
            source_type=document.source_type,
            transcript=document.transcript,
            extraction_tier=document.extraction_tier,
            extraction_degraded_reason_code=document.extraction_degraded_reason_code,
            extraction_review_metadata=document.extraction_review_metadata,
            total_amount=document.total_amount,
            tax_rate=document.tax_rate,
            discount_type=document.discount_type,
            discount_value=document.discount_value,
            deposit_amount=document.deposit_amount,
            notes=document.notes,
            shared_at=document.shared_at,
            share_token=document.share_token,
            share_token_expires_at=document.share_token_expires_at,
            share_token_revoked_at=document.share_token_revoked_at,
            line_items=document.line_items,
            created_at=document.created_at,
            updated_at=document.updated_at,
            requires_customer_assignment=document.customer_id is None,
            can_reassign_customer=_can_reassign_customer(
                status=status,
                has_linked_invoice=linked_invoice is not None,
            ),
            linked_invoice=linked_invoice,
            pdf_artifact_path=document.pdf_artifact_path,
            pdf_artifact_revision=document.pdf_artifact_revision,
            pdf_artifact_job_id=document.pdf_artifact_job_id,
            pdf_artifact_job_status=pdf_artifact_job_status,
            pdf_artifact_terminal_error=pdf_artifact_terminal_error,
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
            customer_id=cast(UUID, row.customer_id),
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
            customer_id=cast(UUID, updated_row.customer_id),
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
        customer_id: UUID | None,
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
        extraction_tier: str | None = None,
        extraction_degraded_reason_code: str | None = None,
        extraction_review_metadata: dict[str, Any] | None = None,
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
            extraction_tier=extraction_tier,
            extraction_degraded_reason_code=extraction_degraded_reason_code,
            extraction_review_metadata=extraction_review_metadata,
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
        customer_id: UUID | None,
        update_customer_id: bool,
        title: str | None,
        update_title: bool,
        transcript: str | None,
        update_transcript: bool,
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
        extraction_review_metadata: dict[str, Any] | None = None,
        update_extraction_review_metadata: bool = False,
    ) -> Document:
        """Apply partial quote updates and optional full line-item replacement."""
        if update_customer_id:
            document.customer_id = customer_id
        if update_title:
            document.title = title
        if update_transcript:
            document.transcript = cast(str, transcript)
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
        if update_extraction_review_metadata:
            document.extraction_review_metadata = extraction_review_metadata

        if replace_line_items and line_items is not None:
            await self._replace_line_items(document.id, line_items)

        await self._session.flush()
        await self._session.refresh(document)
        await self._session.refresh(document, attribute_names=["line_items"])
        return document

    async def update_extraction_review_metadata(
        self,
        *,
        document: Document,
        extraction_review_metadata: dict[str, Any],
    ) -> Document:
        """Persist one sidecar-only extraction review metadata mutation."""
        document.extraction_review_metadata = extraction_review_metadata
        await self._session.flush()
        await self._session.refresh(document)
        return document

    async def has_linked_invoice(
        self,
        *,
        source_document_id: UUID,
        user_id: UUID,
    ) -> bool:
        """Return true when an invoice already exists for one source quote."""
        linked_invoice_id = await self._session.scalar(
            select(Document.id).where(
                Document.user_id == user_id,
                Document.doc_type == _INVOICE_DOC_TYPE,
                Document.source_document_id == source_document_id,
            )
        )
        return linked_invoice_id is not None

    async def invalidate_pdf_artifact(self, document: Document) -> str | None:
        """Invalidate one quote artifact by clearing durable state and bumping revision."""
        previous_path = document.pdf_artifact_path
        document.pdf_artifact_path = None
        document.pdf_artifact_job_id = None
        document.pdf_artifact_revision += 1
        await self._session.flush()
        return previous_path

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
                    flagged=item.flagged,
                    flag_reason=item.flag_reason,
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
        line_item_sum=_to_decimal(derive_document_subtotal_from_line_items(document.line_items)[1]),
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
        business_address_lines=business_address_lines,
        customer_address_lines=customer_address_lines,
    )


def _format_quote_date(value: datetime, timezone: str | None) -> str:
    resolved_tz: tzinfo = UTC
    if timezone:
        try:
            resolved_tz = ZoneInfo(timezone)
        except ZoneInfoNotFoundError:
            resolved_tz = UTC

    return value.astimezone(resolved_tz).strftime("%b %d, %Y")


def _can_reassign_customer(*, status: str, has_linked_invoice: bool) -> bool:
    return status in _CUSTOMER_REASSIGNABLE_STATUSES and not has_linked_invoice
