"""Stable ARQ job registration points for domain-specific background work."""

from __future__ import annotations

import asyncio
import base64
import logging
from dataclasses import dataclass
from hashlib import sha256
from time import perf_counter
from typing import Any, Literal, cast
from uuid import UUID

from arq.worker import Retry, func
from pydantic import ValidationError

from app.core.config import get_settings
from app.features.invoices.email_delivery_service import InvoiceEmailDeliveryService
from app.features.invoices.repository import InvoiceEmailContext, InvoiceRepository
from app.features.jobs.models import JobType
from app.features.jobs.repository import JobRepository
from app.features.quotes.email_delivery_service import QuoteEmailDeliveryService
from app.features.quotes.extraction_outcomes import (
    build_degraded_extraction_result,
    log_draft_generated_event,
    log_draft_generation_failed_event,
    should_persist_degraded_retryable_error,
)
from app.features.quotes.repository import QuoteEmailContext, QuoteRepository
from app.features.quotes.schemas import ExtractionMode, ExtractionResult, PreparedCaptureInput
from app.features.quotes.service import QuoteService, QuoteServiceError
from app.integrations.email import EmailService
from app.integrations.extraction import (
    ExtractionCallMetadata,
    ExtractionError,
    is_retryable_extraction_error,
)
from app.integrations.pdf import (
    PdfRenderError,
    PdfRenderValidationError,
    is_retryable_pdf_error,
)
from app.integrations.storage import StorageNotFoundError
from app.shared.dependencies import get_email_service, get_pdf_integration, get_storage_service
from app.shared.event_logger import log_event
from app.shared.image_signatures import detect_image_content_type
from app.shared.observability import log_security_event
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
TERMINAL_ERROR_DRAFT_PERSISTENCE_FAILED = "Extraction succeeded but draft persistence failed."
TERMINAL_ERROR_MISSING_DOCUMENT_ID = "missing_document_id"
TERMINAL_ERROR_STALE_DOCUMENT_REVISION = "stale_document_revision"

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class _RenderedPdfArtifact:
    """Rendered PDF bytes plus the document snapshot used to persist them safely."""

    document_id: UUID
    user_id: UUID
    doc_type: str
    doc_number: str
    expected_revision: int
    pdf_bytes: bytes | None


async def extraction_job(
    ctx: dict[str, Any],
    job_id: str,
    *,
    correlation_id: str | None = None,
    transcript: str | None = None,
    prepared_capture_input: dict[str, Any] | PreparedCaptureInput | None = None,
    extraction_mode: str | None = None,
    source_type: str = "text",
    capture_detail: str | None = None,
    customer_id: str | None = None,
) -> None:
    """Run durable quote extraction against prepared capture input."""
    parsed_job_id = UUID(job_id)
    resolved_capture_input = _resolve_prepared_capture_input(
        transcript=transcript,
        prepared_capture_input=prepared_capture_input,
        source_type=source_type,
    )
    resolved_capture_detail = _resolve_worker_capture_detail(
        source_type=source_type,
        capture_detail=capture_detail,
    )
    try:
        await process_job(
            ctx,
            job_id=parsed_job_id,
            job_type=JobType.EXTRACTION,
            job_name=EXTRACTION_JOB_NAME,
            correlation_id=correlation_id,
            handler=lambda: _extract_quote_data(
                ctx,
                resolved_capture_input,
                extraction_mode=_resolve_worker_extraction_mode(
                    extraction_mode=extraction_mode,
                ),
                job_id=parsed_job_id,
            ),
            on_success=lambda runtime, result: _store_extraction_result(
                runtime,
                job_id=parsed_job_id,
                result=result,
                source_type=source_type,
                capture_detail=resolved_capture_detail,
                customer_id=customer_id,
            ),
        )
    except Retry:
        raise
    except Exception:
        await _log_extraction_terminal_failure(
            ctx,
            job_id=parsed_job_id,
            capture_detail=resolved_capture_detail,
        )
        raise


async def pdf_job(ctx: dict[str, Any], job_id: str) -> None:
    """Render one document PDF through the durable worker job lifecycle."""
    await process_job(
        ctx,
        job_id=UUID(job_id),
        job_type=JobType.PDF,
        job_name=PDF_JOB_NAME,
        handler=lambda: _render_pdf(ctx, job_id=UUID(job_id)),
        on_success=lambda runtime, result: _store_pdf_artifact(
            runtime,
            ctx,
            job_id=UUID(job_id),
            result=result,
        ),
    )


