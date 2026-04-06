"""Repository helper for worker-owned PDF render payload lookups."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.invoices.repository import InvoiceRepository
from app.features.quotes.models import Document
from app.features.quotes.repository import QuoteRenderContext, QuoteRepository

_QUOTE_DOC_TYPE = "quote"
_INVOICE_DOC_TYPE = "invoice"


class WorkerPdfRepository:
    """Load one PDF render context by durable job document ownership."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_render_context(
        self,
        *,
        document_id: UUID,
        user_id: UUID,
    ) -> QuoteRenderContext | None:
        """Resolve quote/invoice render context without exposing doc-type branching."""
        document_type = await self._session.scalar(
            select(Document.doc_type).where(
                Document.id == document_id,
                Document.user_id == user_id,
            )
        )
        if document_type == _QUOTE_DOC_TYPE:
            return await QuoteRepository(self._session).get_render_context(document_id, user_id)
        if document_type == _INVOICE_DOC_TYPE:
            return await InvoiceRepository(self._session).get_render_context(document_id, user_id)
        return None
