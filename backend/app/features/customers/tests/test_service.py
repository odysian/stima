"""Customer service unit tests."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

import app.features.customers.service as customer_service_module
from app.features.auth.models import User
from app.features.customers.schemas import CustomerUpdateRequest
from app.features.customers.service import CustomerService, CustomerServiceError

pytestmark = pytest.mark.asyncio


class _CustomerRepository:
    def __init__(self, customer: SimpleNamespace) -> None:
        self._customer = customer

    async def list_by_user(self, user_id):  # noqa: ANN001
        del user_id
        raise AssertionError("list_by_user should not be used in this test")

    async def get_by_id(self, customer_id, user_id):  # noqa: ANN001
        if customer_id == self._customer.id and user_id == self._customer.user_id:
            return self._customer
        return None

    async def create(self, **kwargs):  # noqa: ANN001
        del kwargs
        raise AssertionError("create should not be used in this test")

    async def update(self, customer, **fields):  # noqa: ANN001
        for key, value in fields.items():
            setattr(customer, key, value)
        return customer

    async def count_documents_by_type_for_customer(
        self,
        *,
        user_id,  # noqa: ANN001
        customer_id,  # noqa: ANN001
    ) -> tuple[int, int]:
        del user_id
        del customer_id
        return 0, 0

    async def verify_customer_document_cascade(self) -> bool:
        return True

    async def delete(self, customer):  # noqa: ANN001
        del customer
        return None

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

    def fetch_bytes(self, object_path: str) -> bytes:
        del object_path
        raise AssertionError("fetch_bytes should not be used in this test")

    def upload(self, *, prefix: str, filename: str, data: bytes, content_type: str) -> str:
        del prefix, filename, data, content_type
        raise AssertionError("upload should not be used in this test")

    def delete(self, object_path: str) -> None:
        self.deleted_paths.append(object_path)


class _DeleteCustomerRepository(_CustomerRepository):
    def __init__(self, customer: SimpleNamespace, operation_log: list[str]) -> None:
        super().__init__(customer)
        self.operation_log = operation_log
        self.deleted_customer_id = None

    async def count_documents_by_type_for_customer(
        self,
        *,
        user_id,  # noqa: ANN001
        customer_id,  # noqa: ANN001
    ) -> tuple[int, int]:
        self.operation_log.append("counts")
        assert user_id == self._customer.user_id  # nosec B101 - pytest assertion
        assert customer_id == self._customer.id  # nosec B101 - pytest assertion
        return 2, 1

    async def verify_customer_document_cascade(self) -> bool:
        self.operation_log.append("verify-cascade")
        return True

    async def delete(self, customer):  # noqa: ANN001
        self.operation_log.append("delete")
        self.deleted_customer_id = customer.id

    async def commit(self) -> None:
        self.operation_log.append("commit")


class _NoCascadeCustomerRepository(_DeleteCustomerRepository):
    async def verify_customer_document_cascade(self) -> bool:
        self.operation_log.append("verify-cascade")
        return False


class _DeleteArtifactRepository(_PdfArtifactRepository):
    def __init__(self, operation_log: list[str]) -> None:
        super().__init__()
        self.operation_log = operation_log

    async def invalidate_for_customer(self, *, user_id, customer_id):  # noqa: ANN001
        self.calls.append((user_id, customer_id))
        self.operation_log.append("invalidate")
        return ["artifacts/customer-a.pdf", "artifacts/customer-b.pdf"]


class _OrderedStorageService(_StorageService):
    def __init__(self, operation_log: list[str]) -> None:
        super().__init__()
        self.operation_log = operation_log

    def delete(self, object_path: str) -> None:
        self.operation_log.append(f"storage:{object_path}")
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


async def test_delete_customer_invalidates_artifacts_then_deletes_and_logs_counts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    logged_events: list[dict[str, object]] = []

    def _capture_log_event(event: str, **payload: object) -> None:
        logged_events.append({"event": event, **payload})

    monkeypatch.setattr(customer_service_module, "log_event", _capture_log_event)

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
    operation_log: list[str] = []
    repository = _DeleteCustomerRepository(customer, operation_log)
    pdf_artifact_repository = _DeleteArtifactRepository(operation_log)
    storage_service = _OrderedStorageService(operation_log)
    service = CustomerService(
        repository,
        pdf_artifact_repository=pdf_artifact_repository,
        storage_service=storage_service,
    )

    await service.delete_customer(user, customer.id)

    assert operation_log == [  # nosec B101 - pytest assertion
        "verify-cascade",
        "counts",
        "invalidate",
        "storage:artifacts/customer-a.pdf",
        "storage:artifacts/customer-b.pdf",
        "delete",
        "commit",
    ]
    assert repository.deleted_customer_id == customer.id  # nosec B101 - pytest assertion
    assert logged_events == [  # nosec B101 - pytest assertion
        {
            "event": "customer.deleted",
            "user_id": user.id,
            "customer_id": customer.id,
            "detail": "deleted_quote_count=2,deleted_invoice_count=1",
        }
    ]


async def test_delete_customer_rejects_when_fk_cascade_contract_is_missing() -> None:
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
    operation_log: list[str] = []
    repository = _NoCascadeCustomerRepository(customer, operation_log)
    service = CustomerService(
        repository,
        pdf_artifact_repository=_DeleteArtifactRepository(operation_log),
        storage_service=_OrderedStorageService(operation_log),
    )

    with pytest.raises(CustomerServiceError) as exc_info:
        await service.delete_customer(user, customer.id)

    assert exc_info.value.status_code == 503  # nosec B101 - pytest assertion
    assert exc_info.value.detail == "Customer deletion is temporarily unavailable"  # nosec B101 - pytest assertion
    assert operation_log == ["verify-cascade"]  # nosec B101 - pytest assertion
