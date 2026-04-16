"""API tests for authenticated job-status polling."""

from __future__ import annotations

from uuid import uuid4

import pytest
from app.features.auth.models import User
from app.features.auth.service import CSRF_COOKIE_NAME
from app.features.jobs.models import JobType
from app.features.jobs.repository import JobRepository
from app.features.quotes.repository import QuoteRepository
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio


async def test_get_job_status_returns_owned_extraction_result(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    credentials = _credentials()
    await _register_and_login(client, credentials)
    user = await _get_user_by_email(db_session, credentials["email"])

    repository = JobRepository(db_session)
    quote = await QuoteRepository(db_session).create(
        user_id=user.id,
        customer_id=None,
        title=None,
        transcript="mulch the beds",
        line_items=[],
        total_amount=None,
        tax_rate=None,
        discount_type=None,
        discount_value=None,
        deposit_amount=None,
        notes=None,
        source_type="text",
    )
    record = await repository.create(user_id=user.id, job_type=JobType.EXTRACTION)
    await repository.set_running(record.id, expected_job_type=JobType.EXTRACTION)
    await repository.set_extraction_success(
        record.id,
        quote_id=quote.id,
        result_json=('{"transcript":"mulch the beds","line_items":[],"total":null}'),
    )
    await db_session.commit()

    response = await client.get(f"/api/jobs/{record.id}")

    assert response.status_code == 200  # nosec B101 - pytest assertion
    payload = response.json()
    assert payload["id"] == str(record.id)  # nosec B101 - pytest assertion
    assert payload["status"] == "success"  # nosec B101 - pytest assertion
    assert payload["document_id"] == str(quote.id)  # nosec B101 - pytest assertion
    assert payload["quote_id"] == str(quote.id)  # nosec B101 - pytest assertion
    assert payload["extraction_result"] == {  # nosec B101 - pytest assertion
        "transcript": "mulch the beds",
        "line_items": [],
        "pricing_hints": {
            "explicit_total": None,
            "deposit_amount": None,
            "tax_rate": None,
            "discount_type": None,
            "discount_value": None,
        },
        "customer_notes_suggestion": None,
        "extraction_tier": "primary",
        "extraction_degraded_reason_code": None,
    }


async def test_get_job_status_returns_404_for_foreign_or_unknown_jobs(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    credentials = _credentials()
    await _register_and_login(client, credentials)

    foreign_user = User(
        id=uuid4(),
        email=f"{uuid4().hex}@example.com",
        password_hash="hashed-password",  # nosec B106 - test-only stub value
    )
    db_session.add(foreign_user)
    await db_session.flush()

    repository = JobRepository(db_session)
    foreign_record = await repository.create(user_id=foreign_user.id, job_type=JobType.EXTRACTION)
    await db_session.commit()

    foreign_response = await client.get(f"/api/jobs/{foreign_record.id}")
    unknown_response = await client.get(f"/api/jobs/{uuid4()}")

    assert foreign_response.status_code == 404  # nosec B101 - pytest assertion
    assert foreign_response.json() == {"detail": "Not found"}  # nosec B101 - pytest assertion
    assert unknown_response.status_code == 404  # nosec B101 - pytest assertion
    assert unknown_response.json() == {"detail": "Not found"}  # nosec B101 - pytest assertion


async def _register_and_login(client: AsyncClient, credentials: dict[str, str]) -> str:
    register_response = await client.post("/api/auth/register", json=credentials)
    assert register_response.status_code == 201  # nosec B101 - pytest assertion
    login_response = await client.post("/api/auth/login", json=credentials)
    assert login_response.status_code == 200  # nosec B101 - pytest assertion
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None  # nosec B101 - pytest assertion
    return csrf_token


async def _get_user_by_email(db_session: AsyncSession, email: str) -> User:
    user = await db_session.scalar(select(User).where(User.email == email))
    assert user is not None  # nosec B101 - pytest assertion
    return user


def _credentials() -> dict[str, str]:
    suffix = uuid4().hex[:12]
    return {
        "email": f"user-{suffix}@example.com",
        "password": "StrongPass123!",  # nosec B105 - test credential
    }
