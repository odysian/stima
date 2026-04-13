"""Quote service orchestration."""

from __future__ import annotations

import logging
import re
from collections.abc import Sequence
from datetime import datetime
from typing import Literal, Protocol, cast
from uuid import UUID

from arq.connections import ArqRedis
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.exc import IntegrityError

from app.features.auth.models import User
from app.features.jobs.models import JobRecord
from app.features.jobs.service import JobService
from app.features.quotes.deletion import QuoteDeletionService
from app.features.quotes.errors import QuoteServiceError
from app.features.quotes.extraction_outcomes import classify_extraction_result
from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.mutation import QuoteMutationService
from app.features.quotes.outcomes import QuoteOutcomeService
from app.features.quotes.pdf_artifacts import QuotePdfArtifactService
from app.features.quotes.repository import (
    PublicShareRecord,
    QuoteDetailRow,
    QuoteListItemSummary,
    QuoteRenderContext,
    QuoteViewTransition,
)
from app.features.quotes.schemas import (
    ExtractionResult,
    LineItemDraft,
    QuoteCreateRequest,
    QuoteUpdateRequest,
)
from app.features.quotes.share import QuoteShareService
from app.integrations.storage import StorageServiceProtocol
from app.shared.event_logger import log_event
from app.shared.pricing import (
    PricingValidationError,
    derive_document_subtotal_from_line_items,
    document_field_float_or_none,
    resolve_document_subtotal_for_edit,
    validate_document_pricing_input,
)

