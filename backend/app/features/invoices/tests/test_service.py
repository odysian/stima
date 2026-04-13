"""Invoice service unit tests."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest
from app.features.auth.models import User
from app.features.invoices import service as invoice_service_module
from app.features.invoices.creation import service as invoice_creation_service_module
from app.features.invoices.schemas import InvoiceCreateRequest, InvoiceUpdateRequest
from app.features.invoices.service import InvoiceRepositoryProtocol, InvoiceService
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

    async def customer_exists_for_user(self, *, user_id, customer_id):  # noqa: ANN001
        del user_id
        del customer_id
        return False

    async def list_by_user(self, user_id, customer_id=None):  # noqa: ANN001
        del user_id
        del customer_id
        return []

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

    async def get_public_share_record(self, share_token):  # noqa: ANN001
        del share_token
        return None

    async def mark_first_public_view_by_share_token(self, share_token, *, viewed_at):  # noqa: ANN001
        del share_token
        del viewed_at
        return None

    async def touch_last_public_accessed_at_by_share_token(  # noqa: ANN001
        self,
        share_token,
        *,
        accessed_at,
    ):
        del share_token
        del accessed_at
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

    async def create(self, **kwargs):  # noqa: ANN001
        del kwargs
        raise AssertionError("Direct invoice creation should not be used in this test")

    async def update(self, **kwargs):  # noqa: ANN001
        invoice = kwargs["invoice"]
        return invoice

    async def invalidate_pdf_artifact(self, invoice):  # noqa: ANN001
        del invoice
        return None

    async def mark_ready_if_draft(self, *, invoice_id, user_id):  # noqa: ANN001
        del invoice_id
        del user_id
        return None

    async def get_next_doc_sequence_for_type(self, *, user_id, doc_type):  # noqa: ANN001
        del user_id
        del doc_type
        return 1

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

    def upload(self, *, prefix: str, filename: str, data: bytes, content_type: str) -> str:
        del prefix, filename, data, content_type
        raise AssertionError("Storage should not be used in this test")

    def delete(self, object_path: str) -> None:
        del object_path
        raise AssertionError("Storage should not be used in this test")


class _DirectInvoiceCollisionRepository:
    def __init__(self) -> None:
        self.create_attempts = 0
        self.rollback_calls = 0
        self.commit_calls = 0

    async def customer_exists_for_user(self, *, user_id, customer_id):  # noqa: ANN001
        del user_id
        del customer_id
        return True

    async def list_by_user(self, user_id, customer_id=None):  # noqa: ANN001
        del user_id
        del customer_id
        return []

    async def get_by_id(self, invoice_id, user_id):  # noqa: ANN001
        del invoice_id
        del user_id
        return None

    async def get_by_source_document_id(self, *, source_document_id, user_id):  # noqa: ANN001
        del source_document_id
        del user_id
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

    async def get_public_share_record(self, share_token):  # noqa: ANN001
        del share_token
        return None

    async def mark_first_public_view_by_share_token(self, share_token, *, viewed_at):  # noqa: ANN001
        del share_token
        del viewed_at
        return None

    async def touch_last_public_accessed_at_by_share_token(  # noqa: ANN001
        self,
        share_token,
        *,
        accessed_at,
    ):
        del share_token
        del accessed_at
        return None

    async def create_from_quote(self, *, source_quote, due_date: date):  # noqa: ANN001
        del source_quote
        del due_date
        raise AssertionError("Quote conversion should not be used in this test")

    async def create(self, **kwargs):  # noqa: ANN001
        del kwargs
        self.create_attempts += 1
        raise IntegrityError(
            "insert into documents",
            {},
            Exception(
                "duplicate key value violates unique constraint uq_documents_user_type_sequence"
            ),
        )

    async def update(self, **kwargs):  # noqa: ANN001
        invoice = kwargs["invoice"]
        return invoice

    async def invalidate_pdf_artifact(self, invoice):  # noqa: ANN001
        del invoice
        return None

    async def mark_ready_if_draft(self, *, invoice_id, user_id):  # noqa: ANN001
        del invoice_id
        del user_id
        return None

    async def get_next_doc_sequence_for_type(self, *, user_id, doc_type):  # noqa: ANN001
        del user_id
        del doc_type
        return 1

    async def commit(self) -> None:
        self.commit_calls += 1

    async def refresh(self, invoice):  # noqa: ANN001
        return invoice

    async def rollback(self) -> None:
        self.rollback_calls += 1


async def test_convert_quote_to_invoice_retries_sequence_collision_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    logged_events: list[dict[str, object]] = []

    def _capture_log_event(event: str, **payload: object) -> None:
        logged_events.append({"event": event, **payload})

    monkeypatch.setattr(invoice_creation_service_module, "log_event", _capture_log_event)

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
    assert logged_events == [  # nosec B101 - pytest assertion
        {
            "event": "invoice_created",
            "user_id": user.id,
            "quote_id": quote.id,
            "customer_id": quote.customer_id,
        }
    ]


async def test_create_invoice_translates_exhausted_sequence_collisions_to_conflict() -> None:
    user = User(
        email="owner@example.com",
        password_hash="hash",  # nosec B106 - test-only stub value
    )
    user.id = uuid4()
    invoice_repository = _DirectInvoiceCollisionRepository()
    service = InvoiceService(
        invoice_repository=invoice_repository,
        quote_repository=cast(QuoteRepositoryProtocol, _QuoteRepository(None)),
        pdf_integration=_UnusedPdfIntegration(),
        storage_service=_UnusedStorageService(),
    )
    payload = InvoiceCreateRequest(
        customer_id=uuid4(),
        title="Direct invoice",
        transcript="invoice transcript",
        line_items=[],
        total_amount=55,
        notes="Original note",
        source_type="text",
    )

    with pytest.raises(invoice_service_module.QuoteServiceError) as exc_info:
        await service.create_invoice(user, payload)

    assert exc_info.value.status_code == 409  # nosec B101 - pytest assertion
    assert exc_info.value.detail == "Unable to create invoice"  # nosec B101 - pytest assertion
    assert invoice_repository.create_attempts == 2  # nosec B101 - pytest assertion
    assert invoice_repository.rollback_calls == 2  # nosec B101 - pytest assertion
    assert invoice_repository.commit_calls == 0  # nosec B101 - pytest assertion


class _UpdatingInvoiceRepository:
    def __init__(self, invoice) -> None:  # noqa: ANN001
        self._invoice = invoice
        self.invalidate_calls = 0
        self.commit_calls = 0

    async def get_by_id(self, invoice_id, user_id):  # noqa: ANN001
        if invoice_id == self._invoice.id and user_id == self._invoice.user_id:
            return self._invoice
        return None

    async def update(self, **kwargs):  # noqa: ANN001
        invoice = kwargs["invoice"]
        if kwargs["update_title"]:
            invoice.title = kwargs["title"]
        if kwargs["update_total_amount"]:
            invoice.total_amount = kwargs["total_amount"]
        if kwargs["update_tax_rate"]:
            invoice.tax_rate = kwargs["tax_rate"]
        if kwargs["update_discount_type"]:
            invoice.discount_type = kwargs["discount_type"]
        if kwargs["update_discount_value"]:
            invoice.discount_value = kwargs["discount_value"]
        if kwargs["update_deposit_amount"]:
            invoice.deposit_amount = kwargs["deposit_amount"]
        if kwargs["update_notes"]:
            invoice.notes = kwargs["notes"]
        if kwargs["replace_line_items"] and kwargs["line_items"] is not None:
            invoice.line_items = list(kwargs["line_items"])
        if kwargs["update_due_date"]:
            invoice.due_date = kwargs["due_date"]
        return invoice

    async def invalidate_pdf_artifact(self, invoice):  # noqa: ANN001
        self.invalidate_calls += 1
        invoice.pdf_artifact_path = None
        invoice.pdf_artifact_revision += 1
        return "artifacts/invoice.pdf"

    async def commit(self) -> None:
        self.commit_calls += 1

    async def refresh(self, invoice):  # noqa: ANN001
        return invoice

    async def get_next_doc_sequence_for_type(self, *, user_id, doc_type):  # noqa: ANN001
        del user_id
        del doc_type
        return 1


async def test_update_invoice_empty_patch_preserves_existing_pdf_artifact() -> None:
    user = User(
        email="owner@example.com",
        password_hash="hash",  # nosec B106 - test-only stub value
    )
    user.id = uuid4()
    invoice = SimpleNamespace(
        id=uuid4(),
        user_id=user.id,
        customer_id=uuid4(),
        status=QuoteStatus.DRAFT,
        title="Invoice",
        total_amount=100.0,
        tax_rate=None,
        discount_type=None,
        discount_value=None,
        deposit_amount=None,
        notes="Keep current artifact",
        due_date=date(2026, 4, 30),
        line_items=[SimpleNamespace(description="Labor", details=None, price=100.0)],
        pdf_artifact_path="artifacts/invoice.pdf",
        pdf_artifact_revision=7,
    )
    invoice_repository = _UpdatingInvoiceRepository(invoice)
    service = InvoiceService(
        invoice_repository=cast(InvoiceRepositoryProtocol, invoice_repository),
        quote_repository=cast(QuoteRepositoryProtocol, _QuoteRepository(None)),
        pdf_integration=_UnusedPdfIntegration(),
        storage_service=_UnusedStorageService(),
    )

    updated_invoice = await service.update_invoice(user, invoice.id, InvoiceUpdateRequest())

    assert invoice_repository.invalidate_calls == 0  # nosec B101 - pytest assertion
    assert invoice_repository.commit_calls == 1  # nosec B101 - pytest assertion
    assert updated_invoice.pdf_artifact_path == "artifacts/invoice.pdf"  # nosec B101 - pytest assertion
    assert updated_invoice.pdf_artifact_revision == 7  # nosec B101 - pytest assertion
