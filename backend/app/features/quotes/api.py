"""Quote API endpoints."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse

from app.features.auth.models import User
from app.features.quotes.schemas import (
    ConvertNotesRequest,
    ExtractionResult,
    QuoteCreateRequest,
    QuoteResponse,
    QuoteUpdateRequest,
)
from app.features.quotes.service import CaptureAudioClip, QuoteService, QuoteServiceError
from app.shared.dependencies import get_current_user, get_quote_service, require_csrf
from app.shared.rate_limit import get_ip_key, limiter

router = APIRouter(prefix="/quotes", tags=["quotes"])
public_router = APIRouter(tags=["quotes"])
MAX_AUDIO_CLIP_BYTES = 10 * 1024 * 1024


@router.post(
    "/convert-notes",
    response_model=ExtractionResult,
    dependencies=[Depends(require_csrf)],
)
async def convert_notes(
    payload: ConvertNotesRequest,
    user: Annotated[User, Depends(get_current_user)],
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
) -> ExtractionResult:
    """Convert freeform notes into structured quote extraction output."""
    del user
    try:
        return await quote_service.convert_notes(payload.notes)
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
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
) -> ExtractionResult:
    """Convert uploaded audio clips into structured quote extraction output."""
    del request
    del user
    clip_inputs: list[CaptureAudioClip] = []
    for clip in clips:
        try:
            if clip.size is not None and clip.size > MAX_AUDIO_CLIP_BYTES:
                raise HTTPException(status_code=400, detail="Clip too large")

            content = await clip.read()
            if len(content) > MAX_AUDIO_CLIP_BYTES:
                raise HTTPException(status_code=400, detail="Clip too large")

            clip_inputs.append(
                CaptureAudioClip(
                    filename=clip.filename,
                    content_type=clip.content_type,
                    content=content,
                )
            )
        finally:
            await clip.close()

    try:
        return await quote_service.capture_audio(clip_inputs)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.get("", response_model=list[QuoteResponse])
async def list_quotes(
    user: Annotated[User, Depends(get_current_user)],
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
) -> list[QuoteResponse]:
    """List quotes for the authenticated user."""
    quotes = await quote_service.list_quotes(user)
    return [QuoteResponse.model_validate(quote) for quote in quotes]


@router.get("/{quote_id}", response_model=QuoteResponse)
async def get_quote(
    quote_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
) -> QuoteResponse:
    """Return one quote owned by the authenticated user."""
    try:
        quote = await quote_service.get_quote(user, quote_id)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return QuoteResponse.model_validate(quote)


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


@public_router.get("/share/{share_token}")
async def get_shared_quote_pdf(
    share_token: str,
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
) -> StreamingResponse:
    """Render and stream a public quote PDF without auth."""
    try:
        doc_number, pdf_bytes = await quote_service.generate_shared_pdf(share_token)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return StreamingResponse(
        iter((pdf_bytes,)),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="quote-{doc_number}.pdf"',
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex",
        },
    )
