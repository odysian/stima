# Task 02a Follow-ups

Follow-up hardening items identified during execution/review of Task `#199` (`02a-rate-limiting`):

## 1. Close Redis clients on app shutdown

- Current state: `RedisExtractionStateStore` creates a Redis async client in `backend/app/shared/rate_limit.py` but does not explicitly close it.
- Why follow up: this is lifecycle hygiene, not a correctness blocker. The task goal was distributed limiter behavior, which is complete and verified.
- Suggested fix: move Redis-backed limiter/control-manager ownership into app lifespan in `backend/app/main.py`, store the managed instances on `app.state`, and call `aclose()` during shutdown.

## 2. Add invoice-specific 429 tests

- Current state: quote/public rate-limit paths gained targeted tests, but invoice PDF and invoice email rate-limit decorators do not yet have mirrored narrow tests.
- Why follow up: behavior is implemented, but invoice-only regression coverage is thinner than the quote/public paths.
- Suggested fix: add focused backend tests for:
  - `POST /api/invoices/{id}/pdf` returning `429` when the configured user rate limit is exhausted
  - `POST /api/invoices/{id}/send-email` returning `429` when the configured user rate limit is exhausted

## 3. Decide whether extraction guards should share the limiter toggle

- Current state: `require_extraction_capacity_guard` skips quota/concurrency enforcement when `limiter.enabled` is false.
- Why follow up: this is acceptable today, but it couples SlowAPI disablement to extraction-guard disablement.
- Suggested fix: either document this coupling as intentional, or introduce a dedicated setting if operators may need to disable one without disabling the other.

## 4. Reconfirm default extraction thresholds before production rollout

- Current state: authenticated extraction defaults are now user-keyed and configured with conservative hourly/day-based limits.
- Why follow up: this matches the task brief, but rollout should confirm the stricter fairness model is what operators want in production.
- Suggested fix: validate the chosen defaults (`QUOTE_*_RATE_LIMIT`, `EXTRACTION_DAILY_QUOTA`, `EXTRACTION_CONCURRENCY_LIMIT`) before deploy and adjust env values if needed.
