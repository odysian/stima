# Task D: Event logging foundation

**Parent Spec:** [Tier 2 — Quote UX & management improvements](spec-tier2-quote-ux-management.md)
**Mode:** gated child task
**Type:** infrastructure (backend-only)

## Summary

Add structured logging for key business events on the backend. Currently there is zero observability into what users are doing — no way to know how many quotes are created per day, what errors users hit, or which features are actually used.

This task establishes the logging foundation. Frontend analytics (Mixpanel, PostHog, etc.) is deferred until there's a deployment target and a provider decision.

## Scope

### 1. Create a structured event logger

**New file:** `backend/app/shared/event_logger.py` (~40 LOC)

A thin wrapper around Python's `logging` module that emits structured JSON log records for business events. Not a general-purpose logger — specifically for discrete events worth tracking.

```python
import logging
import json
from datetime import datetime, timezone
from uuid import UUID

logger = logging.getLogger("stima.events")

def log_event(
    event: str,
    *,
    user_id: UUID | None = None,
    quote_id: UUID | None = None,
    customer_id: UUID | None = None,
    detail: str | None = None,
) -> None:
    """Emit a structured business event log record."""
    payload = {
        "event": event,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user_id": str(user_id) if user_id else None,
        "quote_id": str(quote_id) if quote_id else None,
        "customer_id": str(customer_id) if customer_id else None,
        "detail": detail,
    }
    # Remove None values for cleaner output
    payload = {k: v for k, v in payload.items() if v is not None}
    logger.info(json.dumps(payload))
```

**Why not a third-party library:** At this scale (6-8 event call sites), Python's stdlib `logging` with JSON payloads is sufficient. Structured logging libraries (structlog, python-json-logger) can be adopted later if log volume or query complexity warrants it.

### 2. Configure the logger

**Modified:** `backend/app/core/config.py` or app startup

Add a `stima.events` logger configuration that outputs to stdout in JSON format. In production this will be captured by whatever log aggregator is used (CloudWatch, Datadog, etc.). In development it prints to the console.

```python
import logging

def configure_event_logging() -> None:
    event_logger = logging.getLogger("stima.events")
    event_logger.setLevel(logging.INFO)
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    event_logger.addHandler(handler)
    event_logger.propagate = False
```

Call `configure_event_logging()` during app startup (in `main.py` or equivalent).

### 3. Instrument key business events

Add `log_event()` calls in the service layer (not API layer — the service is where business logic lives):

| Event name | Location | When |
|---|---|---|
| `quote.created` | `QuoteService.create_quote` | After successful commit |
| `quote.updated` | `QuoteService.update_quote` | After successful commit |
| `quote.deleted` | `QuoteService.delete_quote` | After successful commit (Task C) |
| `quote.pdf_generated` | `QuoteService.generate_pdf` | After successful PDF render |
| `quote.shared` | `QuoteService.share_quote` | After successful share |
| `extraction.completed` | `QuoteService.extract_combined` | After successful extraction |
| `customer.created` | `CustomerService.create_customer` | After successful commit |

Example call site in `create_quote`:
```python
quote = await self._repository.create(...)
await self._repository.commit()
log_event("quote.created", user_id=user_id, quote_id=quote.id, customer_id=data.customer_id)
return quote
```

Each call is a single line. No try/except around logging — if logging fails, it should surface as a bug, not be silently swallowed.

### 4. Non-goals

- No frontend analytics SDK
- No log aggregation/dashboard setup (that's deployment infrastructure)
- No request-level access logging (FastAPI/uvicorn already logs requests)
- No performance metrics or timing (add when there's a monitoring stack)
- No PII in event logs (user_id is a UUID, not email/name)

## Files touched

**New files:**
- `backend/app/shared/event_logger.py` (~40 LOC)

**Modified files:**
- `backend/app/core/config.py` or `backend/app/main.py` (configure event logger at startup)
- `backend/app/features/quotes/service.py` (add 5-6 `log_event` calls)
- `backend/app/features/customers/service.py` (add 1 `log_event` call)

## Acceptance criteria

- [ ] `event_logger.py` exists with `log_event()` function
- [ ] Event logger outputs structured JSON to stdout
- [ ] `quote.created`, `quote.updated`, `quote.pdf_generated`, `quote.shared`, `extraction.completed` events are logged
- [ ] `quote.deleted` event is logged (requires Task C to be merged first — `QuoteService.delete_quote` must exist)
- [ ] `customer.created` event is logged
- [ ] No PII in log output (UUIDs only, no email/name/phone)
- [ ] Event logging does not affect request latency (no external calls, just stdlib logging)
- [ ] All existing tests pass without modification
- [ ] `ruff check`, `mypy`, `bandit` all pass

## Verification

```bash
make backend-verify
```
