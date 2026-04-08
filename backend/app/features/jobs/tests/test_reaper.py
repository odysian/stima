"""Tests for stale extraction job reaping."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from app.features.auth.models import User
from app.features.jobs.models import JobRecord, JobStatus, JobType
from app.features.jobs.reaper import (
    reap_stale_extraction_jobs_once,
    run_stale_extraction_job_reaper,
)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

pytestmark = pytest.mark.asyncio


async def test_reap_stale_extraction_jobs_once_uses_isolated_session(
    db_session: AsyncSession,
) -> None:
    session_factory = async_sessionmaker(bind=db_session.bind, expire_on_commit=False)
    user = await _seed_user(db_session)
    record = JobRecord(
        user_id=user.id,
        job_type=JobType.EXTRACTION,
        status=JobStatus.PENDING,
        attempts=0,
        created_at=datetime.now(UTC) - timedelta(minutes=10),
    )
    db_session.add(record)
    await db_session.commit()

    reaped_count = await reap_stale_extraction_jobs_once(
        session_factory=session_factory,
        stale_ttl_seconds=300,
    )

    assert reaped_count == 1  # nosec B101 - pytest assertion
    await db_session.refresh(record)
    assert record.status == JobStatus.TERMINAL  # nosec B101 - pytest assertion
    assert record.terminal_error == "job_not_picked_up"  # nosec B101 - pytest assertion


async def test_run_stale_extraction_job_reaper_retries_after_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[int] = []
    sleep_calls: list[int] = []

    async def _fake_reap_once(**_: object) -> int:
        calls.append(len(calls))
        if len(calls) == 1:
            raise RuntimeError("boom")
        raise asyncio.CancelledError

    async def _fake_sleep(interval_seconds: int) -> None:
        sleep_calls.append(interval_seconds)

    monkeypatch.setattr(
        "app.features.jobs.reaper.reap_stale_extraction_jobs_once",
        _fake_reap_once,
    )
    monkeypatch.setattr("app.features.jobs.reaper.asyncio.sleep", _fake_sleep)

    with pytest.raises(asyncio.CancelledError):
        await run_stale_extraction_job_reaper(
            session_factory=async_sessionmaker(expire_on_commit=False),
            interval_seconds=7,
            stale_ttl_seconds=300,
        )

    assert len(calls) == 2  # nosec B101 - pytest assertion
    assert sleep_calls == [7]  # nosec B101 - pytest assertion


async def _seed_user(db_session: AsyncSession) -> User:
    user = User(
        id=uuid4(),
        email=f"{uuid4().hex}@example.com",
        password_hash="hashed-password",  # nosec B106 - test-only stub value
    )
    db_session.add(user)
    await db_session.flush()
    return user
