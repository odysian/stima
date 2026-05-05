"""Tests for worker startup, retry, and terminal-failure behavior."""

from __future__ import annotations

import logging
from typing import cast
from uuid import UUID, uuid4

import pytest
from app.core.config import get_settings
from app.features.auth.models import User
from app.features.jobs.models import JobRecord, JobStatus, JobType
from app.features.jobs.repository import JobRepository
from app.worker import runtime as runtime_module
from app.worker.runtime import (
    TERMINAL_ERROR_RETRY_EXHAUSTED,
    RetryableJobError,
    WorkerRuntimeSettings,
    calculate_retry_delay_seconds,
    on_worker_startup,
    process_job,
)
from arq.worker import Retry
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

pytestmark = pytest.mark.asyncio


async def test_process_job_marks_success_after_running(
    db_session: AsyncSession,
) -> None:
    user = await _seed_user(db_session)
    repository = JobRepository(db_session)
    record = await repository.create(user_id=user.id, job_type=JobType.EXTRACTION)
    await db_session.commit()

    await process_job(
        _worker_context(db_session),
        job_id=record.id,
        job_type=JobType.EXTRACTION,
        handler=_successful_handler,
    )

    refreshed = await _load_job_record(db_session, record.id)
    assert refreshed is not None  # nosec B101 - pytest assertion
    assert refreshed.status == JobStatus.SUCCESS  # nosec B101 - pytest assertion
    assert refreshed.attempts == 1  # nosec B101 - pytest assertion
    assert refreshed.terminal_error is None  # nosec B101 - pytest assertion


async def test_process_job_retries_transient_failures_before_terminal(
    db_session: AsyncSession,
) -> None:
    user = await _seed_user(db_session)
    repository = JobRepository(db_session)
    record = await repository.create(user_id=user.id, job_type=JobType.PDF)
    await db_session.commit()

    expected_first_retry_delay = calculate_retry_delay_seconds(
        job_id=record.id,
        attempt_number=1,
        base_delay_seconds=5.0,
        max_jitter_seconds=3.0,
    )
    expected_second_retry_delay = calculate_retry_delay_seconds(
        job_id=record.id,
        attempt_number=2,
        base_delay_seconds=5.0,
        max_jitter_seconds=3.0,
    )

    with pytest.raises(Retry) as first_retry:
        await process_job(
            _worker_context(db_session, job_try=1),
            job_id=record.id,
            job_type=JobType.PDF,
            handler=_retryable_failure_handler,
        )

    after_first_failure = await _load_job_record(db_session, record.id)
    assert after_first_failure is not None  # nosec B101 - pytest assertion
    assert after_first_failure.status == JobStatus.FAILED  # nosec B101 - pytest assertion
    assert after_first_failure.attempts == 1  # nosec B101 - pytest assertion
    assert after_first_failure.terminal_error is None  # nosec B101 - pytest assertion
    assert first_retry.value.defer_score == int(expected_first_retry_delay * 1000)  # nosec B101 - pytest assertion

    with pytest.raises(Retry) as second_retry:
        await process_job(
            _worker_context(db_session, job_try=2),
            job_id=record.id,
            job_type=JobType.PDF,
            handler=_retryable_failure_handler,
        )

    after_second_failure = await _load_job_record(db_session, record.id)
    assert after_second_failure is not None  # nosec B101 - pytest assertion
    assert after_second_failure.status == JobStatus.FAILED  # nosec B101 - pytest assertion
    assert after_second_failure.attempts == 2  # nosec B101 - pytest assertion
    assert second_retry.value.defer_score == int(expected_second_retry_delay * 1000)  # nosec B101 - pytest assertion

    with pytest.raises(RetryableJobError, match="temporary upstream outage"):
        await process_job(
            _worker_context(db_session, job_try=3),
            job_id=record.id,
            job_type=JobType.PDF,
            handler=_retryable_failure_handler,
        )

    terminal_record = await _load_job_record(db_session, record.id)
    assert terminal_record is not None  # nosec B101 - pytest assertion
    assert terminal_record.status == JobStatus.TERMINAL  # nosec B101 - pytest assertion
    assert terminal_record.attempts == 3  # nosec B101 - pytest assertion
    assert terminal_record.terminal_error == TERMINAL_ERROR_RETRY_EXHAUSTED  # nosec B101 - pytest assertion


