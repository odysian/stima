"""Quote API endpoints."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.features.auth.models import User
from app.features.quotes.schemas import (
    ConvertNotesRequest,
    ExtractionResult,
    QuoteCreateRequest,
    QuoteResponse,
    QuoteUpdateRequest,
)
from app.features.quotes.service import QuoteService, QuoteServiceError
from app.shared.dependencies import get_current_user, get_quote_service, require_csrf

router = APIRouter(prefix="/quotes", tags=["quotes"])


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
