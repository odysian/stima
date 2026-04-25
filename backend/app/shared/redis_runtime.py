"""Redis runtime mode resolution for startup degraded-mode behavior."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Literal

from redis.asyncio import Redis

from app.core.config import Settings

RedisRuntimeMode = Literal["redis", "degraded_memory"]


@dataclass(frozen=True, slots=True)
class RedisRuntimeState:
    """Resolved Redis runtime mode and optional degraded reason."""

    mode: RedisRuntimeMode
    degraded_reason: str | None = None


class RedisRuntimeResolutionError(RuntimeError):
    """Raised when startup policy forbids running without healthy Redis."""


async def probe_redis(
    redis_url: str,
    *,
    timeout_seconds: float = 2.0,
) -> tuple[bool, str | None]:
    """Return probe success and failure reason category for startup logging."""
    client = Redis.from_url(redis_url, encoding="utf-8", decode_responses=True)
    try:
        await asyncio.wait_for(client.ping(), timeout=timeout_seconds)
    except TimeoutError:
        return False, "redis_startup_timeout"
    except Exception:
        return False, "redis_probe_failed"
    finally:
        try:
            await client.aclose()
        except Exception:
            pass
    return True, None


async def resolve_redis_runtime_state(settings: Settings) -> RedisRuntimeState:
    """Resolve startup Redis mode from policy and runtime availability."""
    if settings.redis_url is None:
        if settings.allow_redis_degraded_mode:
            return RedisRuntimeState(mode="degraded_memory", degraded_reason="redis_missing")
        raise RedisRuntimeResolutionError("REDIS_URL is required in production")

    is_healthy, reason = await probe_redis(
        settings.redis_url,
        timeout_seconds=settings.redis_startup_probe_timeout_seconds,
    )
    if is_healthy:
        return RedisRuntimeState(mode="redis")
    if settings.allow_redis_degraded_mode:
        return RedisRuntimeState(mode="degraded_memory", degraded_reason=reason)

    degraded_reason = reason or "redis_probe_failed"
    raise RedisRuntimeResolutionError(
        f"Redis unavailable at startup and degraded mode disabled: {degraded_reason}"
    )
