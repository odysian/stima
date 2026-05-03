"""Invoice service facade for invoice domain orchestration.

`InvoiceService` is the stable public entrypoint for routes and sibling
orchestrators. Write/side-effect behavior is delegated to behavior-slice
collaborators (creation/share/pdf_artifacts/mutation/outcomes), while read-side
list/detail access intentionally remains on the facade.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Protocol, cast
from uuid import UUID

from arq.connections import ArqRedis
from sqlalchemy import inspect as sa_inspect

from app.features.auth.models import User
from app.features.invoices.creation import InvoiceCreationService
from app.features.invoices.mutation import InvoiceMutationService
from app.features.invoices.outcomes import InvoiceOutcomeService
from app.features.invoices.pdf_artifacts import InvoicePdfArtifactService
from app.features.invoices.repository import (
    InvoiceDetailRow,
    InvoiceFirstViewTransition,
    InvoiceListItemSummary,
    InvoicePublicShareRecord,
    InvoiceRepository,
)
from app.features.invoices.schemas import (
    InvoiceBulkActionRequest,
    InvoiceBulkActionResponse,
    InvoiceCreateRequest,
    InvoiceUpdateRequest,
)
from app.features.invoices.share import InvoiceShareService
from app.features.jobs.models import JobRecord
from app.features.jobs.service import JobService
from app.features.quotes.models import Document
from app.features.quotes.repository import QuoteRenderContext
from app.features.quotes.schemas import BulkActionAppliedItem, BulkActionBlockedItem, LineItemDraft
from app.features.quotes.service import QuoteRepositoryProtocol, QuoteServiceError
from app.integrations.storage import StorageServiceProtocol

_INVOICE_DOC_TYPE = "invoice"


class InvoiceRepositoryProtocol(Protocol):
    """Structural protocol for invoice repository dependencies."""

    async def customer_exists_for_user(self, *, user_id: UUID, customer_id: UUID) -> bool: ...

    async def get_by_id(self, invoice_id: UUID, user_id: UUID) -> Document | None: ...
    async def get_owned_document_by_id(
        self,
        document_id: UUID,
        user_id: UUID,
    ) -> Document | None: ...

    async def list_by_user(
        self,
        user_id: UUID,
        customer_id: UUID | None = None,
        archived: bool = False,
    ) -> list[InvoiceListItemSummary]: ...

    async def get_by_source_document_id(
        self,
        *,
        source_document_id: UUID,
        user_id: UUID,
    ) -> Document | None: ...

    async def get_detail_by_id(
        self,
        invoice_id: UUID,
        user_id: UUID,
    ) -> InvoiceDetailRow | None: ...

    async def get_render_context(
        self,
        invoice_id: UUID,
        user_id: UUID,
    ) -> QuoteRenderContext | None: ...

    async def get_render_context_by_share_token(
        self,
        share_token: str,
    ) -> QuoteRenderContext | None: ...

    async def get_public_share_record(
        self,
        share_token: str,
    ) -> InvoicePublicShareRecord | None: ...

    async def mark_first_public_view_by_share_token(
        self,
        share_token: str,
        *,
        viewed_at: datetime,
    ) -> InvoiceFirstViewTransition | None: ...

    async def touch_last_public_accessed_at_by_share_token(
        self,
        share_token: str,
        *,
        accessed_at: datetime,
    ) -> None: ...

    async def create_from_quote(
        self,
        *,
        source_quote: Document,
        due_date: date,
    ) -> Document: ...

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
    ) -> Document: ...

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
    ) -> Document: ...

    async def invalidate_pdf_artifact(self, invoice: Document) -> str | None: ...
    async def archive_by_id(self, *, invoice_id: UUID, user_id: UUID) -> bool: ...
    async def unarchive_by_id(self, *, invoice_id: UUID, user_id: UUID) -> bool: ...

    async def mark_ready_if_draft(self, *, invoice_id: UUID, user_id: UUID) -> None: ...

    async def get_next_doc_sequence_for_type(self, *, user_id: UUID, doc_type: str) -> int: ...

    async def commit(self) -> None: ...

    async def refresh(self, invoice: Document) -> Document: ...

    async def rollback(self) -> None: ...


class PdfIntegrationProtocol(Protocol):
    """Structural protocol for PDF rendering integration dependency."""

    def render(self, context: QuoteRenderContext) -> bytes: ...


class InvoiceService:
    """Stable invoice facade coordinating slice collaborators and read-side calls."""

    def __init__(
        self,
        *,
        invoice_repository: InvoiceRepositoryProtocol,
        quote_repository: QuoteRepositoryProtocol,
        pdf_integration: PdfIntegrationProtocol,
        storage_service: StorageServiceProtocol,
    ) -> None:
        self._invoice_repository = invoice_repository
        self._quote_repository = quote_repository
        self._pdf = pdf_integration
        self._storage_service = storage_service
        self._creation_service = InvoiceCreationService(
            invoice_repository=invoice_repository,
            quote_repository=quote_repository,
        )
        self._share_service = InvoiceShareService(
            repository=invoice_repository,
            pdf_integration=pdf_integration,
            storage_service=storage_service,
        )
        self._pdf_artifact_service = InvoicePdfArtifactService(
            repository=invoice_repository,
            storage_service=storage_service,
        )
        self._mutation_service = InvoiceMutationService(
            repository=invoice_repository,
            delete_obsolete_artifact=self._pdf_artifact_service.delete_obsolete_artifact,
        )
        self._outcome_service = InvoiceOutcomeService(repository=invoice_repository)

    async def create_invoice(self, user: User, data: InvoiceCreateRequest) -> Document:
        """Create a direct invoice and retry once on sequence collisions."""
        return await self._creation_service.create_invoice(
            user_id=_resolve_user_id(user),
            data=data,
        )

    async def list_invoices(
        self,
        user: User,
        customer_id: UUID | None = None,
        archived: bool = False,
    ) -> list[InvoiceListItemSummary]:
        """List invoices for the authenticated user."""
        return await self._invoice_repository.list_by_user(
            _resolve_user_id(user),
            customer_id=customer_id,
            archived=archived,
        )

    async def convert_quote_to_invoice(self, user: User, quote_id: UUID) -> Document:
        """Create one invoice from a quote unless a linked invoice already exists."""
        return await self._creation_service.convert_quote_to_invoice(
            user_id=_resolve_user_id(user),
            quote_id=quote_id,
        )

    async def get_invoice_detail(self, user: User, invoice_id: UUID) -> InvoiceDetailRow:
        """Return one user-owned invoice detail row or raise not found."""
        row = await self._invoice_repository.get_detail_by_id(
            invoice_id,
            _resolve_user_id(user),
        )
        if row is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        return row

    async def mark_invoice_paid(self, user: User, invoice_id: UUID) -> Document:
        """Mark one invoice as paid without changing share/access capabilities."""
        return await self._outcome_service.mark_invoice_paid(
            user_id=_resolve_user_id(user),
            invoice_id=invoice_id,
        )

    async def mark_invoice_voided(self, user: User, invoice_id: UUID) -> Document:
        """Mark one invoice as void without changing share/access capabilities."""
        return await self._outcome_service.mark_invoice_voided(
            user_id=_resolve_user_id(user),
            invoice_id=invoice_id,
        )

    async def update_invoice(
        self,
        user: User,
        invoice_id: UUID,
        data: InvoiceUpdateRequest,
    ) -> Document:
        """Delegate invoice patch behavior to the mutation lifecycle slice."""
        return await self._mutation_service.update_invoice(
            user_id=_resolve_user_id(user),
            invoice_id=invoice_id,
            data=data,
        )

    async def execute_bulk_action(
        self,
        user: User,
        payload: InvoiceBulkActionRequest,
    ) -> InvoiceBulkActionResponse:
        """Execute one invoice-scoped bulk archive/unarchive/delete action."""
        user_id = _resolve_user_id(user)
        unique_ids = _dedupe_ids(payload.ids)
        applied: list[BulkActionAppliedItem] = []
        blocked: list[BulkActionBlockedItem] = []

        for document_id in unique_ids:
            document = await self._invoice_repository.get_owned_document_by_id(document_id, user_id)
            if document is None:
                blocked.append(
                    BulkActionBlockedItem(
                        id=document_id,
                        reason="not_found",
                        message="Document not found.",
                    )
                )
                continue
            if document.doc_type != _INVOICE_DOC_TYPE:
                blocked.append(
                    BulkActionBlockedItem(
                        id=document_id,
                        reason="unsupported_document_type",
                        message="Only invoices can be changed from this endpoint.",
                    )
                )
                continue

            if payload.action == "delete":
                blocked.append(
                    BulkActionBlockedItem(
                        id=document_id,
                        reason="invoice_delete_not_supported",
                        message="Invoices cannot be deleted in this version.",
                    )
                )
                continue

            if payload.action == "archive":
                if document.archived_at is not None:
                    blocked.append(
                        BulkActionBlockedItem(
                            id=document_id,
                            reason="already_archived",
                            message="Invoice is already archived.",
                        )
                    )
                    continue

                archived = await self._invoice_repository.archive_by_id(
                    invoice_id=document_id,
                    user_id=user_id,
                )
                if not archived:
                    blocked.append(
                        BulkActionBlockedItem(
                            id=document_id,
                            reason="already_archived",
                            message="Invoice is already archived.",
                        )
                    )
                    continue
            else:
                if document.archived_at is None:
                    blocked.append(
                        BulkActionBlockedItem(
                            id=document_id,
                            reason="not_archived",
                            message="Invoice is not archived.",
                        )
                    )
                    continue

                unarchived = await self._invoice_repository.unarchive_by_id(
                    invoice_id=document_id,
                    user_id=user_id,
                )
                if not unarchived:
                    blocked.append(
                        BulkActionBlockedItem(
                            id=document_id,
                            reason="not_archived",
                            message="Invoice is not archived.",
                        )
                    )
                    continue

            await self._invoice_repository.commit()
            applied.append(BulkActionAppliedItem(id=document_id))

        return InvoiceBulkActionResponse(action=payload.action, applied=applied, blocked=blocked)

    async def start_pdf_generation(
        self,
        user: User,
        invoice_id: UUID,
        *,
        job_service: JobService,
        arq_pool: ArqRedis | None,
    ) -> JobRecord:
        """Create or reuse a durable invoice PDF job for the current artifact revision."""
        return await self._pdf_artifact_service.start_pdf_generation(
            user_id=_resolve_user_id(user),
            invoice_id=invoice_id,
            job_service=job_service,
            arq_pool=arq_pool,
        )

    async def get_pdf_artifact(self, user: User, invoice_id: UUID) -> tuple[str, bytes]:
        """Return one persisted invoice PDF artifact or a stable not-ready error."""
        return await self._pdf_artifact_service.get_pdf_artifact(
            user_id=_resolve_user_id(user),
            invoice_id=invoice_id,
        )

    async def share_invoice(
        self,
        user: User,
        invoice_id: UUID,
        *,
        regenerate: bool = False,
    ) -> Document:
        """Create/reuse a share token without regressing paid/void outcome labels."""
        return await self._share_service.share_invoice(
            user_id=_resolve_user_id(user),
            invoice_id=invoice_id,
            regenerate=regenerate,
        )

    async def revoke_public_share(self, user: User, invoice_id: UUID) -> None:
        """Revoke the currently active public share token for one invoice."""
        await self._share_service.revoke_public_share(
            user_id=_resolve_user_id(user),
            invoice_id=invoice_id,
        )

    async def generate_shared_pdf(self, share_token: str) -> tuple[str, bytes]:
        """Render and return one shared invoice PDF by share token."""
        return await self._share_service.generate_shared_pdf(share_token)

    async def get_public_invoice(self, share_token: str) -> QuoteRenderContext:
        """Return public invoice data and emit the first-view event exactly once."""
        return await self._share_service.get_public_invoice(share_token)

    async def get_public_logo(self, share_token: str) -> tuple[bytes, str]:
        """Return public logo bytes/content type for one shared invoice token."""
        return await self._share_service.get_public_logo(share_token)


def get_invoice_repository(db_repository: InvoiceRepository) -> InvoiceRepository:
    """Identity helper used for typing in tests when needed."""
    return db_repository


def _resolve_user_id(user: User) -> UUID:
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
