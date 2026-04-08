"""Repository helper for worker-owned PDF render payload lookups."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.invoices.repository import InvoiceRepository
from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.repository import QuoteRenderContext, QuoteRepository

_QUOTE_DOC_TYPE = "quote"
_INVOICE_DOC_TYPE = "invoice"


@dataclass(frozen=True, slots=True)
class WorkerPdfDocumentSnapshot:
    """Document fields the worker needs for artifact persistence decisions."""

    document_id: UUID
    user_id: UUID
    doc_type: str
    doc_number: str
    status: str
    pdf_artifact_path: str | None
    pdf_artifact_revision: int
    pdf_artifact_job_id: UUID | None


@dataclass(frozen=True, slots=True)
class PersistedPdfArtifactResult:
    """Outcome of attempting to persist a freshly rendered PDF artifact."""

    applied: bool
    previous_path: str | None


class WorkerPdfRepository:
    """Load one PDF render context by durable job document ownership."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_render_context(
        self,
        *,
        document_id: UUID,
        user_id: UUID,
    ) -> QuoteRenderContext | None:
        """Resolve quote/invoice render context without exposing doc-type branching."""
        document_type = await self._session.scalar(
            select(Document.doc_type).where(
                Document.id == document_id,
                Document.user_id == user_id,
            )
        )
        if document_type == _QUOTE_DOC_TYPE:
            return await QuoteRepository(self._session).get_render_context(document_id, user_id)
        if document_type == _INVOICE_DOC_TYPE:
            return await InvoiceRepository(self._session).get_render_context(document_id, user_id)
        return None

    async def get_document_snapshot(
        self,
        *,
        document_id: UUID,
        user_id: UUID,
    ) -> WorkerPdfDocumentSnapshot | None:
        """Return one owned document snapshot for artifact persistence bookkeeping."""
        row = await self._session.execute(
            select(
                Document.id,
                Document.user_id,
                Document.doc_type,
                Document.doc_number,
                Document.status,
                Document.pdf_artifact_path,
                Document.pdf_artifact_revision,
                Document.pdf_artifact_job_id,
            ).where(
                Document.id == document_id,
                Document.user_id == user_id,
            )
        )
        document = row.one_or_none()
        if document is None:
            return None
        return WorkerPdfDocumentSnapshot(
            document_id=document.id,
            user_id=document.user_id,
            doc_type=document.doc_type,
            doc_number=document.doc_number,
            status=document.status.value,
            pdf_artifact_path=document.pdf_artifact_path,
            pdf_artifact_revision=document.pdf_artifact_revision,
            pdf_artifact_job_id=document.pdf_artifact_job_id,
        )

    async def persist_generated_artifact(
        self,
        *,
        document_id: UUID,
        user_id: UUID,
        job_id: UUID,
        expected_revision: int,
        artifact_path: str,
    ) -> PersistedPdfArtifactResult:
        """Persist one freshly rendered artifact when the document revision still matches."""
        document = await self._session.scalar(
            select(Document).where(
                Document.id == document_id,
                Document.user_id == user_id,
            )
        )
        if document is None:
            return PersistedPdfArtifactResult(applied=False, previous_path=None)
        if document.pdf_artifact_revision != expected_revision:
            return PersistedPdfArtifactResult(
                applied=False,
                previous_path=document.pdf_artifact_path,
            )

        previous_path = document.pdf_artifact_path
        document.pdf_artifact_path = artifact_path
        if document.pdf_artifact_job_id == job_id:
            document.pdf_artifact_job_id = None
        if document.status == QuoteStatus.DRAFT:
            document.status = QuoteStatus.READY
        await self._session.flush()
        return PersistedPdfArtifactResult(applied=True, previous_path=previous_path)
