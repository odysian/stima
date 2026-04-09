"""Quote API endpoints."""

from __future__ import annotations

import logging
from typing import Annotated, Literal, Protocol, cast
from uuid import UUID

from arq.connections import ArqRedis
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.features.auth.models import User
from app.features.invoices.schemas import InvoiceResponse
from app.features.invoices.service import InvoiceService
from app.features.jobs.models import JobStatus, JobType
from app.features.jobs.schemas import JobRecordResponse, job_record_to_response
from app.features.jobs.service import JobService
from app.features.quotes.email_delivery_service import QuoteEmailDeliveryService
from app.features.quotes.extraction_service import CaptureAudioClip, ExtractionService
from app.features.quotes.schemas import (
    ConvertNotesRequest,
    DiscountType,
    ExtractionResult,
    LineItemResponse,
    LinkedInvoiceResponse,
    PdfArtifactResponse,
    PersistedExtractionResponse,
    PublicDocumentResponse,
    PublicInvoiceResponse,
    PublicLineItemResponse,
    PublicQuoteResponse,
    QuoteCreateRequest,
    QuoteDetailResponse,
    QuoteListItemResponse,
    QuoteResponse,
    QuoteUpdateRequest,
)
from app.features.quotes.service import QuoteService, QuoteServiceError
from app.integrations.audio import infer_audio_format
from app.shared.dependencies import (
    extraction_capacity_guard,
    get_arq_pool,
    get_current_user,
    get_extraction_service,
    get_idempotency_store,
    get_invoice_service,
    get_job_service,
    get_quote_email_delivery_service,
    get_quote_service,
    require_csrf,
)
from app.shared.event_logger import log_event
from app.shared.idempotency import IdempotencyStore, validate_idempotency_key
from app.shared.input_limits import (
    MAX_AUDIO_CLIP_BYTES,
    MAX_AUDIO_CLIPS_PER_REQUEST,
    MAX_AUDIO_TOTAL_BYTES,
    NOTE_INPUT_MAX_CHARS,
)
from app.shared.observability import log_security_event
from app.shared.pdf_artifacts import resolve_pdf_artifact_state
from app.shared.rate_limit import get_ip_key, get_user_key, limiter
from app.worker.job_registry import EMAIL_JOB_NAME, EXTRACTION_JOB_NAME

router = APIRouter(prefix="/quotes", tags=["quotes"])
public_router = APIRouter(tags=["quotes"])
_NOINDEX_HEADERS = {"X-Robots-Tag": "noindex"}
_PRIVATE_RESPONSE_HEADERS = {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
}
LOGGER = logging.getLogger(__name__)
_QUEUE_FAILURE_DETAIL = "Unable to start extraction right now. Please try again."
_EMAIL_QUEUE_FAILURE_DETAIL = "Unable to start email delivery right now. Please try again."


class _BusinessNameContext(Protocol):
    business_name: str | None
    first_name: str | None
    last_name: str | None


async def _parse_upload_clips(clips: list[UploadFile]) -> list[CaptureAudioClip]:
    """Read uploaded clips into service payloads while enforcing size limits."""
    if len(clips) > MAX_AUDIO_CLIPS_PER_REQUEST:
        raise HTTPException(
            status_code=400,
            detail=f"No more than {MAX_AUDIO_CLIPS_PER_REQUEST} audio clips are allowed",
        )

    parsed_clips: list[CaptureAudioClip] = []
    total_bytes = 0
    for clip in clips:
        try:
            if infer_audio_format(filename=clip.filename, content_type=clip.content_type) is None:
                raise HTTPException(
                    status_code=400,
                    detail="Audio clip content type is not supported",
                )
            if clip.size is not None and clip.size > MAX_AUDIO_CLIP_BYTES:
                raise HTTPException(status_code=400, detail="Clip too large")

            content = await clip.read()
            if not content:
                raise HTTPException(status_code=400, detail="Audio clip is empty")
            if len(content) > MAX_AUDIO_CLIP_BYTES:
                raise HTTPException(status_code=400, detail="Clip too large")
            total_bytes += len(content)
            if total_bytes > MAX_AUDIO_TOTAL_BYTES:
                raise HTTPException(
                    status_code=400,
                    detail="Total audio upload too large",
                )

            parsed_clips.append(
                CaptureAudioClip(
                    filename=clip.filename,
                    content_type=clip.content_type,
                    content=content,
                )
            )
        finally:
            await clip.close()

    return parsed_clips


