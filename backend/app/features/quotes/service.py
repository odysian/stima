"""Quote service orchestration."""

from __future__ import annotations

from typing import Protocol, cast
from uuid import UUID

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.exc import IntegrityError

from app.features.auth.models import User
from app.features.quotes.models import Document
from app.features.quotes.schemas import (
    ExtractionResult,
    LineItemDraft,
    QuoteCreateRequest,
    QuoteUpdateRequest,
)
from app.integrations.extraction import ExtractionError


class QuoteServiceError(Exception):
    """Quote-domain exception mapped to an HTTP status code."""

    def __init__(self, *, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class QuoteRepositoryProtocol(Protocol):
    """Structural protocol for quote repository dependencies."""

    async def customer_exists_for_user(self, *, user_id: UUID, customer_id: UUID) -> bool: ...

    async def list_by_user(self, user_id: UUID) -> list[Document]: ...

    async def get_by_id(self, quote_id: UUID, user_id: UUID) -> Document | None: ...

    async def create(
        self,
        *,
        user_id: UUID,
        customer_id: UUID,
        transcript: str,
        line_items: list[LineItemDraft],
        total_amount: float | None,
        notes: str | None,
        source_type: str,
    ) -> Document: ...

    async def update(
        self,
        *,
        document: Document,
        total_amount: float | None,
        update_total_amount: bool,
        notes: str | None,
        update_notes: bool,
        line_items: list[LineItemDraft] | None,
        replace_line_items: bool,
    ) -> Document: ...

    async def commit(self) -> None: ...

    async def rollback(self) -> None: ...


class ExtractionIntegrationProtocol(Protocol):
    """Structural protocol for extraction integration dependency."""

    async def extract(self, notes: str) -> ExtractionResult: ...


class QuoteService:
    """Coordinate quote domain rules with persistence and extraction."""

    def __init__(
        self,
        *,
        repository: QuoteRepositoryProtocol,
        extraction_integration: ExtractionIntegrationProtocol,
    ) -> None:
        self._repository = repository
        self._extraction = extraction_integration

    async def convert_notes(self, notes: str) -> ExtractionResult:
        """Extract structured line items from freeform notes."""
        try:
            return await self._extraction.extract(notes)
        except ExtractionError as exc:
            raise QuoteServiceError(
                detail=f"Extraction failed: {exc}",
                status_code=422,
            ) from exc

    async def create_quote(self, user: User, data: QuoteCreateRequest) -> Document:
        """Create a user-owned quote and retry once on sequence collisions."""
        user_id = _resolve_user_id(user)
        customer_exists = await self._repository.customer_exists_for_user(
            user_id=user_id,
            customer_id=data.customer_id,
        )
        if not customer_exists:
            raise QuoteServiceError(detail="Not found", status_code=404)

        for attempt in range(2):
            try:
                quote = await self._repository.create(
                    user_id=user_id,
                    customer_id=data.customer_id,
                    transcript=data.transcript,
                    line_items=data.line_items,
                    total_amount=data.total_amount,
                    notes=data.notes,
                    source_type="text",
                )
                await self._repository.commit()
                return quote
            except IntegrityError as exc:
                await self._repository.rollback()
                if attempt == 0 and _is_doc_sequence_collision(exc):
                    continue
                raise

        raise QuoteServiceError(detail="Unable to create quote", status_code=409)

    async def list_quotes(self, user: User) -> list[Document]:
        """List quotes for the authenticated user."""
        return await self._repository.list_by_user(_resolve_user_id(user))

    async def get_quote(self, user: User, quote_id: UUID) -> Document:
        """Return one user-owned quote or raise not found."""
        quote = await self._repository.get_by_id(quote_id, _resolve_user_id(user))
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        return quote

    async def update_quote(
        self,
        user: User,
        quote_id: UUID,
        data: QuoteUpdateRequest,
    ) -> Document:
        """Patch editable quote fields and optionally replace line items."""
        quote = await self._repository.get_by_id(quote_id, _resolve_user_id(user))
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)

        updated_quote = await self._repository.update(
            document=quote,
            total_amount=data.total_amount,
            update_total_amount="total_amount" in data.model_fields_set,
            notes=data.notes,
            update_notes="notes" in data.model_fields_set,
            line_items=data.line_items,
            replace_line_items="line_items" in data.model_fields_set,
        )
        await self._repository.commit()
        return updated_quote


def _resolve_user_id(user: User) -> UUID:
    """Resolve user id without triggering async lazy loads on detached ORM instances."""
    identity = sa_inspect(user).identity
    if identity and identity[0] is not None:
        return cast(UUID, identity[0])
    return user.id


def _is_doc_sequence_collision(exc: IntegrityError) -> bool:
    """Return true when IntegrityError was caused by doc-sequence uniqueness collision."""
    message = str(exc.orig)
    return "uq_documents_user_sequence" in message
