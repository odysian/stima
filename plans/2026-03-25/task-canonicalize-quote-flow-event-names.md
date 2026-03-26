# Task Plan: Canonicalize Quote-Flow Event Names

Parent context:
- Follow-up to Task #92 / PR #100
- Current quote-flow instrumentation emits both legacy dot-notation stdout events and
  new underscore pilot events for PDF/share actions
- Repo is still pre-pilot V0, so event naming can be simplified before downstream
  consumers depend on the duplicate vocabulary

Recommended labels:
- `type:task`
- `area:quotes`
- `area:backend`
- `area:docs`

Recommended title:
- `Task: Canonicalize quote-flow event names before pilot`

---

## Goal

Adopt one canonical quote-flow event vocabulary in business code before pilot, so one
user action maps to one event name. Remove dual emission for PDF/share actions while
preserving the pilot analytics contract and keeping the logger behavior simple.

---

## Problem Framing

### Goal

Make quote-flow event naming unambiguous before pilot:
- one canonical event name per action
- no duplicated PDF/share emits from service code
- tests and docs reflect the canonical vocabulary

### Non-goals

- No further schema changes to `event_logs` (missing `user_id` index was already fixed in PR #100 follow-up commit)
- No dashboard or reporting work
- No cleanup of every legacy event in the whole app
- No customer/profile/auth event taxonomy redesign
- No new event sinks or queueing infrastructure

### Constraints

- Keep the event logger entrypoint contract stable: `log_event(...)`
- Preserve current request behavior and status codes
- Keep the pilot analytics event set aligned with the persisted underscore names
- Keep the change surgical and backend-only unless docs/tests require otherwise

---

## Locked Design Decisions

### Underscore names become the canonical quote-flow vocabulary

Use these as the only business-code event names for quote-flow pilot instrumentation:
- `quote_started`
- `audio_uploaded`
- `draft_generated`
- `draft_generation_failed`
- `quote_pdf_generated`
- `quote_shared`

These already match the persisted `event_logs` contract from Task #92, so they should
be treated as the single source of truth for pilot quote-flow analytics.

### Remove legacy PDF/share dual emits from service code

For quote PDF/share actions, stop emitting:
- `quote.pdf_generated`
- `quote.shared`

Keep only:
- `quote_pdf_generated`
- `quote_shared`

The service layer should emit one semantic event per user action.

### Do not add logger aliasing unless explicitly needed

Because the app is still pre-pilot V0, prefer deleting the duplicate legacy emits over
introducing compatibility translation logic in `event_logger.py`.

If someone later proves an operational dependency on dot-notation PDF/share logs, that
should be handled as a separate compatibility task, not hidden inside this cleanup.

### Scope the cleanup to quote-flow duplication only

This task should not widen into renaming unrelated operational logs such as:
- `customer.created`
- `quote.created`
- `quote.updated`
- `quote.deleted`

Those may be revisited later, but they are not needed to remove the current ambiguity
in Slice 2 pilot instrumentation.

---

## Risks And Edge Cases

- Existing tests currently assert duplicated event sequences for PDF/share actions and
  will need to be updated carefully
- Anyone informally reading stdout logs may notice the dot-notation PDF/share events
  disappear after this task
- The logger should remain non-blocking and unchanged in behavior aside from receiving
  fewer duplicate calls
- The change should not accidentally alter DB persistence rules or add a contract
  change beyond event naming

---

## Scope

### Backend

**`backend/app/features/quotes/service.py`**
- Remove legacy dot-notation event emits for PDF/share actions
- Keep only the underscore quote-flow event names for those actions

**`backend/app/shared/event_logger.py`**
- No behavior expansion by default
- Only update if needed to clarify comments/docstrings around canonical quote-flow
  naming

### Tests

**`backend/app/features/quotes/tests/test_quotes.py`**
- Update `test_business_events_are_logged_for_quote_customer_and_extraction_flow`: remove
  `"quote.pdf_generated"` and `"quote.shared"` from the expected `event_names` list; total
  expected events drops from 10 to 8
- Keep failure/non-blocking coverage intact

**`backend/app/shared/tests/test_event_logger.py`**
- Adjust/add tests only if needed to reflect canonical naming expectations

### Docs

**`docs/ARCHITECTURE.md`**
- In the `event_logs` section, append one sentence after the pilot event list clarifying
  that underscore names are the canonical quote-flow vocabulary for pilot instrumentation,
  and that dot-notation names (`quote.created`, `quote.updated`, `quote.deleted`,
  `customer.created`) are separate operational events and out of scope for pilot analytics

---

## Proposed Implementation Plan

1. Grep for `quote\.pdf_generated` and `quote\.shared` across `backend/` to confirm the
   only callers are `service.py:248` and `service.py:279-284` before making changes.
2. Remove the duplicate `quote.pdf_generated` and `quote.shared` emits from
   `QuoteService`, keeping only `quote_pdf_generated` and `quote_shared`.
3. Update `test_business_events_are_logged_for_quote_customer_and_extraction_flow` to
   assert the 8-event canonical sequence (no `"quote.pdf_generated"` or `"quote.shared"`).
4. Add a clarifying sentence to the `event_logs` section in `docs/ARCHITECTURE.md` (see
   Docs scope above).
5. Run targeted backend verification, then `make backend-verify`.

---

## Acceptance Criteria

- [ ] `QuoteService.generate_pdf()` emits only `quote_pdf_generated`
- [ ] `QuoteService.share_quote()` emits only `quote_shared`
- [ ] No duplicate event names are emitted for the same PDF/share action
- [ ] Quote extraction pilot event names remain unchanged
- [ ] `event_logs` persistence behavior remains unchanged
- [ ] Quote-flow event tests no longer assert dual PDF/share event sequences
- [ ] `docs/ARCHITECTURE.md` documents underscore quote-flow names as canonical
- [ ] `make backend-verify` passes

---

## Verification

Primary:

```bash
make backend-verify
```

Targeted while iterating:

```bash
cd backend && .venv/bin/pytest -v app/features/quotes/tests/test_quotes.py app/shared/tests/test_event_logger.py
```

Fallback:

```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest
```

---

## Issue Artifact Draft

```md
# Task: Canonicalize quote-flow event names before pilot

Follow-up to Task #92 / PR #100

## Goal

Adopt one canonical quote-flow event vocabulary in business code before pilot, so one
user action maps to one event name. Remove dual emission for PDF/share actions while
preserving the pilot analytics contract and keeping the logger behavior simple.

## Non-goals

- No further schema changes to `event_logs` (missing `user_id` index already fixed in PR #100 follow-up commit)
- No dashboard or reporting work
- No cleanup of every legacy event in the whole app
- No customer/profile/auth event taxonomy redesign
- No new event sinks or queueing infrastructure

## Locked Decisions

- Underscore quote-flow names are canonical:
  - `quote_started`
  - `audio_uploaded`
  - `draft_generated`
  - `draft_generation_failed`
  - `quote_pdf_generated`
  - `quote_shared`
- Remove legacy dot-notation PDF/share emits from service code:
  - `quote.pdf_generated`
  - `quote.shared`
- Do not add logger aliasing unless an explicit compatibility need appears
- Keep this task scoped to quote-flow duplication only

## Scope

### Backend
- Remove duplicate PDF/share event emits from `QuoteService`
- Keep DB persistence behavior unchanged

### Tests
- Update `test_business_events_are_logged_for_quote_customer_and_extraction_flow` to
  assert 8 events (drop `"quote.pdf_generated"` and `"quote.shared"` from expected list)

### Docs
- In the `event_logs` section of `docs/ARCHITECTURE.md`, append a sentence clarifying
  that underscore names are canonical for pilot instrumentation and dot-notation names
  are separate operational events out of scope for pilot analytics

## Acceptance Criteria

- [ ] `QuoteService.generate_pdf()` emits only `quote_pdf_generated`
- [ ] `QuoteService.share_quote()` emits only `quote_shared`
- [ ] No duplicate event names are emitted for the same PDF/share action
- [ ] Quote extraction pilot event names remain unchanged
- [ ] `event_logs` persistence behavior remains unchanged
- [ ] Quote-flow event tests no longer assert dual PDF/share event sequences
- [ ] `docs/ARCHITECTURE.md` documents underscore quote-flow names as canonical
- [ ] `make backend-verify` passes

## Verification

```bash
make backend-verify
```

Fallback:

```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest
```
```
