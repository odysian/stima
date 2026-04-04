"""Rate-limit primitives shared by API modules."""

from __future__ import annotations

import abc
import asyncio
import logging
import time
from collections.abc import AsyncIterator, Awaitable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, cast
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID

from fastapi import Request
from jwt import InvalidTokenError
from redis.asyncio import Redis
from slowapi import Limiter

from app.core.config import Settings, get_settings
from app.core.security import decode_token
from app.features.auth.service import ACCESS_COOKIE_NAME
from app.shared.proxy_headers import (
    IpNetwork,
    is_trusted_proxy,
    parse_ip,
    resolve_forwarded_client_ip,
    trusted_proxy_networks,
)

LOGGER = logging.getLogger(__name__)
_MEMORY_STORAGE_URI = "memory://"


def get_ip_key(request: Request) -> str:
    """Resolve rate-limit key from client IP, proxy-aware when trusted."""
    raw_peer_ip = request.client.host if request.client is not None else "127.0.0.1"
    peer_ip = parse_ip(raw_peer_ip) or "127.0.0.1"
    trusted_networks = _trusted_proxy_networks()

    if is_trusted_proxy(peer_ip, trusted_networks):
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            resolved_client = _resolve_forwarded_client_ip(
                forwarded_for,
                trusted_networks=trusted_networks,
            )
            if resolved_client is not None:
                return resolved_client

        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            parsed_real_ip = parse_ip(real_ip)
            if parsed_real_ip is not None:
                return parsed_real_ip

    return peer_ip


def get_user_key(request: Request) -> str:
    """Resolve a user-aware limit key, falling back to IP for unauthenticated requests."""
    user_id = _resolve_access_token_subject(request)
    if user_id is not None:
        return f"user:{user_id}"
    return f"ip:{get_ip_key(request)}"


@dataclass(frozen=True)
class LimiterBackendConfig:
    storage_uri: str
    mode: str
    fallback_reason: str | None = None


@dataclass(slots=True)
class ConcurrencyLease:
    """Release handle for one acquired provider-concurrency slot."""

    concurrency_key: str
    manager: ExtractionControlManager
    active: bool = True

    async def release(self) -> None:
        if not self.active:
            return
        self.active = False
        await self.manager.release_concurrency(self.concurrency_key)


class ExtractionStateStore(abc.ABC):
    """Backend interface for extraction quota and concurrency state."""

    @abc.abstractmethod
    async def reserve_daily_quota(self, key: str, *, limit: int, expiry_seconds: int) -> bool:
        """Reserve one daily extraction quota slot."""

    @abc.abstractmethod
    async def acquire_concurrency(self, key: str, *, limit: int, expiry_seconds: int) -> bool:
        """Acquire one provider-concurrency slot."""

    @abc.abstractmethod
    async def release_concurrency(self, key: str) -> None:
        """Release one provider-concurrency slot."""

    def reset_local_state(self) -> None:
        """Reset state for in-memory test fixtures when available."""
        return None

    async def aclose(self) -> None:
        """Release backend resources when the store keeps external clients."""
        return None


class InMemoryExtractionStateStore(ExtractionStateStore):
    """Async-safe local fallback store for degraded development/test mode."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._daily_quota: dict[str, tuple[int, float]] = {}
        self._concurrency: dict[str, tuple[int, float]] = {}

    async def reserve_daily_quota(self, key: str, *, limit: int, expiry_seconds: int) -> bool:
        async with self._lock:
            now = time.time()
            count, expiry = self._daily_quota.get(key, (0, now + expiry_seconds))
            if expiry <= now:
                count = 0
                expiry = now + expiry_seconds
            if count >= limit:
                self._daily_quota[key] = (count, expiry)
                return False
            self._daily_quota[key] = (count + 1, expiry)
            return True

    async def acquire_concurrency(self, key: str, *, limit: int, expiry_seconds: int) -> bool:
        async with self._lock:
            now = time.time()
            count, expiry = self._concurrency.get(key, (0, now + expiry_seconds))
            if expiry <= now:
                count = 0
                expiry = now + expiry_seconds
            if count >= limit:
                # Do not refresh TTL on failed acquire (matches Redis script: no INCR/EXPIRE).
                self._concurrency[key] = (count, expiry)
                return False
            self._concurrency[key] = (count + 1, now + expiry_seconds)
            return True

    async def release_concurrency(self, key: str) -> None:
        async with self._lock:
            count, expiry = self._concurrency.get(key, (0, time.time()))
            if count <= 1:
                self._concurrency.pop(key, None)
                return
            self._concurrency[key] = (count - 1, expiry)

    def reset_local_state(self) -> None:
        self._daily_quota.clear()
        self._concurrency.clear()


class RedisExtractionStateStore(ExtractionStateStore):
    """Redis-backed quota and concurrency store for distributed request coordination."""

    def __init__(self, redis_url: str) -> None:
        self._redis_url = redis_url
        self._client: Redis | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    async def _get_client(self) -> Redis:
        running_loop = asyncio.get_running_loop()
        if self._client is None:
            self._client = Redis.from_url(
                self._redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
            self._loop = running_loop
            return self._client

        if self._loop is not running_loop:
            await self.aclose()
            self._client = Redis.from_url(
                self._redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
            self._loop = running_loop

        return self._client

    async def _eval(self, client: Redis, script: str, num_keys: int, *args: str) -> Any:
        raw_result = client.eval(script, num_keys, *args)
        if asyncio.iscoroutine(raw_result):
            return await cast(Awaitable[Any], raw_result)
        return raw_result

    async def reserve_daily_quota(self, key: str, *, limit: int, expiry_seconds: int) -> bool:
        client = await self._get_client()
        script = """
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current >= tonumber(ARGV[1]) then
  return 0
