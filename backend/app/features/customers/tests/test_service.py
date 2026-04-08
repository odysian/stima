"""Customer service unit tests."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.features.auth.models import User
from app.features.customers.schemas import CustomerUpdateRequest
from app.features.customers.service import CustomerService

pytestmark = pytest.mark.asyncio


class _CustomerRepository:
    def __init__(self, customer: SimpleNamespace) -> None:
        self._customer = customer

    async def get_by_id(self, customer_id, user_id):  # noqa: ANN001
        if customer_id == self._customer.id and user_id == self._customer.user_id:
            return self._customer
        return None

    async def update(self, customer, **fields):  # noqa: ANN001
        for key, value in fields.items():
            setattr(customer, key, value)
        return customer

    async def commit(self) -> None:
        return None


class _PdfArtifactRepository:
    def __init__(self) -> None:
        self.calls: list[tuple[object, object]] = []

    async def invalidate_for_customer(self, *, user_id, customer_id):  # noqa: ANN001
        self.calls.append((user_id, customer_id))
        return ["artifacts/customer.pdf"]


class _StorageService:
    def __init__(self) -> None:
        self.deleted_paths: list[str] = []

    def delete(self, object_path: str) -> None:
        self.deleted_paths.append(object_path)


async def test_update_customer_invalidates_artifacts_before_in_place_mutation() -> None:
    user = User(
        email="owner@example.com",
        password_hash="hash",  # nosec B106 - test-only stub value
    )
    user.id = uuid4()
    customer = SimpleNamespace(
        id=uuid4(),
        user_id=user.id,
        name="Alice Johnson",
        phone="555-0100",
        address="1 Main St",
    )
    pdf_artifact_repository = _PdfArtifactRepository()
    storage_service = _StorageService()
    service = CustomerService(
        _CustomerRepository(customer),
        pdf_artifact_repository=pdf_artifact_repository,
        storage_service=storage_service,
    )

    updated_customer = await service.update_customer(
        user,
        customer.id,
        CustomerUpdateRequest(name="Alice Smith"),
    )

    assert updated_customer.name == "Alice Smith"  # nosec B101 - pytest assertion
    assert pdf_artifact_repository.calls == [(user.id, customer.id)]  # nosec B101 - pytest assertion
    assert storage_service.deleted_paths == ["artifacts/customer.pdf"]  # nosec B101 - pytest assertion
