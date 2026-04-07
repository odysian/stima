"""Stable ARQ job registration points for domain-specific background work."""

from __future__ import annotations

import asyncio
import base64
import logging
from typing import Any
from uuid import UUID

from arq.worker import func

from app.core.config import get_settings
from app.features.invoices.email_delivery_service import InvoiceEmailDeliveryService
from app.features.invoices.repository import InvoiceEmailContext, InvoiceRepository
from app.features.jobs.models import JobType
from app.features.jobs.repository import JobRepository
from app.features.quotes.email_delivery_service import QuoteEmailDeliveryService
from app.features.quotes.repository import QuoteEmailContext, QuoteRepository
from app.features.quotes.schemas import ExtractionResult
from app.features.quotes.service import QuoteServiceError
from app.integrations.email import EmailService
from app.integrations.extraction import ExtractionError, is_retryable_extraction_error
from app.integrations.pdf import (
    PdfRenderError,
    PdfRenderValidationError,
    is_retryable_pdf_error,
)
from app.integrations.storage import StorageNotFoundError
from app.shared.dependencies import get_email_service, get_pdf_integration, get_storage_service
from app.shared.image_signatures import detect_image_content_type
from app.worker.email_repository import WorkerEmailRepository
from app.worker.pdf_repository import WorkerPdfRepository
from app.worker.runtime import (
    DEFAULT_MAX_TRIES,
    NonRetryableJobError,
    RetryableJobError,
    WorkerRuntimeSettings,
    process_job,
)

EXTRACTION_JOB_NAME = "jobs.extraction"
PDF_JOB_NAME = "jobs.pdf"
EMAIL_JOB_NAME = "jobs.email"
TERMINAL_ERROR_MISSING_DOCUMENT_ID = "missing_document_id"

logger = logging.getLogger(__name__)


async def extraction_job(ctx: dict[str, Any], job_id: str, *, transcript: str) -> None:
    """Run durable quote extraction against the transcript prepared by the API."""
    await process_job(
        ctx,
        job_id=UUID(job_id),
        job_type=JobType.EXTRACTION,
        handler=lambda: _extract_quote_data(ctx, transcript),
        on_success=lambda runtime, result: _store_extraction_result(
            runtime,
            job_id=UUID(job_id),
            result=result,
        ),
    )


async def pdf_job(ctx: dict[str, Any], job_id: str) -> None:
    """Render one document PDF through the durable worker job lifecycle."""
    await process_job(
        ctx,
        job_id=UUID(job_id),
        job_type=JobType.PDF,
        handler=lambda: _render_pdf(ctx, job_id=UUID(job_id)),
    )


async def email_job(ctx: dict[str, Any], job_id: str) -> None:
    """Deliver one quote/invoice email through the durable worker job lifecycle."""
    await process_job(
        ctx,
        job_id=UUID(job_id),
        job_type=JobType.EMAIL,
        handler=lambda: _deliver_email(ctx, job_id=UUID(job_id)),
    )


def registered_functions() -> list[Any]:
    """Return the stable ARQ function registry for the worker process."""
    return [
        func(extraction_job, name=EXTRACTION_JOB_NAME, max_tries=DEFAULT_MAX_TRIES),
        func(pdf_job, name=PDF_JOB_NAME, max_tries=DEFAULT_MAX_TRIES),
        func(email_job, name=EMAIL_JOB_NAME, max_tries=DEFAULT_MAX_TRIES),
    ]


async def _raise_not_implemented(job_type: JobType) -> None:
    raise NotImplementedError(
        f"{job_type.value} jobs are not wired yet; wait for the corresponding domain task"
    )


async def _deliver_email(ctx: dict[str, Any], *, job_id: UUID) -> None:
    runtime = _get_runtime(ctx)

    async with runtime.session_maker() as session:
        job_repository = JobRepository(session)
        job_record = await job_repository.get_by_id(job_id)
        if job_record is None:
            raise NonRetryableJobError(f"Job {job_id} does not exist")
        if job_record.document_id is None:
            raise NonRetryableJobError("Email job missing required document_id")

        worker_context = await WorkerEmailRepository(session).get_email_context(
            document_id=job_record.document_id,
            user_id=job_record.user_id,
        )
        if worker_context is None:
            raise NonRetryableJobError("Document not found for email job")

        frontend_url = get_settings().frontend_url
        email_service = _get_email_service(ctx)
        if worker_context.doc_type == "quote":
            quote_context = worker_context.context
            if not isinstance(quote_context, QuoteEmailContext):
                raise NonRetryableJobError("Email context type mismatch for quote job")
            quote_service = QuoteEmailDeliveryService(
                repository=QuoteRepository(session),
                quote_service=None,
                email_service=email_service,
                frontend_url=frontend_url,
            )
            try:
                await quote_service.send_quote_email_from_context(quote_context)
            except QuoteServiceError as exc:
                if exc.status_code in {502, 503}:
                    raise RetryableJobError(exc.detail) from exc
                raise NonRetryableJobError(exc.detail) from exc
            return

        if worker_context.doc_type == "invoice":
            invoice_context = worker_context.context
            if not isinstance(invoice_context, InvoiceEmailContext):
                raise NonRetryableJobError("Email context type mismatch for invoice job")
            invoice_service = InvoiceEmailDeliveryService(
                repository=InvoiceRepository(session),
                invoice_service=None,
                email_service=email_service,
                frontend_url=frontend_url,
            )
            try:
                await invoice_service.send_invoice_email_from_context(invoice_context)
            except QuoteServiceError as exc:
                if exc.status_code in {502, 503}:
                    raise RetryableJobError(exc.detail) from exc
                raise NonRetryableJobError(exc.detail) from exc
            return

        raise NonRetryableJobError("Unsupported email document type")


