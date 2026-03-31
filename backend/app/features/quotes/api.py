"""Quote API endpoints."""

from __future__ import annotations

from typing import Annotated, Protocol
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse

from app.features.auth.models import User
from app.features.invoices.schemas import InvoiceResponse
from app.features.invoices.service import InvoiceService
from app.features.quotes.email_delivery_service import QuoteEmailDeliveryService
from app.features.quotes.extraction_service import CaptureAudioClip, ExtractionService
from app.features.quotes.schemas import (
    ConvertNotesRequest,
    ExtractionResult,
    PublicLineItemResponse,
    PublicQuoteResponse,
    QuoteCreateRequest,
    QuoteDetailResponse,
    QuoteListItemResponse,
    QuoteResponse,
    QuoteUpdateRequest,
)
from app.features.quotes.service import QuoteService, QuoteServiceError
from app.shared.dependencies import (
    get_current_user,
    get_extraction_service,
    get_invoice_service,
    get_quote_email_delivery_service,
    get_quote_service,
    require_csrf,
)
from app.shared.rate_limit import get_ip_key, limiter

router = APIRouter(prefix="/quotes", tags=["quotes"])
public_router = APIRouter(tags=["quotes"])
MAX_AUDIO_CLIP_BYTES = 10 * 1024 * 1024
_NOINDEX_HEADERS = {"X-Robots-Tag": "noindex"}
_PRIVATE_RESPONSE_HEADERS = {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
}


class _BusinessNameContext(Protocol):
    business_name: str | None
    first_name: str | None
    last_name: str | None


async def _parse_upload_clips(clips: list[UploadFile]) -> list[CaptureAudioClip]:
    """Read uploaded clips into service payloads while enforcing size limits."""
    parsed_clips: list[CaptureAudioClip] = []
    for clip in clips:
        try:
            if clip.size is not None and clip.size > MAX_AUDIO_CLIP_BYTES:
                raise HTTPException(status_code=400, detail="Clip too large")

            content = await clip.read()
            if len(content) > MAX_AUDIO_CLIP_BYTES:
                raise HTTPException(status_code=400, detail="Clip too large")

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
async def convert_notes(
    payload: ConvertNotesRequest,
    user: Annotated[User, Depends(get_current_user)],
    extraction_service: Annotated[ExtractionService, Depends(get_extraction_service)],
) -> ExtractionResult:
    """Convert freeform notes into structured quote extraction output."""
    del user
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
@limiter.limit("10/minute", key_func=get_ip_key)
async def capture_audio(
    request: Request,
    clips: Annotated[list[UploadFile], File(...)],
    user: Annotated[User, Depends(get_current_user)],
    extraction_service: Annotated[ExtractionService, Depends(get_extraction_service)],
) -> ExtractionResult:
    """Convert uploaded audio clips into structured quote extraction output."""
    del request
    del user
    clip_inputs = await _parse_upload_clips(clips)

    try:
        return await extraction_service.capture_audio(clip_inputs)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post(
    "/extract",
    response_model=ExtractionResult,
    dependencies=[Depends(require_csrf)],
)
@limiter.limit("10/minute", key_func=get_ip_key)
async def extract_combined(
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    extraction_service: Annotated[ExtractionService, Depends(get_extraction_service)],
    clips: Annotated[list[UploadFile] | None, File()] = None,
    notes: Annotated[str, Form()] = "",
) -> ExtractionResult:
    """Extract structured quote data from optional audio clips and optional notes."""
    del request
    clip_inputs = await _parse_upload_clips(clips or [])

    try:
        return await extraction_service.extract_combined(clip_inputs, notes, user_id=user.id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


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
    quote_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
) -> QuoteDetailResponse:
    """Return one quote owned by the authenticated user."""
    try:
        quote = await quote_service.get_quote_detail(user, quote_id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return QuoteDetailResponse.model_validate(quote)


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
    """Convert an approved quote into a linked invoice."""
    try:
        invoice = await invoice_service.convert_quote_to_invoice(user, quote_id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return InvoiceResponse.model_validate(invoice)


@router.post(
    "/{quote_id}/pdf",
    dependencies=[Depends(require_csrf)],
)
async def generate_quote_pdf(
    quote_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
) -> StreamingResponse:
    """Render a user-owned quote to PDF and stream bytes inline."""
    try:
        doc_number, pdf_bytes = await quote_service.generate_pdf(user, quote_id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return StreamingResponse(
        iter((pdf_bytes,)),
        media_type="application/pdf",
        headers={
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
) -> QuoteResponse:
    """Create/reuse a share token and mark quote as shared."""
    try:
        quote = await quote_service.share_quote(user, quote_id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return QuoteResponse.model_validate(quote)


@router.post(
    "/{quote_id}/send-email",
    response_model=QuoteResponse,
    dependencies=[Depends(require_csrf)],
)
async def send_quote_email(
    quote_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    email_delivery_service: Annotated[
        QuoteEmailDeliveryService,
        Depends(get_quote_email_delivery_service),
    ],
) -> QuoteResponse:
    """Send a quote email to the customer contact on file."""
    try:
        quote = await email_delivery_service.send_quote_email(user, quote_id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return QuoteResponse.model_validate(quote)


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
    """Record a contractor-confirmed won quote outcome."""
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
    """Record a contractor-confirmed lost quote outcome."""
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
async def get_shared_document_pdf(
    share_token: str,
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
    invoice_service: Annotated[InvoiceService, Depends(get_invoice_service)],
) -> StreamingResponse:
    """Render and stream a public quote or invoice PDF without auth."""
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


@public_router.get("/api/public/doc/{share_token}", response_model=PublicQuoteResponse)
async def get_public_quote(
    share_token: str,
    request: Request,
    response: Response,
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
) -> PublicQuoteResponse:
    """Return unauthenticated public quote data for the landing page."""
    response.headers.update(_PRIVATE_RESPONSE_HEADERS)
    try:
        quote = await quote_service.get_public_quote(share_token)
    except QuoteServiceError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=exc.detail,
            headers=_PRIVATE_RESPONSE_HEADERS,
        ) from exc

    logo_url = str(request.url_for("get_public_quote_logo", share_token=share_token))
    download_url = str(request.url_for("get_shared_document_pdf", share_token=share_token))
    return PublicQuoteResponse(
        business_name=_resolve_public_business_name(quote),
        customer_name=quote.customer_name,
        doc_number=quote.doc_number,
        title=quote.title,
        status=quote.status,
        total_amount=float(quote.total_amount) if quote.total_amount is not None else None,
        notes=quote.notes,
        issued_date=quote.issued_date,
        logo_url=logo_url,
        download_url=download_url,
        line_items=[
            PublicLineItemResponse.model_validate(item, from_attributes=True)
            for item in quote.line_items
        ],
    )


@public_router.get("/api/public/doc/{share_token}/logo")
async def get_public_quote_logo(
    share_token: str,
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
) -> Response:
    """Proxy public quote logo bytes without exposing storage paths."""
    try:
        logo_bytes, content_type = await quote_service.get_public_logo(share_token)
    except QuoteServiceError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=exc.detail,
            headers=_NOINDEX_HEADERS,
        ) from exc

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
