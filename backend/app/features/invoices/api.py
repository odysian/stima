"""Invoice API endpoints."""

from __future__ import annotations

import logging
from typing import Annotated, cast
from uuid import UUID

from arq.connections import ArqRedis
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.features.auth.models import User
from app.features.invoices.email_delivery_service import InvoiceEmailDeliveryService
from app.features.invoices.schemas import (
    InvoiceCreateRequest,
    InvoiceCustomerResponse,
    InvoiceDetailResponse,
    InvoiceListItemResponse,
    InvoiceResponse,
    InvoiceUpdateRequest,
)
from app.features.invoices.service import InvoiceService
from app.features.jobs.models import JobStatus, JobType
from app.features.jobs.schemas import JobRecordResponse, job_record_to_response
from app.features.jobs.service import JobService
from app.features.quotes.schemas import LineItemResponse, PdfArtifactResponse
from app.features.quotes.service import QuoteServiceError
from app.shared.dependencies import (
    get_arq_pool,
    get_current_user,
    get_idempotency_store,
    get_invoice_email_delivery_service,
    get_invoice_service,
    get_job_service,
    require_csrf,
)
from app.shared.idempotency import IdempotencyStore, validate_idempotency_key
from app.shared.observability import log_security_event
from app.shared.pdf_artifacts import resolve_pdf_artifact_state
from app.shared.pricing import DiscountType
from app.shared.rate_limit import get_user_key, limiter
from app.worker.job_registry import EMAIL_JOB_NAME

router = APIRouter(prefix="/invoices", tags=["invoices"])
LOGGER = logging.getLogger(__name__)
_EMAIL_QUEUE_FAILURE_DETAIL = "Unable to start email delivery right now. Please try again."


