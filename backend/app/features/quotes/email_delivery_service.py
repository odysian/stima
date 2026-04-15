"""Quote email delivery orchestration."""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Protocol
from uuid import UUID

from email_validator import EmailNotValidError, validate_email
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import get_settings
from app.features.auth.models import User
from app.features.quotes.models import Document, QuoteStatus
from app.features.quotes.repository import QuoteEmailContext
from app.features.quotes.service import (
    QuoteService,
    QuoteServiceError,
    ensure_quote_customer_assigned,
)
from app.integrations.email import (
    EmailConfigurationError,
    EmailMessage,
    EmailSendError,
    EmailService,
)
from app.shared.event_logger import log_event

_EMAIL_SENT_FALLBACK_TIMESTAMPS: dict[tuple[UUID, UUID], datetime] = {}
LOGGER = logging.getLogger(__name__)


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

    async def commit(self) -> None: ...

    async def rollback(self) -> None: ...


@dataclass(slots=True)
class QuoteEmailTemplateContext:
    """Template context for the transactional quote email."""

    business_name: str
    contractor_name: str
    contractor_email: str | None
    contact_line: str
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
        quote_service: QuoteService | None,
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

    async def prepare_quote_email_job(self, user: User, quote_id: UUID) -> Document:
        """Validate prerequisites, enforce duplicate guard, and ensure share state."""
        user_id = _resolve_user_id(user)
        if self._quote_service is None:
            raise QuoteServiceError(detail="Quote share service unavailable", status_code=500)

        quote = await self._quote_service.get_quote(user, quote_id)
        ensure_quote_customer_assigned(quote)
        await self._load_context(
            quote_id=quote_id,
            user_id=user_id,
            enforce_duplicate_send_guard=True,
        )

        shared_quote = await self._quote_service.share_quote(user, quote_id)
        if shared_quote.share_token is None:
            raise QuoteServiceError(detail="Share link unavailable", status_code=500)
        return shared_quote

    async def send_quote_email_for_job(self, *, quote_id: UUID, user_id: UUID) -> None:
        """Deliver one quote email from worker context using durable document ownership."""
        context = await self._load_context(
            quote_id=quote_id,
            user_id=user_id,
            enforce_duplicate_send_guard=False,
        )
        await self._send_with_context(context)

    async def send_quote_email_from_context(self, context: QuoteEmailContext) -> None:
        """Deliver one quote email from preloaded worker context."""
        await self._send_with_context(context)

    async def send_quote_email(self, user: User, quote_id: UUID) -> Document:
        """Validate, share if needed, deliver the email, and log success."""
        shared_quote = await self.prepare_quote_email_job(user, quote_id)
        user_id = _resolve_user_id(user)
        await self.send_quote_email_for_job(quote_id=quote_id, user_id=user_id)
        return shared_quote

    async def _load_context(
        self,
        *,
        quote_id: UUID,
        user_id: UUID,
        enforce_duplicate_send_guard: bool,
    ) -> QuoteEmailContext:
        context = await self._repository.get_email_context(quote_id, user_id)
        if context is None:
            raise QuoteServiceError(detail="Not found", status_code=404)
        if context.status == QuoteStatus.DRAFT.value:
            raise QuoteServiceError(
                detail="Generate the PDF before sending this quote by email.",
                status_code=409,
            )

        _validate_customer_email(context.customer_email)
        if enforce_duplicate_send_guard:
            await self._enforce_duplicate_send_guard(context)
        return context

    async def _send_with_context(self, context: QuoteEmailContext) -> None:
        customer_email = _validate_customer_email(context.customer_email)
        share_token = context.share_token
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
                    reply_to_email=rendered_context.contractor_email,
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

        try:
            await self._repository.persist_quote_event(
                user_id=context.user_id,
                quote_id=context.quote_id,
                customer_id=context.customer_id,
                event_name="email_sent",
            )
            await self._repository.commit()
        except Exception:  # noqa: BLE001
            await self._repository.rollback()
            _remember_fallback_email_sent_at(context)
            LOGGER.warning(
                "quote email sent without persisted throttle state",
                extra={
                    "quote_id": str(context.quote_id),
                    "user_id": str(context.user_id),
                },
            )
        log_event(
            "email_sent",
            user_id=context.user_id,
            quote_id=context.quote_id,
            customer_id=context.customer_id,
            persist_async=False,
        )

    async def _enforce_duplicate_send_guard(self, context: QuoteEmailContext) -> None:
        latest_email_sent_at = await self._repository.get_latest_quote_event_at(
            user_id=context.user_id,
            quote_id=context.quote_id,
            event_name="email_sent",
        )
        fallback_email_sent_at = _get_fallback_email_sent_at(context)
        effective_latest_email_sent_at = _pick_latest_timestamp(
            latest_email_sent_at,
            fallback_email_sent_at,
        )
        if effective_latest_email_sent_at is None:
            return

        cutoff = datetime.now(UTC) - timedelta(
            seconds=get_settings().quote_email_duplicate_send_window_seconds
        )
        if effective_latest_email_sent_at >= cutoff:
            raise QuoteServiceError(
                detail=(
                    "This quote was emailed recently. Please wait before resending."
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


def _remember_fallback_email_sent_at(context: QuoteEmailContext) -> None:
    _EMAIL_SENT_FALLBACK_TIMESTAMPS[(context.user_id, context.quote_id)] = datetime.now(UTC)


def _get_fallback_email_sent_at(context: QuoteEmailContext) -> datetime | None:
    cache_key = (context.user_id, context.quote_id)
    fallback_email_sent_at = _EMAIL_SENT_FALLBACK_TIMESTAMPS.get(cache_key)
    if fallback_email_sent_at is None:
        return None

    cutoff = datetime.now(UTC) - timedelta(
        seconds=get_settings().quote_email_duplicate_send_window_seconds
    )
    if fallback_email_sent_at < cutoff:
        _EMAIL_SENT_FALLBACK_TIMESTAMPS.pop(cache_key, None)
        return None

    return fallback_email_sent_at


def _pick_latest_timestamp(
    left: datetime | None,
    right: datetime | None,
) -> datetime | None:
    if left is None:
        return right
    if right is None:
        return left
    return max(left, right)


def _build_template_context(
    *,
    context: QuoteEmailContext,
    landing_page_url: str,
    pdf_download_url: str,
) -> QuoteEmailTemplateContext:
    business_name = _resolve_business_name(context)
    contractor_name = _resolve_contractor_name(context, business_name)
    contractor_phone = _normalize_optional_text(context.contractor_phone)
    contractor_email = _normalize_optional_text(context.contractor_email)
    return QuoteEmailTemplateContext(
        business_name=business_name,
        contractor_name=contractor_name,
        contractor_email=contractor_email,
        contact_line=_build_contact_line(
            contractor_phone=contractor_phone,
            contractor_email=contractor_email,
        ),
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


def _build_contact_line(
    *,
    contractor_phone: str | None,
    contractor_email: str | None,
) -> str:
    if contractor_phone is not None:
        return f"Questions? Call or text {contractor_phone}."
    if contractor_email is not None:
        return "Questions? Reply to this email."
    return "Questions? Contact your contractor for help."


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
            context.contact_line,
        ]
    )
    if context.contractor_email:
        lines.append(f"Reply to: {context.contractor_email}")
    return "\n".join(lines)
