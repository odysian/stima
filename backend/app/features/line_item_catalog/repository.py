"""Line-item catalog repository operations."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.line_item_catalog.models import LineItemCatalogItem


class LineItemCatalogRepository:
    """Persist and query line-item presets with async SQLAlchemy sessions."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_by_user(self, user_id: UUID) -> list[LineItemCatalogItem]:
        """Return all catalog items owned by the given user newest-first."""
        result = await self._session.scalars(
            select(LineItemCatalogItem)
            .where(LineItemCatalogItem.user_id == user_id)
            .order_by(LineItemCatalogItem.created_at.desc(), LineItemCatalogItem.id.desc())
        )
        return list(result)

    async def get_by_id(
        self,
        item_id: UUID,
        user_id: UUID,
    ) -> LineItemCatalogItem | None:
        """Return one user-owned catalog item."""
        result = await self._session.execute(
            select(LineItemCatalogItem).where(
                LineItemCatalogItem.id == item_id,
                LineItemCatalogItem.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        user_id: UUID,
        title: str,
        details: str | None,
        default_price: Decimal | None,
    ) -> LineItemCatalogItem:
        """Create a catalog item for one user."""
        item = LineItemCatalogItem(
            user_id=user_id,
            title=title,
            details=details,
            default_price=default_price,
        )
        self._session.add(item)
        await self._session.flush()
        await self._session.refresh(item)
        return item

    async def update(
        self,
        item: LineItemCatalogItem,
        **fields: str | Decimal | None,
    ) -> LineItemCatalogItem:
        """Apply field updates to one catalog item."""
        for field_name, value in fields.items():
            setattr(item, field_name, value)
        await self._session.flush()
        await self._session.refresh(item)
        return item

    async def delete(self, item: LineItemCatalogItem) -> None:
        """Delete one catalog item entity."""
        await self._session.delete(item)

    async def commit(self) -> None:
        """Commit pending catalog writes."""
        await self._session.commit()
