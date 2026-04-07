"""Repository helper for worker-owned email context lookups."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.invoices.repository import InvoiceEmailContext, InvoiceRepository
from app.features.quotes.models import Document
from app.features.quotes.repository import QuoteEmailContext, QuoteRepository

_QUOTE_DOC_TYPE = "quote"
_INVOICE_DOC_TYPE = "invoice"


@dataclass(slots=True)
class WorkerEmailContext:
    """Resolved worker email payload with durable document ownership metadata."""

    doc_type: str
    context: QuoteEmailContext | InvoiceEmailContext


class WorkerEmailRepository:
    """Load one quote/invoice email context by durable job document ownership."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_email_context(
        self,
        *,
        document_id: UUID,
        user_id: UUID,
    ) -> WorkerEmailContext | None:
        """Resolve quote/invoice email context without exposing doc-type branching."""
        document_type = await self._session.scalar(
            select(Document.doc_type).where(
                Document.id == document_id,
                Document.user_id == user_id,
            )
        )
        if document_type == _QUOTE_DOC_TYPE:
            quote_context = await QuoteRepository(self._session).get_email_context(
                document_id,
                user_id,
            )
            if quote_context is None:
                return None
            return WorkerEmailContext(doc_type=_QUOTE_DOC_TYPE, context=quote_context)

        if document_type == _INVOICE_DOC_TYPE:
            invoice_context = await InvoiceRepository(self._session).get_email_context(
                document_id,
                user_id,
            )
            if invoice_context is None:
                return None
            return WorkerEmailContext(doc_type=_INVOICE_DOC_TYPE, context=invoice_context)

        return None
