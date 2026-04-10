"""Shared app dependencies for auth services, rate guards, and request guards."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import cache, lru_cache
from hmac import compare_digest
from typing import Annotated, cast
from uuid import UUID

from arq.connections import ArqRedis
from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.features.auth.models import User
from app.features.auth.repository import AuthRepository
from app.features.auth.service import (
    ACCESS_COOKIE_NAME,
    CSRF_COOKIE_NAME,
    AuthService,
    AuthServiceError,
)
from app.features.customers.repository import CustomerRepository
from app.features.customers.service import CustomerService
from app.features.invoices.email_delivery_service import InvoiceEmailDeliveryService
from app.features.invoices.repository import InvoiceRepository
from app.features.invoices.service import InvoiceService
from app.features.jobs.repository import JobRepository
from app.features.jobs.service import JobService
from app.features.profile.repository import ProfileRepository
from app.features.profile.service import ProfileService
from app.features.quotes.email_delivery_service import QuoteEmailDeliveryService
from app.features.quotes.extraction_service import ExtractionService
from app.features.quotes.repository import QuoteRepository
from app.features.quotes.service import QuoteService
from app.integrations.audio import AudioIntegration
from app.integrations.email import EmailService
from app.integrations.extraction import ExtractionIntegration
from app.integrations.pdf import PdfIntegration
from app.integrations.storage import StorageService
from app.integrations.transcription import TranscriptionIntegration
from app.shared.idempotency import IdempotencyStore, build_idempotency_store
from app.shared.pdf_artifact_repository import PdfArtifactRepository
from app.shared.rate_limit import limiter, reserve_extraction_capacity


@lru_cache(maxsize=1)
def get_pdf_integration() -> PdfIntegration:
    """Return shared PDF integration instance for request-scoped quote services."""
    return PdfIntegration()


@cache
def _build_storage_service(bucket_name: str) -> StorageService:
    """Return one shared storage service per configured bucket."""
    return StorageService(bucket_name=bucket_name)


def get_storage_service() -> StorageService:
    """Return the configured private storage service."""
    settings = get_settings()
    return _build_storage_service(settings.gcs_bucket_name)


@lru_cache(maxsize=1)
def get_email_service() -> EmailService:
    """Return the configured transactional email integration."""
    settings = get_settings()
    return EmailService(
        api_key=settings.resend_api_key,
        from_address=settings.email_from_address,
        from_name=settings.email_from_name,
    )


@lru_cache(maxsize=1)
def get_extraction_integration() -> ExtractionIntegration:
    """Return the configured Anthropic extraction integration singleton."""
    settings = get_settings()
    return ExtractionIntegration(
        api_key=settings.anthropic_api_key,
        model=settings.extraction_model,
        fallback_model=settings.extraction_fallback_model,
        timeout_seconds=settings.provider_request_timeout_seconds,
        max_attempts=settings.provider_max_retries,
        primary_prompt_variant=settings.extraction_primary_prompt_variant,
        fallback_prompt_variant=settings.extraction_fallback_prompt_variant,
    )


@lru_cache(maxsize=1)
def get_transcription_integration() -> TranscriptionIntegration:
    """Return the configured OpenAI transcription integration singleton."""
    settings = get_settings()
    return TranscriptionIntegration(
        api_key=settings.openai_api_key,
        model=settings.transcription_model,
        timeout_seconds=settings.provider_request_timeout_seconds,
        max_attempts=settings.provider_max_retries,
    )


@lru_cache(maxsize=1)
def get_idempotency_store() -> IdempotencyStore:
    """Return the configured idempotency store singleton."""
    return build_idempotency_store()


def get_auth_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AuthService:
    """Build a request-scoped auth service wired to the DB session."""
    return AuthService(repository=AuthRepository(db))


def get_profile_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
) -> ProfileService:
    """Build a request-scoped profile service wired to the DB session."""
    return ProfileService(
        repository=ProfileRepository(db),
        pdf_artifact_repository=PdfArtifactRepository(db),
        storage_service=storage_service,
    )


def get_customer_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
) -> CustomerService:
    """Build a request-scoped customer service wired to the DB session."""
    return CustomerService(
        repository=CustomerRepository(db),
        pdf_artifact_repository=PdfArtifactRepository(db),
        storage_service=storage_service,
    )


def get_quote_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
) -> QuoteService:
    """Build a request-scoped quote service wired to DB and PDF integration."""
    return QuoteService(
        repository=QuoteRepository(db),
        pdf_integration=get_pdf_integration(),
        storage_service=storage_service,
    )


def get_job_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> JobService:
    """Build a request-scoped durable job service wired to the DB session."""
    return JobService(repository=JobRepository(db))


def get_invoice_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
) -> InvoiceService:
    """Build a request-scoped invoice service wired to DB and PDF integration."""
    return InvoiceService(
        invoice_repository=InvoiceRepository(db),
        quote_repository=QuoteRepository(db),
        pdf_integration=get_pdf_integration(),
        storage_service=storage_service,
    )


def get_quote_email_delivery_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
    email_service: Annotated[EmailService, Depends(get_email_service)],
) -> QuoteEmailDeliveryService:
    """Build a request-scoped quote email delivery service."""
    settings = get_settings()
    repository = QuoteRepository(db)
    quote_service = QuoteService(
        repository=repository,
        pdf_integration=get_pdf_integration(),
        storage_service=storage_service,
    )
    return QuoteEmailDeliveryService(
        repository=repository,
        quote_service=quote_service,
        email_service=email_service,
        frontend_url=settings.frontend_url,
    )


def get_invoice_email_delivery_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    storage_service: Annotated[StorageService, Depends(get_storage_service)],
    email_service: Annotated[EmailService, Depends(get_email_service)],
) -> InvoiceEmailDeliveryService:
    """Build a request-scoped invoice email delivery service."""
    settings = get_settings()
    repository = InvoiceRepository(db)
    invoice_service = InvoiceService(
        invoice_repository=repository,
        quote_repository=QuoteRepository(db),
        pdf_integration=get_pdf_integration(),
        storage_service=storage_service,
    )
    return InvoiceEmailDeliveryService(
        repository=repository,
        invoice_service=invoice_service,
        email_service=email_service,
        frontend_url=settings.frontend_url,
    )


def get_extraction_service() -> ExtractionService:
    """Build a request-scoped extraction service wired to external integrations."""
    return ExtractionService(
        extraction_integration=get_extraction_integration(),
        audio_integration=AudioIntegration(),
        transcription_integration=get_transcription_integration(),
    )


def get_arq_pool(request: Request) -> ArqRedis | None:
    """Return the app-scoped ARQ pool when Redis-backed jobs are enabled."""
    return cast(ArqRedis | None, getattr(request.app.state, "arq_pool", None))


async def get_current_user(
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    access_token: Annotated[str | None, Cookie(alias=ACCESS_COOKIE_NAME)] = None,
) -> User:
    """Resolve current user from the access cookie."""
    try:
        return await auth_service.get_authenticated_user(access_token=access_token)
    except AuthServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


def require_csrf(
    csrf_cookie: Annotated[str | None, Cookie(alias=CSRF_COOKIE_NAME)] = None,
    csrf_header: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> None:
    """Enforce double-submit CSRF checks for mutating cookie-auth endpoints."""
    if csrf_cookie is None or csrf_header is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token missing",
        )
    if not compare_digest(csrf_cookie, csrf_header):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token mismatch",
        )


@asynccontextmanager
async def extraction_capacity_guard(user_id: UUID) -> AsyncIterator[None]:
    """Hold extraction quota/concurrency for the wrapped block (no-op when limiter disabled).

    Use inside route handlers after SlowAPI's per-route limit check so 429s from the
    rate limiter do not consume quota or concurrency slots.
    """
    if not limiter.enabled:
        yield
        return

    async with reserve_extraction_capacity(user_id) as capacity_available:
        if not capacity_available:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Extraction quota or concurrency exhausted. Please retry later.",
            )
        yield
