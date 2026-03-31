"""Shared app dependencies for auth services and request guards."""

from __future__ import annotations

from functools import cache, lru_cache
from hmac import compare_digest
from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException, status
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
from app.features.invoices.repository import InvoiceRepository
from app.features.invoices.service import InvoiceService
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
        storage_service=storage_service,
    )


def get_customer_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CustomerService:
    """Build a request-scoped customer service wired to the DB session."""
    return CustomerService(repository=CustomerRepository(db))


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


def get_extraction_service() -> ExtractionService:
    """Build a request-scoped extraction service wired to external integrations."""
    settings = get_settings()
    return ExtractionService(
        extraction_integration=ExtractionIntegration(
            api_key=settings.anthropic_api_key,
            model=settings.extraction_model,
        ),
        audio_integration=AudioIntegration(),
        transcription_integration=TranscriptionIntegration(
            api_key=settings.openai_api_key,
            model=settings.transcription_model,
        ),
    )


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
