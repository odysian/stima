"""Line-item catalog service orchestration."""

from __future__ import annotations

from decimal import Decimal
from typing import Protocol
from uuid import UUID

from app.features.auth.models import User
from app.features.line_item_catalog.models import LineItemCatalogItem
from app.features.line_item_catalog.schemas import (
    LineItemCatalogCreateRequest,
    LineItemCatalogUpdateRequest,
)


class LineItemCatalogServiceError(Exception):
    """Catalog-domain exception mapped to an HTTP status code."""

    def __init__(self, *, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class LineItemCatalogRepositoryProtocol(Protocol):
    """Structural protocol for line-item catalog repository dependencies."""

    async def list_by_user(self, user_id: UUID) -> list[LineItemCatalogItem]: ...

    async def get_by_id(
        self,
        item_id: UUID,
        user_id: UUID,
    ) -> LineItemCatalogItem | None: ...

    async def create(
        self,
        *,
        user_id: UUID,
        title: str,
        details: str | None,
        default_price: Decimal | None,
    ) -> LineItemCatalogItem: ...

    async def update(
        self,
        item: LineItemCatalogItem,
        **fields: str | Decimal | None,
    ) -> LineItemCatalogItem: ...

    async def delete(self, item: LineItemCatalogItem) -> None: ...

    async def commit(self) -> None: ...


class LineItemCatalogService:
    """Coordinate line-item catalog domain rules with persistence operations."""

    def __init__(self, repository: LineItemCatalogRepositoryProtocol) -> None:
        self._repository = repository

    async def list_items(self, user: User) -> list[LineItemCatalogItem]:
        """Return all catalog items for the authenticated user."""
        return await self._repository.list_by_user(user.id)

    async def create_item(
        self,
        user: User,
        data: LineItemCatalogCreateRequest,
    ) -> LineItemCatalogItem:
        """Create a catalog item owned by the authenticated user."""
        item = await self._repository.create(
            user_id=user.id,
            title=data.title,
            details=data.details,
            default_price=data.default_price,
        )
        await self._repository.commit()
        return item

    async def update_item(
        self,
        user: User,
        item_id: UUID,
        data: LineItemCatalogUpdateRequest,
    ) -> LineItemCatalogItem:
        """Update one user-owned catalog item or raise not found."""
        item = await self._repository.get_by_id(item_id, user.id)
        if item is None:
            raise LineItemCatalogServiceError(detail="Not found", status_code=404)

        update_fields = data.model_dump(exclude_unset=True)
        if not update_fields:
            return item

        updated_item = await self._repository.update(item, **update_fields)
        await self._repository.commit()
        return updated_item

    async def delete_item(self, user: User, item_id: UUID) -> None:
        """Delete one user-owned catalog item or raise not found."""
        item = await self._repository.get_by_id(item_id, user.id)
        if item is None:
            raise LineItemCatalogServiceError(detail="Not found", status_code=404)
        await self._repository.delete(item)
        await self._repository.commit()
