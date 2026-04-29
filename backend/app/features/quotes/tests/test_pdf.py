"""Quote PDF generation and sharing endpoint behavior tests."""

from __future__ import annotations

import asyncio
import base64
import json
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Annotated, TypedDict, cast
from uuid import UUID, uuid4

import pytest
from fastapi import Depends
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.database import get_db
from app.features.auth.models import User
from app.features.auth.service import CSRF_COOKIE_NAME
from app.features.invoices.repository import InvoiceRepository
from app.features.invoices.service import InvoiceService
from app.features.jobs.models import JobStatus
from app.features.quotes.models import Document, LineItem, QuoteStatus
from app.features.quotes.repository import QuoteRenderContext, QuoteRepository
from app.features.quotes.service import QuoteService
from app.integrations.pdf import PdfRenderError, validate_render_context
from app.integrations.storage import StorageNotFoundError
from app.main import app
from app.shared import event_logger, observability
from app.shared.dependencies import (
    get_arq_pool,
    get_invoice_service,
    get_quote_service,
    get_storage_service,
)
from app.shared.input_limits import DOCUMENT_LINE_ITEMS_MAX_ITEMS
from app.shared.pdf_artifacts import PDF_ARTIFACT_NOT_READY_DETAIL
from app.shared.rate_limit import reset_local_rate_limit_state
from app.worker.job_registry import pdf_job
from app.worker.runtime import (
    DEFAULT_MAX_TRIES,
    DEFAULT_RETRY_BASE_SECONDS,
    DEFAULT_RETRY_JITTER_SECONDS,
    NonRetryableJobError,
    WorkerRuntimeSettings,
)

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _reset_rate_limit_state() -> Iterator[None]:
    reset_local_rate_limit_state()
    yield
    reset_local_rate_limit_state()


_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC"
)


class _ConfigurablePdfIntegration:
    def __init__(self) -> None:
        self.should_fail = False
        self.last_context: QuoteRenderContext | None = None
        self.render_calls = 0

    def render(self, context: QuoteRenderContext) -> bytes:
        self.render_calls += 1
        self.last_context = context
        if self.should_fail:
            raise PdfRenderError("Unable to render quote PDF")
        validate_render_context(context)
        return f"PDF for {context.doc_number}".encode()


class _MockArqPool:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def enqueue_job(self, function: str, *args: object, **kwargs: object) -> object:
        self.calls.append(
            {
                "function": function,
                "args": args,
                "kwargs": kwargs,
            }
        )
        return SimpleNamespace(job_id=kwargs.get("_job_id"))


class _PdfJobResponse(TypedDict):
    id: str
    document_id: str
    document_revision: int
    job_type: str
    status: str
    attempts: int
    terminal_error: str | None


class _FakeStorageService:
    def __init__(self) -> None:
        self.fail_fetch = False
        self.objects: dict[str, bytes] = {}

    def upload(
        self,
        *,
        prefix: str,
        filename: str,
        data: bytes,
        content_type: str,
    ) -> str:
        del content_type
        object_path = f"{prefix.strip('/')}/{filename.lstrip('/')}"
        self.objects[object_path] = data
        return object_path

    def delete(self, object_path: str) -> None:
        self.objects.pop(object_path, None)

    def fetch_bytes(self, object_path: str) -> bytes:
        if self.fail_fetch:
            raise RuntimeError("storage unavailable")
        if object_path not in self.objects:
            raise StorageNotFoundError(object_path)
        return self.objects[object_path]


@pytest.fixture()
def _storage_service_dependency() -> Iterator[_FakeStorageService]:
    storage_service = _FakeStorageService()
    app.dependency_overrides[get_storage_service] = lambda: storage_service
    yield storage_service
    app.dependency_overrides.pop(get_storage_service, None)


@pytest.fixture()
def _arq_pool_dependency() -> Iterator[_MockArqPool]:
    arq_pool = _MockArqPool()
    app.dependency_overrides[get_arq_pool] = lambda: arq_pool
    yield arq_pool
    app.dependency_overrides.pop(get_arq_pool, None)


@pytest.fixture(autouse=True)
def _override_quote_service_dependency(
    _storage_service_dependency: _FakeStorageService,
) -> Iterator[_ConfigurablePdfIntegration]:
    pdf_integration = _ConfigurablePdfIntegration()

    async def _override_get_quote_service(
        db: Annotated[AsyncSession, Depends(get_db)],
    ) -> QuoteService:
        return QuoteService(
            repository=QuoteRepository(db),
            pdf_integration=pdf_integration,
            storage_service=_storage_service_dependency,
        )

    async def _override_get_invoice_service(
        db: Annotated[AsyncSession, Depends(get_db)],
    ) -> InvoiceService:
        return InvoiceService(
            invoice_repository=InvoiceRepository(db),
            quote_repository=QuoteRepository(db),
            pdf_integration=pdf_integration,
            storage_service=_storage_service_dependency,
        )

    app.dependency_overrides[get_quote_service] = _override_get_quote_service
    app.dependency_overrides[get_invoice_service] = _override_get_invoice_service
    yield pdf_integration
    app.dependency_overrides.pop(get_quote_service, None)
    app.dependency_overrides.pop(get_invoice_service, None)


async def test_generate_pdf_returns_pdf_and_sets_ready(
    client: AsyncClient,
    db_session: AsyncSession,
    _arq_pool_dependency: _MockArqPool,
    _storage_service_dependency: _FakeStorageService,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )

    job_payload = _assert_async_pdf_job_response(response, document_id=quote["id"])
    assert _arq_pool_dependency.calls == [
        {
            "function": "jobs.pdf",
            "args": (job_payload["id"],),
            "kwargs": {"_job_id": job_payload["id"]},
        }
    ]

    job_detail_before = await client.get(f"/api/jobs/{job_payload['id']}")
    assert job_detail_before.status_code == 200
    assert job_detail_before.json()["status"] == JobStatus.PENDING.value

    artifact_before = await client.get(f"/api/quotes/{quote['id']}/pdf")
    assert artifact_before.status_code == 409
    assert artifact_before.json() == {"detail": PDF_ARTIFACT_NOT_READY_DETAIL}

    detail_before = await client.get(f"/api/quotes/{quote['id']}")
    assert detail_before.status_code == 200
    assert detail_before.json()["status"] == "draft"
    assert detail_before.json()["pdf_artifact"] == {
        "status": "pending",
        "job_id": job_payload["id"],
        "download_url": None,
        "terminal_error": None,
    }

    await _run_pdf_job(
        db_session,
        job_id=job_payload["id"],
        pdf_integration=_override_quote_service_dependency,
        storage_service=_storage_service_dependency,
    )

    response = await client.get(f"/api/quotes/{quote['id']}/pdf")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-disposition"] == 'inline; filename="quote-Q-001.pdf"'
    assert response.content == b"PDF for Q-001"

    job_detail_after = await client.get(f"/api/jobs/{job_payload['id']}")
    assert job_detail_after.status_code == 200
    assert job_detail_after.json()["status"] == JobStatus.SUCCESS.value

    detail = await client.get(f"/api/quotes/{quote['id']}")
    assert detail.status_code == 200
    assert detail.json()["status"] == "ready"
    assert detail.json()["pdf_artifact"] == {
        "status": "ready",
        "job_id": None,
        "download_url": f"http://testserver/api/quotes/{quote['id']}/pdf",
        "terminal_error": None,
    }


async def test_generate_pdf_includes_logo_data_uri_when_logo_exists(
    client: AsyncClient,
    db_session: AsyncSession,
    _arq_pool_dependency: _MockArqPool,
    _storage_service_dependency: _FakeStorageService,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    await _upload_logo(client, csrf_token)
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )

    job_payload = _assert_async_pdf_job_response(response, document_id=quote["id"])
    await _run_pdf_job(
        db_session,
        job_id=job_payload["id"],
        pdf_integration=_override_quote_service_dependency,
        storage_service=_storage_service_dependency,
    )
    assert _override_quote_service_dependency.last_context is not None
    assert _override_quote_service_dependency.last_context.logo_data_uri is not None
    assert _override_quote_service_dependency.last_context.logo_data_uri.startswith(
        "data:image/png;base64,"
    )