async def email_job(ctx: dict[str, Any], job_id: str) -> None:
    """Deliver one quote/invoice email through the durable worker job lifecycle."""
    await process_job(
        ctx,
        job_id=UUID(job_id),
        job_type=JobType.EMAIL,
        job_name=EMAIL_JOB_NAME,
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
    prepared_capture_input: PreparedCaptureInput,
    *,
    extraction_mode: ExtractionMode,
    job_id: UUID,
) -> ExtractionResult:
    extraction_integration = ctx.get("extraction_integration")
    if extraction_integration is None or not hasattr(extraction_integration, "extract"):
        raise RuntimeError("Worker extraction integration is not initialized")

    started_at = perf_counter()
    runtime = _get_runtime(ctx)
    attempt_number = max(int(ctx.get("job_try", 1)), 1)
    configured_model_id = getattr(extraction_integration, "model_id", None)
    await _persist_last_model_id(
        runtime,
        job_id=job_id,
        last_model_id=configured_model_id if isinstance(configured_model_id, str) else None,
    )

    try:
        result = await extraction_integration.extract(
            prepared_capture_input,
            mode=extraction_mode,
        )
    except ExtractionError as exc:
        metadata = _pop_extraction_call_metadata(extraction_integration)
        resolved_last_model_id = _resolve_last_model_id(
            configured_model_id=configured_model_id,
            metadata=metadata,
        )
        await _persist_last_model_id(
            runtime,
            job_id=job_id,
            last_model_id=resolved_last_model_id,
        )
        is_retryable = is_retryable_extraction_error(exc)
        is_final_attempt = attempt_number >= runtime.max_tries
        log_security_event(
            "quotes.extract_failed",
            outcome="retrying" if is_retryable and not is_final_attempt else "failure",
            level=logging.WARNING if is_retryable and not is_final_attempt else logging.ERROR,
            reason="provider_retryable_error" if is_retryable else "provider_non_retryable_error",
            job_name=EXTRACTION_JOB_NAME,
            job_id=str(job_id),
            last_model_id=resolved_last_model_id,
            latency_ms=int((perf_counter() - started_at) * 1000),
            token_usage=metadata.token_usage if metadata is not None else None,
            extraction_invocation_tier=(metadata.invocation_tier if metadata is not None else None),
            extraction_prompt_variant=(metadata.prompt_variant if metadata is not None else None),
            repair_attempted=metadata.repair_attempted if metadata is not None else False,
            repair_outcome=metadata.repair_outcome if metadata is not None else None,
            repair_validation_error_count=(
                metadata.repair_validation_error_count if metadata is not None else None
            ),
            error_class=_compact_error_class(exc),
            transcript_sha256=_transcript_sha256(prepared_capture_input.transcript),
        )
        if should_persist_degraded_retryable_error(
            exc,
            is_final_attempt=is_final_attempt,
        ):
            return build_degraded_extraction_result(transcript=prepared_capture_input.transcript)
        if is_retryable:
            raise RetryableJobError(str(exc)) from exc
        raise

    metadata = _pop_extraction_call_metadata(extraction_integration)
    resolved_last_model_id = _resolve_last_model_id(
        configured_model_id=configured_model_id,
        metadata=metadata,
    )
    await _persist_last_model_id(
        runtime,
        job_id=job_id,
        last_model_id=resolved_last_model_id,
    )
    if metadata is not None and metadata.repair_attempted:
        repair_outcome = metadata.repair_outcome or "unknown"
        log_security_event(
            "quotes.extract_repair",
            outcome=repair_outcome,
            level=logging.INFO if repair_outcome == "repair_succeeded" else logging.WARNING,
            reason=repair_outcome,
            job_name=EXTRACTION_JOB_NAME,
            job_id=str(job_id),
            last_model_id=resolved_last_model_id,
            extraction_invocation_tier=metadata.invocation_tier,
            extraction_prompt_variant=metadata.prompt_variant,
            extraction_tier=result.extraction_tier,
            extraction_degraded_reason_code=result.extraction_degraded_reason_code,
            repair_validation_error_count=metadata.repair_validation_error_count,
            token_usage=metadata.token_usage,
            transcript_sha256=_transcript_sha256(prepared_capture_input.transcript),
        )
    return result


