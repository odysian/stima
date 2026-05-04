"""Support contact API behavior tests."""

from __future__ import annotations

from collections.abc import Iterator
from uuid import uuid4

import pytest
from app.core.config import get_settings
from app.features.auth.service import CSRF_COOKIE_NAME
from app.integrations.email import (
    EmailConfigurationError,
    EmailMessage,
    EmailSendError,
)
from app.main import app
from app.shared.dependencies import get_email_service
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


class _MockEmailService:
    def __init__(self) -> None:
        self.messages: list[EmailMessage] = []
        self.raise_configuration_error = False
        self.raise_send_error = False

    async def send(self, message: EmailMessage) -> None:
        if self.raise_configuration_error:
            raise EmailConfigurationError("Email delivery is not configured")
        if self.raise_send_error:
            raise EmailSendError("Provider failure")
        self.messages.append(message)


@pytest.fixture(autouse=True)
def _configure_support_settings(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("SUPPORT_CONTACT_RECIPIENT_EMAIL", "founder@example.com")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _mock_email_service() -> Iterator[_MockEmailService]:
    service = _MockEmailService()
    app.dependency_overrides[get_email_service] = lambda: service
    yield service
    app.dependency_overrides.pop(get_email_service, None)


async def test_support_contact_requires_authentication(client: AsyncClient) -> None:
    client.cookies.clear()
    client.cookies.set(CSRF_COOKIE_NAME, "csrf", path="/")

    response = await client.post(
        "/api/support/contact",
        json={"category": "bug", "message": "App crashed after save."},
        headers={"X-CSRF-Token": "csrf"},
    )

    assert response.status_code == 401  # nosec B101 - pytest assertion


async def test_support_contact_requires_csrf_header(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/support/contact",
        json={"category": "bug", "message": "App crashed after save."},
    )

    assert response.status_code == 403  # nosec B101 - pytest assertion
    assert response.json() == {"detail": "CSRF token missing"}  # nosec B101 - pytest assertion


async def test_support_contact_rejects_unknown_category(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None  # nosec B101 - pytest assertion
    response = await client.post(
        "/api/support/contact",
        json={"category": "not_a_real_category", "message": "Need help"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422  # nosec B101 - pytest assertion


async def test_support_contact_rejects_blank_message(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None  # nosec B101 - pytest assertion
    response = await client.post(
        "/api/support/contact",
        json={"category": "bug", "message": "    "},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422  # nosec B101 - pytest assertion


async def test_support_contact_rejects_message_above_limit(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None  # nosec B101 - pytest assertion
    response = await client.post(
        "/api/support/contact",
        json={"category": "bug", "message": "a" * 2001},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422  # nosec B101 - pytest assertion


async def test_support_contact_sends_minimal_email(
    client: AsyncClient,
    _mock_email_service: _MockEmailService,
) -> None:
    credentials = _credentials()
    await _register_and_login(client, credentials)
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None  # nosec B101 - pytest assertion
    response = await client.post(
        "/api/support/contact",
        json={
            "category": "security_privacy",
            "message": "  Redacted sample issue details.  ",
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200  # nosec B101 - pytest assertion
    assert response.json() == {"message": "Thanks — your message was sent."}  # nosec B101 - pytest assertion
    assert len(_mock_email_service.messages) == 1  # nosec B101 - pytest assertion
    delivered = _mock_email_service.messages[0]
    assert delivered.to_email == "founder@example.com"  # nosec B101 - pytest assertion
    assert delivered.subject == "Stima support: security_privacy"  # nosec B101 - pytest assertion
    assert delivered.reply_to_email == credentials["email"]  # nosec B101 - pytest assertion
    assert "Category: security_privacy" in delivered.text_content  # nosec B101 - pytest assertion
    assert "Redacted sample issue details." in delivered.text_content  # nosec B101 - pytest assertion
    assert "  Redacted sample issue details.  " not in delivered.text_content  # nosec B101 - pytest assertion


async def test_support_contact_fails_when_recipient_not_configured(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SUPPORT_CONTACT_RECIPIENT_EMAIL", "")
    get_settings.cache_clear()

    await _register_and_login(client, _credentials())
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None  # nosec B101 - pytest assertion
    response = await client.post(
        "/api/support/contact",
        json={"category": "bug", "message": "Need help."},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 503  # nosec B101 - pytest assertion
    assert response.json() == {  # nosec B101 - pytest assertion
        "detail": "Support contact is unavailable right now. Please try again."
    }


async def test_support_contact_maps_provider_failure_to_generic_error(
    client: AsyncClient,
    _mock_email_service: _MockEmailService,
) -> None:
    _mock_email_service.raise_send_error = True
    await _register_and_login(client, _credentials())
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None  # nosec B101 - pytest assertion
    response = await client.post(
        "/api/support/contact",
        json={"category": "other", "message": "Need help."},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 502  # nosec B101 - pytest assertion
    assert response.json() == {"detail": "Message could not be sent. Please try again."}  # nosec B101 - pytest assertion


async def _register_and_login(client: AsyncClient, credentials: dict[str, str]) -> None:
    register_response = await client.post("/api/auth/register", json=credentials)
    assert register_response.status_code == 201  # nosec B101 - pytest assertion
    login_response = await client.post("/api/auth/login", json=credentials)
    assert login_response.status_code == 200  # nosec B101 - pytest assertion


def _credentials() -> dict[str, str]:
    suffix = uuid4().hex[:12]
    return {
        "email": f"user-{suffix}@example.com",
        "password": "StrongPass123!",  # nosec B105 - test credential
    }
