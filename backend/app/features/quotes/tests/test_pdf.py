"""Quote PDF generation and sharing endpoint behavior tests."""

from __future__ import annotations

import asyncio
from collections.abc import Iterator
from typing import Annotated
from uuid import uuid4

import pytest
from fastapi import Depends
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.features.auth.service import CSRF_COOKIE_NAME
from app.features.quotes.repository import QuoteRenderContext, QuoteRepository
from app.features.quotes.service import QuoteService
from app.integrations.pdf import PdfRenderError
from app.main import app
from app.shared.dependencies import get_quote_service

pytestmark = pytest.mark.asyncio


class _ConfigurablePdfIntegration:
    def __init__(self) -> None:
        self.should_fail = False

    def render(self, context: QuoteRenderContext) -> bytes:
        if self.should_fail:
            raise PdfRenderError("Unable to render quote PDF")
        return f"PDF for {context.doc_number}".encode()


@pytest.fixture(autouse=True)
def _override_quote_service_dependency() -> Iterator[_ConfigurablePdfIntegration]:
    pdf_integration = _ConfigurablePdfIntegration()

    async def _override_get_quote_service(
        db: Annotated[AsyncSession, Depends(get_db)],
    ) -> QuoteService:
        return QuoteService(
            repository=QuoteRepository(db),
            pdf_integration=pdf_integration,
        )

    app.dependency_overrides[get_quote_service] = _override_get_quote_service
    yield pdf_integration
    app.dependency_overrides.pop(get_quote_service, None)


async def test_generate_pdf_returns_pdf_and_sets_ready(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    response = await client.post(
        f"/api/quotes/{quote['id']}/pdf",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.headers["content-disposition"] == 'inline; filename="quote-Q-001.pdf"'
    assert response.content == b"PDF for Q-001"

    detail = await client.get(f"/api/quotes/{quote['id']}")
    assert detail.status_code == 200
    assert detail.json()["status"] == "ready"


async def test_generate_pdf_does_not_downgrade_shared_quote(client: AsyncClient) -> None:
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
    assert pdf_response.status_code == 200

    detail = await client.get(f"/api/quotes/{quote['id']}")
    assert detail.status_code == 200
    assert detail.json()["status"] == "shared"


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


async def test_generate_pdf_returns_422_when_render_fails(
    client: AsyncClient,
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

    assert response.status_code == 422
    assert response.json() == {"detail": "Unable to render quote PDF"}


async def test_pdf_endpoint_requires_csrf(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    customer_id = await _create_customer(client, csrf_token)
    quote = await _create_quote(client, csrf_token, customer_id)

    response = await client.post(f"/api/quotes/{quote['id']}/pdf")

    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF token missing"}


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


async def _create_quote(client: AsyncClient, csrf_token: str, customer_id: str) -> dict[str, str]:
    response = await client.post(
        "/api/quotes",
        json={
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
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 201
    return response.json()


def _credentials() -> dict[str, str]:
    suffix = uuid4().hex[:12]
    return {
        "email": f"user-{suffix}@example.com",
        "password": "StrongPass123!",
    }
