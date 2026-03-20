"""Customer service orchestration."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from app.features.auth.models import User
from app.features.customers.models import Customer
from app.features.customers.schemas import CustomerCreateRequest, CustomerUpdateRequest


class CustomerServiceError(Exception):
    """Customer-domain exception mapped to an HTTP status code."""

    def __init__(self, *, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class CustomerRepositoryProtocol(Protocol):
    """Structural protocol for customer repository dependencies."""

    async def list_by_user(self, user_id: UUID) -> list[Customer]: ...

    async def get_by_id(self, customer_id: UUID, user_id: UUID) -> Customer | None: ...

    async def create(
        self,
        *,
        user_id: UUID,
        name: str,
        phone: str | None,
        email: str | None,
        address: str | None,
    ) -> Customer: ...

    async def update(self, customer: Customer, **fields: str | None) -> Customer: ...

    async def commit(self) -> None: ...


class CustomerService:
    """Coordinate customer domain rules with persistence operations."""

    def __init__(self, repository: CustomerRepositoryProtocol) -> None:
        self._repository = repository

    async def list_customers(self, user: User) -> list[Customer]:
        """Return all customers belonging to the authenticated user."""
        return await self._repository.list_by_user(user.id)

    async def get_customer(self, user: User, customer_id: UUID) -> Customer:
        """Return one user-owned customer or raise not found."""
        customer = await self._repository.get_by_id(customer_id, user.id)
        if customer is None:
            raise CustomerServiceError(detail="Not found", status_code=404)
        return customer

    async def create_customer(
        self,
        user: User,
        data: CustomerCreateRequest,
    ) -> Customer:
        """Create a new customer owned by the authenticated user."""
        customer = await self._repository.create(
            user_id=user.id,
            name=data.name,
            phone=data.phone,
            email=data.email,
            address=data.address,
        )
        await self._repository.commit()
        return customer

    async def update_customer(
        self,
        user: User,
        customer_id: UUID,
        data: CustomerUpdateRequest,
    ) -> Customer:
        """Update an existing user-owned customer."""
        customer = await self._repository.get_by_id(customer_id, user.id)
        if customer is None:
            raise CustomerServiceError(detail="Not found", status_code=404)

        update_fields = data.model_dump(exclude_unset=True)
        updated_customer = await self._repository.update(customer, **update_fields)
        await self._repository.commit()
        return updated_customer
