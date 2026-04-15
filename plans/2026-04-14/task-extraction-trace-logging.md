# Task: Extraction pipeline trace logging

## Summary

Add structured trace logging to the extraction pipeline so operators can follow a single
capture end-to-end: **input transcript → raw Claude tool output → validated
`ExtractionResult`**, plus the `ExtractionCallMetadata` that is already collected but
never emitted.  All trace records are at `DEBUG` level, structured JSON, and come from a
new `stima.extraction` logger — isolated from the existing `stima.events` (business
analytics) and `stima.security` (ops/security) loggers.

## Problem

There is currently no way to observe what actually flowed through the extraction pipeline
in a running app.  `stima.events` only records high-level business outcomes (`quote_started`,
`draft_generated`).  The rich per-call telemetry in `ExtractionCallMetadata` (model id,
token usage, tier, repair outcome) is collected in a `ContextVar` and then discarded if
the caller does not pop it.  Input content and Claude's raw tool payload are never
recorded anywhere.

## Scope

**In scope**
- New `stima.extraction` structured logger in `backend/app/shared/` (mirrors the
  `configure_*` / `log_*` pattern from `observability.py` and `event_logger.py`).
- `log_extraction_trace` helper that emits one JSON record per pipeline stage; called
  from:
  - `ExtractionIntegration._extract_for_tier` — before **each** `_request_with_retry`
    call (primary and, when triggered, repair) and after **each** `_extract_tool_payload`
    parse, so both the primary and repair payloads are independently traceable.  Stage
    names are `extraction.primary_input` / `extraction.primary_output` and
    `extraction.repair_input` / `extraction.repair_output` to match the branching
    structure.
  - `ExtractionService.convert_notes` — so the final validated `ExtractionResult` (tier,
    line-item count, confidence-note count) is logged on the happy path.
  - `ExtractionService.extract_combined` — additionally, so the `extraction.result` stage
    is also emitted when `build_degraded_extraction_result` is returned (the degraded
    path that bypasses `convert_notes`).
- Wire `configure_extraction_logging()` in `backend/app/main.py` alongside the existing
  `configure_security_logging()` / `configure_event_logging()` calls.
- Unit tests covering the new logger helper (configure, emit, no-op when level is above
  DEBUG) — follow the pattern in `backend/app/shared/tests/test_event_logger.py`.

**Out of scope**
- `stima.events` business event changes — those already work and are not debug traces.
- Frontend changes.
- New database tables or migrations — no persistence; stdout only.
- Sentry integration changes.
- Per-request rate-limiting of trace records (not needed at DEBUG level).
- Log-shipping or external observability pipeline (Datadog, Loki, etc.).

## Decision locks

- [ ] **PII handling**: the **safe default is metadata-only** — `transcript_chars` and
  `transcript_words` integer fields, never the raw string.  Raw content is opt-in via an
  explicit config value (e.g. `EXTRACTION_TRACE_INCLUDE_CONTENT=true`); when unset or
  false, raw fields are replaced with their metadata equivalents.  This keeps
  implementation unblocked — no operator pre-approval required; an operator who wants raw
  content enables the flag explicitly.
- [ ] **Logger isolation**: `stima.extraction` does not propagate to the root logger
  (`propagate = False`) to match the existing pattern.
- [ ] **No contract changes**: no new API endpoints, no schema migrations, no changes to
  existing `log_event` / `log_security_event` call-sites.

## Acceptance criteria