@router.post(
    "",
    response_model=InvoiceResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_invoice(
    payload: InvoiceCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
) -> InvoiceResponse:
    """Create a direct invoice for the authenticated user."""
    try:
        invoice = await invoice_service.create_invoice(user, payload)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return InvoiceResponse.model_validate(invoice)


@router.get("", response_model=list[InvoiceListItemResponse])
async def list_invoices(
    user: Annotated[User, Depends(get_current_user)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
    customer_id: Annotated[UUID | None, Query()] = None,
) -> list[InvoiceListItemResponse]:
    """List invoices for the authenticated user."""
    invoices = await invoice_service.list_invoices(user, customer_id=customer_id)
    return [InvoiceListItemResponse.model_validate(invoice) for invoice in invoices]


@router.get("/{invoice_id}", response_model=InvoiceDetailResponse)
async def get_invoice(
    request: Request,
    invoice_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
) -> InvoiceDetailResponse:
    """Return one invoice owned by the authenticated user."""
    try:
        invoice = await invoice_service.get_invoice_detail(user, invoice_id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return InvoiceDetailResponse(
        id=invoice.id,
        customer_id=invoice.customer_id,
        doc_number=invoice.doc_number,
        title=invoice.title,
        status=invoice.status,  # type: ignore[arg-type]
        total_amount=float(invoice.total_amount) if invoice.total_amount is not None else None,
        tax_rate=float(invoice.tax_rate) if invoice.tax_rate is not None else None,
        discount_type=cast(DiscountType | None, invoice.discount_type),
        discount_value=(
            float(invoice.discount_value) if invoice.discount_value is not None else None
        ),
        deposit_amount=(
            float(invoice.deposit_amount) if invoice.deposit_amount is not None else None
        ),
        notes=invoice.notes,
        due_date=invoice.due_date,
        shared_at=invoice.shared_at,
        share_token=invoice.share_token,
        source_document_id=invoice.source_document_id,
        source_quote_number=invoice.source_quote_number,
        line_items=[LineItemResponse.model_validate(line_item) for line_item in invoice.line_items],
        customer=InvoiceCustomerResponse(
            id=invoice.customer_id,
            name=invoice.customer_name,
            email=invoice.customer_email,
            phone=invoice.customer_phone,
        ),
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
        pdf_artifact=_build_authenticated_pdf_artifact_response(
            download_url=str(request.url_for("get_invoice_pdf_artifact", invoice_id=invoice.id)),
            artifact_path=invoice.pdf_artifact_path,
            job_id=invoice.pdf_artifact_job_id,
            job_status=invoice.pdf_artifact_job_status,
            terminal_error=invoice.pdf_artifact_terminal_error,
        ),
    )


@router.patch(
    "/{invoice_id}",
    response_model=InvoiceResponse,
    dependencies=[Depends(require_csrf)],
)
async def update_invoice(
    invoice_id: UUID,
    payload: InvoiceUpdateRequest,
    user: Annotated[User, Depends(get_current_user)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
) -> InvoiceResponse:
    """Patch editable invoice fields without changing invoice lifecycle state."""
    try:
        invoice = await invoice_service.update_invoice(user, invoice_id, payload)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return InvoiceResponse.model_validate(invoice)


@router.post(
    "/{invoice_id}/mark-paid",
    response_model=InvoiceResponse,
    dependencies=[Depends(require_csrf)],
)
async def mark_invoice_paid(
    invoice_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
) -> InvoiceResponse:
    """Mark one invoice as paid when it has already reached a sent/outcome state."""
    try:
        invoice = await invoice_service.mark_invoice_paid(user, invoice_id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return InvoiceResponse.model_validate(invoice)


@router.post(
    "/{invoice_id}/mark-void",
    response_model=InvoiceResponse,
    dependencies=[Depends(require_csrf)],
)
async def mark_invoice_void(
    invoice_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
) -> InvoiceResponse:
    """Mark one invoice as void when it has already reached a sent/outcome state."""
    try:
        invoice = await invoice_service.mark_invoice_voided(user, invoice_id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return InvoiceResponse.model_validate(invoice)


@router.post(
    "/{invoice_id}/pdf",
    response_model=JobRecordResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_csrf)],
)
@limiter.limit(
    lambda: get_settings().authenticated_pdf_generation_rate_limit,
    key_func=get_user_key,
)
async def generate_invoice_pdf(
    request: Request,
    response: Response,
    invoice_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
    arq_pool: Annotated[ArqRedis | None, Depends(get_arq_pool)],
    job_service: Annotated[JobService, Depends(get_job_service)],
) -> JobRecordResponse:
    """Start or reuse one durable invoice PDF generation job."""
    del request
    try:
        job = await invoice_service.start_pdf_generation(
            user,
            invoice_id,
            job_service=job_service,
            arq_pool=arq_pool,
        )
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    response.status_code = status.HTTP_202_ACCEPTED
    return job_record_to_response(job)


@router.get("/{invoice_id}/pdf")
async def get_invoice_pdf_artifact(
    invoice_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
) -> Response:
    """Stream one persisted authenticated invoice PDF artifact when ready."""
    try:
        doc_number, pdf_bytes = await invoice_service.get_pdf_artifact(user, invoice_id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": f'inline; filename="invoice-{doc_number}.pdf"',
        },
    )


@router.post(
    "/{invoice_id}/share",
    response_model=InvoiceResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_csrf)],
)
async def share_invoice(
    invoice_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
    regenerate: Annotated[bool, Query()] = False,
) -> InvoiceResponse:
    """Create/reuse a share token and mark the invoice as sent."""
    try:
        invoice = await invoice_service.share_invoice(
            user,
            invoice_id,
            regenerate=regenerate,
        )
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return InvoiceResponse.model_validate(invoice)


@router.delete(
    "/{invoice_id}/share",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
)
async def revoke_invoice_share(
    invoice_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
) -> Response:
    """Revoke the current public share token for one invoice."""
    try:
        await invoice_service.revoke_public_share(user, invoice_id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{invoice_id}/send-email",
    response_model=JobRecordResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_csrf)],
)
@limiter.limit(lambda: get_settings().invoice_email_send_rate_limit, key_func=get_user_key)
async def send_invoice_email(
    request: Request,
    response: Response,
    invoice_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    email_delivery_service: Annotated[
        InvoiceEmailDeliveryService,
        Depends(get_invoice_email_delivery_service),
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
    arq_pool: Annotated[ArqRedis | None, Depends(get_arq_pool)],
    job_service: Annotated[JobService, Depends(get_job_service)],
    idempotency_store: Annotated[IdempotencyStore, Depends(get_idempotency_store)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> JobRecordResponse:
    """Send an invoice email to the customer contact on file."""
    del request
    try:
        normalized_idempotency_key = validate_idempotency_key(idempotency_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    replay = await idempotency_store.begin(
        endpoint_slug="invoice-send-email",
        user_id=user.id,
        resource_id=invoice_id,
        idempotency_key=normalized_idempotency_key,
    )
    if replay.kind == "replay" and replay.response is not None:
        log_security_event(
            "idempotency.replay",
            outcome="replayed",
            level=logging.INFO,
            status_code=replay.response.status_code,
            reason="replayed_response",
            endpoint_slug="invoice-send-email",
            resource_id=str(invoice_id),
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
        await email_delivery_service.prepare_invoice_email_job(user, invoice_id)
    except QuoteServiceError as exc:
        try:
            await idempotency_store.abort(
                endpoint_slug="invoice-send-email",
                user_id=user.id,
                resource_id=invoice_id,
                idempotency_key=normalized_idempotency_key,
            )
        except Exception:  # pragma: no cover - degraded Redis persistence path
            LOGGER.warning(
                "invoice email idempotency abort failed after QuoteServiceError",
                extra={"invoice_id": str(invoice_id), "user_id": str(user.id)},
            )
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except Exception:
        try:
            await idempotency_store.abort(
                endpoint_slug="invoice-send-email",
                user_id=user.id,
                resource_id=invoice_id,
                idempotency_key=normalized_idempotency_key,
            )
        except Exception:  # pragma: no cover - degraded Redis persistence path
            LOGGER.warning(
                "invoice email idempotency abort failed after unexpected error",
                extra={"invoice_id": str(invoice_id), "user_id": str(user.id)},
            )
        raise

    job = await job_service.create_job(
        user_id=user.id,
        job_type=JobType.EMAIL,
        document_id=invoice_id,
    )
    if arq_pool is None:
        await job_service.mark_enqueue_failed(job.id, job_type=JobType.EMAIL)
        await db.commit()
        try:
            await idempotency_store.abort(
                endpoint_slug="invoice-send-email",
                user_id=user.id,
                resource_id=invoice_id,
                idempotency_key=normalized_idempotency_key,
            )
        except Exception:  # pragma: no cover - degraded Redis persistence path
            LOGGER.warning(
                "invoice email idempotency abort failed after missing arq pool",
                extra={"invoice_id": str(invoice_id), "user_id": str(user.id)},
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
        LOGGER.warning("Failed to enqueue invoice email job %s", job.id, exc_info=True)
        await job_service.mark_enqueue_failed(job.id, job_type=JobType.EMAIL)
        await db.commit()
        try:
            await idempotency_store.abort(
                endpoint_slug="invoice-send-email",
                user_id=user.id,
                resource_id=invoice_id,
                idempotency_key=normalized_idempotency_key,
            )
        except Exception:  # pragma: no cover - degraded Redis persistence path
            LOGGER.warning(
                "invoice email idempotency abort failed after enqueue failure",
                extra={"invoice_id": str(invoice_id), "user_id": str(user.id)},
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
            endpoint_slug="invoice-send-email",
            user_id=user.id,
            resource_id=invoice_id,
            idempotency_key=normalized_idempotency_key,
            status_code=status.HTTP_202_ACCEPTED,
            payload=job_response.model_dump(mode="json"),
        )
    except Exception:  # pragma: no cover - degraded Redis persistence path
        LOGGER.warning(
            "invoice email job enqueued without persisted idempotency replay state",
            extra={"invoice_id": str(invoice_id), "user_id": str(user.id)},
        )
    return job_response


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
