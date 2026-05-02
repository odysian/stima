"""Quote service orchestration."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Literal, Protocol, cast
from uuid import UUID

from arq.connections import ArqRedis
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.exc import IntegrityError

from app.features.auth.models import User
from app.features.jobs.models import JobRecord
from app.features.jobs.service import JobService
from app.features.quotes.creation import QuoteCreationService
from app.features.quotes.deletion import QuoteDeletionService
from app.features.quotes.errors import QuoteServiceError
from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.mutation import QuoteMutationService
from app.features.quotes.outcomes import QuoteOutcomeService
from app.features.quotes.pdf_artifacts import QuotePdfArtifactService
from app.features.quotes.repository import (
    PublicShareRecord,
    QuoteDetailRow,
    QuoteListItemSummary,
    QuoteRenderContext,
    QuoteReuseCandidateSummary,
    QuoteViewTransition,
)
from app.features.quotes.schemas import (
    BulkActionAppliedItem,
    BulkActionBlockedItem,
    BulkActionRequest,
    BulkActionResponse,
    ExtractionResult,
    ExtractionReviewMetadataUpdateRequest,
    ExtractionReviewMetadataV1,
    LineItemDraft,
    QuoteCreateRequest,
    QuoteUpdateRequest,
)
from app.features.quotes.share import QuoteShareService
from app.integrations.storage import StorageServiceProtocol

LOGGER = logging.getLogger(__name__)
_TERMINAL_QUOTE_STATUSES = frozenset({QuoteStatus.APPROVED, QuoteStatus.DECLINED})
_CUSTOMER_ASSIGNMENT_REQUIRED_DETAIL = "Assign a customer before continuing."
_QUOTE_DOC_TYPE = "quote"
_NON_DELETABLE_QUOTE_STATUSES = frozenset(
    {
        QuoteStatus.SHARED,
        QuoteStatus.VIEWED,
        QuoteStatus.APPROVED,
        QuoteStatus.DECLINED,
    }
)


class QuoteRepositoryProtocol(Protocol):
    """Structural protocol for quote repository dependencies."""

    async def customer_exists_for_user(self, *, user_id: UUID, customer_id: UUID) -> bool: ...

    async def list_by_user(
        self,
        user_id: UUID,
        customer_id: UUID | None = None,
    ) -> list[QuoteListItemSummary]: ...
    async def list_reuse_candidates(
        self,
        user_id: UUID,
        *,
        customer_id: UUID | None = None,
        q: str | None = None,
    ) -> list[QuoteReuseCandidateSummary]: ...

    async def get_by_id(self, quote_id: UUID, user_id: UUID) -> Document | None: ...
    async def get_owned_document_by_id(
        self,
        document_id: UUID,
        user_id: UUID,
    ) -> Document | None: ...
    async def get_by_id_for_update(self, quote_id: UUID, user_id: UUID) -> Document | None: ...

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
        extraction_review_metadata: dict[str, Any] | None = None,
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
        extraction_review_metadata: dict[str, Any] | None = None,
        update_extraction_review_metadata: bool = False,
    ) -> Document: ...

    async def invalidate_pdf_artifact(self, document: Document) -> str | None: ...

    async def update_extraction_review_metadata(
        self,
        *,
        document: Document,
        extraction_review_metadata: dict[str, Any],
    ) -> Document: ...

    async def delete(self, document_id: UUID) -> None: ...
    async def archive_by_id(self, *, quote_id: UUID, user_id: UUID) -> bool: ...

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
        self._creation_service = QuoteCreationService(repository=repository)

    async def create_quote(self, user: User, data: QuoteCreateRequest) -> Document:
        """Delegate quote creation orchestration to the creation lifecycle slice."""
        return await self._creation_service.create_quote(
            user_id=_resolve_user_id(user),
            data=data,
        )

    async def ensure_customer_exists_for_user(
        self,
        *,
        user_id: UUID,
        customer_id: UUID | None,
    ) -> None:
        """Delegate customer ownership checks to the creation lifecycle slice."""
        await self._creation_service.ensure_customer_exists_for_user(
            user_id=user_id,
            customer_id=customer_id,
        )

    async def create_extracted_draft(
        self,
        *,
        user_id: UUID,
        customer_id: UUID | None,
        extraction_result: ExtractionResult,
        source_type: Literal["text", "voice", "voice+text"],
        commit: bool = True,
    ) -> Document:
        """Delegate extracted-draft persistence to the creation lifecycle slice."""
        return await self._creation_service.create_extracted_draft(
            user_id=user_id,
            customer_id=customer_id,
            extraction_result=extraction_result,
            source_type=source_type,
            commit=commit,
        )

    async def create_manual_draft(
        self,
        *,
        user_id: UUID,
        customer_id: UUID | None,
    ) -> Document:
        """Delegate manual-draft persistence to the creation lifecycle slice."""
        return await self._creation_service.create_manual_draft(
            user_id=user_id,
            customer_id=customer_id,
        )

    async def duplicate_quote(self, user: User, quote_id: UUID) -> Document:
        """Duplicate one user-owned quote into a new draft quote."""
        return await self._creation_service.duplicate_quote(
            user_id=_resolve_user_id(user),
            quote_id=quote_id,
        )

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

    async def list_quote_reuse_candidates(
        self,
        user: User,
        *,
        customer_id: UUID | None = None,
        q: str | None = None,
    ) -> list[QuoteReuseCandidateSummary]:
        """List quote reuse candidates with capped line-item previews."""
        return await self._repository.list_reuse_candidates(
            _resolve_user_id(user),
            customer_id=customer_id,
            q=q,
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

    async def update_extraction_review_metadata(
        self,
        user: User,
        quote_id: UUID,
        data: ExtractionReviewMetadataUpdateRequest,
    ) -> ExtractionReviewMetadataV1:
        """Delegate sidecar-only extraction review metadata updates."""
        return await self._mutation_service.update_extraction_review_metadata(
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

    async def execute_bulk_action(
        self,
        user: User,
        payload: BulkActionRequest,
    ) -> BulkActionResponse:
        """Execute one quote-scoped bulk archive/delete action with per-id outcomes."""
        user_id = _resolve_user_id(user)
        unique_ids = _dedupe_ids(payload.ids)
        applied: list[BulkActionAppliedItem] = []
        blocked: list[BulkActionBlockedItem] = []

        for document_id in unique_ids:
            document = await self._repository.get_owned_document_by_id(document_id, user_id)
            if document is None:
                blocked.append(
                    BulkActionBlockedItem(
                        id=document_id,
                        reason="not_found",
                        message="Document not found.",
                    )
                )
                continue
            if document.doc_type != _QUOTE_DOC_TYPE:
                blocked.append(
                    BulkActionBlockedItem(
                        id=document_id,
                        reason="unsupported_document_type",
                        message="Only quotes can be changed from this endpoint.",
                    )
                )
                continue

            if payload.action == "archive":
                if document.archived_at is not None:
                    blocked.append(
                        BulkActionBlockedItem(
                            id=document_id,
                            reason="already_archived",
                            message="Quote is already archived.",
                        )
                    )
                    continue
                archived = await self._repository.archive_by_id(
                    quote_id=document_id,
                    user_id=user_id,
                )
                if not archived:
                    blocked.append(
                        BulkActionBlockedItem(
                            id=document_id,
                            reason="already_archived",
                            message="Quote is already archived.",
                        )
                    )
                    continue
                await self._repository.commit()
                applied.append(BulkActionAppliedItem(id=document_id))
                continue

            if document.status in _NON_DELETABLE_QUOTE_STATUSES:
                blocked.append(
                    BulkActionBlockedItem(
                        id=document_id,
                        reason="quote_status_not_deletable",
                        message="Shared, viewed, approved, and declined quotes cannot be deleted.",
                    )
                )
                continue
            has_linked_invoice = await self._repository.has_linked_invoice(
                source_document_id=document_id,
                user_id=user_id,
            )
            if has_linked_invoice:
                blocked.append(
                    BulkActionBlockedItem(
                        id=document_id,
                        reason="linked_invoice",
                        message="Quotes with a linked invoice cannot be deleted.",
                        suggested_action="archive",
                    )
                )
                continue

            try:
                await self._repository.delete(document_id)
                await self._repository.commit()
            except IntegrityError:
                await self._repository.rollback()
                blocked.append(
                    BulkActionBlockedItem(
                        id=document_id,
                        reason="linked_invoice",
                        message="Quotes with a linked invoice cannot be deleted.",
                        suggested_action="archive",
                    )
                )
                continue
            applied.append(BulkActionAppliedItem(id=document_id))

        return BulkActionResponse(action=payload.action, applied=applied, blocked=blocked)

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


def _resolve_user_id(user: User) -> UUID:
    """Resolve user id without triggering async lazy loads on detached ORM instances."""
    identity = sa_inspect(user).identity
    if identity and identity[0] is not None:
        return cast(UUID, identity[0])
    return user.id


def _dedupe_ids(ids: list[UUID]) -> list[UUID]:
    seen: set[UUID] = set()
    deduped: list[UUID] = []
    for document_id in ids:
        if document_id in seen:
            continue
        seen.add(document_id)
        deduped.append(document_id)
    return deduped


def ensure_quote_customer_assigned(quote: Document) -> None:
    """Reject customer-dependent quote actions until a customer is assigned."""
    if quote.customer_id is None:
        raise QuoteServiceError(
            detail=_CUSTOMER_ASSIGNMENT_REQUIRED_DETAIL,
            status_code=409,
        )


def build_doc_number(*, doc_type: str, sequence: int) -> str:
    prefix = "I" if doc_type == "invoice" else "Q"
    return f"{prefix}-{sequence:03d}"
