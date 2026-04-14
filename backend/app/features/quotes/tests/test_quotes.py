"""Quote API shared fixture wiring and compatibility exports for split tests."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated

import pytest
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.features.invoices import (
    email_delivery_service as invoice_email_delivery_service,
)
from app.features.quotes import email_delivery_service
from app.features.quotes.extraction_service import ExtractionService
from app.features.quotes.repository import QuoteRepository
from app.features.quotes.service import QuoteService
from app.main import app
from app.shared.dependencies import (
    get_email_service,
    get_extraction_service,
    get_quote_service,
    get_storage_service,
)
from app.shared.rate_limit import reset_local_rate_limit_state

from .support.helpers import (
    _assert_async_email_job_response,
    _create_approved_invoice,
    _create_customer,
    _create_direct_invoice,
    _create_quote,
    _credentials,
    _format_human_date,
    _get_user_by_email,
    _register_and_login,
    _run_extraction_job,
    _run_pdf_job,
    _send_email_headers,
    _set_invoice_status,
    _set_profile_for_email_delivery,
    _set_quote_status,
    _set_user_email_and_phone_number,
    _set_user_phone_number,
)
from .support.mocks import (
    _FailingAbortIdempotencyStore,
    _FailingArqPool,
    _InProgressIdempotencyStore,
    _MockArqPool,
    _MockAudioIntegration,
    _MockEmailService,
    _MockExtractionIntegration,
    _MockPdfIntegration,
    _MockStorageService,
    _MockTranscriptionIntegration,
    _RetryableFailureExtractionIntegration,
    _RetryableProviderError,
)

__all__ = [
    "_assert_async_email_job_response",
    "_create_approved_invoice",
    "_create_customer",
    "_create_direct_invoice",
    "_create_quote",
    "_credentials",
    "_FailingAbortIdempotencyStore",
    "_FailingArqPool",
    "_format_human_date",
    "_get_user_by_email",
    "_InProgressIdempotencyStore",
    "_MockArqPool",
    "_MockAudioIntegration",
    "_MockEmailService",
    "_MockExtractionIntegration",
    "_MockPdfIntegration",
    "_MockStorageService",
    "_MockTranscriptionIntegration",
    "_register_and_login",
    "_RetryableFailureExtractionIntegration",
    "_RetryableProviderError",
    "_run_extraction_job",
    "_run_pdf_job",
    "_send_email_headers",
    "_set_invoice_status",
    "_set_profile_for_email_delivery",
    "_set_quote_status",
    "_set_user_email_and_phone_number",
    "_set_user_phone_number",
]

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _reset_email_delivery_fallback_cache() -> Iterator[None]:
    email_delivery_service._EMAIL_SENT_FALLBACK_TIMESTAMPS.clear()  # noqa: SLF001
    invoice_email_delivery_service._EMAIL_SENT_FALLBACK_TIMESTAMPS.clear()  # noqa: SLF001
    yield
    email_delivery_service._EMAIL_SENT_FALLBACK_TIMESTAMPS.clear()  # noqa: SLF001
    invoice_email_delivery_service._EMAIL_SENT_FALLBACK_TIMESTAMPS.clear()  # noqa: SLF001


@pytest.fixture(autouse=True)
def _override_storage_service_dependency() -> Iterator[None]:
    app.dependency_overrides[get_storage_service] = lambda: _MockStorageService()
    yield
    app.dependency_overrides.pop(get_storage_service, None)


@pytest.fixture
def mock_email_service() -> Iterator[_MockEmailService]:
    service = _MockEmailService()
    app.dependency_overrides[get_email_service] = lambda: service
    yield service
    app.dependency_overrides.pop(get_email_service, None)


@pytest.fixture(autouse=True)
def _override_quote_service_dependency() -> Iterator[None]:
    async def _override_get_quote_service(
        db: Annotated[AsyncSession, Depends(get_db)],
    ) -> QuoteService:
        return QuoteService(
            repository=QuoteRepository(db),
            pdf_integration=_MockPdfIntegration(),
            storage_service=_MockStorageService(),
        )

    app.dependency_overrides[get_quote_service] = _override_get_quote_service
    yield
    app.dependency_overrides.pop(get_quote_service, None)


@pytest.fixture(autouse=True)
def _override_extraction_service_dependency() -> Iterator[None]:
    async def _override_get_extraction_service() -> ExtractionService:
        return ExtractionService(
            extraction_integration=_MockExtractionIntegration(),
            audio_integration=_MockAudioIntegration(),
            transcription_integration=_MockTranscriptionIntegration(),
        )

    app.dependency_overrides[get_extraction_service] = _override_get_extraction_service
    yield
    app.dependency_overrides.pop(get_extraction_service, None)


@pytest.fixture(autouse=True)
def _reset_rate_limiter() -> Iterator[None]:
    reset_local_rate_limit_state()
    yield
    reset_local_rate_limit_state()


@pytest.fixture(autouse=True)
def _mock_arq_pool_for_send_email_tests(
    request: pytest.FixtureRequest,
) -> Iterator[None]:
    node_name = request.node.name
    if (
        "send_quote_email" not in node_name
        and "send_invoice_email" not in node_name
        and "send_email" not in node_name
    ):
        yield
        return

    original_pool = getattr(app.state, "arq_pool", None)
    app.state.arq_pool = _MockArqPool()
    try:
        yield
    finally:
        app.state.arq_pool = original_pool
