"""Idempotency primitives for duplicate-side-effect POST endpoints."""

from __future__ import annotations

import abc
import asyncio
import json
import logging
import time
from dataclasses import asdict, dataclass
from typing import Any, Literal, cast
from uuid import UUID

from redis.asyncio import Redis

from app.core.config import Settings, get_settings

LOGGER = logging.getLogger(__name__)
_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60
RuntimeIdempotencyMode = Literal["redis", "memory"]


@dataclass(frozen=True, slots=True)
class IdempotencyFingerprint:
    """Minimal semantic fingerprint for one side-effect request."""

    endpoint_slug: str
    user_id: str
    resource_id: str


@dataclass(frozen=True, slots=True)
class StoredResponse:
    """Completed semantic response available for idempotent replay."""

    payload: dict[str, Any]
    status_code: int


@dataclass(frozen=True, slots=True)
class IdempotencyBeginResult:
    """Outcome of attempting to reserve one idempotency key."""

    kind: Literal["started", "replay", "conflict", "in_progress"]
    response: StoredResponse | None = None


@dataclass(frozen=True, slots=True)
class _StoredRecord:
    status: Literal["in_progress", "completed"]
    fingerprint: IdempotencyFingerprint
    payload: dict[str, Any] | None = None
    status_code: int | None = None


class IdempotencyStateStore(abc.ABC):
    """Backend interface for idempotency reservation and replay state."""

    @abc.abstractmethod
    async def put_if_absent(self, key: str, value: str, *, expiry_seconds: int) -> bool:
        """Persist ``value`` only when ``key`` does not already exist."""

    @abc.abstractmethod
    async def get(self, key: str) -> str | None:
        """Return the stored raw value for ``key`` when present."""

    @abc.abstractmethod
    async def set(self, key: str, value: str, *, expiry_seconds: int) -> None:
        """Persist ``value`` for ``key`` with the given TTL."""

    @abc.abstractmethod
    async def delete(self, key: str) -> None:
        """Delete any stored state for ``key``."""

    def reset_local_state(self) -> None:
        """Reset local in-memory state for tests when supported."""
        return None

    async def aclose(self) -> None:
        """Release backend resources when the store owns external clients."""
        return None