- [ ] Enabling `DEBUG` log level for `stima.extraction` produces structured JSON records
  at each pipeline stage:
  - **`extraction.primary_input`** — before the primary API call; contains `model_id`,
    `invocation_tier`, `prompt_variant`, `transcript_chars`, `transcript_words` (and
    optionally the raw transcript if `EXTRACTION_TRACE_INCLUDE_CONTENT=true`).
  - **`extraction.primary_output`** — after primary `_extract_tool_payload`; contains
    the raw payload dict (gated by the same content flag), line item count.
  - **`extraction.repair_input`** / **`extraction.repair_output`** — emitted only when a
    repair call is made; same shape as primary equivalents, plus `repair_validation_error_count`.
  - **`extraction.result`** — emitted on both happy path (from `convert_notes`) and the
    degraded path (from `extract_combined` when `build_degraded_extraction_result` is
    returned); contains `extraction_tier`, `line_item_count`, `has_total`,
    `confidence_note_count`, `degraded_reason_code` (if present), and the full
    `ExtractionCallMetadata` fields including `repair_outcome`.
- [ ] All three events carry the current `correlation_id` from
  `app.shared.observability.current_correlation_id()` so they can be joined to the
  corresponding HTTP request log line.
- [ ] `configure_extraction_logging()` is idempotent (identical pattern to existing
  configure helpers).
- [ ] At `INFO` or above, **no** new log records are emitted (no change to existing
  observable behavior).
- [ ] When repair is attempted, `extraction.repair_input` and `extraction.repair_output`
  are emitted; the final `extraction.result` record reflects the repair outcome fields
  (`repair_attempted=true`, `repair_outcome` = `repair_succeeded` / `repair_invalid` /
  `repair_request_failed`).
- [ ] When `build_degraded_extraction_result` is returned (provider-retryable error
  path), `extraction.result` is still emitted with `extraction_tier=degraded`.
- [ ] New unit tests cover:
  - calling `configure_extraction_logging()` twice does not add a second handler (mirrors
    the idempotency test pattern in `test_event_logger.py`)
  - one record emitted per stage at DEBUG
  - zero records emitted at INFO or above
  - correlation id is present in every emitted record
  - repair path emits repair-prefixed stage records

## Why this approach checkpoint

**Chosen approach**: new `stima.extraction` logger at `DEBUG` level, structured JSON,
three named stages.

**Rejected alternative**: add trace records to the existing `stima.security` logger —
rejected because security/ops and extraction debug traces have different retention and
routing requirements; mixing them makes both harder to filter.

**Rejected alternative**: add to `stima.events` — rejected because `stima.events` is
for durable business analytics events (persisted to `event_logs` table); extraction debug
traces are transient and should never be persisted.

**Main tradeoff**: full transcript content in logs vs. metadata-only.  Full content gives
the richest debugging signal but creates a PII obligation.  Metadata-only (char/word
counts) is safer by default and still tells you whether the input was substantive.  This
is the open decision lock above.

**Assumptions / contracts that must hold**:
- `current_correlation_id()` is always safe to call; it creates a new id if none is set
  (already true in `observability.py:205-213`).
- Repair path in `ExtractionIntegration._extract_for_tier` does not change observable
  behavior — the trace calls are side-effect-free.
- `ExtractionService.convert_notes` is the single exit point for the **happy path**
  only; the degraded path returns from `extract_combined` via
  `build_degraded_extraction_result` without passing through `convert_notes`.  Both
  exit points emit `extraction.result` — this is explicit in scope, not an assumption.

## Files (expected)

- `backend/app/shared/extraction_logger.py` — new logger module
- `backend/app/shared/tests/test_extraction_logger.py` — new unit tests
- `backend/app/integrations/extraction.py` — add trace calls in `_extract_for_tier`
- `backend/app/features/quotes/extraction_service.py` — add trace call in `convert_notes`
- `backend/app/main.py` — wire `configure_extraction_logging()`

## Verification

Tier 1 (during implementation):
```bash
cd backend && .venv/bin/pytest \
  app/shared/tests/test_extraction_logger.py \
  app/integrations/tests/test_extraction.py \
  app/features/quotes/tests/test_extraction_service.py \
  app/features/quotes/tests/test_extraction.py \
  -x --tb=short
```

Tier 3 gate before merge:
```bash
make backend-verify
```

## Labels

`type:task`, `area:backend`, `area:integrations`

## PR

- Branch: `task-<id>-extraction-trace-logging`
- PR body: `Closes #<id>`
