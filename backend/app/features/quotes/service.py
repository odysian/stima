"""Quote service orchestration."""

from __future__ import annotations

import asyncio
import base64
import logging
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Literal, Protocol, cast
from uuid import UUID, uuid4

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.exc import IntegrityError

from app.features.auth.models import User
from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.repository import (
    QuoteDetailRow,
    QuoteListItemSummary,
    QuoteRenderContext,
    QuoteViewTransition,
)
from app.features.quotes.schemas import (
    LineItemDraft,
    QuoteCreateRequest,
    QuoteUpdateRequest,
)
from app.integrations.pdf import PdfRenderError
from app.integrations.storage import StorageNotFoundError, StorageReaderProtocol
from app.shared.event_logger import log_event
from app.shared.image_signatures import detect_image_content_type
from app.shared.pricing import (
    PricingValidationError,
    derive_document_subtotal_from_line_items,
    document_field_float_or_none,
    resolve_document_subtotal_for_edit,
    validate_document_pricing_input,
)

LOGGER = logging.getLogger(__name__)
_NON_DELETABLE_QUOTE_STATUSES = frozenset(
    {
        QuoteStatus.SHARED,
        QuoteStatus.VIEWED,
        QuoteStatus.APPROVED,
        QuoteStatus.DECLINED,
    }
)
_TERMINAL_QUOTE_STATUSES = frozenset({QuoteStatus.APPROVED, QuoteStatus.DECLINED})
_POST_SHARE_NON_REGRESSION_STATUSES = frozenset(
    {
        QuoteStatus.VIEWED,
        QuoteStatus.APPROVED,
        QuoteStatus.DECLINED,
    }
)


class QuoteServiceError(Exception):
    """Quote-domain exception mapped to an HTTP status code."""

    def __init__(self, *, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class QuoteRepositoryProtocol(Protocol):
    """Structural protocol for quote repository dependencies."""

    async def customer_exists_for_user(self, *, user_id: UUID, customer_id: UUID) -> bool: ...

    async def list_by_user(
        self,
        user_id: UUID,
        customer_id: UUID | None = None,
    ) -> list[QuoteListItemSummary]: ...

    async def get_by_id(self, quote_id: UUID, user_id: UUID) -> Document | None: ...

    async def get_detail_by_id(self, quote_id: UUID, user_id: UUID) -> QuoteDetailRow | None: ...

    async def get_render_context(
        self, quote_id: UUID, user_id: UUID
    ) -> QuoteRenderContext | None: ...

    async def get_render_context_by_share_token(
        self, share_token: str
    ) -> QuoteRenderContext | None: ...

    async def transition_to_viewed_by_share_token(
        self, share_token: str
    ) -> QuoteViewTransition | None: ...

    async def mark_ready_if_not_shared(self, *, quote_id: UUID, user_id: UUID) -> None: ...

    async def set_quote_outcome(
        self,
        *,
        quote_id: UUID,
        user_id: UUID,
        status: QuoteStatus,
        allowed_current_statuses: tuple[QuoteStatus, ...],
    ) -> Document | None: ...

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
    ) -> Document: ...

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
    ) -> Document: ...

    async def delete(self, document_id: UUID) -> None: ...

    async def commit(self) -> None: ...

    async def refresh(self, document: Document) -> Document: ...

    async def rollback(self) -> None: ...


class PdfIntegrationProtocol(Protocol):
    """Structural protocol for PDF rendering integration dependency."""

    def render(self, context: QuoteRenderContext) -> bytes: ...


