"""Shared runtime helpers for ARQ-backed worker execution."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from hashlib import sha256
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

import redis.asyncio as redis_async
from arq.connections import RedisSettings
from arq.worker import Retry
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings, get_settings
from app.core.database import get_session_maker
from app.features.jobs.models import JobType
from app.features.jobs.repository import JobRepository

logger = logging.getLogger(__name__)

DEFAULT_MAX_TRIES = 3
DEFAULT_RETRY_BASE_SECONDS = 5.0
DEFAULT_RETRY_JITTER_SECONDS = 3.0
TERMINAL_ERROR_RETRY_EXHAUSTED = "retry_exhausted"
TERMINAL_ERROR_UNEXPECTED = "unexpected_error"


@dataclass(frozen=True, slots=True)
class WorkerRuntimeSettings:
    """Resolved worker runtime values shared across job executions."""

    session_maker: async_sessionmaker[AsyncSession]
    max_tries: int
    retry_base_seconds: float
    retry_jitter_seconds: float


class RetryableJobError(RuntimeError):
    """Signal that a job failure is transient and should be retried."""


def build_arq_redis_settings(settings: Settings) -> RedisSettings:
    """Translate the app REDIS_URL into ARQ Redis settings."""
    redis_url = settings.redis_url
    if redis_url is None:
        raise ValueError("REDIS_URL must be set for worker execution")

    parsed = urlparse(redis_url)
    if parsed.scheme not in {"redis", "rediss"}:
        raise ValueError("REDIS_URL must use redis:// or rediss:// for worker execution")

    database = int(parsed.path.lstrip("/") or "0")
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        database=database,
        username=parsed.username,
        password=parsed.password,
        ssl=parsed.scheme == "rediss",
    )


async def on_worker_startup(ctx: dict[str, Any]) -> None:
    """Fail fast on missing Redis and prime shared worker runtime state."""
    settings = get_settings()
    redis_url = settings.redis_url
    if redis_url is None:
        raise ValueError("REDIS_URL must be set for worker execution")

    await ping_worker_redis(redis_url)
    ctx["worker_runtime"] = WorkerRuntimeSettings(
        session_maker=get_session_maker(),
        max_tries=DEFAULT_MAX_TRIES,
        retry_base_seconds=DEFAULT_RETRY_BASE_SECONDS,
        retry_jitter_seconds=DEFAULT_RETRY_JITTER_SECONDS,
    )


async def ping_worker_redis(redis_url: str) -> None:
    """Verify Redis connectivity during worker startup."""
    client = redis_async.Redis.from_url(
        redis_url,
        socket_connect_timeout=2,
        socket_timeout=2,
    )
    try:
        await client.ping()
    finally:
        await client.aclose()


async def process_job(
    ctx: dict[str, Any],
    *,
    job_id: UUID,
    job_type: JobType,
    handler: Callable[[], Awaitable[None]],
) -> None:
    """Wrap domain handlers with durable job status transitions and retry policy."""
    runtime = _get_runtime(ctx)
    attempt_number = max(int(ctx.get("job_try", 1)), 1)

    await _set_running(runtime, job_id=job_id, job_type=job_type)

    try:
        await handler()
    except RetryableJobError as exc:
        if attempt_number >= runtime.max_tries:
            await _set_failed(runtime, job_id=job_id, job_type=job_type)
            logger.warning(
                "Job %s exhausted retry budget and is transitioning to terminal state.",
                job_id,
                exc_info=True,
            )
            await _set_terminal(
                runtime,
                job_id=job_id,
                job_type=job_type,
                reason=_terminal_error_code(exc),
            )
            raise

        await _set_failed(runtime, job_id=job_id, job_type=job_type)
        raise Retry(
            defer=calculate_retry_delay_seconds(
                job_id=job_id,
                attempt_number=attempt_number,
                base_delay_seconds=runtime.retry_base_seconds,
                max_jitter_seconds=runtime.retry_jitter_seconds,
            )
        ) from exc
    except Exception as exc:
        logger.exception("Job %s failed with a terminal exception.", job_id)
        await _set_terminal(
            runtime,
            job_id=job_id,
            job_type=job_type,
            reason=_terminal_error_code(exc),
        )
        raise
    else:
        await _set_success(runtime, job_id=job_id, job_type=job_type)


def calculate_retry_delay_seconds(
    *,
    job_id: UUID,
    attempt_number: int,
    base_delay_seconds: float,
    max_jitter_seconds: float,
) -> float:
    """Return an exponential retry delay with deterministic jitter."""
    exponential_delay = base_delay_seconds * (2 ** max(attempt_number - 1, 0))
    if max_jitter_seconds <= 0:
        return exponential_delay

    jitter_seed = sha256(f"{job_id}:{attempt_number}".encode()).hexdigest()
    jitter_ratio = int(jitter_seed[:8], 16) / 0xFFFFFFFF
    jitter_seconds = jitter_ratio * max_jitter_seconds
    return round(exponential_delay + jitter_seconds, 3)


def _get_runtime(ctx: dict[str, Any]) -> WorkerRuntimeSettings:
    runtime = ctx.get("worker_runtime")
    if not isinstance(runtime, WorkerRuntimeSettings):
        raise RuntimeError("Worker runtime is not initialized; on_worker_startup must run first")
    return runtime


async def _set_running(
    runtime: WorkerRuntimeSettings,
    *,
    job_id: UUID,
    job_type: JobType,
) -> None:
    async with runtime.session_maker() as session:
        repository = JobRepository(session)
        await repository.set_running(job_id, expected_job_type=job_type)
        await session.commit()


async def _set_failed(
    runtime: WorkerRuntimeSettings,
    *,
    job_id: UUID,
    job_type: JobType,
) -> None:
    async with runtime.session_maker() as session:
        repository = JobRepository(session)
        await repository.set_failed(job_id, expected_job_type=job_type)
        await session.commit()


async def _set_success(
    runtime: WorkerRuntimeSettings,
    *,
    job_id: UUID,
    job_type: JobType,
) -> None:
    async with runtime.session_maker() as session:
        repository = JobRepository(session)
        await repository.set_success(job_id, expected_job_type=job_type)
        await session.commit()


async def _set_terminal(
    runtime: WorkerRuntimeSettings,
    *,
    job_id: UUID,
    job_type: JobType,
    reason: str,
) -> None:
    async with runtime.session_maker() as session:
        repository = JobRepository(session)
        await repository.set_terminal(
            job_id,
            reason=reason,
            expected_job_type=job_type,
        )
        await session.commit()


def _terminal_error_code(exc: Exception) -> str:
    if isinstance(exc, RetryableJobError):
        return TERMINAL_ERROR_RETRY_EXHAUSTED
    return TERMINAL_ERROR_UNEXPECTED
