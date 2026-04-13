"""Quote deletion lifecycle orchestration."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from app.features.quotes.errors import QuoteServiceError
from app.features.quotes.models import Document, QuoteStatus
from app.shared.event_logger import log_event

_NON_DELETABLE_QUOTE_STATUSES = frozenset(
    {
        QuoteStatus.SHARED,
        QuoteStatus.VIEWED,
        QuoteStatus.APPROVED,
        QuoteStatus.DECLINED,
    }
)


class QuoteDeletionRepositoryProtocol(Protocol):
    """Structural protocol for quote-deletion persistence behavior."""

    async def get_by_id(self, quote_id: UUID, user_id: UUID) -> Document | None: ...

    async def delete(self, document_id: UUID) -> None: ...

    async def commit(self) -> None: ...


class QuoteDeletionService:
    """Delete one owned quote and emit the deletion event after commit."""

    def __init__(self, *, repository: QuoteDeletionRepositoryProtocol) -> None:
        self._repository = repository

    async def delete_quote(self, *, user_id: UUID, quote_id: UUID) -> None:
        """Hard-delete an owned quote when its status allows deletion."""
        quote = await self._repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if quote.status in _NON_DELETABLE_QUOTE_STATUSES:
            raise QuoteServiceError(
                detail="Shared quotes cannot be deleted",
                status_code=409,
            )

        await self._repository.delete(quote_id)
        await self._repository.commit()
        log_event(
            "quote.deleted",
            user_id=user_id,
            quote_id=quote.id,
            customer_id=quote.customer_id,
        )
