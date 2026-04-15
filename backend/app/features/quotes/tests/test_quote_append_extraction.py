"""Quote append-extraction API behavior tests."""

from __future__ import annotations

from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.features.jobs.models import JobRecord, JobType
from app.features.jobs.repository import JobRepository
from app.features.quotes.models import Document
from app.features.quotes.schemas import ExtractionResult
from app.features.quotes.service import QuoteService, QuoteServiceError
from app.features.quotes.tests import test_quotes as quotes_test_module
from app.features.quotes.tests.support.helpers import (
    _create_customer,
    _create_quote,
    _credentials,
    _get_user_by_email,
    _register_and_login,
    _run_extraction_job,
)
from app.features.quotes.tests.support.mocks import (
    _MockArqPool,
    _MockExtractionIntegration,
    _MockStorageService,
    _RetryableProviderError,
)
from app.integrations.extraction import ExtractionError
from app.main import app

pytestmark = pytest.mark.asyncio

# Reuse existing fixture wiring/helpers from test_quotes to preserve behavior.
_reset_email_delivery_fallback_cache = quotes_test_module._reset_email_delivery_fallback_cache
_override_storage_service_dependency = quotes_test_module._override_storage_service_dependency
_override_quote_service_dependency = quotes_test_module._override_quote_service_dependency
_override_extraction_service_dependency = quotes_test_module._override_extraction_service_dependency
_reset_rate_limiter = quotes_test_module._reset_rate_limiter


