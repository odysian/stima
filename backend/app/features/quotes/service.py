"""Quote service orchestration."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Literal, Protocol, cast
from uuid import UUID

from arq.connections import ArqRedis
from sqlalchemy import inspect as sa_inspect

from app.features.auth.models import User
from app.features.jobs.models import JobRecord
from app.features.jobs.service import JobService
from app.features.quotes.creation import QuoteCreationService
from app.features.quotes.deletion import QuoteDeletionService
from app.features.quotes.errors import QuoteServiceError
from app.features.quotes.extraction_append import QuoteExtractionAppendService
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
from app.shared.event_logger import log_event  # noqa: F401

LOGGER = logging.getLogger(__name__)
_TERMINAL_QUOTE_STATUSES = frozenset({QuoteStatus.APPROVED, QuoteStatus.DECLINED})
_CUSTOMER_ASSIGNMENT_REQUIRED_DETAIL = "Assign a customer before continuing."


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
        self._extraction_append_service = QuoteExtractionAppendService(
            repository=repository,
            delete_obsolete_artifact=self._delete_obsolete_artifact,
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
        source_type: Literal["text", "voice"],
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

    async def ensure_quote_appendable(
        self,
        *,
        user_id: UUID,
        quote_id: UUID,
    ) -> Document:
        """Return one owned quote that can accept append extraction updates."""
        return await self._extraction_append_service.ensure_quote_appendable(
            user_id=user_id,
            quote_id=quote_id,
        )

    async def append_extraction_to_quote(
        self,
        *,
        user_id: UUID,
        quote_id: UUID,
        extraction_result: ExtractionResult,
        commit: bool = True,
    ) -> tuple[Document, ExtractionResult]:
        """Delegate append extraction lifecycle behavior to the append slice."""
        return await self._extraction_append_service.append_extraction_to_quote(
            user_id=user_id,
            quote_id=quote_id,
            extraction_result=extraction_result,
            commit=commit,
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


def build_doc_number(*, doc_type: str, sequence: int) -> str:
    prefix = "I" if doc_type == "invoice" else "Q"
    return f"{prefix}-{sequence:03d}"
