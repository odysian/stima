"""Shared pytest fixtures for backend integration tests."""

from __future__ import annotations

import os
from collections.abc import AsyncGenerator, Iterator
from uuid import uuid4

import pytest
import pytest_asyncio
from app.core.config import get_settings
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-at-least-32-bytes")
os.environ.setdefault("GCS_BUCKET_NAME", "stima-test-logos")
# Prevent backend/.env REDIS_URL from leaking into the test session.
# Route tests to a dedicated test DB when TEST_REDIS_URL is set; otherwise
# force memory-only mode so tests never touch the developer's local Redis.
os.environ["REDIS_URL"] = os.environ.get("TEST_REDIS_URL", "")

from app.core.database import Base, get_db
from app.features import registry as feature_registry  # noqa: F401
from app.main import app
from app.shared import event_logger
from app.shared.dependencies import (
    get_extraction_integration,
    get_idempotency_store,
    get_transcription_integration,
)
from app.shared.idempotency import reset_local_idempotency_state
from app.shared.rate_limit import configure_active_limiter_key_prefix, reset_local_rate_limit_state

TEST_SCHEMA = "stima_test"
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://stima:stima@localhost:5432/stima",
)

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    poolclass=NullPool,
    connect_args={"server_settings": {"search_path": f"{TEST_SCHEMA},public"}},
)
TestAsyncSession = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


@pytest.fixture(scope="session", autouse=True)
def _flush_test_redis() -> Iterator[None]:
    """Flush the dedicated test Redis DB at session start and end.

    Only runs when REDIS_URL is set (i.e. TEST_REDIS_URL was provided).
    Gives every run a clean slate and avoids stale keys from crashed runs.
    """
    import redis as sync_redis

    test_redis_url = os.environ.get("REDIS_URL", "")
    if not test_redis_url:
        yield
        return

    def _flush() -> None:
        try:
            client = sync_redis.Redis.from_url(test_redis_url, socket_connect_timeout=2)
            client.flushdb()
            client.close()
        except Exception:
            pass

    _flush()
    yield
    _flush()


@pytest.fixture(autouse=True)
def _disable_db_event_persistence_by_default() -> Iterator[None]:
    """Keep integration tests isolated unless a test explicitly enables event persistence."""
    event_logger.configure_event_logging(session_factory=None)
    yield
    event_logger.configure_event_logging(session_factory=None)


@pytest.fixture(autouse=True)
def _reset_arq_pool_state() -> Iterator[None]:
    """Keep shared app state from leaking fake ARQ pools across tests."""
    app.state.arq_pool = None
    yield
    app.state.arq_pool = None


@pytest.fixture(autouse=True)
def _isolate_rate_limit_state(
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[None]:
    """Use a unique Redis namespace per test so local Redis-backed limits cannot leak."""
    prefix = f"pytest-{uuid4().hex}"
    monkeypatch.setenv("REDIS_KEY_PREFIX", prefix)
    get_settings.cache_clear()
    get_extraction_integration.cache_clear()
    get_transcription_integration.cache_clear()
    configure_active_limiter_key_prefix(prefix)
    reset_local_rate_limit_state()
    if get_idempotency_store.cache_info().currsize:
        reset_local_idempotency_state(get_idempotency_store())
    yield
    reset_local_rate_limit_state()
    if get_idempotency_store.cache_info().currsize:
        reset_local_idempotency_state(get_idempotency_store())
    get_extraction_integration.cache_clear()
    get_transcription_integration.cache_clear()
    get_settings.cache_clear()


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def setup_test_database() -> AsyncGenerator[None, None]:
    """Create and tear down test schema/tables once per test session."""
    async with test_engine.begin() as conn:
        await conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {TEST_SCHEMA}"))

    original_metadata_schema = Base.metadata.schema
    original_table_schemas = {table.name: table.schema for table in Base.metadata.tables.values()}

    Base.metadata.schema = TEST_SCHEMA
    for table in Base.metadata.tables.values():
        table.schema = TEST_SCHEMA

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield

    async with test_engine.begin() as conn:
        await conn.execute(text(f"DROP SCHEMA IF EXISTS {TEST_SCHEMA} CASCADE"))

    Base.metadata.schema = original_metadata_schema
    for table in Base.metadata.tables.values():
        table.schema = original_table_schemas[table.name]


@pytest_asyncio.fixture()
async def db_session(
    setup_test_database: None,
) -> AsyncGenerator[AsyncSession, None]:
    """Provide a transactional session rolled back after each test."""
    connection = await test_engine.connect()
    outer_transaction = await connection.begin()
    session = TestAsyncSession(bind=connection)

    await connection.begin_nested()

    @event.listens_for(session.sync_session, "after_transaction_end")
    def _restart_savepoint(
        session_inner: object,
        transaction_inner: object,
    ) -> None:
        del session_inner
        nested = getattr(transaction_inner, "nested", False)
        parent = getattr(transaction_inner, "_parent", None)
        parent_nested = bool(parent is not None and getattr(parent, "nested", False))
        if nested and not parent_nested:
            sync_connection = connection.sync_connection
            if sync_connection is not None:
                sync_connection.begin_nested()

    yield session

    await session.close()
    if outer_transaction.is_active:
        await outer_transaction.rollback()
    await connection.close()


@pytest_asyncio.fixture()
async def client(
    db_session: AsyncSession,
) -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP client with DB dependency bound to the per-test session."""

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    app.state.limiter.enabled = False

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac

    app.dependency_overrides.clear()
    app.state.limiter.enabled = True
