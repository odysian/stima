"""Database runtime setup tests."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.database import get_db, get_session_maker


def test_session_maker_uses_async_sessions() -> None:
    session_factory = get_session_maker()

    assert isinstance(session_factory, async_sessionmaker)
    assert session_factory.class_ is AsyncSession


@pytest.mark.asyncio
async def test_get_db_yields_async_session() -> None:
    session_generator = get_db()
    session = await anext(session_generator)

    assert isinstance(session, AsyncSession)

    await session_generator.aclose()
