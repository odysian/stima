"""Quote outcome lifecycle orchestration."""

from __future__ import annotations

from typing import Literal, Protocol
from uuid import UUID

from app.features.quotes.errors import QuoteServiceError
from app.features.quotes.models import Document, QuoteStatus
from app.shared.event_logger import log_event

_QUOTE_OUTCOME_ELIGIBLE_STATUSES = (
    QuoteStatus.DRAFT,
    QuoteStatus.READY,
    QuoteStatus.SHARED,
    QuoteStatus.VIEWED,
    QuoteStatus.APPROVED,
    QuoteStatus.DECLINED,
)


class QuoteOutcomeRepositoryProtocol(Protocol):
    """Repository behavior required by quote outcome lifecycle orchestration."""

    async def get_by_id(self, quote_id: UUID, user_id: UUID) -> Document | None: ...

    async def set_quote_outcome(
        self,
        *,
        quote_id: UUID,
        user_id: UUID,
        status: QuoteStatus,
        allowed_current_statuses: tuple[QuoteStatus, ...],
    ) -> Document | None: ...

    async def commit(self) -> None: ...

    async def refresh(self, document: Document) -> Document: ...


class QuoteOutcomeService:
    """Record quote outcomes with idempotency and atomic race fallback semantics."""

    def __init__(self, *, repository: QuoteOutcomeRepositoryProtocol) -> None:
        self._repository = repository

    async def mark_quote_outcome(
        self,
        *,
        user_id: UUID,
        quote_id: UUID,
        outcome: Literal["approved", "declined"],
    ) -> Document:
        """Persist one approved/declined transition and emit the matching outcome event."""
        quote = await self._repository.get_by_id(quote_id, user_id)
        if quote is None:
            raise QuoteServiceError(detail="Not found", status_code=404)

        next_status = QuoteStatus.APPROVED if outcome == "approved" else QuoteStatus.DECLINED
        if quote.status == next_status:
            return quote

        event_name = "quote_approved" if outcome == "approved" else "quote_marked_lost"
        updated_quote = await self._repository.set_quote_outcome(
            quote_id=quote_id,
            user_id=user_id,
            status=next_status,
            allowed_current_statuses=tuple(
                status for status in _QUOTE_OUTCOME_ELIGIBLE_STATUSES if status != next_status
            ),
        )
        if updated_quote is None:
            current_quote = await self._repository.get_by_id(quote_id, user_id)
            if current_quote is not None and current_quote.status == next_status:
                return current_quote
            raise QuoteServiceError(
                detail="Unable to update quote outcome",
                status_code=409,
            )

        await self._repository.commit()
        refreshed_quote = await self._repository.refresh(updated_quote)
        log_event(
            event_name,
            user_id=user_id,
            quote_id=refreshed_quote.id,
            customer_id=refreshed_quote.customer_id,
        )
        return refreshed_quote
