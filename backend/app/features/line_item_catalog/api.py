"""Line-item catalog API endpoints."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.features.auth.models import User
from app.features.line_item_catalog.schemas import (
    LineItemCatalogCreateRequest,
    LineItemCatalogItemResponse,
    LineItemCatalogUpdateRequest,
)
from app.features.line_item_catalog.service import (
    LineItemCatalogService,
    LineItemCatalogServiceError,
)
from app.shared.dependencies import (
    get_current_user,
    get_line_item_catalog_service,
    require_csrf,
)

router = APIRouter(prefix="/line-item-catalog", tags=["line-item-catalog"])


@router.get("", response_model=list[LineItemCatalogItemResponse])
async def list_line_item_catalog(
    user: Annotated[User, Depends(get_current_user)],
    line_item_catalog_service: Annotated[
        LineItemCatalogService,
        Depends(get_line_item_catalog_service),
    ],
) -> list[LineItemCatalogItemResponse]:
    """List line-item catalog entries for the authenticated user."""
    items = await line_item_catalog_service.list_items(user)
    return [LineItemCatalogItemResponse.model_validate(item) for item in items]


@router.post(
    "",
    response_model=LineItemCatalogItemResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_line_item_catalog(
    payload: LineItemCatalogCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    line_item_catalog_service: Annotated[
        LineItemCatalogService,
        Depends(get_line_item_catalog_service),
    ],
) -> LineItemCatalogItemResponse:
    """Create one line-item catalog entry for the authenticated user."""
    try:
        item = await line_item_catalog_service.create_item(user, payload)
    except LineItemCatalogServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return LineItemCatalogItemResponse.model_validate(item)


@router.patch(
    "/{item_id}",
    response_model=LineItemCatalogItemResponse,
    dependencies=[Depends(require_csrf)],
)
async def update_line_item_catalog(
    item_id: UUID,
    payload: LineItemCatalogUpdateRequest,
    user: Annotated[User, Depends(get_current_user)],
    line_item_catalog_service: Annotated[
        LineItemCatalogService,
        Depends(get_line_item_catalog_service),
    ],
) -> LineItemCatalogItemResponse:
    """Update one line-item catalog entry for the authenticated user."""
    try:
        item = await line_item_catalog_service.update_item(user, item_id, payload)
    except LineItemCatalogServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return LineItemCatalogItemResponse.model_validate(item)


@router.delete(
    "/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
)
async def delete_line_item_catalog(
    item_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    line_item_catalog_service: Annotated[
        LineItemCatalogService,
        Depends(get_line_item_catalog_service),
    ],
) -> None:
    """Delete one line-item catalog entry for the authenticated user."""
    try:
        await line_item_catalog_service.delete_item(user, item_id)
    except LineItemCatalogServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
