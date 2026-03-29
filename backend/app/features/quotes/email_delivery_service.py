"""Quote email delivery orchestration."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Protocol
from uuid import UUID

from email_validator import EmailNotValidError, validate_email
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.features.auth.models import User
from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.repository import QuoteEmailContext
from app.features.quotes.service import QuoteService, QuoteServiceError
from app.integrations.email import (
    EmailConfigurationError,
    EmailMessage,
    EmailSendError,
    EmailService,
)
from app.shared.event_logger import log_event

_DUPLICATE_SEND_WINDOW = timedelta(minutes=5)


class QuoteEmailRepositoryProtocol(Protocol):
    """Structural protocol for quote email delivery persistence needs."""

    async def get_email_context(
        self,
        quote_id: UUID,
        user_id: UUID,
    ) -> QuoteEmailContext | None: ...

    async def get_latest_quote_event_at(
        self,
        *,
        user_id: UUID,
        quote_id: UUID,
        event_name: str,
    ) -> datetime | None: ...

    async def persist_quote_event(
        self,
        *,
        user_id: UUID,
        quote_id: UUID,
        customer_id: UUID,
        event_name: str,
    ) -> None: ...


@dataclass(slots=True)
class QuoteEmailTemplateContext:
    """Template context for the transactional quote email."""

    business_name: str
    contractor_name: str
    contractor_phone: str
    contractor_email: str | None
    customer_name: str
    doc_number: str
    title: str | None
    total_amount: str
    landing_page_url: str
    pdf_download_url: str


class QuoteEmailDeliveryService:
    """Send quote delivery emails while preserving share-flow contracts."""

    def __init__(
        self,
        *,
        repository: QuoteEmailRepositoryProtocol,
        quote_service: QuoteService,
        email_service: EmailService,
        frontend_url: str,
        template_dir: Path | None = None,
    ) -> None:
        self._repository = repository
        self._quote_service = quote_service
        self._email_service = email_service
        self._frontend_url = frontend_url.rstrip("/")
        resolved_template_dir = template_dir or (Path(__file__).resolve().parents[2] / "templates")
        self._template_dir = resolved_template_dir
        self._template_environment = Environment(
            loader=FileSystemLoader(str(resolved_template_dir)),
            autoescape=select_autoescape(["html", "xml"]),
            trim_blocks=True,
            lstrip_blocks=True,
        )

    async def send_quote_email(self, user: User, quote_id: UUID) -> Document:
        """Validate, share if needed, deliver the email, and log success."""
        user_id = _resolve_user_id(user)
        context = await self._repository.get_email_context(quote_id, user_id)
        if context is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if context.status == QuoteStatus.DRAFT.value:
            raise QuoteServiceError(
                detail="Generate the PDF before sending this quote by email.",
                status_code=409,
            )

        customer_email = _validate_customer_email(context.customer_email)
        await self._enforce_duplicate_send_guard(context)

        try:
            shared_quote = await self._quote_service.share_quote(user, quote_id)
        except QuoteServiceError:
            raise

        share_token = shared_quote.share_token
        if share_token is None:
            raise QuoteServiceError(detail="Share link unavailable", status_code=500)

        rendered_context = _build_template_context(
            context=context,
            landing_page_url=f"{self._frontend_url}/doc/{share_token}",
            pdf_download_url=f"{self._frontend_url}/share/{share_token}",
        )
        subject = _build_email_subject(rendered_context)

        try:
            await self._email_service.send(
                EmailMessage(
                    to_email=customer_email,
                    subject=subject,
                    html_content=self._render_html(rendered_context),
                    text_content=_render_text(rendered_context),
                )
            )
        except EmailConfigurationError as exc:
            raise QuoteServiceError(
                detail="Email delivery is not configured right now.",
                status_code=503,
            ) from exc
        except EmailSendError as exc:
            raise QuoteServiceError(
                detail="Email delivery failed. Please try again.",
                status_code=502,
            ) from exc

        await self._repository.persist_quote_event(
            user_id=context.user_id,
            quote_id=context.quote_id,
            customer_id=context.customer_id,
            event_name="email_sent",
        )
        log_event(
            "email_sent",
            user_id=context.user_id,
            quote_id=context.quote_id,
            customer_id=context.customer_id,
            persist_async=False,
        )
        return shared_quote

    async def _enforce_duplicate_send_guard(self, context: QuoteEmailContext) -> None:
        latest_email_sent_at = await self._repository.get_latest_quote_event_at(
            user_id=context.user_id,
            quote_id=context.quote_id,
            event_name="email_sent",
        )
        if latest_email_sent_at is None:
            return

        cutoff = datetime.now(UTC) - _DUPLICATE_SEND_WINDOW
        if latest_email_sent_at >= cutoff:
            raise QuoteServiceError(
                detail=(
                    "This quote was emailed recently. Please wait a few minutes before resending."
                ),
                status_code=429,
            )

    def _render_html(self, context: QuoteEmailTemplateContext) -> str:
        template = self._template_environment.get_template("quote_email.html")
        return template.render(**asdict(context))


def _resolve_user_id(user: User) -> UUID:
    user_id = getattr(user, "id", None)
    if not isinstance(user_id, UUID):
        raise QuoteServiceError(detail="User identity unavailable", status_code=401)
    return user_id


def _validate_customer_email(customer_email: str | None) -> str:
    normalized_email = (customer_email or "").strip()
    if not normalized_email:
        raise QuoteServiceError(
            detail="Add a customer email before sending this quote.",
            status_code=422,
        )

    try:
        validated_email = validate_email(
            normalized_email,
            check_deliverability=False,
        )
    except EmailNotValidError as exc:
        raise QuoteServiceError(
            detail="Customer email address looks invalid.",
            status_code=422,
        ) from exc

    return validated_email.normalized


def _build_template_context(
    *,
    context: QuoteEmailContext,
    landing_page_url: str,
    pdf_download_url: str,
) -> QuoteEmailTemplateContext:
    business_name = _resolve_business_name(context)
    contractor_name = _resolve_contractor_name(context, business_name)
    contractor_phone = _resolve_contractor_phone(context)
    contractor_email = (
        context.contractor_email.strip() if context.contractor_email.strip() else None
    )
    return QuoteEmailTemplateContext(
        business_name=business_name,
        contractor_name=contractor_name,
        contractor_phone=contractor_phone,
        contractor_email=contractor_email,
        customer_name=context.customer_name,
        doc_number=context.doc_number,
        title=_normalize_optional_text(context.title),
        total_amount=_format_total_amount(context.total_amount),
        landing_page_url=landing_page_url,
        pdf_download_url=pdf_download_url,
    )


def _resolve_business_name(context: QuoteEmailContext) -> str:
    business_name = _normalize_optional_text(context.business_name)
    if business_name is not None:
        return business_name
    return _resolve_contractor_name(context, "Your contractor")


def _resolve_contractor_name(context: QuoteEmailContext, fallback: str) -> str:
    name_parts = [
        part
        for part in (
            _normalize_optional_text(context.first_name),
            _normalize_optional_text(context.last_name),
        )
        if part is not None
    ]
    if name_parts:
        return " ".join(name_parts)
    return fallback


def _resolve_contractor_phone(context: QuoteEmailContext) -> str:
    phone_number = _normalize_optional_text(context.contractor_phone)
    if phone_number is not None:
        return phone_number
    return "your contractor"


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized_value = value.strip()
    if not normalized_value:
        return None
    return normalized_value


def _format_total_amount(value: Decimal | None) -> str:
    if value is None:
        return "TBD"
    return f"${value:,.2f}"


def _build_email_subject(context: QuoteEmailTemplateContext) -> str:
    return f"Quote {context.doc_number} from {context.business_name}"


def _render_text(context: QuoteEmailTemplateContext) -> str:
    lines = [
        f"{context.business_name} sent you a quote.",
        f"Quote {context.doc_number}: {context.total_amount}",
    ]
    if context.title:
        lines.append(f"Title: {context.title}")
    lines.extend(
        [
            "",
            f"View quote: {context.landing_page_url}",
            f"Download PDF: {context.pdf_download_url}",
            "",
            f"Questions? Call or text {context.contractor_phone}.",
        ]
    )
    if context.contractor_email:
        lines.append(f"Reply to: {context.contractor_email}")
    return "\n".join(lines)
