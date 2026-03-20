"""Database runtime setup tests."""

from collections.abc import AsyncGenerator
from typing import cast

import pytest
from app.core.database import get_db, get_session_maker
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker


def test_session_maker_uses_async_sessions() -> None:
    session_factory = get_session_maker()

    assert isinstance(session_factory, async_sessionmaker)
    assert session_factory.class_ is AsyncSession


@pytest.mark.asyncio
async def test_get_db_yields_async_session() -> None:
    session_generator = cast(AsyncGenerator[AsyncSession, None], get_db())
    session = await session_generator.__anext__()
    assert isinstance(session, AsyncSession)
    await session_generator.aclose()