async def _render_pdf(ctx: dict[str, Any], *, job_id: UUID) -> _RenderedPdfArtifact:
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

        worker_repository = WorkerPdfRepository(session)
        document_snapshot = await worker_repository.get_document_snapshot(
            document_id=job_record.document_id,
            user_id=job_record.user_id,
        )
        if document_snapshot is None:
            raise NonRetryableJobError("Document not found for PDF job")
        if job_record.document_revision is None:
            raise NonRetryableJobError("PDF job missing required document_revision")
        if document_snapshot.pdf_artifact_revision != job_record.document_revision:
            raise NonRetryableJobError(
                "PDF job became stale before rendering started",
                terminal_reason=TERMINAL_ERROR_STALE_DOCUMENT_REVISION,
            )
        if document_snapshot.pdf_artifact_path is not None:
            return _RenderedPdfArtifact(
                document_id=document_snapshot.document_id,
                user_id=document_snapshot.user_id,
                doc_type=document_snapshot.doc_type,
                doc_number=document_snapshot.doc_number,
                expected_revision=document_snapshot.pdf_artifact_revision,
                pdf_bytes=None,
            )

        context = await worker_repository.get_render_context(
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

    return _RenderedPdfArtifact(
        document_id=document_snapshot.document_id,
        user_id=document_snapshot.user_id,
        doc_type=document_snapshot.doc_type,
        doc_number=document_snapshot.doc_number,
        expected_revision=document_snapshot.pdf_artifact_revision,
        pdf_bytes=pdf_bytes,
    )


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
    if (
        not hasattr(storage_service, "fetch_bytes")
        or not hasattr(storage_service, "upload")
        or not hasattr(storage_service, "delete")
    ):
        raise RuntimeError("Worker storage service is not initialized")
    return storage_service


def _get_email_service(ctx: dict[str, Any]) -> EmailService:
    email_service = ctx.get("email_service")
    if email_service is None:
        return get_email_service()
    if not hasattr(email_service, "send"):
        raise RuntimeError("Worker email service is not initialized")
    return email_service


class _UnusedWorkerPdfIntegration:
    def render(self, context: Any) -> bytes:
        del context
        raise RuntimeError("PDF rendering is not available in extraction persistence")


class _UnusedWorkerStorageService:
    def fetch_bytes(self, object_path: str) -> bytes:
        del object_path
        raise RuntimeError("Storage is not available in extraction persistence")

    def upload(self, *, prefix: str, filename: str, data: bytes, content_type: str) -> str:
        del prefix, filename, data, content_type
        raise RuntimeError("Storage is not available in extraction persistence")

    def delete(self, object_path: str) -> None:
        del object_path
        raise RuntimeError("Storage is not available in extraction persistence")


def _validate_extraction_source_type(source_type: str) -> Literal["text", "voice", "voice+text"]:
    if source_type not in {"text", "voice", "voice+text"}:
        raise NonRetryableJobError("Extraction job missing valid source_type")
    return cast(Literal["text", "voice", "voice+text"], source_type)


def _validate_extraction_mode(extraction_mode: str) -> ExtractionMode:
    if extraction_mode != "initial":
        raise NonRetryableJobError("Extraction job missing valid extraction_mode")
    return cast(ExtractionMode, extraction_mode)


def _parse_optional_uuid(value: str | None) -> UUID | None:
    if value is None:
        return None
    return UUID(value)


def _resolve_worker_capture_detail(*, source_type: str, capture_detail: str | None) -> str:
    normalized_capture_detail = (capture_detail or "").strip()
    if normalized_capture_detail:
        return normalized_capture_detail
    if source_type == "voice+text":
        return "audio+notes"
    if source_type == "voice":
        return "audio"
    return "notes"


def _resolve_worker_extraction_mode(
    *,
    extraction_mode: str | None,
) -> ExtractionMode:
    normalized_mode = (extraction_mode or "").strip().lower()
    if not normalized_mode:
        return "initial"
    return _validate_extraction_mode(normalized_mode)


def _resolve_prepared_capture_input(
    *,
    transcript: str | None,
    prepared_capture_input: dict[str, Any] | PreparedCaptureInput | None,
    source_type: str,
) -> PreparedCaptureInput:
    if isinstance(prepared_capture_input, PreparedCaptureInput):
        return prepared_capture_input
    if isinstance(prepared_capture_input, dict):
        try:
            return PreparedCaptureInput.model_validate(prepared_capture_input)
        except ValidationError as exc:
            raise NonRetryableJobError("Extraction job prepared_capture_input is invalid") from exc

    normalized_transcript = (transcript or "").strip()
    if not normalized_transcript:
        raise NonRetryableJobError(
            "Extraction job requires transcript or prepared_capture_input payload"
        )
    prepared_source_type: Literal["text", "voice"] = (
        "voice" if source_type in {"voice", "voice+text"} else "text"
    )
    return PreparedCaptureInput.from_legacy_transcript(
        transcript=normalized_transcript,
        source_type=prepared_source_type,
    )


async def _store_extraction_result(
    runtime: WorkerRuntimeSettings,
    *,
    job_id: UUID,
    result: ExtractionResult,
    source_type: str,
    capture_detail: str,
    customer_id: str | None,
) -> None:
    async with runtime.session_maker() as session:
        repository = JobRepository(session)
        job_record = await repository.get_by_id(job_id)
        if job_record is None:
            raise NonRetryableJobError(f"Job {job_id} does not exist")

        quote_id = job_record.document_id
        if quote_id is not None:
            raise NonRetryableJobError(
                "Extraction jobs targeting existing quotes are no longer supported",
                terminal_reason=TERMINAL_ERROR_MISSING_DOCUMENT_ID,
            )
        resolved_customer_id = _parse_optional_uuid(customer_id)
        created_new_quote = False
        result_payload = result
        if quote_id is None:
            try:
                quote = await QuoteService(
                    repository=QuoteRepository(session),
                    pdf_integration=_UnusedWorkerPdfIntegration(),
                    storage_service=_UnusedWorkerStorageService(),
                ).create_extracted_draft(
                    user_id=job_record.user_id,
                    customer_id=resolved_customer_id,
                    extraction_result=result,
                    source_type=_validate_extraction_source_type(source_type),
                    commit=False,
                )
            except QuoteServiceError as exc:
                await session.rollback()
                logger.warning(
                    "Extraction draft persistence failed for job %s",
                    job_id,
                    exc_info=True,
                )
                log_security_event(
                    "quotes.extract_persist_failed",
                    outcome="failure",
                    level=logging.ERROR,
                    reason="draft_persistence_failed",
                    job_name=EXTRACTION_JOB_NAME,
                    job_id=str(job_id),
                    error_class=type(exc).__name__,
                )
                raise NonRetryableJobError(
                    TERMINAL_ERROR_DRAFT_PERSISTENCE_FAILED,
                    terminal_reason=TERMINAL_ERROR_DRAFT_PERSISTENCE_FAILED,
                ) from exc
            except Exception as exc:  # noqa: BLE001
                await session.rollback()
                logger.warning(
                    "Extraction draft persistence failed for job %s",
                    job_id,
                    exc_info=True,
                )
                log_security_event(
                    "quotes.extract_persist_failed",
                    outcome="failure",
                    level=logging.ERROR,
                    reason="draft_persistence_failed",
                    job_name=EXTRACTION_JOB_NAME,
                    job_id=str(job_id),
                    error_class=type(exc).__name__,
                )
                raise NonRetryableJobError(
                    TERMINAL_ERROR_DRAFT_PERSISTENCE_FAILED,
                    terminal_reason=TERMINAL_ERROR_DRAFT_PERSISTENCE_FAILED,
                ) from exc

            quote_id = quote.id
            resolved_customer_id = quote.customer_id
            created_new_quote = True

        await repository.set_extraction_success(
            job_id,
            quote_id=quote_id,
            result_json=result_payload.model_dump_json(),
        )
        await session.commit()

    if created_new_quote:
        log_event(
            "quote.created",
            user_id=job_record.user_id,
            quote_id=quote_id,
            customer_id=resolved_customer_id,
        )
        log_draft_generated_event(
            user_id=job_record.user_id,
            quote_id=quote_id,
            customer_id=resolved_customer_id,
            capture_detail=capture_detail,
            extraction_result=result_payload,
        )


async def _store_pdf_artifact(
    runtime: WorkerRuntimeSettings,
    ctx: dict[str, Any],
    *,
    job_id: UUID,
    result: _RenderedPdfArtifact,
) -> None:
    if result.pdf_bytes is None:
        async with runtime.session_maker() as session:
            repository = JobRepository(session)
            await repository.set_success(job_id, expected_job_type=JobType.PDF)
            await session.commit()
        return

    storage_service = _get_storage_service(ctx)
    try:
        artifact_path = await asyncio.to_thread(
            storage_service.upload,
            prefix=f"pdf-artifacts/{result.user_id}/{result.doc_type}/{result.document_id}",
            filename=f"r{result.expected_revision}.pdf",
            data=result.pdf_bytes,
            content_type="application/pdf",
        )
    except Exception as exc:  # noqa: BLE001
        raise RetryableJobError("Unable to persist PDF artifact") from exc

    async with runtime.session_maker() as session:
        persistence_result = await WorkerPdfRepository(session).persist_generated_artifact(
            document_id=result.document_id,
            user_id=result.user_id,
            job_id=job_id,
            expected_revision=result.expected_revision,
            artifact_path=artifact_path,
        )
        if not persistence_result.applied:
            try:
                await asyncio.to_thread(storage_service.delete, artifact_path)
            except Exception:  # noqa: BLE001
                logger.warning("Failed to delete stale PDF artifact upload", exc_info=True)
            raise NonRetryableJobError(
                "PDF job became stale before persistence completed",
                terminal_reason=TERMINAL_ERROR_STALE_DOCUMENT_REVISION,
            )

        repository = JobRepository(session)
        await repository.set_success(job_id, expected_job_type=JobType.PDF)
        await session.commit()

    if result.doc_type == "quote":
        log_event(
            "quote_pdf_generated",
            user_id=result.user_id,
            quote_id=result.document_id,
        )

    if persistence_result.previous_path and persistence_result.previous_path != artifact_path:
        try:
            await asyncio.to_thread(storage_service.delete, persistence_result.previous_path)
        except Exception:  # noqa: BLE001
            logger.warning("Failed to delete superseded PDF artifact", exc_info=True)


async def _log_extraction_terminal_failure(
    ctx: dict[str, Any],
    *,
    job_id: UUID,
    capture_detail: str,
) -> None:
    runtime = _get_runtime(ctx)
    async with runtime.session_maker() as session:
        job_record = await JobRepository(session).get_by_id(job_id)
    if job_record is None:
        return
    log_draft_generation_failed_event(
        user_id=job_record.user_id,
        capture_detail=capture_detail,
    )


async def _persist_last_model_id(
    runtime: WorkerRuntimeSettings,
    *,
    job_id: UUID,
    last_model_id: str | None,
) -> None:
    if last_model_id is None:
        return
    async with runtime.session_maker() as session:
        repository = JobRepository(session)
        await repository.set_last_model_id(
            job_id,
            last_model_id=last_model_id,
            expected_job_type=JobType.EXTRACTION,
        )
        await session.commit()


def _pop_extraction_call_metadata(extraction_integration: object) -> ExtractionCallMetadata | None:
    pop_metadata = getattr(extraction_integration, "pop_last_call_metadata", None)
    if not callable(pop_metadata):
        return None
    metadata = pop_metadata()
    return metadata if isinstance(metadata, ExtractionCallMetadata) else None


def _resolve_last_model_id(
    *,
    configured_model_id: object,
    metadata: ExtractionCallMetadata | None,
) -> str | None:
    metadata_model_id = metadata.model_id if metadata is not None else None
    if isinstance(metadata_model_id, str) and metadata_model_id:
        return metadata_model_id
    if isinstance(configured_model_id, str) and configured_model_id:
        return configured_model_id
    return None


def _compact_error_class(error: Exception) -> str:
    candidate = error.__cause__ if isinstance(error.__cause__, Exception) else error
    return type(candidate).__name__


def _transcript_sha256(transcript: str) -> str:
    return sha256(transcript.encode("utf-8")).hexdigest()
