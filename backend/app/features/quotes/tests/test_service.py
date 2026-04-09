"""Quote service unit tests."""

from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest

from app.features.auth.models import User
from app.features.quotes import service as quote_service_module
from app.features.quotes.models import QuoteStatus
from app.features.quotes.schemas import QuoteUpdateRequest
from app.features.quotes.service import QuoteRepositoryProtocol, QuoteService

pytestmark = pytest.mark.asyncio


class _QuoteRepository:
    def __init__(
        self,
        quote: SimpleNamespace,
        *,
        has_linked_invoice: bool = False,
        customer_exists: bool = True,
    ) -> None:
        self._quote = quote
        self._has_linked_invoice = has_linked_invoice
        self._customer_exists = customer_exists
        self.invalidate_calls = 0
        self.commit_calls = 0

    async def customer_exists_for_user(self, *, user_id, customer_id):  # noqa: ANN001
        del user_id
        del customer_id
        return self._customer_exists

    async def get_by_id(self, quote_id, user_id):  # noqa: ANN001
        if quote_id == self._quote.id and user_id == self._quote.user_id:
            return self._quote
        return None

    async def has_linked_invoice(self, *, source_document_id, user_id):  # noqa: ANN001
        del source_document_id
        del user_id
        return self._has_linked_invoice

    async def update(self, **kwargs):  # noqa: ANN001
        document = kwargs["document"]
        if kwargs["update_customer_id"]:
            document.customer_id = kwargs["customer_id"]
        if kwargs["update_title"]:
            document.title = kwargs["title"]
        if kwargs["update_transcript"]:
            document.transcript = kwargs["transcript"]
        if kwargs["update_total_amount"]:
            document.total_amount = kwargs["total_amount"]
        if kwargs["update_tax_rate"]:
            document.tax_rate = kwargs["tax_rate"]
        if kwargs["update_discount_type"]:
            document.discount_type = kwargs["discount_type"]
        if kwargs["update_discount_value"]:
            document.discount_value = kwargs["discount_value"]
        if kwargs["update_deposit_amount"]:
            document.deposit_amount = kwargs["deposit_amount"]
        if kwargs["update_notes"]:
            document.notes = kwargs["notes"]
        if kwargs["replace_line_items"] and kwargs["line_items"] is not None:
            document.line_items = list(kwargs["line_items"])
        return document

    async def invalidate_pdf_artifact(self, document):  # noqa: ANN001
        self.invalidate_calls += 1
        document.pdf_artifact_path = None
        document.pdf_artifact_revision += 1
        return "artifacts/quote.pdf"

    async def commit(self) -> None:
        self.commit_calls += 1

    async def refresh(self, document):  # noqa: ANN001
        return document


class _UnusedPdfIntegration:
    def render(self, context):  # noqa: ANN001
        del context
        raise AssertionError("PDF rendering should not be used in this test")


class _UnusedStorageService:
    def fetch_bytes(self, object_path: str) -> bytes:
        del object_path
        raise AssertionError("Storage should not be used in this test")

    def upload(self, *, prefix: str, filename: str, data: bytes, content_type: str) -> str:
        del prefix, filename, data, content_type
        raise AssertionError("Storage should not be used in this test")

    def delete(self, object_path: str) -> None:
        del object_path
        raise AssertionError("Storage should not be used in this test")