@router.post(
    "/convert-notes",
    response_model=ExtractionResult,
    dependencies=[Depends(require_csrf)],
)
@limiter.limit(lambda: get_settings().quote_text_extraction_rate_limit, key_func=get_user_key)
async def convert_notes(
    request: Request,
    payload: ConvertNotesRequest,
    user: Annotated[User, Depends(get_current_user)],
    extraction_service: Annotated[ExtractionService, Depends(get_extraction_service)],
) -> ExtractionResult:
    """Convert notes into extraction output without creating a persisted draft."""
    del request
    async with extraction_capacity_guard(user.id):
        try:
            return await extraction_service.convert_notes(payload.notes)
        except QuoteServiceError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post(
    "",
    response_model=QuoteResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_quote(
    payload: QuoteCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
) -> QuoteResponse:
    """Create a quote for the authenticated user."""
    # Extraction-created drafts flow through the extraction handler/worker, not POST /quotes.
    try:
        quote = await quote_service.create_quote(user, payload)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return QuoteResponse.model_validate(quote)


@router.post(
    "/capture-audio",
    response_model=ExtractionResult,
    dependencies=[Depends(require_csrf)],
)
@limiter.limit(lambda: get_settings().quote_audio_capture_rate_limit, key_func=get_user_key)
async def capture_audio(
    request: Request,
    clips: Annotated[list[UploadFile], File(...)],
    user: Annotated[User, Depends(get_current_user)],
    extraction_service: Annotated[ExtractionService, Depends(get_extraction_service)],
) -> ExtractionResult:
    """Convert audio clips into extraction output without creating a persisted draft."""
    del request
    async with extraction_capacity_guard(user.id):
        clip_inputs = await _parse_upload_clips(clips)

        try:
            return await extraction_service.capture_audio(clip_inputs)
        except QuoteServiceError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post(
    "/extract",
    response_model=PersistedExtractionResponse | JobRecordResponse,
    dependencies=[Depends(require_csrf)],
)
@limiter.limit(lambda: get_settings().quote_combined_extract_rate_limit, key_func=get_user_key)
async def extract_combined(
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    extraction_service: Annotated[ExtractionService, Depends(get_extraction_service)],
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
    arq_pool: Annotated[ArqRedis | None, Depends(get_arq_pool)],
    job_service: Annotated[JobService, Depends(get_job_service)],
    response: Response,
    clips: Annotated[list[UploadFile] | None, File()] = None,
    notes: Annotated[str, Form(max_length=NOTE_INPUT_MAX_CHARS)] = "",
    customer_id: Annotated[UUID | None, Form()] = None,
) -> PersistedExtractionResponse | JobRecordResponse:
    """Extract quote data, persist the draft, and return a quote id or extraction job."""
    del request
    clip_inputs = await _parse_upload_clips(clips or [])
    capture_detail = _resolve_capture_detail(clip_inputs, notes)
    source_type = _resolve_source_type(clip_inputs)

    try:
        await quote_service.ensure_customer_exists_for_user(
            user_id=user.id,
            customer_id=customer_id,
        )
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    if arq_pool is None:
        async with extraction_capacity_guard(user.id):
            try:
                extraction = await extraction_service.extract_combined(
                    clip_inputs,
                    notes,
                    user_id=user.id,
                )
                quote = await quote_service.create_extracted_draft(
                    user_id=user.id,
                    customer_id=customer_id,
                    extraction_result=extraction,
                    source_type=source_type,
                )
            except QuoteServiceError as exc:
                if exc.detail == "Unable to save extracted draft right now. Please try again.":
                    log_event("draft_generation_failed", user_id=user.id, detail=capture_detail)
                raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
        log_event(
            "quote.created",
            user_id=user.id,
            quote_id=quote.id,
            customer_id=quote.customer_id,
        )
        log_event(
            "draft_generated",
            user_id=user.id,
            quote_id=quote.id,
            customer_id=quote.customer_id,
            detail=capture_detail,
        )
        return PersistedExtractionResponse(
            quote_id=quote.id,
            **extraction.model_dump(),
        )

    try:
        transcript = await extraction_service.prepare_combined_transcript(
            clip_inputs,
            notes,
            user_id=user.id,
        )
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    settings = get_settings()
    job = await job_service.create_extraction_job_if_capacity_available(
        user_id=user.id,
        concurrency_limit=settings.extraction_concurrency_limit,
    )
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Extraction quota or concurrency exhausted. Please retry later.",
        )
    try:
        queued_job = await arq_pool.enqueue_job(
            EXTRACTION_JOB_NAME,
            str(job.id),
            _job_id=str(job.id),
            transcript=transcript,
            source_type=source_type,
            capture_detail=capture_detail,
            customer_id=str(customer_id) if customer_id is not None else None,
        )
        if queued_job is None:
            raise RuntimeError("ARQ did not accept the extraction job")
    except Exception as exc:
        LOGGER.warning("Failed to enqueue extraction job %s", job.id, exc_info=True)
        await job_service.mark_enqueue_failed(job.id, job_type=JobType.EXTRACTION)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_QUEUE_FAILURE_DETAIL,
        ) from exc

    await db.commit()
    response.status_code = status.HTTP_202_ACCEPTED
    return job_record_to_response(job)


