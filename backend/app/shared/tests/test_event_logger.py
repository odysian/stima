"""Structured event logger tests."""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from datetime import datetime
from uuid import uuid4

import pytest
from app.features.event_logs.models import EventLog
from app.shared import event_logger


def test_configure_event_logging_uses_stdout_and_does_not_duplicate_handlers() -> None:
    logger = logging.getLogger(event_logger.EVENT_LOGGER_NAME)
    original_handlers = list(logger.handlers)
    original_level = logger.level
    original_propagate = logger.propagate

    try:
        for handler in list(logger.handlers):
            logger.removeHandler(handler)

        event_logger.configure_event_logging()
        event_logger.configure_event_logging()

        assert logger.level == logging.INFO
        assert logger.propagate is False
        assert len(logger.handlers) == 1
        handler = logger.handlers[0]
        assert isinstance(handler, logging.StreamHandler)
        assert handler.stream is sys.stdout
        assert handler.formatter is not None
        assert handler.formatter._fmt == "%(message)s"  # noqa: SLF001
    finally:
        for handler in list(logger.handlers):
            logger.removeHandler(handler)
        for handler in original_handlers:
            logger.addHandler(handler)
        logger.setLevel(original_level)
        logger.propagate = original_propagate


def test_log_event_emits_json_payload_without_none_fields(monkeypatch) -> None:
    calls: list[str] = []
    user_id = uuid4()
    quote_id = uuid4()

    monkeypatch.setattr(event_logger._EVENT_LOGGER, "info", calls.append)  # noqa: SLF001

    event_logger.log_event(
        "quote.created",
        user_id=user_id,
        quote_id=quote_id,
    )

    assert len(calls) == 1
    payload = json.loads(calls[0])
    assert payload["event"] == "quote.created"
    assert payload["user_id"] == str(user_id)
    assert payload["quote_id"] == str(quote_id)
    assert "customer_id" not in payload
    assert "detail" not in payload
    datetime.fromisoformat(payload["timestamp"])


@pytest.mark.asyncio
async def test_flush_event_tasks_waits_for_pending_persistence(monkeypatch) -> None:
    gate = asyncio.Event()

    async def _persist_event_record(**_: object) -> None:
        await gate.wait()

    monkeypatch.setattr(event_logger, "_persist_event_record", _persist_event_record)
    event_logger.configure_event_logging(session_factory=object())  # type: ignore[arg-type]

    event_logger.log_event("quote_started", user_id=uuid4())
    assert event_logger._PENDING_EVENT_TASKS  # noqa: SLF001

    gate.set()
    await event_logger.flush_event_tasks()

    assert not event_logger._PENDING_EVENT_TASKS  # noqa: SLF001


@pytest.mark.asyncio
async def test_log_event_persists_pilot_events_with_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _FakeSession:
        def __init__(self) -> None:
            self.added: list[EventLog] = []
            self.committed = False

        def add(self, instance: EventLog) -> None:
            self.added.append(instance)

        async def commit(self) -> None:
            self.committed = True

    class _FakeSessionContext:
        def __init__(self, session: _FakeSession) -> None:
            self._session = session

        async def __aenter__(self) -> _FakeSession:
            return self._session

        async def __aexit__(self, exc_type, exc, tb) -> None:
            del exc_type, exc, tb

    class _FakeSessionFactory:
        def __init__(self, session: _FakeSession) -> None:
            self._session = session

        def __call__(self) -> _FakeSessionContext:
            return _FakeSessionContext(self._session)

    fake_session = _FakeSession()
    session_factory = _FakeSessionFactory(fake_session)
    quote_id = uuid4()
    customer_id = uuid4()
    user_id = uuid4()
    monkeypatch.setattr(event_logger, "EventLog", EventLog)

    await event_logger._persist_event_record(  # noqa: SLF001
        session_factory=session_factory,  # type: ignore[arg-type]
        event_name="quote_shared",
        user_id=user_id,
        metadata_json={
            "quote_id": str(quote_id),
            "customer_id": str(customer_id),
            "detail": "audio+notes",
        },
    )

    assert fake_session.committed is True
    assert len(fake_session.added) == 1
    assert fake_session.added[0].event_name == "quote_shared"
    assert fake_session.added[0].user_id == user_id
    assert fake_session.added[0].metadata_json == {
        "quote_id": str(quote_id),
        "customer_id": str(customer_id),
        "detail": "audio+notes",
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("event_name", ["quote_approved", "quote_marked_lost"])
async def test_log_event_persists_new_quote_outcome_events(
    event_name: str,
) -> None:
    class _FakeSession:
        def __init__(self) -> None:
            self.added: list[EventLog] = []
            self.committed = False

        def add(self, instance: EventLog) -> None:
            self.added.append(instance)

        async def commit(self) -> None:
            self.committed = True

    class _FakeSessionContext:
        def __init__(self, session: _FakeSession) -> None:
            self._session = session

        async def __aenter__(self) -> _FakeSession:
            return self._session

        async def __aexit__(self, exc_type, exc, tb) -> None:
            del exc_type, exc, tb

    class _FakeSessionFactory:
        def __init__(self, session: _FakeSession) -> None:
            self._session = session

        def __call__(self) -> _FakeSessionContext:
            return _FakeSessionContext(self._session)

    fake_session = _FakeSession()
    quote_id = uuid4()
    customer_id = uuid4()
    user_id = uuid4()
    event_logger.configure_event_logging(
        session_factory=_FakeSessionFactory(fake_session),  # type: ignore[arg-type]
    )

    event_logger.log_event(
        event_name,
        user_id=user_id,
        quote_id=quote_id,
        customer_id=customer_id,
    )
    await event_logger.flush_event_tasks()

    assert fake_session.committed is True
    assert len(fake_session.added) == 1
    assert fake_session.added[0].event_name == event_name
    assert fake_session.added[0].user_id == user_id
    assert fake_session.added[0].metadata_json == {
        "quote_id": str(quote_id),
        "customer_id": str(customer_id),
    }


def test_pilot_event_whitelist_matches_v1_analytics_contract() -> None:
    assert event_logger._PILOT_EVENT_NAMES == {  # noqa: SLF001
        "quote_started",
        "audio_uploaded",
        "draft_generated",
        "draft_generation_failed",
        "quote_pdf_generated",
        "quote_shared",
        "quote_approved",
        "quote_marked_lost",
        "quote_viewed",
        "email_sent",
        "invoice_created",
        "invoice_viewed",
    }