async def test_append_extraction_sync_retryable_failure_uses_degraded_append_semantics(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _retryable_extract(self, notes: str) -> ExtractionResult:  # noqa: ANN001
        del self, notes
        raise ExtractionError("Claude request failed: retryable") from _RetryableProviderError(429)

    monkeypatch.setattr(_MockExtractionIntegration, "extract", _retryable_extract)

    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    quote_id = quote["id"]
    app.state.arq_pool = None

    first_append = await client.post(
        f"/api/quotes/{quote_id}/append-extraction",
        files=[("notes", (None, "first degraded note"))],
        headers={"X-CSRF-Token": csrf_token},
    )
    second_append = await client.post(
        f"/api/quotes/{quote_id}/append-extraction",
        files=[("notes", (None, "second degraded note"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert first_append.status_code == 200
    assert second_append.status_code == 200
    assert first_append.json()["line_items"] == []
    assert second_append.json()["line_items"] == []
    assert first_append.json()["extraction_tier"] == "degraded"
    assert second_append.json()["extraction_tier"] == "degraded"

    detail_response = await client.get(f"/api/quotes/{quote_id}")
    assert detail_response.status_code == 200
    payload = detail_response.json()
    assert len(payload["line_items"]) == 1
    assert payload["extraction_tier"] == "degraded"
    assert payload["extraction_degraded_reason_code"] == "provider_retryable_error"
    assert payload["transcript"].count("Added later:") == 1
    assert "- first degraded note" in payload["transcript"]
    assert "- second degraded note" in payload["transcript"]
    assert "Added later (2):" not in payload["transcript"]


async def test_append_extraction_sync_appends_line_items_and_merges_transcript_entries(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    quote_id = quote["id"]
    initial_detail_response = await client.get(f"/api/quotes/{quote_id}")
    assert initial_detail_response.status_code == 200
    original_line_item_id = initial_detail_response.json()["line_items"][0]["id"]
    app.state.arq_pool = None

    first_append = await client.post(
        f"/api/quotes/{quote_id}/append-extraction",
        files=[("notes", (None, "first follow-up request"))],
        headers={"X-CSRF-Token": csrf_token},
    )
    second_append = await client.post(
        f"/api/quotes/{quote_id}/append-extraction",
        files=[("notes", (None, "second follow-up request"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert first_append.status_code == 200
    assert second_append.status_code == 200
    assert first_append.json()["quote_id"] == quote_id
    assert second_append.json()["quote_id"] == quote_id

    detail_response = await client.get(f"/api/quotes/{quote_id}")
    assert detail_response.status_code == 200
    payload = detail_response.json()
    assert [item["sort_order"] for item in payload["line_items"]] == [0, 1, 2]
    assert payload["line_items"][0]["id"] == original_line_item_id
    assert payload["line_items"][0]["description"] == "line item"
    assert payload["line_items"][1]["description"] == "Brown mulch"
    assert payload["line_items"][2]["description"] == "Brown mulch"
    assert payload["total_amount"] == 295
    assert "quote transcript" in payload["transcript"]
    assert "Added later:" in payload["transcript"]
    assert "- first follow-up request" in payload["transcript"]
    assert "- second follow-up request" in payload["transcript"]
    assert "Added later (2):" not in payload["transcript"]


async def test_append_extraction_sync_cleans_obsolete_pdf_artifact_after_commit(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    deleted_paths: list[str] = []

    def _capture_delete(self, object_path: str) -> None:  # noqa: ANN001
        del self
        deleted_paths.append(object_path)

    monkeypatch.setattr(_MockStorageService, "delete", _capture_delete)

    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    quote_id = UUID(quote["id"])
    app.state.arq_pool = None

    persisted_quote = await db_session.get(Document, quote_id)
    assert persisted_quote is not None
    initial_revision = persisted_quote.pdf_artifact_revision
    persisted_quote.pdf_artifact_path = "quotes/obsolete-artifact.pdf"
    await db_session.commit()

    append_response = await client.post(
        f"/api/quotes/{quote_id}/append-extraction",
        files=[("notes", (None, "append artifact cleanup"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert append_response.status_code == 200
    assert deleted_paths == ["quotes/obsolete-artifact.pdf"]

    refreshed_quote = await db_session.get(Document, quote_id)
    assert refreshed_quote is not None
    assert refreshed_quote.pdf_artifact_path is None
    assert refreshed_quote.pdf_artifact_revision == initial_revision + 1


async def test_append_extraction_enqueues_async_job_for_owned_quote(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    quote_id = quote["id"]
    pool = _MockArqPool()
    app.state.arq_pool = pool

    response = await client.post(
        f"/api/quotes/{quote_id}/append-extraction",
        files=[("notes", (None, "append this"))],
        headers={"X-CSRF-Token": csrf_token},
    )
    response_correlation_id = response.headers["x-correlation-id"]

    jobs = (await db_session.scalars(select(JobRecord))).all()

    assert response.status_code == 202
    payload = response.json()
    assert payload["job_type"] == "extraction"
    assert payload["status"] == "pending"
    assert payload["quote_id"] is None
    assert payload["document_id"] == quote_id
    assert len(jobs) == 1
    assert jobs[0].document_id == UUID(quote_id)
    assert pool.calls == [
        {
            "function": "jobs.extraction",
            "args": (str(jobs[0].id),),
            "kwargs": {
                "_job_id": str(jobs[0].id),
                "correlation_id": response_correlation_id,
                "prepared_capture_input": {
                    "transcript": "append this",
                    "source_type": "text",
                    "raw_typed_notes": "append this",
                    "raw_transcript": None,
                },
                "source_type": "text",
                "capture_detail": "notes",
                "append_to_quote": True,
            },
        }
    ]


async def test_append_extraction_sync_normalizes_legacy_numbered_transcript_sections(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    quote_id = quote["id"]
    app.state.arq_pool = None

    legacy_transcript = (
        "quote transcript\n\n"
        "Added later:\n"
        "first follow-up request\n\n"
        "Added later (2):\n"
        "second follow-up request"
    )
    update_response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"transcript": legacy_transcript},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert update_response.status_code == 200

    append_response = await client.post(
        f"/api/quotes/{quote_id}/append-extraction",
        files=[("notes", (None, "third follow-up request"))],
        headers={"X-CSRF-Token": csrf_token},
    )
    assert append_response.status_code == 200

    detail_response = await client.get(f"/api/quotes/{quote_id}")
    assert detail_response.status_code == 200
    transcript = detail_response.json()["transcript"]
    assert transcript.count("Added later:") == 1
    assert "Added later (2):" not in transcript
    assert "- first follow-up request" in transcript
    assert "- second follow-up request" in transcript
    assert "- third follow-up request" in transcript


async def test_append_extraction_sync_merges_from_append_only_baseline_without_duplicate_headers(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    quote_id = quote["id"]
    app.state.arq_pool = None

    update_response = await client.patch(
        f"/api/quotes/{quote_id}",
        json={"transcript": "Added later:\n- existing append-only note"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert update_response.status_code == 200

    first_append = await client.post(
        f"/api/quotes/{quote_id}/append-extraction",
        files=[("notes", (None, "first follow-up request"))],
        headers={"X-CSRF-Token": csrf_token},
    )
    second_append = await client.post(
        f"/api/quotes/{quote_id}/append-extraction",
        files=[("notes", (None, "second follow-up request"))],
        headers={"X-CSRF-Token": csrf_token},
    )
    assert first_append.status_code == 200
    assert second_append.status_code == 200

    detail_response = await client.get(f"/api/quotes/{quote_id}")
    assert detail_response.status_code == 200
    transcript = detail_response.json()["transcript"]
    assert transcript.count("Added later:") == 1
    assert "Added later (2):" not in transcript
    assert "- existing append-only note" in transcript
    assert "- first follow-up request" in transcript
    assert "- second follow-up request" in transcript


async def test_append_extraction_rejects_when_async_job_limit_is_exhausted(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    credentials = _credentials()
    csrf_token = await _register_and_login(client, credentials)
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    quote_id = quote["id"]
    app.state.arq_pool = _MockArqPool()
    monkeypatch.setenv("EXTRACTION_CONCURRENCY_LIMIT", "1")
    get_settings.cache_clear()

    user = await _get_user_by_email(db_session, credentials["email"])
    repository = JobRepository(db_session)
    await repository.create(user_id=user.id, job_type=JobType.EXTRACTION)
    await db_session.commit()

    response = await client.post(
        f"/api/quotes/{quote_id}/append-extraction",
        files=[("notes", (None, "append"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 429
    assert response.json() == {
        "detail": "Extraction quota or concurrency exhausted. Please retry later."
    }


async def test_append_extraction_async_worker_updates_existing_quote(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    quote_id = quote["id"]
    pool = _MockArqPool()
    app.state.arq_pool = pool

    response = await client.post(
        f"/api/quotes/{quote_id}/append-extraction",
        files=[("notes", (None, "append via worker"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 202
    payload = response.json()

    await _run_extraction_job(
        db_session,
        job_id=payload["id"],
        source_type="text",
        capture_detail="notes",
        append_to_quote=True,
        transcript="append via worker",
    )

    status_response = await client.get(f"/api/jobs/{payload['id']}")
    assert status_response.status_code == 200
    status_payload = status_response.json()
    assert status_payload["status"] == "success"
    assert status_payload["quote_id"] == quote_id
    assert status_payload["document_id"] == quote_id
    assert status_payload["extraction_result"]["transcript"] == "append via worker"

    detail_response = await client.get(f"/api/quotes/{quote_id}")
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert len(detail_payload["line_items"]) == 2
    assert detail_payload["line_items"][0]["description"] == "line item"
    assert detail_payload["line_items"][1]["description"] == "Brown mulch"
    assert detail_payload["total_amount"] == 175
    assert "Added later:\n- append via worker" in detail_payload["transcript"]


async def test_append_extraction_returns_404_for_quotes_owned_by_other_users(
    client: AsyncClient,
) -> None:
    first_credentials = _credentials()
    first_csrf_token = await _register_and_login(client, first_credentials)
    customer_id = await _create_customer(client, first_csrf_token)
    quote = await _create_quote(client, first_csrf_token, customer_id)
    quote_id = quote["id"]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as second_client:
        second_csrf_token = await _register_and_login(second_client, _credentials())
        response = await second_client.post(
            f"/api/quotes/{quote_id}/append-extraction",
            files=[("notes", (None, "other user attempt"))],
            headers={"X-CSRF-Token": second_csrf_token},
        )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found"}


async def test_append_extraction_worker_provider_failure_keeps_quote_unchanged(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    quote_id = quote["id"]
    pool = _MockArqPool()
    app.state.arq_pool = pool

    response = await client.post(
        f"/api/quotes/{quote_id}/append-extraction",
        files=[("notes", (None, "append request"))],
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 202
    payload = response.json()

    with pytest.raises(ExtractionError):
        await _run_extraction_job(
            db_session,
            job_id=payload["id"],
            source_type="text",
            capture_detail="notes",
            append_to_quote=True,
            transcript="malformed extraction response",
        )

    status_response = await client.get(f"/api/jobs/{payload['id']}")
    assert status_response.status_code == 200
    status_payload = status_response.json()
    assert status_payload["status"] == "terminal"
    assert status_payload["quote_id"] is None

    detail_response = await client.get(f"/api/quotes/{quote_id}")
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert len(detail_payload["line_items"]) == 1
    assert detail_payload["line_items"][0]["description"] == "line item"
    assert detail_payload["transcript"] == "quote transcript"
    assert detail_payload["total_amount"] == 55


async def test_append_extraction_sync_persistence_failure_keeps_quote_unchanged(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fail_append(self, **kwargs):  # noqa: ANN001, ANN003
        del self, kwargs
        raise QuoteServiceError(
            detail="database unavailable",
            status_code=503,
        )

    monkeypatch.setattr(QuoteService, "append_extraction_to_quote", _fail_append)

    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)
    quote_id = quote["id"]
    app.state.arq_pool = None

    response = await client.post(
        f"/api/quotes/{quote_id}/append-extraction",
        files=[("notes", (None, "append sync failure"))],
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "database unavailable"}

    detail_response = await client.get(f"/api/quotes/{quote_id}")
    assert detail_response.status_code == 200
    payload = detail_response.json()
    assert len(payload["line_items"]) == 1
    assert payload["line_items"][0]["description"] == "line item"
    assert payload["transcript"] == "quote transcript"
    assert payload["total_amount"] == 55