class InMemoryIdempotencyStateStore(IdempotencyStateStore):
    """Async-safe local fallback store for development and test mode."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._records: dict[str, tuple[str, float]] = {}

    async def put_if_absent(self, key: str, value: str, *, expiry_seconds: int) -> bool:
        async with self._lock:
            self._purge_expired_locked(key)
            if key in self._records:
                return False
            self._records[key] = (value, time.time() + expiry_seconds)
            return True

    async def get(self, key: str) -> str | None:
        async with self._lock:
            self._purge_expired_locked(key)
            stored = self._records.get(key)
            if stored is None:
                return None
            return stored[0]

    async def set(self, key: str, value: str, *, expiry_seconds: int) -> None:
        async with self._lock:
            self._records[key] = (value, time.time() + expiry_seconds)

    async def delete(self, key: str) -> None:
        async with self._lock:
            self._records.pop(key, None)

    def reset_local_state(self) -> None:
        self._records.clear()

    def _purge_expired_locked(self, key: str) -> None:
        stored = self._records.get(key)
        if stored is None:
            return
        _, expiry = stored
        if expiry <= time.time():
            self._records.pop(key, None)


class RedisIdempotencyStateStore(IdempotencyStateStore):
    """Redis-backed idempotency store for cross-instance replay guarantees."""

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

    async def put_if_absent(self, key: str, value: str, *, expiry_seconds: int) -> bool:
        client = await self._get_client()
        return bool(await client.set(key, value, ex=expiry_seconds, nx=True))

    async def get(self, key: str) -> str | None:
        client = await self._get_client()
        return cast(str | None, await client.get(key))

    async def set(self, key: str, value: str, *, expiry_seconds: int) -> None:
        client = await self._get_client()
        await client.set(key, value, ex=expiry_seconds)

    async def delete(self, key: str) -> None:
        client = await self._get_client()
        await client.delete(key)

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


class IdempotencyStore:
    """High-level idempotency manager for one configured backend."""

    def __init__(
        self,
        store: IdempotencyStateStore,
        *,
        settings: Settings | None = None,
    ) -> None:
        self._store = store
        self._settings = settings

    async def begin(
        self,
        *,
        endpoint_slug: str,
        user_id: UUID,
        resource_id: UUID,
        idempotency_key: str,
    ) -> IdempotencyBeginResult:
        """Reserve a key, replay a stored response, or report a conflict."""
        fingerprint = IdempotencyFingerprint(
            endpoint_slug=endpoint_slug,
            user_id=str(user_id),
            resource_id=str(resource_id),
        )
        storage_key = self.build_storage_key(
            endpoint_slug=endpoint_slug,
            user_id=user_id,
            idempotency_key=idempotency_key,
        )
        pending_record = _StoredRecord(status="in_progress", fingerprint=fingerprint)
        claimed = await self._store.put_if_absent(
            storage_key,
            _encode_record(pending_record),
            expiry_seconds=_IDEMPOTENCY_TTL_SECONDS,
        )
        if claimed:
            return IdempotencyBeginResult(kind="started")

        existing_record = await self._get_record(storage_key)
        if existing_record is None:
            LOGGER.warning(
                "idempotency key existed but could not be read", extra={"key": storage_key}
            )
            return IdempotencyBeginResult(kind="started")

        if existing_record.fingerprint != fingerprint:
            return IdempotencyBeginResult(kind="conflict")

        if existing_record.status == "completed":
            if existing_record.payload is None or existing_record.status_code is None:
                return IdempotencyBeginResult(kind="conflict")
            return IdempotencyBeginResult(
                kind="replay",
                response=StoredResponse(
                    payload=existing_record.payload,
                    status_code=existing_record.status_code,
                ),
            )

        return IdempotencyBeginResult(kind="in_progress")

    async def complete(
        self,
        *,
        endpoint_slug: str,
        user_id: UUID,
        resource_id: UUID,
        idempotency_key: str,
        status_code: int,
        payload: dict[str, Any],
    ) -> None:
        """Persist the completed response for future same-key replays."""
        storage_key = self.build_storage_key(
            endpoint_slug=endpoint_slug,
            user_id=user_id,
            idempotency_key=idempotency_key,
        )
        record = _StoredRecord(
            status="completed",
            fingerprint=IdempotencyFingerprint(
                endpoint_slug=endpoint_slug,
                user_id=str(user_id),
                resource_id=str(resource_id),
            ),
            payload=payload,
            status_code=status_code,
        )
        await self._store.set(
            storage_key,
            _encode_record(record),
            expiry_seconds=_IDEMPOTENCY_TTL_SECONDS,
        )

    async def abort(
        self,
        *,
        endpoint_slug: str,
        user_id: UUID,
        resource_id: UUID,
        idempotency_key: str,
    ) -> None:
        """Release a pending reservation after a non-successful request."""
        storage_key = self.build_storage_key(
            endpoint_slug=endpoint_slug,
            user_id=user_id,
            idempotency_key=idempotency_key,
        )
        existing_record = await self._get_record(storage_key)
        if existing_record is None:
            return
        if existing_record.status != "in_progress":
            return
        if existing_record.fingerprint != IdempotencyFingerprint(
            endpoint_slug=endpoint_slug,
            user_id=str(user_id),
            resource_id=str(resource_id),
        ):
            return
        await self._store.delete(storage_key)

    def build_storage_key(
        self,
        *,
        endpoint_slug: str,
        user_id: UUID,
        idempotency_key: str,
    ) -> str:
        """Return the configured Redis-style storage key for one request scope."""
        settings = self._resolved_settings()
        return _redis_prefixed_key(
            settings.redis_key_prefix,
            "idempotency",
            endpoint_slug,
            str(user_id),
            idempotency_key,
        )

    def reset_local_state(self) -> None:
        self._store.reset_local_state()

    async def aclose(self) -> None:
        await self._store.aclose()

    async def _get_record(self, storage_key: str) -> _StoredRecord | None:
        raw_record = await self._store.get(storage_key)
        if raw_record is None:
            return None
        try:
            return _decode_record(raw_record)
        except (json.JSONDecodeError, KeyError, TypeError):
            LOGGER.warning(
                "unreadable idempotency record encountered; treating as conflict",
                extra={"storage_key": storage_key},
            )
            return _unreadable_record()

    def _resolved_settings(self) -> Settings:
        return self._settings if self._settings is not None else get_settings()


def build_idempotency_store(
    settings: Settings | None = None,
    *,
    runtime_mode: RuntimeIdempotencyMode | None = None,
) -> IdempotencyStore:
    """Build a settings-backed idempotency store."""
    resolved_settings = settings if settings is not None else get_settings()
    if runtime_mode == "redis":
        if not resolved_settings.redis_url:
            raise ValueError("REDIS_URL must be set when idempotency runtime mode is redis")
        return IdempotencyStore(
            RedisIdempotencyStateStore(resolved_settings.redis_url),
            settings=resolved_settings,
        )
    if runtime_mode == "memory":
        return IdempotencyStore(InMemoryIdempotencyStateStore(), settings=resolved_settings)

    if resolved_settings.redis_url:
        return IdempotencyStore(
            RedisIdempotencyStateStore(resolved_settings.redis_url),
            settings=resolved_settings,
        )
    return IdempotencyStore(InMemoryIdempotencyStateStore(), settings=resolved_settings)


def reset_local_idempotency_state(store: IdempotencyStore) -> None:
    """Reset local in-memory idempotency state for tests."""
    store.reset_local_state()


def validate_idempotency_key(idempotency_key: str | None) -> str:
    """Return a normalized RFC-style idempotency key or raise a 400-ready error."""
    normalized_key = (idempotency_key or "").strip()
    if not normalized_key:
        raise ValueError("Idempotency-Key header is required")
    return normalized_key


def _redis_prefixed_key(prefix: str, *parts: str) -> str:
    return ":".join((prefix, *parts))


def _encode_record(record: _StoredRecord) -> str:
    return json.dumps(
        {
            "status": record.status,
            "fingerprint": asdict(record.fingerprint),
            "payload": record.payload,
            "status_code": record.status_code,
        },
        separators=(",", ":"),
        sort_keys=True,
    )


def _decode_record(raw_record: str) -> _StoredRecord:
    payload = json.loads(raw_record)
    fingerprint = payload.get("fingerprint") or {}
    return _StoredRecord(
        status=cast(Literal["in_progress", "completed"], payload["status"]),
        fingerprint=IdempotencyFingerprint(
            endpoint_slug=str(fingerprint["endpoint_slug"]),
            user_id=str(fingerprint["user_id"]),
            resource_id=str(fingerprint["resource_id"]),
        ),
        payload=cast(dict[str, Any] | None, payload.get("payload")),
        status_code=cast(int | None, payload.get("status_code")),
    )


def _unreadable_record() -> _StoredRecord:
    return _StoredRecord(
        status="in_progress",
        fingerprint=IdempotencyFingerprint(
            endpoint_slug="",
            user_id="",
            resource_id="",
        ),
    )