async def test_generate_pdf_reuses_persisted_artifact_without_rerendering(
    client: AsyncClient,
    db_session: AsyncSession,
    _arq_pool_dependency: _MockArqPool,
    _storage_service_dependency: _FakeStorageService,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    first_response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    first_job = _assert_async_pdf_job_response(first_response, document_id=quote["id"])
    await _run_pdf_job(
        db_session,
        job_id=first_job["id"],
        pdf_integration=_override_quote_service_dependency,
        storage_service=_storage_service_dependency,
    )
    assert _override_quote_service_dependency.render_calls == 1

    second_response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    second_job = _assert_async_pdf_job_response(second_response, document_id=quote["id"])
    assert second_job["id"] != first_job["id"]

    await _run_pdf_job(
        db_session,
        job_id=second_job["id"],
        pdf_integration=_override_quote_service_dependency,
        storage_service=_storage_service_dependency,
    )
    assert _override_quote_service_dependency.render_calls == 1

    artifact_response = await client.get(f"/api/quotes/{quote['id']}/pdf")
    assert artifact_response.status_code == 200
    assert artifact_response.content == b"PDF for Q-001"


async def test_get_pdf_artifact_resets_missing_storage_artifact_and_keeps_revision(
    client: AsyncClient,
    db_session: AsyncSession,
    _arq_pool_dependency: _MockArqPool,
    _storage_service_dependency: _FakeStorageService,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    initial_job = await _generate_ready_quote_pdf(
        client,
        db_session,
        csrf_token=csrf_token,
        quote_id=quote["id"],
        pdf_integration=_override_quote_service_dependency,
        storage_service=_storage_service_dependency,
    )

    stored_quote = await db_session.scalar(select(Document).where(Document.id == UUID(quote["id"])))
    assert stored_quote is not None
    assert stored_quote.pdf_artifact_path is not None
    stored_revision = stored_quote.pdf_artifact_revision

    _storage_service_dependency.delete(stored_quote.pdf_artifact_path)

    artifact_response = await client.get(f"/api/quotes/{quote['id']}/pdf")
    assert artifact_response.status_code == 409
    assert artifact_response.json() == {"detail": PDF_ARTIFACT_NOT_READY_DETAIL}

    db_session.expire_all()
    recovered_quote = await db_session.scalar(
        select(Document).where(Document.id == UUID(quote["id"]))
    )
    assert recovered_quote is not None
    assert recovered_quote.pdf_artifact_path is None
    assert recovered_quote.pdf_artifact_job_id is None
    assert recovered_quote.pdf_artifact_revision == stored_revision

    detail_response = await client.get(f"/api/quotes/{quote['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["pdf_artifact"] == {
        "status": "missing",
        "job_id": None,
        "download_url": None,
        "terminal_error": None,
    }

    next_job_response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    next_job = _assert_async_pdf_job_response(next_job_response, document_id=quote["id"])
    assert next_job["document_revision"] == stored_revision
    assert initial_job["document_revision"] == stored_revision


async def test_generate_pdf_reuses_existing_pending_job_instead_of_enqueuing_duplicate(
    client: AsyncClient,
    _arq_pool_dependency: _MockArqPool,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    first_response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    first_job = _assert_async_pdf_job_response(first_response, document_id=quote["id"])

    second_response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    second_job = _assert_async_pdf_job_response(second_response, document_id=quote["id"])

    assert second_job["id"] == first_job["id"]
    assert _arq_pool_dependency.calls == [
        {
            "function": "jobs.pdf",
            "args": (first_job["id"],),
            "kwargs": {"_job_id": first_job["id"]},
        }
    ]


async def test_patch_quote_rendered_fields_invalidates_ready_pdf_artifact_and_bumps_revision(
    client: AsyncClient,
    db_session: AsyncSession,
    _arq_pool_dependency: _MockArqPool,
    _storage_service_dependency: _FakeStorageService,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    initial_job = await _generate_ready_quote_pdf(
        client,
        db_session,
        csrf_token=csrf_token,
        quote_id=quote["id"],
        pdf_integration=_override_quote_service_dependency,
        storage_service=_storage_service_dependency,
    )
    assert initial_job["document_revision"] is not None

    patch_response = await client.patch(
        f"/api/quotes/{quote['id']}",
        json={"notes": "Updated after the customer requested revisions"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200

    detail_response = await client.get(f"/api/quotes/{quote['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["pdf_artifact"] == {
        "status": "missing",
        "job_id": None,
        "download_url": None,
        "terminal_error": None,
    }

    artifact_response = await client.get(f"/api/quotes/{quote['id']}/pdf")
    assert artifact_response.status_code == 409
    assert artifact_response.json() == {"detail": PDF_ARTIFACT_NOT_READY_DETAIL}

    next_job_response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    next_job = _assert_async_pdf_job_response(next_job_response, document_id=quote["id"])
    assert next_job["document_revision"] == initial_job["document_revision"] + 1


async def test_profile_update_invalidates_ready_quote_pdf_artifact_and_bumps_revision(
    client: AsyncClient,
    db_session: AsyncSession,
    _arq_pool_dependency: _MockArqPool,
    _storage_service_dependency: _FakeStorageService,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    initial_job = await _generate_ready_quote_pdf(
        client,
        db_session,
        csrf_token=csrf_token,
        quote_id=quote["id"],
        pdf_integration=_override_quote_service_dependency,
        storage_service=_storage_service_dependency,
    )
    assert initial_job["document_revision"] is not None

    profile_response = await client.patch(
        "/api/profile",
        json={
            "business_name": "Summit Exterior Care",
            "first_name": "Jane",
            "last_name": "Doe",
            "trade_type": "Landscaper",
            "timezone": "America/New_York",
            "default_tax_rate": 0.0825,
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert profile_response.status_code == 200

    detail_response = await client.get(f"/api/quotes/{quote['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["pdf_artifact"] == {
        "status": "missing",
        "job_id": None,
        "download_url": None,
        "terminal_error": None,
    }

    artifact_response = await client.get(f"/api/quotes/{quote['id']}/pdf")
    assert artifact_response.status_code == 409
    assert artifact_response.json() == {"detail": PDF_ARTIFACT_NOT_READY_DETAIL}

    next_job_response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    next_job = _assert_async_pdf_job_response(next_job_response, document_id=quote["id"])
    assert next_job["document_revision"] == initial_job["document_revision"] + 1


async def test_profile_phone_update_invalidates_ready_quote_pdf_artifact_and_bumps_revision(
    client: AsyncClient,
    db_session: AsyncSession,
    _arq_pool_dependency: _MockArqPool,
    _storage_service_dependency: _FakeStorageService,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    baseline_profile_response = await client.patch(
        "/api/profile",
        json={
            "business_name": "Summit Exterior Care",
            "first_name": "Jane",
            "last_name": "Doe",
            "trade_type": "Landscaper",
            "timezone": "America/New_York",
            "default_tax_rate": 0.0825,
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert baseline_profile_response.status_code == 200

    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    initial_job = await _generate_ready_quote_pdf(
        client,
        db_session,
        csrf_token=csrf_token,
        quote_id=quote["id"],
        pdf_integration=_override_quote_service_dependency,
        storage_service=_storage_service_dependency,
    )
    assert initial_job["document_revision"] is not None

    profile_response = await client.patch(
        "/api/profile",
        json={
            "business_name": "Summit Exterior Care",
            "first_name": "Jane",
            "last_name": "Doe",
            "trade_type": "Landscaper",
            "timezone": "America/New_York",
            "default_tax_rate": 0.0825,
            "phone_number": "+1-555-111-2222",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert profile_response.status_code == 200

    detail_response = await client.get(f"/api/quotes/{quote['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["pdf_artifact"] == {
        "status": "missing",
        "job_id": None,
        "download_url": None,
        "terminal_error": None,
    }

    next_job_response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    next_job = _assert_async_pdf_job_response(next_job_response, document_id=quote["id"])
    assert next_job["document_revision"] == initial_job["document_revision"] + 1


async def test_logo_upload_invalidates_ready_quote_pdf_artifact_and_bumps_revision(
    client: AsyncClient,
    db_session: AsyncSession,
    _arq_pool_dependency: _MockArqPool,
    _storage_service_dependency: _FakeStorageService,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    initial_job = await _generate_ready_quote_pdf(
        client,
        db_session,
        csrf_token=csrf_token,
        quote_id=quote["id"],
        pdf_integration=_override_quote_service_dependency,
        storage_service=_storage_service_dependency,
    )
    assert initial_job["document_revision"] is not None

    await _upload_logo(client, csrf_token)

    detail_response = await client.get(f"/api/quotes/{quote['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["pdf_artifact"] == {
        "status": "missing",
        "job_id": None,
        "download_url": None,
        "terminal_error": None,
    }

    artifact_response = await client.get(f"/api/quotes/{quote['id']}/pdf")
    assert artifact_response.status_code == 409
    assert artifact_response.json() == {"detail": PDF_ARTIFACT_NOT_READY_DETAIL}

    next_job_response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    next_job = _assert_async_pdf_job_response(next_job_response, document_id=quote["id"])
    assert next_job["document_revision"] == initial_job["document_revision"] + 1


async def test_logo_delete_invalidates_ready_quote_pdf_artifact_and_bumps_revision(
    client: AsyncClient,
    db_session: AsyncSession,
    _arq_pool_dependency: _MockArqPool,
    _storage_service_dependency: _FakeStorageService,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    await _upload_logo(client, csrf_token)
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    initial_job = await _generate_ready_quote_pdf(
        client,
        db_session,
        csrf_token=csrf_token,
        quote_id=quote["id"],
        pdf_integration=_override_quote_service_dependency,
        storage_service=_storage_service_dependency,
    )
    assert initial_job["document_revision"] is not None

    delete_response = await client.delete(
        "/api/profile/logo",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert delete_response.status_code == 204

    detail_response = await client.get(f"/api/quotes/{quote['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["pdf_artifact"] == {
        "status": "missing",
        "job_id": None,
        "download_url": None,
        "terminal_error": None,
    }

    artifact_response = await client.get(f"/api/quotes/{quote['id']}/pdf")
    assert artifact_response.status_code == 409
    assert artifact_response.json() == {"detail": PDF_ARTIFACT_NOT_READY_DETAIL}

    next_job_response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    next_job = _assert_async_pdf_job_response(next_job_response, document_id=quote["id"])
    assert next_job["document_revision"] == initial_job["document_revision"] + 1


async def test_customer_update_invalidates_ready_quote_pdf_artifact_and_bumps_revision(
    client: AsyncClient,
    db_session: AsyncSession,
    _arq_pool_dependency: _MockArqPool,
    _storage_service_dependency: _FakeStorageService,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    initial_job = await _generate_ready_quote_pdf(
        client,
        db_session,
        csrf_token=csrf_token,
        quote_id=quote["id"],
        pdf_integration=_override_quote_service_dependency,
        storage_service=_storage_service_dependency,
    )
    assert initial_job["document_revision"] is not None

    customer_response = await client.patch(
        f"/api/customers/{customer_id}",
        json={"name": "Updated PDF Test Customer"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert customer_response.status_code == 200

    detail_response = await client.get(f"/api/quotes/{quote['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["pdf_artifact"] == {
        "status": "missing",
        "job_id": None,
        "download_url": None,
        "terminal_error": None,
    }

    artifact_response = await client.get(f"/api/quotes/{quote['id']}/pdf")
    assert artifact_response.status_code == 409
    assert artifact_response.json() == {"detail": PDF_ARTIFACT_NOT_READY_DETAIL}

    next_job_response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    next_job = _assert_async_pdf_job_response(next_job_response, document_id=quote["id"])
    assert next_job["document_revision"] == initial_job["document_revision"] + 1


async def test_customer_phone_update_does_not_invalidate_ready_quote_pdf_artifact(
    client: AsyncClient,
    db_session: AsyncSession,
    _arq_pool_dependency: _MockArqPool,
    _storage_service_dependency: _FakeStorageService,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    await _generate_ready_quote_pdf(
        client,
        db_session,
        csrf_token=csrf_token,
        quote_id=quote["id"],
        pdf_integration=_override_quote_service_dependency,
        storage_service=_storage_service_dependency,
    )

    customer_response = await client.patch(
        f"/api/customers/{customer_id}",
        json={"phone": "555-123-4567"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert customer_response.status_code == 200

    detail_response = await client.get(f"/api/quotes/{quote['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["pdf_artifact"] == {
        "status": "ready",
        "job_id": None,
        "download_url": f"http://testserver/api/quotes/{quote['id']}/pdf",
        "terminal_error": None,
    }

    artifact_response = await client.get(f"/api/quotes/{quote['id']}/pdf")
    assert artifact_response.status_code == 200


async def test_generate_pdf_handles_sparse_quote_context(
    client: AsyncClient,
    db_session: AsyncSession,
    _arq_pool_dependency: _MockArqPool,
    _storage_service_dependency: _FakeStorageService,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    credentials = _credentials()
    csrf_token = await _register_and_login(client, credentials)
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(
        client,
        csrf_token,
        customer_id,
        payload={
            "title": None,
            "line_items": [
                {
                    "description": "Install mulch",
                    "details": None,
                    "price": None,
                }
            ],
            "total_amount": None,
            "notes": None,
        },
    )

    response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )

    job_payload = _assert_async_pdf_job_response(response, document_id=quote["id"])
    await _run_pdf_job(
        db_session,
        job_id=job_payload["id"],
        pdf_integration=_override_quote_service_dependency,
        storage_service=_storage_service_dependency,
    )
    assert _override_quote_service_dependency.last_context is not None
    assert _override_quote_service_dependency.last_context.title is None
    assert _override_quote_service_dependency.last_context.logo_data_uri is None
    assert _override_quote_service_dependency.last_context.notes is None
    assert _override_quote_service_dependency.last_context.total_amount is None
    assert len(_override_quote_service_dependency.last_context.line_items) == 1
    assert _override_quote_service_dependency.last_context.line_items[0].details is None


async def test_generate_pdf_does_not_downgrade_shared_quote(
    client: AsyncClient,
    db_session: AsyncSession,
    _arq_pool_dependency: _MockArqPool,
    _storage_service_dependency: _FakeStorageService,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    assert share_response.json()["status"] == "shared"

    pdf_response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    job_payload = _assert_async_pdf_job_response(pdf_response, document_id=quote["id"])
    await _run_pdf_job(
        db_session,
        job_id=job_payload["id"],
        pdf_integration=_override_quote_service_dependency,
        storage_service=_storage_service_dependency,
    )

    detail = await client.get(f"/api/quotes/{quote['id']}")
    assert detail.status_code == 200
    assert detail.json()["status"] == "shared"


@pytest.mark.parametrize(
    "status",
    [QuoteStatus.VIEWED, QuoteStatus.APPROVED, QuoteStatus.DECLINED],
)
async def test_generate_pdf_does_not_downgrade_post_share_quote_statuses(
    client: AsyncClient,
    db_session: AsyncSession,
    _arq_pool_dependency: _MockArqPool,
    _storage_service_dependency: _FakeStorageService,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
    status: QuoteStatus,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    await _set_quote_status(db_session, quote["id"], status)

    pdf_response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    job_payload = _assert_async_pdf_job_response(pdf_response, document_id=quote["id"])
    await _run_pdf_job(
        db_session,
        job_id=job_payload["id"],
        pdf_integration=_override_quote_service_dependency,
        storage_service=_storage_service_dependency,
    )

    detail = await client.get(f"/api/quotes/{quote['id']}")
    assert detail.status_code == 200
    assert detail.json()["status"] == status.value


async def test_share_sets_status_token_and_timestamp(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "shared"
    assert isinstance(payload["share_token"], str) and payload["share_token"]
    assert payload["shared_at"] is not None

    detail_response = await client.get(f"/api/quotes/{quote['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["has_active_share"] is True


async def test_share_reuses_existing_token_and_updates_timestamp(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    first_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert first_response.status_code == 200
    first_payload = first_response.json()

    await asyncio.sleep(0.02)
    second_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert second_response.status_code == 200
    second_payload = second_response.json()
    assert second_payload["share_token"] == first_payload["share_token"]
    assert second_payload["shared_at"] != first_payload["shared_at"]


@pytest.mark.parametrize(
    "status",
    [QuoteStatus.VIEWED, QuoteStatus.APPROVED, QuoteStatus.DECLINED],
)
async def test_share_does_not_regress_viewed_or_finalized_quotes(
    client: AsyncClient,
    db_session: AsyncSession,
    status: QuoteStatus,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    await _set_quote_status(db_session, quote["id"], status)

    detail_before = await client.get(f"/api/quotes/{quote['id']}")
    assert detail_before.status_code == 200

    second_share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert second_share_response.status_code == 200
    payload = second_share_response.json()
    assert payload["status"] == status.value
    assert payload["share_token"] == detail_before.json()["share_token"]
    assert payload["shared_at"] == detail_before.json()["shared_at"]


async def test_generate_pdf_returns_422_when_render_fails(
    client: AsyncClient,
    db_session: AsyncSession,
    _arq_pool_dependency: _MockArqPool,
    _storage_service_dependency: _FakeStorageService,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    _override_quote_service_dependency.should_fail = True
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )

    job_payload = _assert_async_pdf_job_response(response, document_id=quote["id"])
    with pytest.raises(NonRetryableJobError, match="Unable to render quote PDF"):
        await _run_pdf_job(
            db_session,
            job_id=job_payload["id"],
            pdf_integration=_override_quote_service_dependency,
            storage_service=_storage_service_dependency,
        )

    job_detail = await client.get(f"/api/jobs/{job_payload['id']}")
    assert job_detail.status_code == 200
    assert job_detail.json()["status"] == JobStatus.TERMINAL.value

    detail = await client.get(f"/api/quotes/{quote['id']}")
    assert detail.status_code == 200
    assert detail.json()["pdf_artifact"]["status"] == "failed"
    assert detail.json()["pdf_artifact"]["job_id"] == job_payload["id"]
    assert detail.json()["pdf_artifact"]["download_url"] is None
    assert detail.json()["pdf_artifact"]["terminal_error"] is not None

    artifact_response = await client.get(f"/api/quotes/{quote['id']}/pdf")
    assert artifact_response.status_code == 409
    assert artifact_response.json() == {"detail": PDF_ARTIFACT_NOT_READY_DETAIL}


async def test_generate_pdf_rejects_documents_that_exceed_render_limits(
    client: AsyncClient,
    db_session: AsyncSession,
    _arq_pool_dependency: _MockArqPool,
    _storage_service_dependency: _FakeStorageService,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    quote_row = await db_session.scalar(
        select(Document)
        .options(selectinload(Document.line_items))
        .where(Document.id == UUID(quote["id"]))
    )
    assert quote_row is not None
    quote_row.line_items = [
        LineItem(
            description=f"line item {index}",
            details=None,
            price=55,
            sort_order=index,
        )
        for index in range(DOCUMENT_LINE_ITEMS_MAX_ITEMS + 1)
    ]
    await db_session.commit()

    response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )

    job_payload = _assert_async_pdf_job_response(response, document_id=quote["id"])
    with pytest.raises(NonRetryableJobError, match="Document exceeds supported render limits"):
        await _run_pdf_job(
            db_session,
            job_id=job_payload["id"],
            pdf_integration=_override_quote_service_dependency,
            storage_service=_storage_service_dependency,
        )

    detail = await client.get(f"/api/quotes/{quote['id']}")
    assert detail.status_code == 200
    assert detail.json()["pdf_artifact"]["status"] == "failed"
    assert detail.json()["pdf_artifact"]["job_id"] == job_payload["id"]
    assert detail.json()["pdf_artifact"]["terminal_error"] is not None

    artifact_response = await client.get(f"/api/quotes/{quote['id']}/pdf")
    assert artifact_response.status_code == 409
    assert artifact_response.json() == {"detail": PDF_ARTIFACT_NOT_READY_DETAIL}


async def test_generate_pdf_returns_404_for_nonexistent_quote(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        f"/api/quotes/{uuid4()}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_share_quote_returns_404_for_nonexistent_quote(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        f"/api/quotes/{uuid4()}/share",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_pdf_endpoint_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    response = await client.post(f"/api/quotes/{quote['id']}/pdf")

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_generate_quote_pdf_slowapi_rate_limit_returns_429(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    _arq_pool_dependency: _MockArqPool,
) -> None:
    monkeypatch.setattr(app.state.limiter, "enabled", True)
    monkeypatch.setenv("AUTHENTICATED_PDF_GENERATION_RATE_LIMIT", "1/minute")
    get_settings.cache_clear()
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    first_response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    second_response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert first_response.status_code == 202
    assert second_response.status_code == 429
    assert "Rate limit exceeded" in second_response.json()["error"]


async def test_share_endpoint_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    response = await client.post(f"/api/quotes/{quote['id']}/share")

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


async def test_public_share_endpoint_streams_pdf_without_auth(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]
    assert isinstance(share_token, str)

    client.cookies.clear()
    response = await client.get(f"/share/{share_token}")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-robots-tag"] == "noindex"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert response.headers["x-frame-options"] == "DENY"


async def test_public_share_endpoint_marks_first_view_once(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]

    emitted_events: list[dict[str, str]] = []

    def _capture(message: str) -> None:
        emitted_events.append(json.loads(message))

    monkeypatch.setattr(event_logger._EVENT_LOGGER, "info", _capture)  # noqa: SLF001

    client.cookies.clear()
    first_response = await client.get(f"/share/{share_token}")
    second_response = await client.get(f"/share/{share_token}")

    assert first_response.status_code == 200
    assert second_response.status_code == 200

    await event_logger.flush_event_tasks()
    quote_row = await db_session.scalar(select(Document).where(Document.id == UUID(quote["id"])))
    assert quote_row is not None
    assert quote_row.status == QuoteStatus.VIEWED

    assert [event["event"] for event in emitted_events] == ["quote_viewed"]
    assert emitted_events[0]["quote_id"] == quote["id"]
    assert emitted_events[0]["customer_id"] == customer_id


async def test_public_share_endpoint_includes_logo_data_uri_when_logo_exists(
    client: AsyncClient,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    await _upload_logo(client, csrf_token)
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]

    client.cookies.clear()
    response = await client.get(f"/share/{share_token}")

    assert response.status_code == 200
    assert _override_quote_service_dependency.last_context is not None
    assert _override_quote_service_dependency.last_context.logo_data_uri is not None


async def test_public_share_endpoint_passes_contractor_contact_fields_to_pdf_render(
    client: AsyncClient,
    db_session: AsyncSession,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    credentials = _credentials()
    csrf_token = await _register_and_login(client, credentials)
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    await _set_user_email_and_phone_number(
        db_session,
        email=credentials["email"],
        updated_email="quotes@example.com",
        phone_number="+1-555-111-2222",
    )

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]

    client.cookies.clear()
    response = await client.get(f"/share/{share_token}")

    assert response.status_code == 200
    assert _override_quote_service_dependency.last_context is not None
    assert _override_quote_service_dependency.last_context.phone_number == "+1-555-111-2222"
    assert _override_quote_service_dependency.last_context.contractor_email == "quotes@example.com"


async def test_render_context_queries_return_same_contractor_contact_fields_for_shared_quotes(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    credentials = _credentials()
    csrf_token = await _register_and_login(client, credentials)
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    await _set_user_email_and_phone_number(
        db_session,
        email=credentials["email"],
        updated_email="quotes@example.com",
        phone_number="+1-555-111-2222",
    )

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]

    user = await _get_user_by_email(db_session, "quotes@example.com")
    repository = QuoteRepository(db_session)
    authenticated_context = await repository.get_render_context(UUID(quote["id"]), user.id)
    shared_context = await repository.get_render_context_by_share_token(share_token)

    assert authenticated_context is not None
    assert shared_context is not None
    assert authenticated_context.phone_number == "+1-555-111-2222"
    assert shared_context.phone_number == authenticated_context.phone_number
    assert authenticated_context.contractor_email == "quotes@example.com"
    assert shared_context.contractor_email == authenticated_context.contractor_email


async def test_public_share_endpoint_returns_404_for_unknown_token(client: AsyncClient) -> None:
    client.cookies.clear()
    response = await client.get("/share/not-a-real-token")
    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_public_share_endpoint_returns_422_when_render_fails(
    client: AsyncClient,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    _override_quote_service_dependency.should_fail = True
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]

    client.cookies.clear()
    response = await client.get(f"/share/{share_token}")

    assert response.status_code == 422
    assert response.json() == {"detail": "Unable to render quote PDF"}


async def test_public_quote_endpoint_returns_json_and_marks_first_view_once(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]

    emitted_events: list[dict[str, str]] = []

    def _capture(message: str) -> None:
        emitted_events.append(json.loads(message))

    monkeypatch.setattr(event_logger._EVENT_LOGGER, "info", _capture)  # noqa: SLF001

    client.cookies.clear()
    first_response = await client.get(f"/api/public/doc/{share_token}")
    second_response = await client.get(f"/api/public/doc/{share_token}")

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert first_response.headers["cache-control"] == "no-store"
    assert first_response.headers["x-robots-tag"] == "noindex"
    first_payload = first_response.json()
    assert first_payload["doc_type"] == "quote"
    assert first_payload["doc_number"] == "Q-001"
    assert first_payload["status"] == "viewed"
    assert first_payload["download_url"].endswith(f"/share/{share_token}")
    assert first_payload["logo_url"].endswith(f"/api/public/doc/{share_token}/logo")
    assert second_response.json()["status"] == "viewed"

    await event_logger.flush_event_tasks()
    quote_row = await db_session.scalar(select(Document).where(Document.id == UUID(quote["id"])))
    assert quote_row is not None
    assert quote_row.status == QuoteStatus.VIEWED

    assert [event["event"] for event in emitted_events] == ["quote_viewed"]
    assert emitted_events[0]["quote_id"] == quote["id"]
    assert emitted_events[0]["customer_id"] == customer_id


async def test_revoke_share_is_idempotent_when_quote_has_no_token(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    revoke_response = await client.delete(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert revoke_response.status_code == 204

    detail_response = await client.get(f"/api/quotes/{quote['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["share_token"] is None
    assert detail_response.json()["has_active_share"] is False

    quote_row = await db_session.scalar(select(Document).where(Document.id == UUID(quote["id"])))
    assert quote_row is not None
    assert quote_row.share_token is None
    assert quote_row.share_token_revoked_at is None


async def test_revoke_share_is_idempotent_when_quote_token_already_revoked(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200

    first_revoke_response = await client.delete(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert first_revoke_response.status_code == 204

    first_quote_row = await db_session.scalar(
        select(Document).where(Document.id == UUID(quote["id"]))
    )
    assert first_quote_row is not None
    first_revoked_at = first_quote_row.share_token_revoked_at
    assert first_revoked_at is not None

    second_revoke_response = await client.delete(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert second_revoke_response.status_code == 204

    detail_response = await client.get(f"/api/quotes/{quote['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["has_active_share"] is False

    second_quote_row = await db_session.scalar(
        select(Document).where(Document.id == UUID(quote["id"]))
    )
    assert second_quote_row is not None
    assert second_quote_row.share_token_revoked_at == first_revoked_at


async def test_revoked_public_quote_token_returns_generic_404(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]

    detail_before_revoke = await client.get(f"/api/quotes/{quote['id']}")
    assert detail_before_revoke.status_code == 200
    assert detail_before_revoke.json()["has_active_share"] is True

    revoke_response = await client.delete(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert revoke_response.status_code == 204

    detail_after_revoke = await client.get(f"/api/quotes/{quote['id']}")
    assert detail_after_revoke.status_code == 200
    assert detail_after_revoke.json()["share_token"] == share_token
    assert detail_after_revoke.json()["has_active_share"] is False

    client.cookies.clear()
    json_response = await client.get(f"/api/public/doc/{share_token}")
    pdf_response = await client.get(f"/share/{share_token}")

    assert json_response.status_code == 404
    assert json_response.json() == {"detail": "Not found"}
    assert pdf_response.status_code == 404
    assert pdf_response.json() == {"detail": "Not found"}

    quote_row = await db_session.scalar(select(Document).where(Document.id == UUID(quote["id"])))
    assert quote_row is not None
    assert quote_row.share_token_revoked_at is not None


async def test_revoked_public_quote_token_emits_structured_denial_log(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[dict[str, object]] = []

    def _capture(payload: dict[str, object], *, level: int) -> None:
        captured.append(payload)

    monkeypatch.setattr(observability, "_emit_security_payload", _capture)
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]

    revoke_response = await client.delete(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert revoke_response.status_code == 204

    client.cookies.clear()
    response = await client.get(f"/api/public/doc/{share_token}")

    assert response.status_code == 404
    denial_event = next(
        payload for payload in captured if payload.get("event") == "public_share.token_denied"
    )
    assert denial_event["reason"] == "revoked"
    assert denial_event["status_code"] == 404
    assert denial_event["document_type"] == "quote"
    assert denial_event["route_template"] == "/api/public/doc/{token}"
    assert isinstance(denial_event["token_ref_hash"], str)
    assert share_token not in json.dumps(denial_event, sort_keys=True)


async def test_expired_public_quote_token_returns_generic_404(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]

    await _set_share_token_expiry(
        db_session,
        document_id=UUID(quote["id"]),
        expires_at=datetime.now(UTC) - timedelta(days=1),
    )

    client.cookies.clear()
    response = await client.get(f"/api/public/doc/{share_token}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_regenerate_quote_share_invalidates_old_token(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    first_share = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert first_share.status_code == 200
    first_token = first_share.json()["share_token"]

    second_share = await client.post(
        f"/api/quotes/{quote['id']}/share?regenerate=true",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert second_share.status_code == 200
    second_token = second_share.json()["share_token"]

    assert second_token != first_token

    client.cookies.clear()
    old_response = await client.get(f"/api/public/doc/{first_token}")
    new_response = await client.get(f"/api/public/doc/{second_token}")

    assert old_response.status_code == 404
    assert new_response.status_code == 200
    assert new_response.json()["doc_type"] == "quote"


async def test_public_share_pdf_rate_limit_returns_429(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(app.state.limiter, "enabled", True)
    monkeypatch.setenv("PUBLIC_DOCUMENT_FETCH_RATE_LIMIT", "1/minute")
    get_settings.cache_clear()
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]

    client.cookies.clear()
    first_response = await client.get(f"/share/{share_token}")
    second_response = await client.get(f"/share/{share_token}")

    assert first_response.status_code == 200
    assert second_response.status_code == 429


async def test_public_share_access_logs_redact_raw_tokens(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[dict[str, object]] = []

    def _capture(payload: dict[str, object], *, level: int) -> None:
        captured.append(payload)

    monkeypatch.setattr(observability, "_emit_security_payload", _capture)
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]

    client.cookies.clear()
    public_doc_response = await client.get(f"/api/public/doc/{share_token}")
    public_pdf_response = await client.get(f"/share/{share_token}")

    assert public_doc_response.status_code == 200
    assert public_pdf_response.status_code in {200, 422}

    access_events = [
        payload
        for payload in captured
        if payload.get("event") == "http.request.completed"
        and payload.get("route_template") in {"/api/public/doc/{token}", "/share/{token}"}
    ]
    assert len(access_events) >= 2
    assert {payload["route_template"] for payload in access_events} == {
        "/api/public/doc/{token}",
        "/share/{token}",
    }
    assert all(share_token not in json.dumps(payload, sort_keys=True) for payload in access_events)


async def test_public_quote_json_rate_limit_returns_429(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(app.state.limiter, "enabled", True)
    monkeypatch.setenv("PUBLIC_DOCUMENT_FETCH_RATE_LIMIT", "1/minute")
    get_settings.cache_clear()
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]

    client.cookies.clear()
    first_response = await client.get(f"/api/public/doc/{share_token}")
    second_response = await client.get(f"/api/public/doc/{share_token}")

    assert first_response.status_code == 200
    assert second_response.status_code == 429


async def test_public_quote_endpoint_prefers_terminal_status_when_view_transition_races(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]

    emitted_events: list[dict[str, str]] = []

    def _capture(message: str) -> None:
        emitted_events.append(json.loads(message))

    async def _simulate_terminal_race(
        self: QuoteRepository,
        share_token: str,
        *,
        accessed_at: datetime,
    ) -> None:
        await self._session.execute(
            update(Document)
            .where(Document.share_token == share_token)
            .values(status=QuoteStatus.APPROVED)
        )
        await self._session.commit()
        del accessed_at
        return None

    monkeypatch.setattr(event_logger._EVENT_LOGGER, "info", _capture)  # noqa: SLF001
    monkeypatch.setattr(
        QuoteRepository,
        "transition_to_viewed_by_share_token",
        _simulate_terminal_race,
    )

    client.cookies.clear()
    response = await client.get(f"/api/public/doc/{share_token}")

    assert response.status_code == 200
    assert response.json()["status"] == "approved"

    await event_logger.flush_event_tasks()
    quote_row = await db_session.scalar(select(Document).where(Document.id == UUID(quote["id"])))
    assert quote_row is not None
    assert quote_row.status == QuoteStatus.APPROVED
    assert emitted_events == []


@pytest.mark.parametrize("status", [QuoteStatus.DRAFT, QuoteStatus.READY])
async def test_public_quote_endpoint_returns_404_for_non_public_statuses(
    client: AsyncClient,
    db_session: AsyncSession,
    status: QuoteStatus,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    token = f"manual-token-{status.value}"

    quote_row = await db_session.scalar(select(Document).where(Document.id == UUID(quote["id"])))
    assert quote_row is not None
    quote_row.share_token = token
    quote_row.status = status
    await db_session.commit()

    client.cookies.clear()
    response = await client.get(f"/api/public/doc/{token}")

    assert response.status_code == 404
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-robots-tag"] == "noindex"
    assert response.json() == {"detail": "Not found"}


@pytest.mark.parametrize(
    ("status", "expected_message"),
    [
        (QuoteStatus.APPROVED, "approved"),
        (QuoteStatus.DECLINED, "declined"),
    ],
)
async def test_public_quote_endpoint_returns_visible_terminal_statuses(
    client: AsyncClient,
    db_session: AsyncSession,
    status: QuoteStatus,
    expected_message: str,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]
    await _set_quote_status(db_session, quote["id"], status)

    client.cookies.clear()
    response = await client.get(f"/api/public/doc/{share_token}")

    assert response.status_code == 200
    assert response.json()["status"] == expected_message


async def test_public_quote_access_touches_timestamp_for_already_visible_status(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]

    await _set_quote_status(db_session, quote["id"], QuoteStatus.APPROVED)
    seeded_accessed_at = datetime.now(UTC) - timedelta(minutes=5)
    quote_row = await db_session.scalar(select(Document).where(Document.id == UUID(quote["id"])))
    assert quote_row is not None
    quote_row.last_public_accessed_at = seeded_accessed_at
    await db_session.commit()

    client.cookies.clear()
    json_response = await client.get(f"/api/public/doc/{share_token}")
    assert json_response.status_code == 200
    assert json_response.json()["status"] == "approved"

    row_after_json = await db_session.scalar(
        select(Document).where(Document.id == UUID(quote["id"]))
    )
    assert row_after_json is not None
    assert row_after_json.status == QuoteStatus.APPROVED
    assert row_after_json.last_public_accessed_at is not None
    assert row_after_json.last_public_accessed_at > seeded_accessed_at
    first_accessed_at = row_after_json.last_public_accessed_at

    pdf_response = await client.get(f"/share/{share_token}")
    assert pdf_response.status_code == 200

    row_after_pdf = await db_session.scalar(
        select(Document).where(Document.id == UUID(quote["id"]))
    )
    assert row_after_pdf is not None
    assert row_after_pdf.status == QuoteStatus.APPROVED
    assert row_after_pdf.last_public_accessed_at is not None
    assert row_after_pdf.last_public_accessed_at > first_accessed_at


async def test_public_logo_endpoint_returns_image_bytes(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    await _upload_logo(client, csrf_token)
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]

    client.cookies.clear()
    response = await client.get(f"/api/public/doc/{share_token}/logo")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/png")
    assert response.headers["cache-control"] == "public, max-age=300"
    assert response.headers["x-robots-tag"] == "noindex"
    assert response.content == _PNG_BYTES


async def test_public_logo_rate_limit_returns_429(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(app.state.limiter, "enabled", True)
    monkeypatch.setenv("PUBLIC_LOGO_FETCH_RATE_LIMIT", "1/minute")
    get_settings.cache_clear()
    csrf_token = await _register_and_login(client, _credentials())
    await _upload_logo(client, csrf_token)
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]

    client.cookies.clear()
    first_response = await client.get(f"/api/public/doc/{share_token}/logo")
    second_response = await client.get(f"/api/public/doc/{share_token}/logo")

    assert first_response.status_code == 200
    assert second_response.status_code == 429


async def test_public_logo_endpoint_returns_404_when_quote_has_no_logo(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]

    client.cookies.clear()
    response = await client.get(f"/api/public/doc/{share_token}/logo")

    assert response.status_code == 404
    assert response.headers["x-robots-tag"] == "noindex"
    assert response.json() == {"detail": "Logo not found"}


async def test_public_logo_endpoint_returns_404_when_logo_object_is_missing(
    client: AsyncClient,
    _storage_service_dependency: _FakeStorageService,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    await _upload_logo(client, csrf_token)
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]
    _storage_service_dependency.objects.clear()

    client.cookies.clear()
    response = await client.get(f"/api/public/doc/{share_token}/logo")

    assert response.status_code == 404
    assert response.headers["x-robots-tag"] == "noindex"
    assert response.json() == {"detail": "Logo not found"}


async def test_public_logo_endpoint_returns_500_for_storage_failures(
    client: AsyncClient,
    _storage_service_dependency: _FakeStorageService,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    await _upload_logo(client, csrf_token)
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    share_response = await client.post(
        f"/api/quotes/{quote['id']}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]
    _storage_service_dependency.fail_fetch = True

    client.cookies.clear()
    response = await client.get(f"/api/public/doc/{share_token}/logo")

    assert response.status_code == 500
    assert response.headers["x-robots-tag"] == "noindex"
    assert response.json() == {"detail": "Unable to load logo"}


async def test_generate_pdf_logs_and_omits_logo_when_storage_fetch_fails(
    client: AsyncClient,
    db_session: AsyncSession,
    caplog: pytest.LogCaptureFixture,
    _arq_pool_dependency: _MockArqPool,
    _storage_service_dependency: _FakeStorageService,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    await _upload_logo(client, csrf_token)
    _storage_service_dependency.fail_fetch = True
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    with caplog.at_level("WARNING", logger="app.worker.job_registry"):
        response = await client.post(
            f"/api/quotes/{quote['id']}/pdf",
            headers={"X-CSRF-Token": csrf_token},
        )
        job_payload = _assert_async_pdf_job_response(response, document_id=quote["id"])
        await _run_pdf_job(
            db_session,
            job_id=job_payload["id"],
            pdf_integration=_override_quote_service_dependency,
            storage_service=_storage_service_dependency,
        )

    assert _override_quote_service_dependency.last_context is not None
    assert _override_quote_service_dependency.last_context.logo_data_uri is None
    assert any("omitting logo" in record.message for record in caplog.records)


async def test_invoice_pdf_generation_sets_ready_and_renders_invoice_context(
    client: AsyncClient,
    db_session: AsyncSession,
    _arq_pool_dependency: _MockArqPool,
    _storage_service_dependency: _FakeStorageService,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    await _set_quote_status(db_session, quote["id"], QuoteStatus.APPROVED)
    convert_response = await client.post(
        f"/api/quotes/{quote['id']}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert convert_response.status_code == 201
    invoice_id = convert_response.json()["id"]

    response = await client.post(
        f"/api/invoices/{invoice_id}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )

    job_payload = _assert_async_pdf_job_response(response, document_id=invoice_id)
    await _run_pdf_job(
        db_session,
        job_id=job_payload["id"],
        pdf_integration=_override_quote_service_dependency,
        storage_service=_storage_service_dependency,
    )

    response = await client.get(f"/api/invoices/{invoice_id}/pdf")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-disposition"] == 'inline; filename="invoice-I-001.pdf"'
    assert response.content == b"PDF for I-001"
    assert _override_quote_service_dependency.last_context is not None
    assert _override_quote_service_dependency.last_context.doc_label == "Invoice"
    assert _override_quote_service_dependency.last_context.due_date is not None

    detail_response = await client.get(f"/api/invoices/{invoice_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["status"] == "ready"


async def test_patch_invoice_rendered_fields_invalidates_ready_pdf_artifact_and_bumps_revision(
    client: AsyncClient,
    db_session: AsyncSession,
    _arq_pool_dependency: _MockArqPool,
    _storage_service_dependency: _FakeStorageService,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    await _set_quote_status(db_session, quote["id"], QuoteStatus.APPROVED)
    convert_response = await client.post(
        f"/api/quotes/{quote['id']}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert convert_response.status_code == 201
    invoice_id = convert_response.json()["id"]

    initial_job = await _generate_ready_invoice_pdf(
        client,
        db_session,
        csrf_token=csrf_token,
        invoice_id=invoice_id,
        pdf_integration=_override_quote_service_dependency,
        storage_service=_storage_service_dependency,
    )
    assert initial_job["document_revision"] is not None

    patch_response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={"title": "Updated invoice title"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200

    detail_response = await client.get(f"/api/invoices/{invoice_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["pdf_artifact"] == {
        "status": "missing",
        "job_id": None,
        "download_url": None,
        "terminal_error": None,
    }

    artifact_response = await client.get(f"/api/invoices/{invoice_id}/pdf")
    assert artifact_response.status_code == 409
    assert artifact_response.json() == {"detail": PDF_ARTIFACT_NOT_READY_DETAIL}

    next_job_response = await client.post(
        f"/api/invoices/{invoice_id}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    next_job = _assert_async_pdf_job_response(next_job_response, document_id=invoice_id)
    assert next_job["document_revision"] == initial_job["document_revision"] + 1


async def test_generate_invoice_pdf_slowapi_rate_limit_returns_429(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    _arq_pool_dependency: _MockArqPool,
) -> None:
    monkeypatch.setattr(app.state.limiter, "enabled", True)
    monkeypatch.setenv("AUTHENTICATED_PDF_GENERATION_RATE_LIMIT", "1/minute")
    get_settings.cache_clear()
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    await _set_quote_status(db_session, quote["id"], QuoteStatus.APPROVED)
    convert_response = await client.post(
        f"/api/quotes/{quote['id']}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert convert_response.status_code == 201
    invoice_id = convert_response.json()["id"]

    first_response = await client.post(
        f"/api/invoices/{invoice_id}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    second_response = await client.post(
        f"/api/invoices/{invoice_id}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert first_response.status_code == 202
    assert second_response.status_code == 429
    assert "Rate limit exceeded" in second_response.json()["error"]


async def test_invoice_share_returns_sent_and_raw_share_token_renders_pdf(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    await _set_quote_status(db_session, quote["id"], QuoteStatus.APPROVED)
    convert_response = await client.post(
        f"/api/quotes/{quote['id']}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert convert_response.status_code == 201
    invoice_id = convert_response.json()["id"]

    share_response = await client.post(
        f"/api/invoices/{invoice_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_payload = share_response.json()
    assert share_payload["status"] == "sent"
    assert share_payload["share_token"]

    detail_response = await client.get(f"/api/invoices/{invoice_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["has_active_share"] is True

    pdf_response = await client.get(f"/share/{share_payload['share_token']}")
    assert pdf_response.status_code == 200
    assert pdf_response.headers["content-disposition"] == 'inline; filename="invoice-I-001.pdf"'
    assert pdf_response.content == b"PDF for I-001"


async def test_public_invoice_endpoint_returns_json_and_logs_first_view_once(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    await _set_quote_status(db_session, quote["id"], QuoteStatus.APPROVED)
    convert_response = await client.post(
        f"/api/quotes/{quote['id']}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert convert_response.status_code == 201
    invoice_id = convert_response.json()["id"]

    share_response = await client.post(
        f"/api/invoices/{invoice_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]
    assert share_token is not None

    emitted_events: list[dict[str, str]] = []

    def _capture(message: str) -> None:
        emitted_events.append(json.loads(message))

    monkeypatch.setattr(event_logger._EVENT_LOGGER, "info", _capture)  # noqa: SLF001

    client.cookies.clear()
    first_response = await client.get(f"/api/public/doc/{share_token}")
    second_response = await client.get(f"/api/public/doc/{share_token}")

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    first_payload = first_response.json()
    assert first_payload["doc_type"] == "invoice"
    assert first_payload["status"] == "sent"
    assert first_payload["doc_number"] == "I-001"
    assert first_payload["due_date"] is not None
    assert second_response.json()["doc_type"] == "invoice"

    await event_logger.flush_event_tasks()
    invoice_row = await db_session.scalar(select(Document).where(Document.id == UUID(invoice_id)))
    assert invoice_row is not None
    assert invoice_row.invoice_first_viewed_at is not None
    assert invoice_row.last_public_accessed_at is not None

    invoice_view_events = [event for event in emitted_events if event["event"] == "invoice_viewed"]
    assert len(invoice_view_events) == 1
    assert invoice_view_events[0]["invoice_id"] == invoice_id
    assert invoice_view_events[0]["customer_id"] == customer_id


async def test_public_logo_endpoint_supports_invoice_tokens(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    await _upload_logo(client, csrf_token)
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    await _set_quote_status(db_session, quote["id"], QuoteStatus.APPROVED)
    convert_response = await client.post(
        f"/api/quotes/{quote['id']}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert convert_response.status_code == 201
    invoice_id = convert_response.json()["id"]

    share_response = await client.post(
        f"/api/invoices/{invoice_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]
    assert share_token is not None

    client.cookies.clear()
    response = await client.get(f"/api/public/doc/{share_token}/logo")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/png")
    assert response.content == _PNG_BYTES


async def test_revoked_public_invoice_token_returns_generic_404(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    await _set_quote_status(db_session, quote["id"], QuoteStatus.APPROVED)
    convert_response = await client.post(
        f"/api/quotes/{quote['id']}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert convert_response.status_code == 201
    invoice_id = convert_response.json()["id"]

    share_response = await client.post(
        f"/api/invoices/{invoice_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]

    detail_before_revoke = await client.get(f"/api/invoices/{invoice_id}")
    assert detail_before_revoke.status_code == 200
    assert detail_before_revoke.json()["has_active_share"] is True

    revoke_response = await client.delete(
        f"/api/invoices/{invoice_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert revoke_response.status_code == 204

    detail_after_revoke = await client.get(f"/api/invoices/{invoice_id}")
    assert detail_after_revoke.status_code == 200
    assert detail_after_revoke.json()["share_token"] == share_token
    assert detail_after_revoke.json()["has_active_share"] is False

    client.cookies.clear()
    json_response = await client.get(f"/api/public/doc/{share_token}")
    pdf_response = await client.get(f"/share/{share_token}")

    assert json_response.status_code == 404
    assert json_response.json() == {"detail": "Not found"}
    assert pdf_response.status_code == 404
    assert pdf_response.json() == {"detail": "Not found"}

    invoice_row = await db_session.scalar(select(Document).where(Document.id == UUID(invoice_id)))
    assert invoice_row is not None
    assert invoice_row.share_token_revoked_at is not None


async def test_expired_public_invoice_token_returns_generic_404(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    await _set_quote_status(db_session, quote["id"], QuoteStatus.APPROVED)
    convert_response = await client.post(
        f"/api/quotes/{quote['id']}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert convert_response.status_code == 201
    invoice_id = convert_response.json()["id"]

    share_response = await client.post(
        f"/api/invoices/{invoice_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]

    await _set_share_token_expiry(
        db_session,
        document_id=UUID(invoice_id),
        expires_at=datetime.now(UTC) - timedelta(days=1),
    )

    client.cookies.clear()
    response = await client.get(f"/api/public/doc/{share_token}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_regenerate_invoice_share_invalidates_old_token(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    await _set_quote_status(db_session, quote["id"], QuoteStatus.APPROVED)
    convert_response = await client.post(
        f"/api/quotes/{quote['id']}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert convert_response.status_code == 201
    invoice_id = convert_response.json()["id"]

    first_share = await client.post(
        f"/api/invoices/{invoice_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert first_share.status_code == 200
    first_token = first_share.json()["share_token"]

    second_share = await client.post(
        f"/api/invoices/{invoice_id}/share?regenerate=true",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert second_share.status_code == 200
    second_token = second_share.json()["share_token"]

    assert second_token != first_token

    client.cookies.clear()
    old_response = await client.get(f"/api/public/doc/{first_token}")
    new_response = await client.get(f"/api/public/doc/{second_token}")

    assert old_response.status_code == 404
    assert new_response.status_code == 200
    assert new_response.json()["doc_type"] == "invoice"


async def test_sent_invoice_share_pdf_renders_latest_persisted_content_after_edit(
    client: AsyncClient,
    db_session: AsyncSession,
    _override_quote_service_dependency: _ConfigurablePdfIntegration,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    await _set_quote_status(db_session, quote["id"], QuoteStatus.APPROVED)
    convert_response = await client.post(
        f"/api/quotes/{quote['id']}/convert-to-invoice",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert convert_response.status_code == 201
    invoice_id = convert_response.json()["id"]

    share_response = await client.post(
        f"/api/invoices/{invoice_id}/share",
        headers={"X-CSRF-Token": csrf_token},
    )
    assert share_response.status_code == 200
    share_token = share_response.json()["share_token"]
    assert share_token is not None

    patch_response = await client.patch(
        f"/api/invoices/{invoice_id}",
        json={
            "title": "Updated invoice title",
            "line_items": [
                {
                    "description": "Final walkthrough",
                    "details": "Touch-up and cleanup",
                    "price": 90,
                }
            ],
            "total_amount": 90,
            "notes": "Updated after the customer requested revisions",
            "due_date": "2026-05-01",
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert patch_response.status_code == 200

    pdf_response = await client.get(f"/share/{share_token}")
    assert pdf_response.status_code == 200
    assert _override_quote_service_dependency.last_context is not None
    assert _override_quote_service_dependency.last_context.title == "Updated invoice title"
    assert _override_quote_service_dependency.last_context.notes == (
        "Updated after the customer requested revisions"
    )
    assert _override_quote_service_dependency.last_context.total_amount == 90
    assert _override_quote_service_dependency.last_context.due_date == "May 01, 2026"
    assert _override_quote_service_dependency.last_context.line_items[0].description == (
        "Final walkthrough"
    )
    assert _override_quote_service_dependency.last_context.line_items[0].details == (
        "Touch-up and cleanup"
    )
    assert _override_quote_service_dependency.last_context.line_items[0].price == 90


async def _register_and_login(client: AsyncClient, credentials: dict[str, str]) -> str:
    register_response = await client.post("/api/auth/register", json=credentials)
    assert register_response.status_code == 201
    login_response = await client.post("/api/auth/login", json=credentials)
    assert login_response.status_code == 200
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None
    return csrf_token


async def _create_customer(client: AsyncClient, csrf_token: str) -> str:
    response = await client.post(
        "/api/customers",
        json={"name": "PDF Test Customer"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 201
    return response.json()["id"]


async def _create_quote(
    client: AsyncClient,
    csrf_token: str,
    customer_id: str,
    payload: dict[str, object] | None = None,
) -> dict[str, str]:
    quote_payload: dict[str, object] = {
        "customer_id": customer_id,
        "transcript": "Install mulch and edge beds",
        "line_items": [
            {
                "description": "Install mulch",
                "details": "5 yards",
                "price": None,
            }
        ],
        "total_amount": 125,
        "notes": "Schedule for next Tuesday",
        "source_type": "text",
    }
    if payload is not None:
        quote_payload.update(payload)

    response = await client.post(
        "/api/quotes",
        json=quote_payload,
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 201
    return response.json()


async def _set_quote_status(
    db_session: AsyncSession,
    quote_id: str,
    status: QuoteStatus,
) -> None:
    quote = await db_session.scalar(select(Document).where(Document.id == UUID(quote_id)))
    assert quote is not None
    quote.status = status
    await db_session.commit()


async def _set_share_token_expiry(
    db_session: AsyncSession,
    *,
    document_id: UUID,
    expires_at: datetime,
) -> None:
    document = await db_session.scalar(select(Document).where(Document.id == document_id))
    assert document is not None
    document.share_token_expires_at = expires_at
    await db_session.commit()


async def _upload_logo(client: AsyncClient, csrf_token: str) -> None:
    response = await client.post(
        "/api/profile/logo",
        files={"file": ("logo.png", _PNG_BYTES, "image/png")},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 200


def _assert_async_pdf_job_response(response, *, document_id: str) -> _PdfJobResponse:
    assert response.status_code == 202
    payload = cast(_PdfJobResponse, response.json())
    assert payload["job_type"] == "pdf"
    assert payload["status"] == "pending"
    assert payload["document_id"] == document_id
    assert payload["document_revision"] is not None
    assert payload["attempts"] == 0
    assert payload["terminal_error"] is None
    return payload


async def _generate_ready_quote_pdf(
    client: AsyncClient,
    db_session: AsyncSession,
    *,
    csrf_token: str,
    quote_id: str,
    pdf_integration: _ConfigurablePdfIntegration,
    storage_service: _FakeStorageService,
) -> _PdfJobResponse:
    response = await client.post(
        f"/api/quotes/{quote_id}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    job_payload = _assert_async_pdf_job_response(response, document_id=quote_id)
    await _run_pdf_job(
        db_session,
        job_id=job_payload["id"],
        pdf_integration=pdf_integration,
        storage_service=storage_service,
    )
    return job_payload


async def _generate_ready_invoice_pdf(
    client: AsyncClient,
    db_session: AsyncSession,
    *,
    csrf_token: str,
    invoice_id: str,
    pdf_integration: _ConfigurablePdfIntegration,
    storage_service: _FakeStorageService,
) -> _PdfJobResponse:
    response = await client.post(
        f"/api/invoices/{invoice_id}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )
    job_payload = _assert_async_pdf_job_response(response, document_id=invoice_id)
    await _run_pdf_job(
        db_session,
        job_id=job_payload["id"],
        pdf_integration=pdf_integration,
        storage_service=storage_service,
    )
    return job_payload


async def _run_pdf_job(
    db_session: AsyncSession,
    *,
    job_id: str,
    pdf_integration: _ConfigurablePdfIntegration,
    storage_service: _FakeStorageService,
) -> None:
    session_maker = async_sessionmaker(
        bind=db_session.bind,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    runtime = WorkerRuntimeSettings(
        session_maker=session_maker,
        max_tries=DEFAULT_MAX_TRIES,
        retry_base_seconds=DEFAULT_RETRY_BASE_SECONDS,
        retry_jitter_seconds=DEFAULT_RETRY_JITTER_SECONDS,
    )
    await pdf_job(
        {
            "job_try": 1,
            "worker_runtime": runtime,
            "pdf_integration": pdf_integration,
            "storage_service": storage_service,
        },
        job_id,
    )


def _credentials() -> dict[str, str]:
    suffix = uuid4().hex[:12]
    return {
        "email": f"user-{suffix}@example.com",
        "password": "StrongPass123!",
    }


async def _set_user_email_and_phone_number(
    db_session: AsyncSession,
    *,
    email: str,
    updated_email: str,
    phone_number: str | None,
) -> None:
    user = await _get_user_by_email(db_session, email)
    user.email = updated_email
    user.phone_number = phone_number
    await db_session.commit()


async def _get_user_by_email(db_session: AsyncSession, email: str) -> User:
    user = await db_session.scalar(select(User).where(User.email == email))
    assert user is not None
    return user
