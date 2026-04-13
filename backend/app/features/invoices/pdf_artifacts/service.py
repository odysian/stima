"""Invoice authenticated PDF artifact lifecycle coordination."""

from __future__ import annotations

import asyncio
import logging
from typing import Protocol
from uuid import UUID

from arq.connections import ArqRedis

from app.features.jobs.models import JobRecord, JobStatus, JobType
from app.features.jobs.service import JobService
from app.features.quotes.errors import QuoteServiceError
from app.features.quotes.models import Document
from app.integrations.storage import StorageNotFoundError, StorageServiceProtocol
from app.shared.pdf_artifacts import PDF_ARTIFACT_NOT_READY_DETAIL

LOGGER = logging.getLogger(__name__)
_PDF_JOB_NAME = "jobs.pdf"
_PDF_QUEUE_FAILURE_DETAIL = "Unable to start PDF generation right now. Please try again."


class InvoicePdfArtifactRepositoryProtocol(Protocol):
    """Repository behavior required by the invoice PDF artifact slice."""

    async def get_by_id(self, invoice_id: UUID, user_id: UUID) -> Document | None: ...

    async def commit(self) -> None: ...


class InvoicePdfArtifactService:
    """Own authenticated invoice PDF artifact generation and retrieval behavior."""

    def __init__(
        self,
        *,
        repository: InvoicePdfArtifactRepositoryProtocol,
        storage_service: StorageServiceProtocol,
    ) -> None:
        self._repository = repository
        self._storage_service = storage_service

    async def start_pdf_generation(
        self,
        *,
        user_id: UUID,
        invoice_id: UUID,
        job_service: JobService,
        arq_pool: ArqRedis | None,
    ) -> JobRecord:
        """Create or reuse a durable invoice PDF job for the current artifact revision."""
        invoice = await self._repository.get_by_id(invoice_id, user_id)
        if invoice is None:
            raise QuoteServiceError(detail="Not found", status_code=404)

        existing_job = await self._get_reusable_pdf_job(
            job_service=job_service,
            user_id=user_id,
            document=invoice,
        )
        if existing_job is not None:
            return existing_job

        attach_job_to_document = invoice.pdf_artifact_path is None
        job = await job_service.create_job(
            user_id=user_id,
            job_type=JobType.PDF,
            document_id=invoice.id,
            document_revision=invoice.pdf_artifact_revision,
        )
        if attach_job_to_document:
            invoice.pdf_artifact_job_id = job.id

        try:
            if arq_pool is None:
                raise RuntimeError("ARQ pool is not available")
            queued_job = await arq_pool.enqueue_job(
                _PDF_JOB_NAME,
                str(job.id),
                _job_id=str(job.id),
            )
            if queued_job is None:
                raise RuntimeError("ARQ did not accept the PDF job")
        except Exception as exc:
            LOGGER.warning("Failed to enqueue invoice PDF job %s", job.id, exc_info=True)
            if attach_job_to_document:
                invoice.pdf_artifact_job_id = None
            await job_service.mark_enqueue_failed(job.id, job_type=JobType.PDF)
            await self._repository.commit()
            raise QuoteServiceError(detail=_PDF_QUEUE_FAILURE_DETAIL, status_code=503) from exc

        await self._repository.commit()
        return job

    async def get_pdf_artifact(self, *, user_id: UUID, invoice_id: UUID) -> tuple[str, bytes]:
        """Return one persisted invoice PDF artifact or a stable not-ready error."""
        invoice = await self._repository.get_by_id(invoice_id, user_id)
        if invoice is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if invoice.pdf_artifact_path is None:
            raise QuoteServiceError(detail=PDF_ARTIFACT_NOT_READY_DETAIL, status_code=409)

        try:
            pdf_bytes = await asyncio.to_thread(
                self._storage_service.fetch_bytes,
                invoice.pdf_artifact_path,
            )
        except StorageNotFoundError as exc:
            invoice.pdf_artifact_path = None
            invoice.pdf_artifact_job_id = None
            # Keep the artifact revision unchanged here: storage-loss recovery should
            # regenerate and overwrite the same revision path, while true content
            # invalidation paths are the only flows that bump revision.
            await self._repository.commit()
            raise QuoteServiceError(detail=PDF_ARTIFACT_NOT_READY_DETAIL, status_code=409) from exc
        except Exception as exc:  # noqa: BLE001
            raise QuoteServiceError(detail="Unable to load PDF artifact", status_code=500) from exc

        return invoice.doc_number, pdf_bytes

    async def delete_obsolete_artifact(self, object_path: str | None) -> None:
        """Best-effort cleanup for obsolete invoice PDF artifact storage objects."""
        if object_path is None:
            return
        try:
            await asyncio.to_thread(self._storage_service.delete, object_path)
        except Exception:  # noqa: BLE001
            LOGGER.warning("Failed to delete invalidated invoice PDF artifact", exc_info=True)

    async def _get_reusable_pdf_job(
        self,
        *,
        job_service: JobService,
        user_id: UUID,
        document: Document,
    ) -> JobRecord | None:
        if document.pdf_artifact_job_id is None:
            return None

        job = await job_service.get_job_for_user(
            job_id=document.pdf_artifact_job_id,
            user_id=user_id,
        )
        if (
            job is None
            or job.job_type != JobType.PDF
            or job.document_revision != document.pdf_artifact_revision
            or job.status not in {JobStatus.PENDING, JobStatus.RUNNING}
        ):
            return None
        return job
