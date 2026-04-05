"""Idempotency store behavior tests."""

from __future__ import annotations

from uuid import uuid4

import pytest
from app.core.config import Settings
from app.shared.idempotency import (
    IdempotencyStore,
    InMemoryIdempotencyStateStore,
)


@pytest.mark.asyncio
async def test_idempotency_store_prefixes_keys_with_endpoint_and_user_scope() -> None:
    user_id = uuid4()
    store = IdempotencyStore(
        InMemoryIdempotencyStateStore(),
        settings=Settings.model_construct(redis_key_prefix="stima_test"),
    )

    key = store.build_storage_key(
        endpoint_slug="quote-send-email",
        user_id=user_id,
        idempotency_key="abc123",
    )

    assert key == f"stima_test:idempotency:quote-send-email:{user_id}:abc123"


@pytest.mark.asyncio
async def test_idempotency_store_replays_completed_responses() -> None:
    user_id = uuid4()
    resource_id = uuid4()
    state_store = InMemoryIdempotencyStateStore()
    store = IdempotencyStore(
        state_store,
        settings=Settings.model_construct(redis_key_prefix="stima_test"),
    )

    first = await store.begin(
        endpoint_slug="quote-send-email",
        user_id=user_id,
        resource_id=resource_id,
        idempotency_key="replay-me",
    )
    await store.complete(
        endpoint_slug="quote-send-email",
        user_id=user_id,
        resource_id=resource_id,
        idempotency_key="replay-me",
        status_code=200,
        payload={"status": "shared"},
    )
    second = await store.begin(
        endpoint_slug="quote-send-email",
        user_id=user_id,
        resource_id=resource_id,
        idempotency_key="replay-me",
    )

    assert first.kind == "started"
    assert second.kind == "replay"
    assert second.response is not None
    assert second.response.status_code == 200
    assert second.response.payload["status"] == "shared"

    raw_record = await state_store.get(
        store.build_storage_key(
            endpoint_slug="quote-send-email",
            user_id=user_id,
            idempotency_key="replay-me",
        )
    )
    assert raw_record is not None
    assert str(resource_id) in raw_record


@pytest.mark.asyncio
async def test_idempotency_store_conflicts_on_fingerprint_mismatch() -> None:
    user_id = uuid4()
    first_resource_id = uuid4()
    store = IdempotencyStore(
        InMemoryIdempotencyStateStore(),
        settings=Settings.model_construct(redis_key_prefix="stima_test"),
    )

    first = await store.begin(
        endpoint_slug="quote-send-email",
        user_id=user_id,
        resource_id=first_resource_id,
        idempotency_key="shared-key",
    )
    second = await store.begin(
        endpoint_slug="quote-send-email",
        user_id=user_id,
        resource_id=uuid4(),
        idempotency_key="shared-key",
    )

    assert first.kind == "started"
    assert second.kind == "conflict"


@pytest.mark.asyncio
async def test_idempotency_store_conflicts_when_stored_state_is_unreadable() -> None:
    user_id = uuid4()
    resource_id = uuid4()
    state_store = InMemoryIdempotencyStateStore()
    store = IdempotencyStore(
        state_store,
        settings=Settings.model_construct(redis_key_prefix="stima_test"),
    )
    storage_key = store.build_storage_key(
        endpoint_slug="quote-send-email",
        user_id=user_id,
        idempotency_key="corrupted",
    )
    await state_store.set(
        storage_key,
        "{not-json",
        expiry_seconds=60,
    )

    result = await store.begin(
        endpoint_slug="quote-send-email",
        user_id=user_id,
        resource_id=resource_id,
        idempotency_key="corrupted",
    )

    assert result.kind == "conflict"