async def test_process_job_marks_failed_before_terminal_on_final_retryable_error(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = await _seed_user(db_session)
    repository = JobRepository(db_session)
    record = await repository.create(user_id=user.id, job_type=JobType.EMAIL)
    await db_session.commit()

    call_order: list[str] = []
    original_set_failed = _resolve_runtime_helper("_set_failed")
    original_set_terminal = _resolve_runtime_helper("_set_terminal")

    async def _tracking_set_failed(*args, **kwargs) -> None:
        call_order.append("failed")
        await original_set_failed(*args, **kwargs)

    async def _tracking_set_terminal(*args, **kwargs) -> None:
        call_order.append("terminal")
        await original_set_terminal(*args, **kwargs)

    monkeypatch.setattr("app.worker.runtime._set_failed", _tracking_set_failed)
    monkeypatch.setattr("app.worker.runtime._set_terminal", _tracking_set_terminal)

    with pytest.raises(RetryableJobError, match="temporary upstream outage"):
        await process_job(
            _worker_context(db_session, job_try=3),
            job_id=record.id,
            job_type=JobType.EMAIL,
            handler=_retryable_failure_handler,
        )

    assert call_order == ["failed", "terminal"]  # nosec B101 - pytest assertion


async def test_process_job_terminal_logs_omit_raw_exception_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    rendered_messages: list[str] = []
    security_events: list[dict[str, object]] = []
    terminal_reasons: list[str] = []
    sentinel = "PROVIDER_SECRET_SENTINEL_DO_NOT_LOG"
    job_id = uuid4()

    def _capture_log(level: int, message: str, *args: object, **kwargs: object) -> None:
        del kwargs
        rendered_messages.append(message % args if args else message)

    def _capture_security_event(
        event: str,
        *,
        outcome: str,
        level: int = logging.INFO,
        **fields: object,
    ) -> None:
        security_events.append(
            {
                "event": event,
                "outcome": outcome,
                "level": level,
                **fields,
            }
        )

    async def _noop_set_running(*args, **kwargs) -> None:  # noqa: ANN002, ANN003
        del args, kwargs

    async def _capture_set_terminal(
        runtime: WorkerRuntimeSettings,
        *,
        job_id: UUID,
        job_type: JobType,
        reason: str,
    ) -> None:
        del runtime, job_id, job_type
        terminal_reasons.append(reason)

    runtime = WorkerRuntimeSettings(
        session_maker=cast(async_sessionmaker[AsyncSession], object()),
        max_tries=3,
        retry_base_seconds=5.0,
        retry_jitter_seconds=3.0,
    )

    monkeypatch.setattr(runtime_module.logger, "log", _capture_log)
    monkeypatch.setattr(runtime_module, "log_security_event", _capture_security_event)
    monkeypatch.setattr(runtime_module, "_set_running", _noop_set_running)
    monkeypatch.setattr(runtime_module, "_set_terminal", _capture_set_terminal)

    async def _terminal_failure_handler() -> None:
        raise RuntimeError(sentinel)

    with pytest.raises(RuntimeError, match=sentinel):
        await process_job(
            {"job_try": 1, "worker_runtime": runtime},
            job_id=job_id,
            job_type=JobType.EXTRACTION,
            job_name="jobs.extraction",
            handler=_terminal_failure_handler,
        )

    assert rendered_messages  # nosec B101 - pytest assertion
    assert all(sentinel not in message for message in rendered_messages)  # nosec B101 - pytest assertion
    assert terminal_reasons == ["unexpected_error"]  # nosec B101 - pytest assertion
    terminal_event = security_events[-1]
    assert terminal_event["event"] == "jobs.terminal_failure"  # nosec B101 - pytest assertion
    assert terminal_event["reason"] == "unexpected_error"  # nosec B101 - pytest assertion
    assert terminal_event["job_id"] == str(job_id)  # nosec B101 - pytest assertion
    assert terminal_event["job_name"] == "jobs.extraction"  # nosec B101 - pytest assertion
    assert terminal_event["error_class"] == "RuntimeError"  # nosec B101 - pytest assertion
    assert sentinel not in str(terminal_event)  # nosec B101 - pytest assertion


async def test_worker_startup_raises_when_redis_is_unreachable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("REDIS_URL", "redis://cache.example:6379/0")
    get_settings.cache_clear()

    class _BrokenRedisClient:
        async def ping(self) -> None:
            raise ConnectionError("cannot reach redis")

        async def aclose(self) -> None:
            return None

    monkeypatch.setattr(
        "app.worker.runtime.redis_async.Redis.from_url",
        lambda *args, **kwargs: _BrokenRedisClient(),
    )

    with pytest.raises(ConnectionError, match="cannot reach redis"):
        await on_worker_startup({})

    get_settings.cache_clear()


async def _successful_handler() -> None:
    return None


async def _retryable_failure_handler() -> None:
    raise RetryableJobError("temporary upstream outage")


async def _seed_user(db_session: AsyncSession) -> User:
    user = User(
        id=uuid4(),
        email=f"{uuid4().hex}@example.com",
        password_hash="hashed-password",  # nosec B106 - test-only stub value
    )
    db_session.add(user)
    await db_session.flush()
    return user


def _worker_context(
    db_session: AsyncSession,
    *,
    job_try: int = 1,
) -> dict[str, object]:
    session_maker = async_sessionmaker(
        bind=db_session.bind,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    runtime = WorkerRuntimeSettings(
        session_maker=session_maker,
        max_tries=3,
        retry_base_seconds=5.0,
        retry_jitter_seconds=3.0,
    )
    return {
        "job_try": job_try,
        "worker_runtime": runtime,
    }


async def _load_job_record(db_session: AsyncSession, job_id: UUID) -> JobRecord | None:
    session_maker = async_sessionmaker(
        bind=db_session.bind,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with session_maker() as session:
        repository = JobRepository(session)
        return await repository.get_by_id(job_id)


def _resolve_runtime_helper(name: str):
    from app.worker import runtime

    return getattr(runtime, name)