end
current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
return 1
"""
        result = await self._eval(client, script, 1, key, str(limit), str(expiry_seconds))
        return bool(result)

    async def acquire_concurrency(self, key: str, *, limit: int, expiry_seconds: int) -> bool:
        client = await self._get_client()
        script = """
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current >= tonumber(ARGV[1]) then
  return 0
end
current = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
return 1
"""
        result = await self._eval(client, script, 1, key, str(limit), str(expiry_seconds))
        return bool(result)

    async def release_concurrency(self, key: str) -> None:
        client = await self._get_client()
        script = """
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current <= 1 then
  redis.call('DEL', KEYS[1])
  return 0
end
return redis.call('DECR', KEYS[1])
"""
        await self._eval(client, script, 1, key)

    async def aclose(self) -> None:
        if self._client is None:
            return

        client = self._client
        self._client = None
        self._loop = None
        close = getattr(client, "aclose", None)
        if callable(close):
            try:
                await close()
            except RuntimeError:
                pass
            return
        close_sync = getattr(client, "close", None)
        if callable(close_sync):
            maybe_awaitable = close_sync()
            if asyncio.iscoroutine(maybe_awaitable):
                try:
                    await maybe_awaitable
                except RuntimeError:
                    pass


class ExtractionControlManager:
    """Coordinate per-user extraction quota and concurrency limits."""

    def __init__(self, store: ExtractionStateStore, *, settings: Settings | None = None) -> None:
        self._store = store
        self._settings = settings

    async def reserve_daily_quota(self, user_id: UUID) -> bool:
        settings = self._resolved_settings()
        quota_key = _redis_prefixed_key(settings.redis_key_prefix, "quota", "extract", str(user_id))
        return await self._store.reserve_daily_quota(
            quota_key,
            limit=settings.extraction_daily_quota,
            expiry_seconds=_seconds_until_utc_midnight(),
        )

    async def acquire_concurrency(self, user_id: UUID) -> ConcurrencyLease | None:
        settings = self._resolved_settings()
        concurrency_key = _redis_prefixed_key(
            settings.redis_key_prefix,
            "concurrency",
            "extract",
            str(user_id),
        )
        acquired = await self._store.acquire_concurrency(
            concurrency_key,
            limit=settings.extraction_concurrency_limit,
            expiry_seconds=settings.extraction_concurrency_ttl_seconds,
        )
        if not acquired:
            return None
        return ConcurrencyLease(concurrency_key=concurrency_key, manager=self)

    async def release_concurrency(self, key: str) -> None:
        await self._store.release_concurrency(key)

    def reset_local_state(self) -> None:
        self._store.reset_local_state()

    async def aclose(self) -> None:
        await self._store.aclose()

    def _resolved_settings(self) -> Settings:
        return self._settings if self._settings is not None else get_settings()


def _redis_prefixed_key(prefix: str, *parts: str) -> str:
    return ":".join((prefix, *parts))


def _redact_redis_url_for_logs(url: str) -> str:
    parsed = urlsplit(url)
    host = parsed.hostname or ""
    port = f":{parsed.port}" if parsed.port is not None else ""
    userinfo = "***@" if "@" in parsed.netloc else ""
    return urlunsplit((parsed.scheme, f"{userinfo}{host}{port}", parsed.path, "", ""))


def build_limiter(settings: Settings | None = None) -> Limiter:
    """Build a settings-backed SlowAPI limiter."""
    resolved_settings = settings if settings is not None else get_settings()
    backend = resolve_limiter_backend(resolved_settings)
    if backend.mode == "redis":
        LOGGER.info(
            "Redis rate limiting enabled with backend %s",
            _redact_redis_url_for_logs(backend.storage_uri),
        )
        rate_limiter = Limiter(
            key_func=get_ip_key,
            headers_enabled=resolved_settings.rate_limit_headers_enabled,
            storage_uri=backend.storage_uri,
            storage_options={"key_prefix": resolved_settings.redis_key_prefix},
        )
    else:
        rate_limiter = Limiter(
            key_func=get_ip_key,
            headers_enabled=resolved_settings.rate_limit_headers_enabled,
            storage_uri=backend.storage_uri,
        )
    rate_limiter._stima_storage_mode = backend.mode  # type: ignore[attr-defined]
    rate_limiter._stima_fallback_reason = backend.fallback_reason  # type: ignore[attr-defined]
    return rate_limiter


def build_extraction_control_manager(
    settings: Settings | None = None,
) -> ExtractionControlManager:
    """Build extraction quota/concurrency controls from the current settings."""
    resolved_settings = settings if settings is not None else get_settings()
    backend = resolve_limiter_backend(resolved_settings)
    if backend.mode == "redis" and resolved_settings.redis_url is not None:
        return ExtractionControlManager(
            RedisExtractionStateStore(resolved_settings.redis_url),
            settings=settings,
        )
    return ExtractionControlManager(InMemoryExtractionStateStore(), settings=settings)


def configure_active_limiter_key_prefix(prefix: str) -> None:
    """Update the active limiter storage namespace when the backend supports key prefixes."""
    storage = getattr(limiter, "_storage", None)
    if storage is None or not hasattr(storage, "key_prefix"):
        return
    storage.key_prefix = prefix


def resolve_limiter_backend(settings: Settings | None = None) -> LimiterBackendConfig:
    """Resolve whether the app should use Redis or degraded in-memory storage."""
    resolved_settings = settings if settings is not None else get_settings()
    environment = resolved_settings.environment.lower()
    if resolved_settings.redis_url:
        return LimiterBackendConfig(storage_uri=resolved_settings.redis_url, mode="redis")

    if environment == "production":
        raise ValueError("REDIS_URL must be set when ENVIRONMENT is 'production'")

    fallback_reason = (
        "REDIS_URL not configured; using in-memory rate limiting and quota state in degraded mode."
    )
    LOGGER.warning(fallback_reason)
    return LimiterBackendConfig(
        storage_uri=_MEMORY_STORAGE_URI,
        mode="memory",
        fallback_reason=fallback_reason,
    )


limiter = build_limiter()
extraction_controls = build_extraction_control_manager()


def reset_local_rate_limit_state() -> None:
    """Reset local in-memory limiter and extraction-control state for tests."""
    limiter.reset()
    extraction_controls.reset_local_state()


@asynccontextmanager
async def reserve_extraction_capacity(user_id: UUID) -> AsyncIterator[bool]:
    """Acquire extraction concurrency and daily quota before provider-backed work starts.

    Ordering: concurrency is acquired first so a provider slot is confirmed before
    consuming daily quota. Quota is a non-reversible per-UTC-day counter and is
    not rolled back if the caller raises inside the ``async with`` block. That is
    intentional: failed provider calls still count against the daily limit to
    prevent abuse via rapid retry loops against a failing provider.

    Task #200 note: if retries re-enter this guard, each retry consumes another
    quota slot. Decide there whether retries should bypass this guard or consume
    quota per attempt.
    """
    lease = await extraction_controls.acquire_concurrency(user_id)
    if lease is None:
        yield False
        return

    quota_reserved = await extraction_controls.reserve_daily_quota(user_id)
    if not quota_reserved:
        await lease.release()
        yield False
        return

    try:
        yield True
    finally:
        await lease.release()


def _trusted_proxy_networks() -> list[IpNetwork]:
    return trusted_proxy_networks(get_settings().trusted_proxy_ips)


def _resolve_forwarded_client_ip(
    forwarded_for: str,
    *,
    trusted_networks: list[IpNetwork],
) -> str | None:
    return resolve_forwarded_client_ip(
        forwarded_for,
        trusted_networks=trusted_networks,
    )


def _resolve_access_token_subject(request: Request) -> str | None:
    token = request.cookies.get(ACCESS_COOKIE_NAME)
    if not token:
        return None

    try:
        payload = decode_token(token)
    except (InvalidTokenError, ValueError):
        return None

    token_type = payload.get("type")
    subject = payload.get("sub")
    if token_type != "access" or not isinstance(subject, str):  # nosec B105 - JWT kind check
        return None
    return subject


def _seconds_until_utc_midnight() -> int:
    now = time.time()
    return max(1, int(86400 - (now % 86400)))
