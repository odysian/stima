"""Repository helpers for durable PDF artifact invalidation across document types."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.quotes.models import Document


class PdfArtifactRepository:
    """Own cross-document artifact invalidation that does not belong to one feature module."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def invalidate_for_user(self, *, user_id: UUID) -> list[str]:
        """Invalidate all persisted artifacts owned by one user."""
        return await self._invalidate_documents(select(Document).where(Document.user_id == user_id))

    async def invalidate_for_customer(self, *, user_id: UUID, customer_id: UUID) -> list[str]:
        """Invalidate all persisted artifacts tied to one customer for one user."""
        return await self._invalidate_documents(
            select(Document).where(
                Document.user_id == user_id,
                Document.customer_id == customer_id,
            )
        )

    async def _invalidate_documents(self, statement) -> list[str]:  # type: ignore[no-untyped-def]
        documents = (await self._session.scalars(statement)).all()
        deleted_paths: list[str] = []
        for document in documents:
            if document.pdf_artifact_path is not None:
                deleted_paths.append(document.pdf_artifact_path)
            document.pdf_artifact_path = None
            document.pdf_artifact_job_id = None
            document.pdf_artifact_revision += 1
        await self._session.flush()
        return deleted_paths
