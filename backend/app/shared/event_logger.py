"""Structured business event logging helpers."""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from collections.abc import Mapping
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.features.event_logs.models import EventLog

EVENT_LOGGER_NAME = "stima.events"
_HANDLER_SENTINEL = "_stima_event_handler"
_EVENT_LOGGER = logging.getLogger(EVENT_LOGGER_NAME)
_EVENT_LOG_SESSION_FACTORY: async_sessionmaker[AsyncSession] | None = None
_PILOT_EVENT_NAMES = frozenset(
    {
        "quote_started",
        "audio_uploaded",
        "draft_generated",
        "draft_generation_failed",
        "quote_pdf_generated",
        "quote_shared",
        "quote_approved",
        "quote_marked_lost",
    }
)
_PENDING_EVENT_TASKS: set[asyncio.Task[None]] = set()


def configure_event_logging(
    *,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> None:
    """Attach a stdout handler for structured event messages exactly once."""
    global _EVENT_LOG_SESSION_FACTORY

    _EVENT_LOGGER.setLevel(logging.INFO)
    _EVENT_LOGGER.propagate = False
    _EVENT_LOG_SESSION_FACTORY = session_factory
    if any(getattr(handler, _HANDLER_SENTINEL, False) for handler in _EVENT_LOGGER.handlers):
        return

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    setattr(handler, _HANDLER_SENTINEL, True)
    _EVENT_LOGGER.addHandler(handler)


def log_event(
    event: str,
    *,
    user_id: UUID | None = None,
    quote_id: UUID | None = None,
    customer_id: UUID | None = None,
    detail: str | None = None,
) -> None:
    """Emit a structured JSON log record for one business event."""
    payload = {
        "event": event,
        "timestamp": datetime.now(UTC).isoformat(),
        "user_id": str(user_id) if user_id else None,
        "quote_id": str(quote_id) if quote_id else None,
        "customer_id": str(customer_id) if customer_id else None,
        "detail": detail,
    }
    _EVENT_LOGGER.info(
        json.dumps({key: value for key, value in payload.items() if value is not None})
    )

    if event not in _PILOT_EVENT_NAMES or _EVENT_LOG_SESSION_FACTORY is None or user_id is None:
        return

    try:
        task = asyncio.create_task(
            _persist_event_safely(
                session_factory=_EVENT_LOG_SESSION_FACTORY,
                event_name=event,
                user_id=user_id,
                metadata_json=_build_metadata_payload(
                    quote_id=quote_id,
                    customer_id=customer_id,
                    detail=detail,
                ),
            )
        )
    except RuntimeError:
        return

    _PENDING_EVENT_TASKS.add(task)
    task.add_done_callback(_PENDING_EVENT_TASKS.discard)


async def flush_event_tasks() -> None:
    """Wait for any best-effort event persistence tasks to finish."""
    if not _PENDING_EVENT_TASKS:
        return

    await asyncio.gather(*list(_PENDING_EVENT_TASKS))


def _build_metadata_payload(
    *,
    quote_id: UUID | None,
    customer_id: UUID | None,
    detail: str | None,
) -> dict[str, str]:
    metadata: dict[str, str] = {}
    if quote_id is not None:
        metadata["quote_id"] = str(quote_id)
    if customer_id is not None:
        metadata["customer_id"] = str(customer_id)
    if detail is not None:
        metadata["detail"] = detail
    return metadata


async def _persist_event_safely(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    event_name: str,
    user_id: UUID,
    metadata_json: Mapping[str, str],
) -> None:
    try:
        await _persist_event_record(
            session_factory=session_factory,
            event_name=event_name,
            user_id=user_id,
            metadata_json=metadata_json,
        )
    except Exception:
        _EVENT_LOGGER.warning(
            json.dumps(
                {
                    "event": "event_log.persistence_failed",
                    "timestamp": datetime.now(UTC).isoformat(),
                    "source_event": event_name,
                }
            )
        )


async def _persist_event_record(
    *,
    session_factory: async_sessionmaker[AsyncSession],
    event_name: str,
    user_id: UUID,
    metadata_json: Mapping[str, str],
) -> None:
    async with session_factory() as session:
        session.add(
            EventLog(
                user_id=user_id,
                event_name=event_name,
                metadata_json=dict(metadata_json),
            )
        )
        await session.commit()
