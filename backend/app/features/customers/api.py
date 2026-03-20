"""Customer API endpoints."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.features.auth.models import User
from app.features.customers.schemas import (
    CustomerCreateRequest,
    CustomerResponse,
    CustomerUpdateRequest,
)
from app.features.customers.service import CustomerService, CustomerServiceError
from app.shared.dependencies import get_current_user, get_customer_service, require_csrf

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("", response_model=list[CustomerResponse])
async def list_customers(
    user: Annotated[User, Depends(get_current_user)],
    customer_service: Annotated[CustomerService, Depends(get_customer_service)],
) -> list[CustomerResponse]:
    """List customers for the authenticated user."""
    customers = await customer_service.list_customers(user)
    return [CustomerResponse.model_validate(customer) for customer in customers]


@router.post(
    "",
    response_model=CustomerResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def create_customer(
    payload: CustomerCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    customer_service: Annotated[CustomerService, Depends(get_customer_service)],
) -> CustomerResponse:
    """Create a customer for the authenticated user."""
    try:
        customer = await customer_service.create_customer(user, payload)
    except CustomerServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return CustomerResponse.model_validate(customer)


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    customer_service: Annotated[CustomerService, Depends(get_customer_service)],
) -> CustomerResponse:
    """Return one customer for the authenticated user."""
    try:
        customer = await customer_service.get_customer(user, customer_id)
    except CustomerServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return CustomerResponse.model_validate(customer)


@router.patch(
    "/{customer_id}",
    response_model=CustomerResponse,
    dependencies=[Depends(require_csrf)],
)
async def update_customer(
    customer_id: UUID,
    payload: CustomerUpdateRequest,
    user: Annotated[User, Depends(get_current_user)],
    customer_service: Annotated[CustomerService, Depends(get_customer_service)],
) -> CustomerResponse:
    """Update a customer for the authenticated user."""
    try:
        customer = await customer_service.update_customer(user, customer_id, payload)
    except CustomerServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return CustomerResponse.model_validate(customer)
