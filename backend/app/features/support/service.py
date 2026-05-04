"""Support contact service orchestration."""

from __future__ import annotations

import logging
from typing import Protocol

from app.features.auth.models import User
from app.features.support.schemas import SupportContactCategory
from app.integrations.email import (
    EmailConfigurationError,
    EmailMessage,
    EmailSendError,
)

LOGGER = logging.getLogger(__name__)


class SupportContactServiceError(Exception):
    """Support-contact exception mapped to an HTTP status code."""

    def __init__(self, *, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class EmailServiceProtocol(Protocol):
    """Structural protocol for outbound email service dependency."""

    async def send(self, message: EmailMessage) -> None: ...


class SupportContactService:
    """Send authenticated support messages to a configured recipient."""

    def __init__(
        self,
        *,
        email_service: EmailServiceProtocol,
        recipient_email: str | None,
    ) -> None:
        self._email_service = email_service
        self._recipient_email = _normalize_optional_value(recipient_email)

    async def send_contact_message(
        self,
        *,
        user: User,
        category: SupportContactCategory,
        message: str,
    ) -> None:
        """Deliver one minimal support contact email."""
        if self._recipient_email is None:
            LOGGER.warning(
                "support_contact_rejected",
                extra={
                    "reason": "recipient_not_configured",
                    "category": category.value,
                    "user_id": str(user.id),
                },
            )
            raise SupportContactServiceError(
                detail="Support contact is unavailable right now. Please try again.",
                status_code=503,
            )

        try:
            await self._email_service.send(
                EmailMessage(
                    to_email=self._recipient_email,
                    subject=f"Stima support: {category.value}",
                    html_content=_render_html_body(
                        user_email=user.email,
                        user_id=str(user.id),
                        category=category,
                        message=message,
                    ),
                    text_content=_render_text_body(
                        user_email=user.email,
                        user_id=str(user.id),
                        category=category,
                        message=message,
                    ),
                    reply_to_email=user.email,
                )
            )
        except EmailConfigurationError as exc:
            LOGGER.warning(
                "support_contact_failed",
                extra={
                    "reason": "email_not_configured",
                    "category": category.value,
                    "user_id": str(user.id),
                },
            )
            raise SupportContactServiceError(
                detail="Support contact is unavailable right now. Please try again.",
                status_code=503,
            ) from exc
        except EmailSendError as exc:
            LOGGER.warning(
                "support_contact_failed",
                extra={
                    "reason": "provider_send_error",
                    "category": category.value,
                    "user_id": str(user.id),
                },
            )
            raise SupportContactServiceError(
                detail="Message could not be sent. Please try again.",
                status_code=502,
            ) from exc

        LOGGER.info(
            "support_contact_sent",
            extra={"category": category.value, "user_id": str(user.id)},
        )


def _normalize_optional_value(value: str | None) -> str | None:
    if value is None:
        return None
    normalized_value = value.strip()
    if not normalized_value:
        return None
    return normalized_value


def _render_text_body(
    *,
    user_email: str,
    user_id: str,
    category: SupportContactCategory,
    message: str,
) -> str:
    return (
        f"User email: {user_email}\n"
        f"User id: {user_id}\n"
        f"Category: {category.value}\n\n"
        "Message:\n"
        f"{message}\n"
    )


def _render_html_body(
    *,
    user_email: str,
    user_id: str,
    category: SupportContactCategory,
    message: str,
) -> str:
    escaped_message = (
        message.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    ).replace("\n", "<br>")
    return (
        "<p><strong>User email:</strong> "
        f"{user_email}</p>"
        "<p><strong>User id:</strong> "
        f"{user_id}</p>"
        "<p><strong>Category:</strong> "
        f"{category.value}</p>"
        "<p><strong>Message:</strong><br>"
        f"{escaped_message}</p>"
    )
