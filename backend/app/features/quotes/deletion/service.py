"""Quote deletion lifecycle orchestration."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from sqlalchemy.exc import IntegrityError

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
_QUOTE_DOC_TYPE = "quote"
_LINKED_INVOICE_BLOCK_DETAIL = "Quotes with a linked invoice cannot be deleted."


class QuoteDeletionRepositoryProtocol(Protocol):
    """Structural protocol for quote-deletion persistence behavior."""

    async def get_owned_document_by_id(
        self,
        document_id: UUID,
        user_id: UUID,
    ) -> Document | None: ...

    async def has_linked_invoice(
        self,
        *,
        source_document_id: UUID,
        user_id: UUID,
    ) -> bool: ...

    async def delete(self, document_id: UUID) -> None: ...

    async def commit(self) -> None: ...

    async def rollback(self) -> None: ...


class QuoteDeletionService:
    """Delete one owned quote and emit the deletion event after commit."""

    def __init__(self, *, repository: QuoteDeletionRepositoryProtocol) -> None:
        self._repository = repository

    async def delete_quote(self, *, user_id: UUID, quote_id: UUID) -> None:
        """Hard-delete an owned quote when its status allows deletion."""
        document = await self._repository.get_owned_document_by_id(quote_id, user_id)
        if document is None or document.doc_type != _QUOTE_DOC_TYPE:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if document.status in _NON_DELETABLE_QUOTE_STATUSES:
            raise QuoteServiceError(
                detail="Shared quotes cannot be deleted",
                status_code=409,
            )
        has_linked_invoice = await self._repository.has_linked_invoice(
            source_document_id=document.id,
            user_id=user_id,
        )
        if has_linked_invoice:
            raise QuoteServiceError(
                detail=_LINKED_INVOICE_BLOCK_DETAIL,
                status_code=409,
            )

        try:
            await self._repository.delete(quote_id)
            await self._repository.commit()
        except IntegrityError as exc:
            await self._repository.rollback()
            raise QuoteServiceError(
                detail=_LINKED_INVOICE_BLOCK_DETAIL,
                status_code=409,
            ) from exc
        log_event(
            "quote.deleted",
            user_id=user_id,
            quote_id=document.id,
            customer_id=document.customer_id,
        )