async def test_update_quote_with_unchanged_rendered_values_preserves_pdf_artifact(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(quote_service_module, "log_event", lambda *args, **kwargs: None)

    user = User(
        email="owner@example.com",
        password_hash="hash",  # nosec B106 - test-only stub value
    )
    user.id = uuid4()
    quote = SimpleNamespace(
        id=uuid4(),
        user_id=user.id,
        customer_id=uuid4(),
        status=QuoteStatus.DRAFT,
        title="Spring Cleanup",
        transcript="Original transcript",
        total_amount=100.0,
        tax_rate=None,
        discount_type=None,
        discount_value=None,
        deposit_amount=None,
        notes="Leave as-is",
        line_items=[SimpleNamespace(description="Cleanup", details=None, price=100.0)],
        pdf_artifact_path="artifacts/quote.pdf",
        pdf_artifact_revision=4,
    )
    repository = _QuoteRepository(quote)
    service = QuoteService(
        repository=cast(QuoteRepositoryProtocol, repository),
        pdf_integration=_UnusedPdfIntegration(),
        storage_service=_UnusedStorageService(),
    )

    updated_quote = await service.update_quote(
        user,
        quote.id,
        QuoteUpdateRequest(notes="Leave as-is"),
    )

    assert repository.invalidate_calls == 0  # nosec B101 - pytest assertion
    assert repository.commit_calls == 1  # nosec B101 - pytest assertion
    assert updated_quote.pdf_artifact_path == "artifacts/quote.pdf"  # nosec B101 - pytest assertion
    assert updated_quote.pdf_artifact_revision == 4  # nosec B101 - pytest assertion


async def test_update_quote_rejects_clearing_assigned_customer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(quote_service_module, "log_event", lambda *args, **kwargs: None)

    user = User(
        email="owner@example.com",
        password_hash="hash",  # nosec B106 - test-only stub value
    )
    user.id = uuid4()
    quote = SimpleNamespace(
        id=uuid4(),
        user_id=user.id,
        customer_id=uuid4(),
        status=QuoteStatus.DRAFT,
        title="Spring Cleanup",
        transcript="Original transcript",
        total_amount=100.0,
        tax_rate=None,
        discount_type=None,
        discount_value=None,
        deposit_amount=None,
        notes="Leave as-is",
        line_items=[SimpleNamespace(description="Cleanup", details=None, price=100.0)],
        pdf_artifact_path=None,
        pdf_artifact_revision=0,
    )
    repository = _QuoteRepository(quote)
    service = QuoteService(
        repository=cast(QuoteRepositoryProtocol, repository),
        pdf_integration=_UnusedPdfIntegration(),
        storage_service=_UnusedStorageService(),
    )

    with pytest.raises(
        quote_service_module.QuoteServiceError,
        match="Customer cannot be cleared from a quote.",
    ):
        await service.update_quote(
            user,
            quote.id,
            QuoteUpdateRequest(customer_id=None),
        )


async def test_update_quote_rejects_reassigning_shared_quote_customer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(quote_service_module, "log_event", lambda *args, **kwargs: None)

    user = User(
        email="owner@example.com",
        password_hash="hash",  # nosec B106 - test-only stub value
    )
    user.id = uuid4()
    quote = SimpleNamespace(
        id=uuid4(),
        user_id=user.id,
        customer_id=uuid4(),
        status=QuoteStatus.SHARED,
        title="Spring Cleanup",
        transcript="Original transcript",
        total_amount=100.0,
        tax_rate=None,
        discount_type=None,
        discount_value=None,
        deposit_amount=None,
        notes="Leave as-is",
        line_items=[SimpleNamespace(description="Cleanup", details=None, price=100.0)],
        pdf_artifact_path=None,
        pdf_artifact_revision=0,
    )
    repository = _QuoteRepository(quote)
    service = QuoteService(
        repository=cast(QuoteRepositoryProtocol, repository),
        pdf_integration=_UnusedPdfIntegration(),
        storage_service=_UnusedStorageService(),
    )

    with pytest.raises(
        quote_service_module.QuoteServiceError,
        match="Customer cannot be changed after sharing or invoice conversion.",
    ):
        await service.update_quote(
            user,
            quote.id,
            QuoteUpdateRequest(customer_id=uuid4()),
        )


async def test_update_quote_rejects_reassigning_when_linked_invoice_exists(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(quote_service_module, "log_event", lambda *args, **kwargs: None)

    user = User(
        email="owner@example.com",
        password_hash="hash",  # nosec B106 - test-only stub value
    )
    user.id = uuid4()
    quote = SimpleNamespace(
        id=uuid4(),
        user_id=user.id,
        customer_id=uuid4(),
        status=QuoteStatus.DRAFT,
        title="Spring Cleanup",
        transcript="Original transcript",
        total_amount=100.0,
        tax_rate=None,
        discount_type=None,
        discount_value=None,
        deposit_amount=None,
        notes="Leave as-is",
        line_items=[SimpleNamespace(description="Cleanup", details=None, price=100.0)],
        pdf_artifact_path=None,
        pdf_artifact_revision=0,
    )
    repository = _QuoteRepository(quote, has_linked_invoice=True)
    service = QuoteService(
        repository=cast(QuoteRepositoryProtocol, repository),
        pdf_integration=_UnusedPdfIntegration(),
        storage_service=_UnusedStorageService(),
    )

    with pytest.raises(
        quote_service_module.QuoteServiceError,
        match="Customer cannot be changed after sharing or invoice conversion.",
    ):
        await service.update_quote(
            user,
            quote.id,
            QuoteUpdateRequest(customer_id=uuid4()),
        )