LOGGER = logging.getLogger(__name__)
_TERMINAL_QUOTE_STATUSES = frozenset({QuoteStatus.APPROVED, QuoteStatus.DECLINED})
_CUSTOMER_ASSIGNMENT_REQUIRED_DETAIL = "Assign a customer before continuing."
_APPENDABLE_QUOTE_STATUSES = frozenset(
    {
        QuoteStatus.DRAFT,
        QuoteStatus.READY,
        QuoteStatus.SHARED,
        QuoteStatus.VIEWED,
        QuoteStatus.APPROVED,
        QuoteStatus.DECLINED,
    }
)
_APPEND_UNAVAILABLE_DETAIL = "This quote can no longer be edited."
_APPEND_TRANSCRIPT_SEPARATOR_PATTERN = re.compile(r"(?:^|\n\n)Added later(?: \(\d+\))?:\n")
_APPEND_TRANSCRIPT_BULLET_PREFIXES = ("- ", "* ")


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

    async def has_linked_invoice(
        self,
        *,
        source_document_id: UUID,
        user_id: UUID,
    ) -> bool: ...

    async def get_next_doc_sequence_for_type(self, *, user_id: UUID, doc_type: str) -> int: ...

    async def get_render_context(
        self, quote_id: UUID, user_id: UUID
    ) -> QuoteRenderContext | None: ...

    async def get_render_context_by_share_token(
        self, share_token: str
    ) -> QuoteRenderContext | None: ...

    async def transition_to_viewed_by_share_token(
        self,
        share_token: str,
        *,
        accessed_at: datetime,
    ) -> QuoteViewTransition | None: ...

    async def get_public_share_record(self, share_token: str) -> PublicShareRecord | None: ...

    async def touch_last_public_accessed_at_by_share_token(
        self,
        share_token: str,
        *,
        accessed_at: datetime,
    ) -> None: ...

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
    ) -> Document: ...

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
    ) -> Document: ...

    async def invalidate_pdf_artifact(self, document: Document) -> str | None: ...

    async def append_extraction(
        self,
        *,
        document: Document,
        transcript: str,
        total_amount: float | None,
        line_items: list[LineItemDraft],
        extraction_tier: str | None = None,
        extraction_degraded_reason_code: str | None = None,
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
        storage_service: StorageServiceProtocol,
    ) -> None:
        self._repository = repository
        self._pdf = pdf_integration
        self._storage_service = storage_service
        self._share_service = QuoteShareService(
            repository=repository,
            pdf_integration=pdf_integration,
            storage_service=storage_service,
            ensure_quote_customer_assigned=ensure_quote_customer_assigned,
        )
        self._pdf_artifact_service = QuotePdfArtifactService(
            repository=repository,
            storage_service=storage_service,
            ensure_quote_customer_assigned=ensure_quote_customer_assigned,
        )
        self._mutation_service = QuoteMutationService(
            repository=repository,
            delete_obsolete_artifact=self._delete_obsolete_artifact,
            ensure_quote_customer_assigned=ensure_quote_customer_assigned,
        )
        self._deletion_service = QuoteDeletionService(repository=repository)
        self._outcome_service = QuoteOutcomeService(repository=repository)

    async def create_quote(self, user: User, data: QuoteCreateRequest) -> Document:
        """Create a user-owned quote and retry once on sequence collisions."""
        user_id = _resolve_user_id(user)
        await self.ensure_customer_exists_for_user(
            user_id=user_id,
            customer_id=data.customer_id,
        )

        validated_pricing = _validate_document_pricing_for_quote(
            total_amount=data.total_amount,
            line_items=data.line_items,
            discount_type=data.discount_type,
            discount_value=data.discount_value,
            tax_rate=data.tax_rate,
            deposit_amount=data.deposit_amount,
        )

        quote = await _create_quote_document(
            self,
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

    async def ensure_customer_exists_for_user(
        self,
        *,
        user_id: UUID,
        customer_id: UUID | None,
    ) -> None:
        """Reject missing or foreign customer ids when one is supplied."""
        if customer_id is None:
            return
        customer_exists = await self._repository.customer_exists_for_user(
            user_id=user_id,
            customer_id=customer_id,
        )
        if not customer_exists:
            raise QuoteServiceError(detail="Not found", status_code=404)

    async def create_extracted_draft(
        self,
        *,
        user_id: UUID,
        customer_id: UUID | None,
        extraction_result: ExtractionResult,
        source_type: Literal["text", "voice"],
        commit: bool = True,
    ) -> Document:
        """Persist one extraction result as a draft quote."""
        await self.ensure_customer_exists_for_user(
            user_id=user_id,
            customer_id=customer_id,
        )
        extraction_metadata = classify_extraction_result(extraction_result)
        try:
            quote = await _create_quote_document(
                self,
                user_id=user_id,
                customer_id=customer_id,
                title=None,
                transcript=extraction_result.transcript,
                line_items=[
                    LineItemDraft(
                        description=item.description,
                        details=item.details,
                        price=item.price,
                    )
                    for item in extraction_result.line_items
                ],
                total_amount=extraction_result.total,
                tax_rate=None,
                discount_type=None,
                discount_value=None,
                deposit_amount=None,
                notes=None,
                source_type=source_type,
                extraction_tier=extraction_metadata.tier,
                extraction_degraded_reason_code=extraction_metadata.degraded_reason_code,
            )
        except QuoteServiceError:
            raise
        except Exception as exc:  # noqa: BLE001
            await self._repository.rollback()
            raise QuoteServiceError(
                detail="Unable to save extracted draft right now. Please try again.",
                status_code=503,
            ) from exc
        if not commit:
            return quote

        try:
            await self._repository.commit()
        except Exception as exc:  # noqa: BLE001
            await self._repository.rollback()
            raise QuoteServiceError(
                detail="Unable to save extracted draft right now. Please try again.",
                status_code=503,
            ) from exc
        return quote

    async def create_manual_draft(
        self,
        *,
        user_id: UUID,
        customer_id: UUID | None,
    ) -> Document:
        """Persist one blank draft quote without running extraction."""
        await self.ensure_customer_exists_for_user(
            user_id=user_id,
            customer_id=customer_id,
        )
        try:
            quote = await _create_quote_document(
                self,
                user_id=user_id,
                customer_id=customer_id,
                title=None,
                transcript="",
                line_items=[],
                total_amount=None,
                tax_rate=None,
                discount_type=None,
                discount_value=None,
                deposit_amount=None,
                notes=None,
                source_type="text",
            )
        except QuoteServiceError:
            raise
        except Exception as exc:  # noqa: BLE001
            await self._repository.rollback()
            raise QuoteServiceError(
                detail="Unable to save manual draft right now. Please try again.",
                status_code=503,
            ) from exc

        try:
            await self._repository.commit()
        except Exception as exc:  # noqa: BLE001
            await self._repository.rollback()
            raise QuoteServiceError(
                detail="Unable to save manual draft right now. Please try again.",
                status_code=503,
            ) from exc

        return quote

    async def ensure_quote_appendable(
        self,
        *,
        user_id: UUID,
        quote_id: UUID,
    ) -> Document:
        """Return one owned quote that can accept append extraction updates."""
        quote = await self._repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if quote.status not in _APPENDABLE_QUOTE_STATUSES:
            raise QuoteServiceError(detail=_APPEND_UNAVAILABLE_DETAIL, status_code=409)
        return quote

    async def append_extraction_to_quote(
        self,
        *,
        user_id: UUID,
        quote_id: UUID,
        extraction_result: ExtractionResult,
        commit: bool = True,
    ) -> tuple[Document, ExtractionResult]:
        """Append extraction output onto an existing persisted quote."""
        quote = await self.ensure_quote_appendable(user_id=user_id, quote_id=quote_id)
        appended_line_items = [
            LineItemDraft(
                description=item.description,
                details=item.details,
                price=item.price,
            )
            for item in extraction_result.line_items
        ]
        merged_line_items = [
            *[
                LineItemDraft(
                    description=line_item.description,
                    details=line_item.details,
                    price=document_field_float_or_none(line_item.price),
                )
                for line_item in quote.line_items
            ],
            *appended_line_items,
        ]
        line_items_define_subtotal, derived_line_item_subtotal = (
            derive_document_subtotal_from_line_items(merged_line_items)
        )
        current_subtotal = resolve_document_subtotal_for_edit(
            total_amount=quote.total_amount,
            discount_type=quote.discount_type,
            discount_value=quote.discount_value,
            tax_rate=quote.tax_rate,
            deposit_amount=quote.deposit_amount,
            line_items=merged_line_items,
        )
        validated_pricing = _validate_document_pricing_for_quote(
            total_amount=(
                derived_line_item_subtotal if line_items_define_subtotal else current_subtotal
            ),
            line_items=merged_line_items,
            discount_type=quote.discount_type,
            discount_value=document_field_float_or_none(quote.discount_value),
            tax_rate=document_field_float_or_none(quote.tax_rate),
            deposit_amount=document_field_float_or_none(quote.deposit_amount),
        )

        next_transcript = _merge_append_transcript(
            current_transcript=quote.transcript,
            appended_transcript=extraction_result.transcript,
        )
        extraction_metadata = classify_extraction_result(extraction_result)
        updated_quote = await self._repository.append_extraction(
            document=quote,
            transcript=next_transcript,
            total_amount=document_field_float_or_none(validated_pricing.total_amount),
            line_items=appended_line_items,
            extraction_tier=extraction_metadata.tier,
            extraction_degraded_reason_code=extraction_metadata.degraded_reason_code,
        )
        obsolete_artifact_path = await self._repository.invalidate_pdf_artifact(updated_quote)
        if not commit:
            return updated_quote, extraction_result

        await self._repository.commit()
        await self._delete_obsolete_artifact(obsolete_artifact_path)
        return await self._repository.refresh(updated_quote), extraction_result

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
        """Delegate quote patch behavior to the mutation lifecycle slice."""
        return await self._mutation_service.update_quote(
            user_id=_resolve_user_id(user),
            quote_id=quote_id,
            data=data,
        )

    async def delete_quote(self, user: User, quote_id: UUID) -> None:
        """Delegate owner-facing quote deletion to the deletion lifecycle slice."""
        await self._deletion_service.delete_quote(
            user_id=_resolve_user_id(user),
            quote_id=quote_id,
        )

    async def start_pdf_generation(
        self,
        user: User,
        quote_id: UUID,
        *,
        job_service: JobService,
        arq_pool: ArqRedis | None,
    ) -> JobRecord:
        """Create or reuse a durable quote PDF job for the current artifact revision."""
        user_id = _resolve_user_id(user)
        return await self._pdf_artifact_service.start_pdf_generation(
            user_id=user_id,
            quote_id=quote_id,
            job_service=job_service,
            arq_pool=arq_pool,
        )

    async def get_pdf_artifact(self, user: User, quote_id: UUID) -> tuple[str, bytes]:
        """Return one persisted quote PDF artifact or a stable not-ready error."""
        return await self._pdf_artifact_service.get_pdf_artifact(
            user_id=_resolve_user_id(user),
            quote_id=quote_id,
        )

    async def generate_shared_pdf(self, share_token: str) -> tuple[str, bytes]:
        """Render and return a publicly shared quote PDF by token."""
        return await self._share_service.generate_shared_pdf(share_token)

    async def get_public_quote(self, share_token: str) -> QuoteRenderContext:
        """Return public quote data and apply the first shared->viewed transition once."""
        return await self._share_service.get_public_quote(share_token)

    async def get_public_logo(self, share_token: str) -> tuple[bytes, str]:
        """Return public logo bytes/content type for one shared quote token."""
        return await self._share_service.get_public_logo(share_token)

    async def _delete_obsolete_artifact(self, object_path: str | None) -> None:
        await self._pdf_artifact_service.delete_obsolete_artifact(object_path)

    async def share_quote(
        self,
        user: User,
        quote_id: UUID,
        *,
        regenerate: bool = False,
    ) -> Document:
        """Delegate owner-facing share lifecycle behavior to the share slice."""
        user_id = _resolve_user_id(user)
        return await self._share_service.share_quote(
            user_id=user_id,
            quote_id=quote_id,
            regenerate=regenerate,
        )

    async def revoke_public_share(self, user: User, quote_id: UUID) -> None:
        """Delegate owner-facing share revocation behavior to the share slice."""
        user_id = _resolve_user_id(user)
        await self._share_service.revoke_public_share(
            user_id=user_id,
            quote_id=quote_id,
        )

    async def mark_quote_outcome(
        self,
        user: User,
        quote_id: UUID,
        outcome: Literal["approved", "declined"],
    ) -> Document:
        """Delegate quote outcome lifecycle behavior to the outcome slice."""
        return await self._outcome_service.mark_quote_outcome(
            user_id=_resolve_user_id(user),
            quote_id=quote_id,
            outcome=outcome,
        )


async def _create_quote_document(
    service: QuoteService,
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
    source_type: Literal["text", "voice"],
    extraction_tier: str | None = None,
    extraction_degraded_reason_code: str | None = None,
) -> Document:
    for attempt in range(2):
        try:
            return await service._repository.create(
                user_id=user_id,
                customer_id=customer_id,
                title=title,
                transcript=transcript,
                line_items=line_items,
                total_amount=total_amount,
                tax_rate=tax_rate,
                discount_type=discount_type,
                discount_value=discount_value,
                deposit_amount=deposit_amount,
                notes=notes,
                source_type=source_type,
                extraction_tier=extraction_tier,
                extraction_degraded_reason_code=extraction_degraded_reason_code,
            )
        except IntegrityError as exc:
            await service._repository.rollback()
            if attempt == 0 and _is_doc_sequence_collision(exc):
                continue
            raise

    raise QuoteServiceError(detail="Unable to create quote", status_code=409)


def _resolve_user_id(user: User) -> UUID:
    """Resolve user id without triggering async lazy loads on detached ORM instances."""
    identity = sa_inspect(user).identity
    if identity and identity[0] is not None:
        return cast(UUID, identity[0])
    return user.id


def ensure_quote_customer_assigned(quote: Document) -> None:
    """Reject customer-dependent quote actions until a customer is assigned."""
    if quote.customer_id is None:
        raise QuoteServiceError(
            detail=_CUSTOMER_ASSIGNMENT_REQUIRED_DETAIL,
            status_code=409,
        )


def _is_doc_sequence_collision(exc: IntegrityError) -> bool:
    """Return true when IntegrityError was caused by doc-sequence uniqueness collision."""
    message = str(exc.orig)
    return "uq_documents_user_type_sequence" in message


def build_doc_number(*, doc_type: str, sequence: int) -> str:
    prefix = "I" if doc_type == "invoice" else "Q"
    return f"{prefix}-{sequence:03d}"


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


def _merge_append_transcript(*, current_transcript: str, appended_transcript: str) -> str:
    normalized_current = current_transcript.rstrip()
    appended_entries = _extract_append_entries(appended_transcript)

    if not normalized_current:
        if not appended_entries:
            return ""
        return "Added later:\n" + "\n".join(f"- {entry}" for entry in appended_entries)

    base_transcript, existing_entries = _split_transcript_and_append_entries(normalized_current)
    merged_entries = [*existing_entries, *appended_entries]
    if not merged_entries:
        return base_transcript

    append_section = "Added later:\n" + "\n".join(f"- {entry}" for entry in merged_entries)
    if not base_transcript:
        return append_section
    return f"{base_transcript}\n\n{append_section}"


def _split_transcript_and_append_entries(current_transcript: str) -> tuple[str, list[str]]:
    matches = list(_APPEND_TRANSCRIPT_SEPARATOR_PATTERN.finditer(current_transcript))
    if not matches:
        return current_transcript, []

    base_transcript = current_transcript[: matches[0].start()].rstrip()
    entries: list[str] = []
    for index, match in enumerate(matches):
        body_start = match.end()
        body_end = (
            matches[index + 1].start() if index + 1 < len(matches) else len(current_transcript)
        )
        section_body = current_transcript[body_start:body_end]
        entries.extend(_extract_append_entries(section_body))

    return base_transcript, entries


def _extract_append_entries(transcript: str) -> list[str]:
    entries: list[str] = []
    for raw_line in transcript.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        for prefix in _APPEND_TRANSCRIPT_BULLET_PREFIXES:
            if line.startswith(prefix):
                line = line[len(prefix) :].strip()
                break
        if line:
            entries.append(line)
    return entries