def _resolve_source_type(clips: list[CaptureAudioClip]) -> Literal["text", "voice"]:
    return "voice" if clips else "text"


def _resolve_capture_detail(clips: list[CaptureAudioClip], notes: str | None) -> str:
    normalized_notes = (notes or "").strip()
    if clips and normalized_notes:
        return "audio+notes"
    if clips:
        return "audio"
    return "notes"


@router.get("", response_model=list[QuoteListItemResponse])
async def list_quotes(
    user: Annotated[User, Depends(get_current_user)],
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
    customer_id: Annotated[UUID | None, Query()] = None,
) -> list[QuoteListItemResponse]:
    """List quotes for the authenticated user."""
    quotes = await quote_service.list_quotes(user, customer_id=customer_id)
    return [QuoteListItemResponse.model_validate(quote) for quote in quotes]


@router.get("/{quote_id}", response_model=QuoteDetailResponse)
async def get_quote(
    request: Request,
    quote_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
) -> QuoteDetailResponse:
    """Return one quote owned by the authenticated user."""
    try:
        quote = await quote_service.get_quote_detail(user, quote_id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return QuoteDetailResponse(
        id=quote.id,
        customer_id=quote.customer_id,
        doc_number=quote.doc_number,
        title=quote.title,
        status=cast(str, quote.status),
        source_type=cast(Literal["text", "voice"], quote.source_type),
        transcript=quote.transcript,
        total_amount=float(quote.total_amount) if quote.total_amount is not None else None,
        tax_rate=float(quote.tax_rate) if quote.tax_rate is not None else None,
        discount_type=cast(DiscountType | None, quote.discount_type),
        discount_value=(float(quote.discount_value) if quote.discount_value is not None else None),
        deposit_amount=(float(quote.deposit_amount) if quote.deposit_amount is not None else None),
        notes=quote.notes,
        shared_at=quote.shared_at,
        share_token=quote.share_token,
        line_items=[LineItemResponse.model_validate(line_item) for line_item in quote.line_items],
        created_at=quote.created_at,
        updated_at=quote.updated_at,
        customer_name=quote.customer_name,
        customer_email=quote.customer_email,
        customer_phone=quote.customer_phone,
        requires_customer_assignment=quote.requires_customer_assignment,
        can_reassign_customer=quote.can_reassign_customer,
        linked_invoice=(
            LinkedInvoiceResponse.model_validate(quote.linked_invoice)
            if quote.linked_invoice is not None
            else None
        ),
        pdf_artifact=_build_authenticated_pdf_artifact_response(
            download_url=str(request.url_for("get_quote_pdf_artifact", quote_id=quote.id)),
            artifact_path=quote.pdf_artifact_path,
            job_id=quote.pdf_artifact_job_id,
            job_status=quote.pdf_artifact_job_status,
            terminal_error=quote.pdf_artifact_terminal_error,
        ),
    )


@router.patch(
    "/{quote_id}",
    response_model=QuoteResponse,
    dependencies=[Depends(require_csrf)],
)
async def update_quote(
    quote_id: UUID,
    payload: QuoteUpdateRequest,
    user: Annotated[User, Depends(get_current_user)],
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
) -> QuoteResponse:
    """Update editable fields for a user-owned quote."""
    try:
        quote = await quote_service.update_quote(user, quote_id, payload)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return QuoteResponse.model_validate(quote)


@router.delete(
    "/{quote_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
)
async def delete_quote(
    quote_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
) -> None:
    """Delete a user-owned quote unless it has been shared."""
    try:
        await quote_service.delete_quote(user, quote_id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post(
    "/{quote_id}/convert-to-invoice",
    response_model=InvoiceResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def convert_quote_to_invoice(
    quote_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
) -> InvoiceResponse:
    """Convert a quote into a linked invoice unless one already exists."""
    try:
        invoice = await invoice_service.convert_quote_to_invoice(user, quote_id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return InvoiceResponse.model_validate(invoice)


@router.post(
    "/{quote_id}/pdf",
    response_model=JobRecordResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_csrf)],
)
@limiter.limit(
    lambda: get_settings().authenticated_pdf_generation_rate_limit,
    key_func=get_user_key,
)
async def generate_quote_pdf(
    request: Request,
    response: Response,
    quote_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
    arq_pool: Annotated[ArqRedis | None, Depends(get_arq_pool)],
    job_service: Annotated[JobService, Depends(get_job_service)],
) -> JobRecordResponse:
    """Start or reuse one durable quote PDF generation job."""
    del request
    try:
        job = await quote_service.start_pdf_generation(
            user,
            quote_id,
            job_service=job_service,
            arq_pool=arq_pool,
        )
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    response.status_code = status.HTTP_202_ACCEPTED
    return job_record_to_response(job)


@router.get("/{quote_id}/pdf")
async def get_quote_pdf_artifact(
    quote_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
) -> Response:
    """Stream one persisted authenticated quote PDF artifact when ready."""
    try:
        doc_number, pdf_bytes = await quote_service.get_pdf_artifact(user, quote_id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": f'inline; filename="quote-{doc_number}.pdf"',
        },
    )


@router.post(
    "/{quote_id}/share",
    response_model=QuoteResponse,
    dependencies=[Depends(require_csrf)],
)
async def share_quote(
    quote_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
    regenerate: Annotated[bool, Query()] = False,
) -> QuoteResponse:
    """Create/reuse a share token and mark quote as shared."""
    try:
        quote = await quote_service.share_quote(user, quote_id, regenerate=regenerate)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return QuoteResponse.model_validate(quote)


@router.delete(
    "/{quote_id}/share",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
)
async def revoke_quote_share(
    quote_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
) -> Response:
    """Revoke the current public share token for one quote."""
    try:
        await quote_service.revoke_public_share(user, quote_id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{quote_id}/send-email",
    response_model=JobRecordResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_csrf)],
)
@limiter.limit(lambda: get_settings().quote_email_send_rate_limit, key_func=get_user_key)
async def send_quote_email(
    request: Request,
    response: Response,
    quote_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    email_delivery_service: Annotated[
        QuoteEmailDeliveryService,
        Depends(get_quote_email_delivery_service),
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
    arq_pool: Annotated[ArqRedis | None, Depends(get_arq_pool)],
    job_service: Annotated[JobService, Depends(get_job_service)],
    idempotency_store: Annotated[IdempotencyStore, Depends(get_idempotency_store)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> JobRecordResponse:
    """Send a quote email to the customer contact on file."""
    del request
    try:
        normalized_idempotency_key = validate_idempotency_key(idempotency_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    replay = await idempotency_store.begin(
        endpoint_slug="quote-send-email",
        user_id=user.id,
        resource_id=quote_id,
        idempotency_key=normalized_idempotency_key,
    )
    if replay.kind == "replay" and replay.response is not None:
        log_security_event(
            "idempotency.replay",
            outcome="replayed",
            level=logging.INFO,
            status_code=replay.response.status_code,
            reason="replayed_response",
            endpoint_slug="quote-send-email",
            resource_id=str(quote_id),
        )
        response.headers["Idempotency-Replayed"] = "true"
        response.status_code = replay.response.status_code
        return JobRecordResponse.model_validate(replay.response.payload)
    if replay.kind == "conflict":
        raise HTTPException(
            status_code=409,
            detail="Idempotency key was already used for a different request.",
        )
    if replay.kind == "in_progress":
        raise HTTPException(
            status_code=409,
            detail="A request with this Idempotency-Key is already in progress.",
        )

    try:
        await email_delivery_service.prepare_quote_email_job(user, quote_id)
    except QuoteServiceError as exc:
        try:
            await idempotency_store.abort(
                endpoint_slug="quote-send-email",
                user_id=user.id,
                resource_id=quote_id,
                idempotency_key=normalized_idempotency_key,
            )
        except Exception:  # pragma: no cover - degraded Redis persistence path
            LOGGER.warning(
                "quote email idempotency abort failed after QuoteServiceError",
                extra={"quote_id": str(quote_id), "user_id": str(user.id)},
            )
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except Exception:
        try:
            await idempotency_store.abort(
                endpoint_slug="quote-send-email",
                user_id=user.id,
                resource_id=quote_id,
                idempotency_key=normalized_idempotency_key,
            )
        except Exception:  # pragma: no cover - degraded Redis persistence path
            LOGGER.warning(
                "quote email idempotency abort failed after unexpected error",
                extra={"quote_id": str(quote_id), "user_id": str(user.id)},
            )
        raise

    job = await job_service.create_job(
        user_id=user.id,
        job_type=JobType.EMAIL,
        document_id=quote_id,
    )
    if arq_pool is None:
        await job_service.mark_enqueue_failed(job.id, job_type=JobType.EMAIL)
        await db.commit()
        try:
            await idempotency_store.abort(
                endpoint_slug="quote-send-email",
                user_id=user.id,
                resource_id=quote_id,
                idempotency_key=normalized_idempotency_key,
            )
        except Exception:  # pragma: no cover - degraded Redis persistence path
            LOGGER.warning(
                "quote email idempotency abort failed after missing arq pool",
                extra={"quote_id": str(quote_id), "user_id": str(user.id)},
            )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_EMAIL_QUEUE_FAILURE_DETAIL,
        )

    try:
        queued_job = await arq_pool.enqueue_job(
            EMAIL_JOB_NAME,
            str(job.id),
            _job_id=str(job.id),
        )
        if queued_job is None:
            raise RuntimeError("ARQ did not accept the email job")
    except Exception as exc:
        LOGGER.warning("Failed to enqueue quote email job %s", job.id, exc_info=True)
        await job_service.mark_enqueue_failed(job.id, job_type=JobType.EMAIL)
        await db.commit()
        try:
            await idempotency_store.abort(
                endpoint_slug="quote-send-email",
                user_id=user.id,
                resource_id=quote_id,
                idempotency_key=normalized_idempotency_key,
            )
        except Exception:  # pragma: no cover - degraded Redis persistence path
            LOGGER.warning(
                "quote email idempotency abort failed after enqueue failure",
                extra={"quote_id": str(quote_id), "user_id": str(user.id)},
            )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_EMAIL_QUEUE_FAILURE_DETAIL,
        ) from exc

    await db.commit()
    job_response = job_record_to_response(job)
    response.status_code = status.HTTP_202_ACCEPTED
    try:
        await idempotency_store.complete(
            endpoint_slug="quote-send-email",
            user_id=user.id,
            resource_id=quote_id,
            idempotency_key=normalized_idempotency_key,
            status_code=status.HTTP_202_ACCEPTED,
            payload=job_response.model_dump(mode="json"),
        )
    except Exception:  # pragma: no cover - degraded Redis persistence path
        LOGGER.warning(
            "quote email job enqueued without persisted idempotency replay state",
            extra={"quote_id": str(quote_id), "user_id": str(user.id)},
        )
    return job_response


@router.post(
    "/{quote_id}/mark-won",
    response_model=QuoteResponse,
    dependencies=[Depends(require_csrf)],
)
async def mark_quote_won(
    quote_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
) -> QuoteResponse:
    """Record a contractor-controlled won quote outcome."""
    try:
        quote = await quote_service.mark_quote_outcome(
            user,
            quote_id,
            outcome="approved",
        )
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return QuoteResponse.model_validate(quote)


@router.post(
    "/{quote_id}/mark-lost",
    response_model=QuoteResponse,
    dependencies=[Depends(require_csrf)],
)
async def mark_quote_lost(
    quote_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
) -> QuoteResponse:
    """Record a contractor-controlled lost quote outcome."""
    try:
        quote = await quote_service.mark_quote_outcome(
            user,
            quote_id,
            outcome="declined",
        )
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return QuoteResponse.model_validate(quote)


@public_router.get("/share/{share_token}")
@limiter.limit(lambda: get_settings().public_document_fetch_rate_limit, key_func=get_ip_key)
async def get_shared_document_pdf(
    request: Request,
    share_token: str,
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
) -> StreamingResponse:
    """Render and stream a public quote or invoice PDF without auth."""
    del request
    try:
        doc_number, pdf_bytes = await quote_service.generate_shared_pdf(share_token)
        filename = f'inline; filename="quote-{doc_number}.pdf"'
    except QuoteServiceError as exc:
        if exc.status_code != 404:
            raise HTTPException(
                status_code=exc.status_code,
                detail=exc.detail,
                headers=_NOINDEX_HEADERS,
            ) from exc

        try:
            doc_number, pdf_bytes = await invoice_service.generate_shared_pdf(share_token)
            filename = f'inline; filename="invoice-{doc_number}.pdf"'
        except QuoteServiceError as invoice_exc:
            raise HTTPException(
                status_code=invoice_exc.status_code,
                detail=invoice_exc.detail,
                headers=_NOINDEX_HEADERS,
            ) from invoice_exc

    return StreamingResponse(
        iter((pdf_bytes,)),
        media_type="application/pdf",
        headers={
            "Content-Disposition": filename,
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex",
        },
    )


@public_router.get("/api/public/doc/{share_token}", response_model=PublicDocumentResponse)
@limiter.limit(lambda: get_settings().public_document_fetch_rate_limit, key_func=get_ip_key)
async def get_public_quote(
    share_token: str,
    request: Request,
    response: Response,
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
) -> PublicDocumentResponse:
    """Return unauthenticated public quote or invoice data for the landing page."""
    response.headers.update(_PRIVATE_RESPONSE_HEADERS)
    try:
        quote = await quote_service.get_public_quote(share_token)
        doc_type: str = "quote"
    except QuoteServiceError as exc:
        if exc.status_code != 404:
            raise HTTPException(
                status_code=exc.status_code,
                detail=exc.detail,
                headers=_PRIVATE_RESPONSE_HEADERS,
            ) from exc
        try:
            quote = await invoice_service.get_public_invoice(share_token)
            doc_type = "invoice"
        except QuoteServiceError as invoice_exc:
            raise HTTPException(
                status_code=invoice_exc.status_code,
                detail=invoice_exc.detail,
                headers=_PRIVATE_RESPONSE_HEADERS,
            ) from invoice_exc

    logo_url = str(request.url_for("get_public_quote_logo", share_token=share_token))
    download_url = str(request.url_for("get_shared_document_pdf", share_token=share_token))
    line_items = [
        PublicLineItemResponse.model_validate(item, from_attributes=True)
        for item in quote.line_items
    ]
    if doc_type == "invoice":
        return PublicInvoiceResponse(
            doc_type="invoice",
            business_name=_resolve_public_business_name(quote),
            customer_name=quote.customer_name,
            doc_number=quote.doc_number,
            title=quote.title,
            status="sent",
            total_amount=float(quote.total_amount) if quote.total_amount is not None else None,
            tax_rate=float(quote.tax_rate) if quote.tax_rate is not None else None,
            discount_type=cast(DiscountType | None, quote.discount_type),
            discount_value=(
                float(quote.discount_value) if quote.discount_value is not None else None
            ),
            deposit_amount=(
                float(quote.deposit_amount) if quote.deposit_amount is not None else None
            ),
            notes=quote.notes,
            issued_date=quote.issued_date,
            due_date=quote.due_date,
            logo_url=logo_url,
            download_url=download_url,
            line_items=line_items,
        )

    return PublicQuoteResponse(
        doc_type="quote",
        business_name=_resolve_public_business_name(quote),
        customer_name=quote.customer_name,
        doc_number=quote.doc_number,
        title=quote.title,
        status=cast(str, quote.status),
        total_amount=float(quote.total_amount) if quote.total_amount is not None else None,
        tax_rate=float(quote.tax_rate) if quote.tax_rate is not None else None,
        discount_type=cast(DiscountType | None, quote.discount_type),
        discount_value=(float(quote.discount_value) if quote.discount_value is not None else None),
        deposit_amount=(float(quote.deposit_amount) if quote.deposit_amount is not None else None),
        notes=quote.notes,
        issued_date=quote.issued_date,
        logo_url=logo_url,
        download_url=download_url,
        line_items=line_items,
    )


@public_router.get("/api/public/doc/{share_token}/logo")
@limiter.limit(lambda: get_settings().public_logo_fetch_rate_limit, key_func=get_ip_key)
async def get_public_quote_logo(
    request: Request,
    share_token: str,
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
) -> Response:
    """Proxy public quote or invoice logo bytes without exposing storage paths."""
    del request
    try:
        logo_bytes, content_type = await quote_service.get_public_logo(share_token)
    except QuoteServiceError as exc:
        # Fall through to invoice only when the token is not recognisable as a quote token
        # ("Not found" 404). A valid quote token that has no logo raises "Logo not found" 404
        # which must not fall through — it is already the correct terminal response.
        if exc.status_code != 404 or exc.detail != "Not found":
            raise HTTPException(
                status_code=exc.status_code,
                detail=exc.detail,
                headers=_NOINDEX_HEADERS,
            ) from exc
        try:
            logo_bytes, content_type = await invoice_service.get_public_logo(share_token)
        except QuoteServiceError as invoice_exc:
            raise HTTPException(
                status_code=invoice_exc.status_code,
                detail=invoice_exc.detail,
                headers=_NOINDEX_HEADERS,
            ) from invoice_exc

    return Response(
        content=logo_bytes,
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=300",
            "X-Robots-Tag": "noindex",
        },
    )


def _resolve_public_business_name(quote: _BusinessNameContext) -> str | None:
    """Return the display name shown on the public landing page."""
    if quote.business_name and quote.business_name.strip():
        return quote.business_name.strip()

    fallback_name = " ".join(
        value.strip() for value in (quote.first_name, quote.last_name) if value and value.strip()
    )
    return fallback_name or None


def _build_authenticated_pdf_artifact_response(
    *,
    download_url: str,
    artifact_path: str | None,
    job_id: UUID | None,
    job_status: JobStatus | None,
    terminal_error: str | None,
) -> PdfArtifactResponse:
    state = resolve_pdf_artifact_state(
        artifact_path=artifact_path,
        job_id=job_id,
        job_status=job_status,
        terminal_error=terminal_error,
    )
    return PdfArtifactResponse(
        status=state.status,
        job_id=state.job_id,
        download_url=download_url if state.status == "ready" else None,
        terminal_error=state.terminal_error,
    )
