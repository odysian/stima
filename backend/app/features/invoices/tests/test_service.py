"""Invoice service unit tests."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest
from app.features.auth.models import User
from app.features.invoices.service import InvoiceService
from app.features.quotes.models import QuoteStatus
from app.features.quotes.service import QuoteRepositoryProtocol
from sqlalchemy.exc import IntegrityError

pytestmark = pytest.mark.asyncio


class _RetryingInvoiceRepository:
    def __init__(self, quote_id: str, user_id: str) -> None:
        self._quote_id = quote_id
        self._user_id = user_id
        self.create_attempts = 0
        self.rollback_calls = 0
        self.commit_calls = 0

    async def get_by_id(self, invoice_id, user_id):  # noqa: ANN001
        del invoice_id
        del user_id
        return None

    async def get_by_source_document_id(self, *, source_document_id, user_id):  # noqa: ANN001
        if str(source_document_id) == self._quote_id and str(user_id) == self._user_id:
            return None
        return None

    async def get_detail_by_id(self, invoice_id, user_id):  # noqa: ANN001
        del invoice_id
        del user_id
        return None

    async def get_render_context(self, invoice_id, user_id):  # noqa: ANN001
        del invoice_id
        del user_id
        return None

    async def get_render_context_by_share_token(self, share_token):  # noqa: ANN001
        del share_token
        return None

    async def create_from_quote(self, *, source_quote, due_date: date):  # noqa: ANN001
        del due_date
        self.create_attempts += 1
        if self.create_attempts == 1:
            raise IntegrityError(
                "insert into documents",
                {},
                Exception(
                    "duplicate key value violates unique constraint uq_documents_user_type_sequence"
                ),
            )

        return SimpleNamespace(
            id=uuid4(),
            customer_id=source_quote.customer_id,
        )

    async def update_due_date(self, *, invoice, due_date: date):  # noqa: ANN001
        del due_date
        return invoice

    async def mark_ready_if_draft(self, *, invoice_id, user_id):  # noqa: ANN001
        del invoice_id
        del user_id
        return None

    async def commit(self) -> None:
        self.commit_calls += 1

    async def refresh(self, invoice):  # noqa: ANN001
        return invoice

    async def rollback(self) -> None:
        self.rollback_calls += 1


class _QuoteRepository:
    def __init__(self, quote) -> None:  # noqa: ANN001
        self._quote = quote

    async def get_by_id(self, quote_id, user_id):  # noqa: ANN001
        if quote_id == self._quote.id and user_id == self._quote.user_id:
            return self._quote
        return None


class _UnusedPdfIntegration:
    def render(self, context):  # noqa: ANN001
        del context
        raise AssertionError("PDF rendering should not be used in this test")


class _UnusedStorageService:
    def fetch_bytes(self, object_path: str) -> bytes:
        del object_path
        raise AssertionError("Storage should not be used in this test")


async def test_convert_quote_to_invoice_retries_sequence_collision_once() -> None:
    user = User(
        email="owner@example.com",
        password_hash="hash",  # nosec B106 - test-only stub value
    )
    user.id = uuid4()
    quote = SimpleNamespace(
        id=uuid4(),
        user_id=user.id,
        customer_id=uuid4(),
        status=QuoteStatus.APPROVED,
    )
    invoice_repository = _RetryingInvoiceRepository(str(quote.id), str(user.id))
    service = InvoiceService(
        invoice_repository=invoice_repository,
        quote_repository=cast(QuoteRepositoryProtocol, _QuoteRepository(quote)),
        pdf_integration=_UnusedPdfIntegration(),
        storage_service=_UnusedStorageService(),
    )

    invoice = await service.convert_quote_to_invoice(user, quote.id)

    assert invoice_repository.create_attempts == 2  # nosec B101 - pytest assertion
    assert invoice_repository.rollback_calls == 1  # nosec B101 - pytest assertion
    assert invoice_repository.commit_calls == 1  # nosec B101 - pytest assertion
    assert invoice.customer_id == quote.customer_id  # nosec B101 - pytest assertion
