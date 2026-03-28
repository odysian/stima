"""Admin analytics endpoint tests."""

from __future__ import annotations

from collections.abc import AsyncGenerator, Iterator
from datetime import UTC, datetime
from uuid import uuid4

import pytest
import pytest_asyncio
from app.core.config import get_settings
from app.core.database import get_db, get_engine, get_session_maker
from app.features.auth.models import User
from app.features.event_logs.models import EventLog
from app.main import create_app
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _clear_cached_settings() -> Iterator[None]:
    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_maker.cache_clear()
    yield
    get_session_maker.cache_clear()
    get_engine.cache_clear()
    get_settings.cache_clear()


@pytest_asyncio.fixture()
async def admin_client(
    monkeypatch: pytest.MonkeyPatch,
    db_session: AsyncSession,
) -> AsyncGenerator[AsyncClient, None]:
    monkeypatch.setenv("ADMIN_API_KEY", "pilot-key")

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

    app.dependency_overrides.clear()


async def test_admin_events_returns_aggregated_counts_by_utc_day(
    admin_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    user = await _seed_user(db_session)
    db_session.add_all(
        [
            EventLog(
                user_id=user.id,
                event_name="quote_started",
                metadata_json={},
                created_at=datetime(2026, 3, 10, 23, 30, tzinfo=UTC),
            ),
            EventLog(
                user_id=user.id,
                event_name="quote_started",
                metadata_json={},
                created_at=datetime(2026, 3, 10, 23, 45, tzinfo=UTC),
            ),
            EventLog(
                user_id=user.id,
                event_name="quote_shared",
                metadata_json={},
                created_at=datetime(2026, 3, 11, 0, 30, tzinfo=UTC),
            ),
        ]
    )
    await db_session.commit()

    response = await admin_client.get(
        "/api/admin/events",
        params={"start_date": "2026-03-10", "end_date": "2026-03-11"},
        headers={"X-Admin-Key": "pilot-key"},
    )

    assert response.status_code == 200  # nosec B101
    assert response.json() == {  # nosec B101
        "events": [
            {"event_name": "quote_started", "date": "2026-03-10", "count": 2},
            {"event_name": "quote_shared", "date": "2026-03-11", "count": 1},
        ],
        "total": 3,
    }


async def test_admin_events_requires_key_when_route_is_registered(
    admin_client: AsyncClient,
) -> None:
    response = await admin_client.get(
        "/api/admin/events",
        params={"start_date": "2026-03-10", "end_date": "2026-03-11"},
    )

    assert response.status_code == 401  # nosec B101


async def test_admin_events_rejects_invalid_key(admin_client: AsyncClient) -> None:
    response = await admin_client.get(
        "/api/admin/events",
        params={"start_date": "2026-03-10", "end_date": "2026-03-11"},
        headers={"X-Admin-Key": "wrong-key"},
    )

    assert response.status_code == 401  # nosec B101


async def test_admin_events_route_is_absent_when_key_unset(
    monkeypatch: pytest.MonkeyPatch,
    db_session: AsyncSession,
) -> None:
    monkeypatch.delenv("ADMIN_API_KEY", raising=False)

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/api/admin/events",
            params={"start_date": "2026-03-10", "end_date": "2026-03-11"},
            headers={"X-Admin-Key": "pilot-key"},
        )

    assert response.status_code == 404  # nosec B101


async def test_admin_events_rejects_invalid_date_inputs(admin_client: AsyncClient) -> None:
    response = await admin_client.get(
        "/api/admin/events",
        params={"start_date": "not-a-date", "end_date": "2026-03-11"},
        headers={"X-Admin-Key": "pilot-key"},
    )

    assert response.status_code == 422  # nosec B101


async def test_admin_events_rejects_inverted_date_ranges(admin_client: AsyncClient) -> None:
    response = await admin_client.get(
        "/api/admin/events",
        params={"start_date": "2026-03-12", "end_date": "2026-03-11"},
        headers={"X-Admin-Key": "pilot-key"},
    )

    assert response.status_code == 422  # nosec B101


async def test_admin_events_can_filter_by_event_name(
    admin_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    user = await _seed_user(db_session)
    db_session.add_all(
        [
            EventLog(
                user_id=user.id,
                event_name="quote_started",
                metadata_json={},
                created_at=datetime(2026, 3, 10, 12, 0, tzinfo=UTC),
            ),
            EventLog(
                user_id=user.id,
                event_name="quote_shared",
                metadata_json={},
                created_at=datetime(2026, 3, 10, 13, 0, tzinfo=UTC),
            ),
        ]
    )
    await db_session.commit()

    response = await admin_client.get(
        "/api/admin/events",
        params={
            "event_name": "quote_shared",
            "start_date": "2026-03-10",
            "end_date": "2026-03-10",
        },
        headers={"X-Admin-Key": "pilot-key"},
    )

    assert response.status_code == 200  # nosec B101
    assert response.json() == {  # nosec B101
        "events": [
            {"event_name": "quote_shared", "date": "2026-03-10", "count": 1},
        ],
        "total": 1,
    }


async def test_admin_events_returns_empty_results_for_unknown_event_name(
    admin_client: AsyncClient,
) -> None:
    response = await admin_client.get(
        "/api/admin/events",
        params={
            "event_name": "unknown-event",
            "start_date": "2026-03-10",
            "end_date": "2026-03-10",
        },
        headers={"X-Admin-Key": "pilot-key"},
    )

    assert response.status_code == 200  # nosec B101
    assert response.json() == {"events": [], "total": 0}  # nosec B101


async def test_admin_events_route_is_hidden_from_openapi(admin_client: AsyncClient) -> None:
    response = await admin_client.get("/openapi.json")

    assert response.status_code == 200  # nosec B101
    assert "/api/admin/events" not in response.json()["paths"]  # nosec B101


async def _seed_user(db_session: AsyncSession) -> User:
    user = User(
        email=f"admin-{datetime.now(tz=UTC).timestamp()}@example.com",
        password_hash=str(uuid4()),
    )
    db_session.add(user)
    await db_session.flush()
    return user