class QuoteService:
    """Coordinate quote domain rules with persistence and PDF rendering."""

    def __init__(
        self,
        *,
        repository: QuoteRepositoryProtocol,
        pdf_integration: PdfIntegrationProtocol,
        storage_service: StorageReaderProtocol,
    ) -> None:
        self._repository = repository
        self._pdf = pdf_integration
        self._storage_service = storage_service

    async def create_quote(self, user: User, data: QuoteCreateRequest) -> Document:
        """Create a user-owned quote and retry once on sequence collisions."""
        user_id = _resolve_user_id(user)
        customer_exists = await self._repository.customer_exists_for_user(
            user_id=user_id,
            customer_id=data.customer_id,
        )
        if not customer_exists:
            raise QuoteServiceError(detail="Not found", status_code=404)

        validated_pricing = _validate_document_pricing_for_quote(
            total_amount=data.total_amount,
            line_items=data.line_items,
            discount_type=data.discount_type,
            discount_value=data.discount_value,
            tax_rate=data.tax_rate,
            deposit_amount=data.deposit_amount,
        )

        for attempt in range(2):
            try:
                quote = await self._repository.create(
                    user_id=user_id,
                    customer_id=data.customer_id,
                    title=data.title,
                    transcript=data.transcript,
                    line_items=data.line_items,
                    total_amount=document_field_float_or_none(validated_pricing.total_amount),
                    tax_rate=document_field_float_or_none(validated_pricing.tax_rate),
                    discount_type=validated_pricing.discount_type,
                    discount_value=document_field_float_or_none(validated_pricing.discount_value),
                    deposit_amount=document_field_float_or_none(validated_pricing.deposit_amount),
                    notes=data.notes,
                    source_type=data.source_type,
                )
                await self._repository.commit()
                log_event(
                    "quote.created",
                    user_id=user_id,
                    quote_id=quote.id,
                    customer_id=quote.customer_id,
                )
                return quote
            except IntegrityError as exc:
                await self._repository.rollback()
                if attempt == 0 and _is_doc_sequence_collision(exc):
                    continue
                raise

        raise QuoteServiceError(detail="Unable to create quote", status_code=409)

    async def list_quotes(
        self,
        user: User,
        customer_id: UUID | None = None,
    ) -> list[QuoteListItemSummary]:
        """List quotes for the authenticated user."""
        return await self._repository.list_by_user(
            _resolve_user_id(user),
            customer_id=customer_id,
        )

    async def get_quote(self, user: User, quote_id: UUID) -> Document:
        """Return one user-owned quote or raise not found."""
        quote = await self._repository.get_by_id(quote_id, _resolve_user_id(user))
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        return quote

    async def get_quote_detail(self, user: User, quote_id: UUID) -> QuoteDetailRow:
        """Return one user-owned quote detail row or raise not found."""
        row = await self._repository.get_detail_by_id(quote_id, _resolve_user_id(user))
        if row is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        return row

    async def update_quote(
        self,
        user: User,
        quote_id: UUID,
        data: QuoteUpdateRequest,
    ) -> Document:
        """Patch editable quote fields and optionally replace line items."""
        user_id = _resolve_user_id(user)
        quote = await self._repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)

        next_line_items = (
            data.line_items if "line_items" in data.model_fields_set else quote.line_items
        )
        line_items_define_subtotal, derived_line_item_subtotal = (
            derive_document_subtotal_from_line_items(next_line_items)
        )
        current_subtotal = resolve_document_subtotal_for_edit(
            total_amount=quote.total_amount,
            discount_type=quote.discount_type,
            discount_value=quote.discount_value,
            tax_rate=quote.tax_rate,
            deposit_amount=quote.deposit_amount,
            line_items=next_line_items,
        )
        current_pricing = _validate_document_pricing_for_quote(
            total_amount=(
                data.total_amount
                if "total_amount" in data.model_fields_set
                else (
                    derived_line_item_subtotal
                    if "line_items" in data.model_fields_set and line_items_define_subtotal
                    else current_subtotal
                )
            ),
            line_items=next_line_items,
            discount_type=(
                None
                if "discount_value" in data.model_fields_set and data.discount_value is None
                else (
                    data.discount_type
                    if "discount_type" in data.model_fields_set
                    else quote.discount_type
                )
            ),
            discount_value=(
                data.discount_value
                if "discount_value" in data.model_fields_set
                else document_field_float_or_none(quote.discount_value)
            ),
            tax_rate=(
                data.tax_rate
                if "tax_rate" in data.model_fields_set
                else document_field_float_or_none(quote.tax_rate)
            ),
            deposit_amount=(
                data.deposit_amount
                if "deposit_amount" in data.model_fields_set
                else document_field_float_or_none(quote.deposit_amount)
            ),
        )

        updated_quote = await self._repository.update(
            document=quote,
            title=data.title,
            update_title="title" in data.model_fields_set,
            total_amount=document_field_float_or_none(current_pricing.total_amount),
            update_total_amount="total_amount" in data.model_fields_set
            or ("line_items" in data.model_fields_set and line_items_define_subtotal)
            or "discount_type" in data.model_fields_set
            or "discount_value" in data.model_fields_set
            or "tax_rate" in data.model_fields_set,
            tax_rate=document_field_float_or_none(current_pricing.tax_rate),
            update_tax_rate="tax_rate" in data.model_fields_set,
            discount_type=current_pricing.discount_type,
            update_discount_type=(
                "discount_type" in data.model_fields_set
                or (
                    "discount_value" in data.model_fields_set
                    and current_pricing.discount_type is None
                )
            ),
            discount_value=document_field_float_or_none(current_pricing.discount_value),
            update_discount_value="discount_value" in data.model_fields_set,
            deposit_amount=document_field_float_or_none(current_pricing.deposit_amount),
            update_deposit_amount="deposit_amount" in data.model_fields_set,
            notes=data.notes,
            update_notes="notes" in data.model_fields_set,
            line_items=data.line_items,
            replace_line_items="line_items" in data.model_fields_set,
        )
        await self._repository.commit()
        log_event(
            "quote.updated",
            user_id=user_id,
            quote_id=updated_quote.id,
            customer_id=updated_quote.customer_id,
        )
        return await self._repository.refresh(updated_quote)

    async def delete_quote(self, user: User, quote_id: UUID) -> None:
        """Delete a user-owned quote unless it has already been shared."""
        user_id = _resolve_user_id(user)
        quote = await self._repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if quote.status in _NON_DELETABLE_QUOTE_STATUSES:
            raise QuoteServiceError(
                detail="Shared quotes cannot be deleted",
                status_code=409,
            )

        await self._repository.delete(quote_id)
        await self._repository.commit()
        log_event(
            "quote.deleted",
            user_id=user_id,
            quote_id=quote.id,
            customer_id=quote.customer_id,
        )

    async def generate_pdf(self, user: User, quote_id: UUID) -> tuple[str, bytes]:
        """Render and return quote PDF bytes while applying ready transition rules."""
        user_id = _resolve_user_id(user)
        context = await self._repository.get_render_context(quote_id, user_id)
        if context is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        await self._attach_logo_data_uri(context)

        try:
            pdf_bytes = await asyncio.to_thread(self._pdf.render, context)
        except PdfRenderError as exc:
            raise QuoteServiceError(detail=str(exc), status_code=422) from exc

        await self._repository.mark_ready_if_not_shared(quote_id=quote_id, user_id=user_id)
        await self._repository.commit()
        log_event("quote_pdf_generated", user_id=user_id, quote_id=quote_id)
        return context.doc_number, pdf_bytes

    async def generate_shared_pdf(self, share_token: str) -> tuple[str, bytes]:
        """Render and return a publicly shared quote PDF by token."""
        context = await self._get_public_quote_context(share_token)
        await self._attach_logo_data_uri(context)

        try:
            pdf_bytes = await asyncio.to_thread(self._pdf.render, context)
        except PdfRenderError as exc:
            raise QuoteServiceError(detail=str(exc), status_code=422) from exc

        await self._mark_public_quote_viewed_once(context, share_token)
        return context.doc_number, pdf_bytes

    async def get_public_quote(self, share_token: str) -> QuoteRenderContext:
        """Return public quote data and apply the first shared->viewed transition once."""
        context = await self._get_public_quote_context(share_token)
        await self._mark_public_quote_viewed_once(context, share_token)
        return context

    async def get_public_logo(self, share_token: str) -> tuple[bytes, str]:
        """Return public logo bytes/content type for one shared quote token."""
        context = await self._get_public_quote_context(share_token)
        if context.logo_path is None:
            raise QuoteServiceError(detail="Logo not found", status_code=404)

        try:
            logo_bytes = await asyncio.to_thread(
                self._storage_service.fetch_bytes,
                context.logo_path,
            )
        except StorageNotFoundError as exc:
            raise QuoteServiceError(detail="Logo not found", status_code=404) from exc
        except Exception as exc:  # noqa: BLE001
            raise QuoteServiceError(detail="Unable to load logo", status_code=500) from exc

        content_type = detect_image_content_type(logo_bytes)
        if content_type is None:
            raise QuoteServiceError(detail="Unable to load logo", status_code=500)

        return logo_bytes, content_type

    async def _get_public_quote_context(self, share_token: str) -> QuoteRenderContext:
        """Load public quote context for a share token or raise a 404."""
        context = await self._repository.get_render_context_by_share_token(share_token)
        if context is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        return context

    async def _mark_public_quote_viewed_once(
        self,
        context: QuoteRenderContext,
        share_token: str,
    ) -> None:
        """Advance a shared public quote to viewed and log the first successful access."""
        if context.status != QuoteStatus.SHARED.value:
            return

        transition = await self._repository.transition_to_viewed_by_share_token(share_token)
        if transition is not None:
            await self._repository.commit()
            self._log_public_quote_viewed(transition)
            context.status = QuoteStatus.VIEWED.value
            return

        refreshed_context = await self._repository.get_render_context_by_share_token(share_token)
        if refreshed_context is not None:
            context.status = refreshed_context.status

    def _log_public_quote_viewed(self, transition: QuoteViewTransition) -> None:
        """Emit the first public quote view event."""
        log_event(
            "quote_viewed",
            user_id=transition.user_id,
            quote_id=transition.quote_id,
            customer_id=transition.customer_id,
        )

    async def share_quote(self, user: User, quote_id: UUID) -> Document:
        """Set share token/timestamp and transition quote status to shared."""
        user_id = _resolve_user_id(user)
        quote = await self._repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if quote.status in _POST_SHARE_NON_REGRESSION_STATUSES:
            return quote

        if quote.share_token is None:
            quote.share_token = str(uuid4())

        quote.shared_at = _utcnow()
        quote.status = QuoteStatus.SHARED
        await self._repository.commit()
        refreshed_quote = await self._repository.refresh(quote)
        log_event(
            "quote_shared",
            user_id=user_id,
            quote_id=refreshed_quote.id,
            customer_id=refreshed_quote.customer_id,
        )
        return refreshed_quote

    async def mark_quote_outcome(
        self,
        user: User,
        quote_id: UUID,
        outcome: Literal["approved", "declined"],
    ) -> Document:
        """Record a contractor-confirmed quote outcome for a shared/viewed quote."""
        user_id = _resolve_user_id(user)
        quote = await self._repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if quote.status in _TERMINAL_QUOTE_STATUSES:
            raise QuoteServiceError(
                detail="Quote outcome has already been recorded",
                status_code=409,
            )
        if quote.status in {QuoteStatus.DRAFT, QuoteStatus.READY}:
            raise QuoteServiceError(
                detail="Quote has not been shared yet",
                status_code=409,
            )

        next_status = QuoteStatus.APPROVED if outcome == "approved" else QuoteStatus.DECLINED
        event_name = "quote_approved" if outcome == "approved" else "quote_marked_lost"
        updated_quote = await self._repository.set_quote_outcome(
            quote_id=quote_id,
            user_id=user_id,
            status=next_status,
            allowed_current_statuses=(QuoteStatus.SHARED, QuoteStatus.VIEWED),
        )
        if updated_quote is None:
            raise QuoteServiceError(
                detail="Quote outcome has already been recorded",
                status_code=409,
            )

        await self._repository.commit()
        refreshed_quote = await self._repository.refresh(updated_quote)
        log_event(
            event_name,
            user_id=user_id,
            quote_id=refreshed_quote.id,
            customer_id=refreshed_quote.customer_id,
        )
        return refreshed_quote

    async def _attach_logo_data_uri(self, context: QuoteRenderContext) -> None:
        if context.logo_path is None:
            context.logo_data_uri = None
            return

        try:
            logo_bytes = await asyncio.to_thread(
                self._storage_service.fetch_bytes,
                context.logo_path,
            )
        except StorageNotFoundError:
            LOGGER.warning("Quote logo missing in storage; omitting from PDF render")
            context.logo_data_uri = None
            return
        except Exception:  # noqa: BLE001
            LOGGER.warning("Failed to load quote logo for PDF render; omitting logo", exc_info=True)
            context.logo_data_uri = None
            return

        content_type = detect_image_content_type(logo_bytes)
        if content_type is None:
            LOGGER.warning("Quote logo bytes were invalid; omitting from PDF render")
            context.logo_data_uri = None
            return

        encoded_logo = base64.b64encode(logo_bytes).decode("ascii")
        context.logo_data_uri = f"data:{content_type};base64,{encoded_logo}"


def _resolve_user_id(user: User) -> UUID:
    """Resolve user id without triggering async lazy loads on detached ORM instances."""
    identity = sa_inspect(user).identity
    if identity and identity[0] is not None:
        return cast(UUID, identity[0])
    return user.id


def _is_doc_sequence_collision(exc: IntegrityError) -> bool:
    """Return true when IntegrityError was caused by doc-sequence uniqueness collision."""
    message = str(exc.orig)
    return "uq_documents_user_type_sequence" in message


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _validate_document_pricing_for_quote(
    *,
    total_amount: float | None,
    line_items: Sequence[object] | None,
    discount_type: str | None,
    discount_value: float | None,
    tax_rate: float | None,
    deposit_amount: float | None,
):
    try:
        return validate_document_pricing_input(
            total_amount=total_amount,
            line_items=line_items,
            discount_type=discount_type,
            discount_value=discount_value,
            tax_rate=tax_rate,
            deposit_amount=deposit_amount,
        )
    except PricingValidationError as exc:
        raise QuoteServiceError(detail=str(exc), status_code=422) from exc
