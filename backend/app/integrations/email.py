"""Transactional email delivery integration."""

from __future__ import annotations

from dataclasses import dataclass

import httpx


class EmailSendError(Exception):
    """Raised when the email provider rejects or fails a send."""


class EmailConfigurationError(Exception):
    """Raised when email delivery is not configured."""


@dataclass(slots=True)
class EmailMessage:
    """Normalized outbound email payload."""

    to_email: str
    subject: str
    html_content: str
    text_content: str
    reply_to_email: str | None = None


class EmailService:
    """Send transactional email through the configured provider."""

    def __init__(
        self,
        *,
        api_key: str | None,
        from_address: str | None,
        from_name: str | None,
        api_url: str = "https://api.resend.com/emails",
        timeout_seconds: float = 10.0,
    ) -> None:
        self._api_key = _normalize_optional_value(api_key)
        self._from_address = _normalize_optional_value(from_address)
        self._from_name = _normalize_optional_value(from_name)
        self._api_url = api_url
        self._timeout_seconds = timeout_seconds

    @property
    def is_configured(self) -> bool:
        """Return true when the provider has the minimum runtime config."""
        return bool(self._api_key and self._from_address and self._from_name)

    async def send(self, message: EmailMessage) -> None:
        """Deliver one email through the Resend Email API."""
        if not self.is_configured:
            raise EmailConfigurationError("Email delivery is not configured")

        payload = {
            "from": f"{self._from_name} <{self._from_address}>",
            "to": [message.to_email],
            "subject": message.subject,
            "html": message.html_content,
            "text": message.text_content,
        }
        if message.reply_to_email is not None:
            payload["reply_to"] = message.reply_to_email
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                response = await client.post(self._api_url, json=payload, headers=headers)
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise EmailSendError("Email provider rejected the message") from exc
        except httpx.HTTPError as exc:
            raise EmailSendError("Email provider request failed") from exc


def _normalize_optional_value(value: str | None) -> str | None:
    if value is None:
        return None
    normalized_value = value.strip()
    if not normalized_value:
        return None
    return normalized_value