async def _extract_quote_data(
    ctx: dict[str, Any],
    transcript: str,
) -> ExtractionResult:
    extraction_integration = ctx.get("extraction_integration")
    if extraction_integration is None or not hasattr(extraction_integration, "extract"):
        raise RuntimeError("Worker extraction integration is not initialized")

    try:
        return await extraction_integration.extract(transcript)
    except ExtractionError as exc:
        if is_retryable_extraction_error(exc):
            raise RetryableJobError(str(exc)) from exc
        raise


async def _render_pdf(ctx: dict[str, Any], *, job_id: UUID) -> None:
    runtime = _get_runtime(ctx)

    async with runtime.session_maker() as session:
        job_repository = JobRepository(session)
        job_record = await job_repository.get_by_id(job_id)
        if job_record is None:
            raise NonRetryableJobError(f"Job {job_id} does not exist")
        if job_record.document_id is None:
            raise NonRetryableJobError(
                "PDF job missing required document_id",
                terminal_reason=TERMINAL_ERROR_MISSING_DOCUMENT_ID,
            )

        context = await WorkerPdfRepository(session).get_render_context(
            document_id=job_record.document_id,
            user_id=job_record.user_id,
        )
        if context is None:
            raise NonRetryableJobError("Document not found for PDF job")

    await _attach_logo_data_uri(ctx, context)

    pdf_integration = _get_pdf_integration(ctx)
    try:
        pdf_bytes = await asyncio.to_thread(pdf_integration.render, context)
        if not isinstance(pdf_bytes, bytes):
            raise NonRetryableJobError("PDF render returned invalid payload type")
    except PdfRenderValidationError as exc:
        raise NonRetryableJobError(str(exc)) from exc
    except PdfRenderError as exc:
        if is_retryable_pdf_error(exc):
            raise RetryableJobError(str(exc)) from exc
        raise NonRetryableJobError(str(exc)) from exc


async def _attach_logo_data_uri(ctx: dict[str, Any], context: Any) -> None:
    logo_path = getattr(context, "logo_path", None)
    if logo_path is None:
        context.logo_data_uri = None
        return

    storage_service = _get_storage_service(ctx)
    try:
        logo_bytes = await asyncio.to_thread(storage_service.fetch_bytes, logo_path)
    except StorageNotFoundError:
        logger.warning("Document logo missing in storage; omitting from PDF render")
        context.logo_data_uri = None
        return
    except Exception:  # noqa: BLE001
        logger.warning(
            "Failed to load document logo for PDF render; omitting logo",
            exc_info=True,
        )
        context.logo_data_uri = None
        return

    content_type = detect_image_content_type(logo_bytes)
    if content_type is None:
        logger.warning("Document logo bytes were invalid; omitting from PDF render")
        context.logo_data_uri = None
        return

    encoded_logo = base64.b64encode(logo_bytes).decode("ascii")
    context.logo_data_uri = f"data:{content_type};base64,{encoded_logo}"


def _get_runtime(ctx: dict[str, Any]) -> WorkerRuntimeSettings:
    runtime = ctx.get("worker_runtime")
    if not isinstance(runtime, WorkerRuntimeSettings):
        raise RuntimeError("Worker runtime is not initialized; on_worker_startup must run first")
    return runtime


def _get_pdf_integration(ctx: dict[str, Any]) -> Any:
    pdf_integration = ctx.get("pdf_integration")
    if pdf_integration is None:
        return get_pdf_integration()
    if not hasattr(pdf_integration, "render"):
        raise RuntimeError("Worker PDF integration is not initialized")
    return pdf_integration


def _get_storage_service(ctx: dict[str, Any]) -> Any:
    storage_service = ctx.get("storage_service")
    if storage_service is None:
        return get_storage_service()
    if not hasattr(storage_service, "fetch_bytes"):
        raise RuntimeError("Worker storage service is not initialized")
    return storage_service


def _get_email_service(ctx: dict[str, Any]) -> EmailService:
    email_service = ctx.get("email_service")
    if email_service is None:
        return get_email_service()
    if not hasattr(email_service, "send"):
        raise RuntimeError("Worker email service is not initialized")
    return email_service


async def _store_extraction_result(
    runtime: WorkerRuntimeSettings,
    *,
    job_id: UUID,
    result: ExtractionResult,
) -> None:
    async with runtime.session_maker() as session:
        repository = JobRepository(session)
        await repository.set_success_with_result(
            job_id,
            result_json=result.model_dump_json(),
            expected_job_type=JobType.EXTRACTION,
        )
        await session.commit()
