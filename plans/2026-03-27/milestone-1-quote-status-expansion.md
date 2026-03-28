# Plan: Milestone 1 — Quote Status Expansion

**Date:** 2026-03-27
**Roadmap ref:** `docs/V1_ROADMAP.md` — Milestone 1
**Mode:** single (one task, one PR)

---

## Decisions Made Before Implementation

**Removed: customer-facing approve/decline/request_changes**
The public `POST /api/quotes/:id/respond` endpoint has been dropped. In practice, tradespeople close jobs over the phone or in person — customers will rarely tap an "Approve" button in a web UI. Adding a customer-facing write endpoint (with security model, rate limiting, token validation, input sanitization) to support a button most customers won't press adds complexity without pilot-validated value. If pilot users ask for it, it can be added with real evidence behind it.

**Removed: `expired` status**
Expiry is list hygiene and analytics only — it does not unlock any downstream milestone. A background job adds infrastructure overhead; on-read expiry only works if the contractor opens the quote. Deferred until pilot data shows this is a real problem.

**Removed: `customer_response_note`**
Only existed to support the `request_changes` customer action. No longer needed.

**Changed: approve/decline become contractor-set outcomes**
The contractor records the outcome of an in-person or phone decision via "Mark as Won" / "Mark as Lost" on the quote preview screen. These are authenticated actions — no public endpoint required. M4 already planned "Mark as Lost"; M1 adds both.

**Event name distinction preserved:**
`quote_declined` is reserved for a potential future customer-facing decline action. Contractor-initiated closure uses `quote_marked_lost` (matching the roadmap's M4 intent). Both map to the `declined` DB status, but the event name distinguishes the origin for analytics.

**Changed: `approved` badge uses a check icon**
`ready` and `approved` would both be green. Differentiate with a `check_circle` Material Symbol inline in the "Approved" badge.

**Roadmap updated:**
`docs/V1_ROADMAP.md` has been revised to reflect all of the above decisions. M2 landing page is now read-only. POST respond endpoint and expired status have been removed from the locked contracts section.

---

## Goal

Expand the quote status lifecycle from `draft → ready → shared` to:

```
draft → ready → shared → viewed → approved | declined
```

`viewed` is set by the public landing page (Milestone 2) when a customer opens the link. `approved` and `declined` are set by the contractor after the customer confirms intent via phone or in-person. Add the contractor-facing Mark as Won / Mark as Lost actions to the quote preview screen.

---

## Non-Goals

- Customer-facing approve/decline/request_changes (removed — see decisions above)
- `expired` status (deferred)
- `customer_response_note` (removed)
- Public write endpoint (removed)
- Background expiry job (deferred with `expired`)
- Invoice conversion (Milestone 5)
- Email delivery (Milestone 3)

---

## Current State Audit

### Model
`QuoteStatus` at `backend/app/features/quotes/models.py:16-22` — 3 values: `DRAFT | READY | SHARED`.

Status column uses `native_enum=False, create_constraint=True` → stored as VARCHAR with a CHECK constraint. Alembic will not auto-generate the constraint expansion correctly; the migration must manually drop and recreate the CHECK constraint.

### Service guards (need expansion)
- Edit guard at `service.py:199` — `if quote.status == QuoteStatus.SHARED`
- Delete guard at `service.py:233` — same

Both must expand to cover all post-editable statuses.

### Repository
- `mark_ready_if_not_shared` at `repository.py:252-262` — WHERE clause is `status != SHARED`. With new statuses added, this would wrongly flip `viewed`/`approved`/`declined` back to `ready` if a contractor regenerates a PDF. Must narrow to `status == DRAFT` only.

### QuotePreviewActions
`frontend/src/features/quotes/components/QuotePreviewActions.tsx:4` — `QuotePreviewActionState` type is `"draft" | "ready" | "shared"`. New statuses will fall through all conditional branches silently — no actions render, no error surfaces.

### Event logger whitelist
`backend/app/shared/event_logger.py:21-30` — `_PILOT_EVENT_NAMES` frozenset controls which events are persisted to `event_logs`. Any event name not in this set is logged to stdout only. New M1 events (`quote_approved`, `quote_marked_lost`) must be added here or they will never appear in analytics queries.

### StatusBadge
`frontend/src/shared/components/StatusBadge.tsx` — hardcoded to 3 variants. Needs 3 more.

---

## Schema Changes (one migration)

**File:** `backend/alembic/versions/20260327_0011_quote_status_expansion.py`

Two changes in one migration:

1. **Status CHECK constraint** — drop existing `quote_status` constraint, recreate with 5 values:
   `draft | ready | shared | viewed | approved | declined`
   Migration must be hand-written; autogenerate does not handle non-native enum expansion.

2. **`source_document_id`** — add to `documents`:
   ```sql
   ALTER TABLE documents
     ADD COLUMN source_document_id UUID NULL
       REFERENCES documents(id) ON DELETE SET NULL;
   ```
   Column added now so M5 (invoice conversion) has a stable FK to populate. M1 never writes to it. `ON DELETE SET NULL` means deleting a source quote orphans but does not delete any derived invoice.

### Python model updates (`models.py`)
- Extend `QuoteStatus` with `VIEWED = "viewed"`, `APPROVED = "approved"`, `DECLINED = "declined"`
- Add `source_document_id: Mapped[UUID | None]` to `Document` with FK and `ON DELETE SET NULL`

---

## Backend Changes

### 1. Repository (`repository.py`)

**Fix `mark_ready_if_not_shared`** — change WHERE clause:
```python
# Old: Document.status != QuoteStatus.SHARED
# New: only transition from DRAFT
.where(Document.status == QuoteStatus.DRAFT)
```
All other statuses are left untouched. This is a latent correctness fix — without it, PDF regeneration on a `viewed` or `approved` quote would silently flip it back to `ready`.

**New: `set_quote_outcome(quote_id, user_id, status) -> Document | None`**
Authenticated write; sets status to `APPROVED` or `DECLINED`. Returns the updated document or `None` if not found.

**Protocol update** (`QuoteRepositoryProtocol` in `service.py`): add `set_quote_outcome`.

### 2. Service (`service.py`)

**Expand edit/delete guards** from `SHARED`-only to all non-editable statuses:
```python
_NON_EDITABLE_STATUSES = {
    QuoteStatus.SHARED,
    QuoteStatus.VIEWED,
    QuoteStatus.APPROVED,
    QuoteStatus.DECLINED,
}
```
Use this set in both `update_quote()` and `delete_quote()`.

**New `mark_quote_outcome()` method** (authenticated, contractor action):
```
mark_quote_outcome(
    user: User,
    quote_id: UUID,
    outcome: Literal["approved", "declined"],
) -> Document
```

Logic:
1. Load quote by `(quote_id, user_id)` — 404 if not found
2. If already `APPROVED` or `DECLINED` → 409 "Quote outcome has already been recorded"
3. If status is `DRAFT` or `READY` → 409 "Quote has not been shared yet"
4. Set `status = APPROVED` or `status = DECLINED`, commit
5. Log `quote_approved` (for Won) or `quote_marked_lost` (for Lost) — not `quote_declined`

**`share_quote()` non-regression guard:**
If current status is `VIEWED`, `APPROVED`, or `DECLINED` — do not regress to `SHARED`. Return the existing document as-is. Defensive guard for M3 (email resend) where a re-share must not overwrite a later status.

### 3. Event logger (`event_logger.py`)

Add `quote_approved` and `quote_marked_lost` to `_PILOT_EVENT_NAMES` at `event_logger.py:21`:
```python
_PILOT_EVENT_NAMES = frozenset({
    "quote_started",
    "audio_uploaded",
    "draft_generated",
    "draft_generation_failed",
    "quote_pdf_generated",
    "quote_shared",
    "quote_approved",        # new
    "quote_marked_lost",     # new
})
```
Without this, `log_event("quote_approved", ...)` writes to stdout only and never reaches `event_logs`.

### 4. API (`api.py`)

**New routes (authenticated, CSRF-protected):**
- `POST /api/quotes/{id}/mark-won` → calls `mark_quote_outcome(..., outcome="approved")`
- `POST /api/quotes/{id}/mark-lost` → calls `mark_quote_outcome(..., outcome="declined")`

Both require the standard `current_user` and `require_csrf` dependencies. No request body needed. Returns 200 with the updated quote document on success.

---

## Status Transitions Summary

| From | Trigger | To | Who |
|---|---|---|---|
| `draft` | PDF generated | `ready` | System |
| `ready` | Contractor shares link | `shared` | Contractor |
| `shared` | Customer opens landing page (M2) | `viewed` | System (M2) |
| `shared` or `viewed` | Contractor presses Mark as Won | `approved` | Contractor |
| `shared` or `viewed` | Contractor presses Mark as Lost | `declined` | Contractor |

Note: both Mark as Won and Mark as Lost are allowed from `SHARED` (not just `VIEWED`) because the contractor may record the outcome before the customer ever opens the link.

---

## Frontend Changes

### 1. StatusBadge (`StatusBadge.tsx`)

Extend variant type to `"draft" | "ready" | "shared" | "viewed" | "approved" | "declined"`.

| Status | Background | Text | Icon | Notes |
|---|---|---|---|---|
| `draft` | `bg-neutral-container` | `text-on-surface-variant` | — | Unchanged |
| `ready` | `bg-success-container` | `text-success` | — | Unchanged |
| `shared` | `bg-info-container` | `text-info` | — | Unchanged |
| `viewed` | `bg-warning-container` | `text-warning` | — | "Needs follow-up" signal |
| `approved` | `bg-success-container` | `text-success` | `check_circle` (filled, inline) | Icon differentiates from `ready` |
| `declined` | `bg-error-container` | `text-error` | — | Clear closure signal |

For `approved`, render a small `check_circle` Material Symbol (filled variant, `text-sm`) inline before the label. Only badge with an icon.

### 2. QuotePreviewActions (`QuotePreviewActions.tsx`)

`QuotePreviewActionState` at line 4 must expand to cover all 6 statuses. New state behaviours:

| State | Actions rendered |
|---|---|
| `draft` | Generate PDF (unchanged) |
| `ready` | Share Quote + Open PDF (unchanged) |
| `shared` | Open PDF + Copy Share Link + Mark as Won + Mark as Lost |
| `viewed` | Open PDF + Copy Share Link + Mark as Won + Mark as Lost |
| `approved` | Open PDF only (closed state, no further actions) |
| `declined` | Open PDF only (closed state, no further actions) |

Mark as Won → primary styling. Mark as Lost → destructive styling, triggers confirm modal before executing. Both call their respective API routes and refetch the quote detail on success.

### 3. QuotePreview (`QuotePreview.tsx`)

Check for any hardcoded status comparisons that gate edit/share/delete actions. All guards that currently reference the string `"shared"` or the 3-variant union must expand to the 6-variant contract. TypeScript's exhaustive type checking should surface these once the type is updated.

### 4. Quote list (`QuoteList.tsx`, `QuoteHistoryList.tsx`)

No structural changes — `status` is already passed as a string to `StatusBadge`. TypeScript will surface any unhandled variants after the type is updated.

---

## Documentation Changes

All four of the following `docs/ARCHITECTURE.md` updates are required. Leaving any of
them out means the repo docs stay contract-stale after the code lands.

**1. `documents` schema — `status` field (line 92):**
Update the status notes column from `` `draft \| ready \| shared` `` to
`` `draft \| ready \| shared \| viewed \| approved \| declined` `` with DB check constraint.

**2. `documents` schema — new column (after line 100):**
Add `source_document_id` row to the `documents` table:
```
| source_document_id | UUID (FK → documents, self-ref) | nullable, ON DELETE SET NULL; populated by M5 invoice conversion |
```

**3. Quote API table — new endpoints (after line 201):**
Add the two authenticated outcome endpoints:
```
| `/quotes/{id}/mark-won`  | POST | yes | cookie | — | `200 Quote` or `404` or `409` |
| `/quotes/{id}/mark-lost` | POST | yes | cookie | — | `200 Quote` or `404` or `409` |
```

**4. Pilot event set (line 124):**
Add `quote_approved` and `quote_marked_lost`. Remove `quote_declined`,
`quote_changes_requested`, and `quote_expired` (removed from V1 scope).

---

## Event Logging

| Event | Trigger | Persisted to event_logs |
|---|---|---|
| `quote_approved` | `mark_quote_outcome`, outcome=approved | Yes (added to whitelist) |
| `quote_marked_lost` | `mark_quote_outcome`, outcome=declined | Yes (added to whitelist) |

`quote_declined` is intentionally not used in M1. It is reserved for a future customer-facing decline action so analytics can distinguish contractor-closure from customer-rejection.

---

## Risks and Edge Cases

| Risk | Mitigation |
|---|---|
| CHECK constraint expansion not handled by autogenerate | Write migration manually with `op.drop_constraint` + `op.create_check_constraint` |
| New events not persisted because whitelist not updated | Explicitly add to `_PILOT_EVENT_NAMES`; regression test that calling `log_event("quote_approved", ...)` results in a DB row |
| Edit guard misses a new status | Use `_NON_EDITABLE_STATUSES` set; cover all 4 non-editable statuses in tests |
| `mark_ready_if_not_shared` flips `viewed`/`approved` → `ready` on PDF regenerate | Narrowed WHERE clause to `status == DRAFT`; regression test for this path |
| Contractor marks outcome on a draft/ready quote (not yet sent) | Service guard: 409 "Quote has not been shared yet" |
| `share_quote()` regresses `viewed`/`approved` back to `shared` | Non-regression guard in `share_quote()` |
| `QuotePreviewActions` silently renders nothing for new statuses | Expand `QuotePreviewActionState` type; add tests for viewed/approved/declined states |
| `source_document_id` self-referential FK | PostgreSQL supports self-ref FK natively; no deferral needed |
| `approved` badge visually identical to `ready` | `check_circle` icon inside `approved` badge |

---

## Implementation Order

1. Migration (`20260327_0011_...`) — status constraint (5 values) + `source_document_id`
2. Python model — extend `QuoteStatus` (3 new values), add `source_document_id` to `Document`
3. Repository — fix `mark_ready_if_not_shared` WHERE clause, add `set_quote_outcome`
4. Service — expand edit/delete guards, add `mark_quote_outcome`, add `share_quote` non-regression guard
5. Event logger — add `quote_approved` and `quote_marked_lost` to `_PILOT_EVENT_NAMES`
6. API — add `POST /api/quotes/{id}/mark-won` and `mark-lost` routes
7. Backend tests — outcome actions (guards, transitions, event persistence, 409 paths), `mark_ready` regression
8. `ARCHITECTURE.md` — update pilot event table
9. Frontend — extend `StatusBadge` (3 new variants + icon for approved)
10. Frontend — update `QuotePreviewActions` type and render logic for all 6 states (including Mark as Won/Lost with confirm modal for Lost)
11. Frontend — audit `QuotePreview.tsx` for hardcoded status comparisons; expand as needed
12. Frontend tests — badge variants, Mark as Won/Lost calls, closed-state rendering

---

## Acceptance Criteria

- [ ] `viewed`, `approved`, `declined` are valid at the DB level (CHECK constraint); existing statuses unaffected
- [ ] `source_document_id` column exists with self-referential FK; NULL for all existing rows
- [ ] `mark-won` transitions `shared`/`viewed` → `approved`; emits `quote_approved` event; row persisted to `event_logs`
- [ ] `mark-lost` transitions `shared`/`viewed` → `declined`; emits `quote_marked_lost` event; row persisted to `event_logs`
- [ ] Both actions return 409 when quote is already `approved` or `declined`
- [ ] Both actions return 409 when quote is `draft` or `ready` (not yet shared)
- [ ] Edit blocked for `shared`, `viewed`, `approved`, `declined`
- [ ] Delete blocked for `shared`, `viewed`, `approved`, `declined`
- [ ] PDF generation does not regress `viewed`/`approved`/`declined` back to `ready`
- [ ] `share_quote()` does not regress a `viewed`/`approved`/`declined` quote back to `shared`
- [ ] New status badges render for all 6 states in quote list and detail
- [ ] `approved` badge displays `check_circle` icon alongside label
- [ ] `QuotePreviewActions` renders correct actions for all 6 states; no silent empty state for new statuses
- [ ] Mark as Won / Mark as Lost buttons visible only on `shared` and `viewed` quotes
- [ ] Mark as Lost prompts confirm modal before executing
- [ ] `ARCHITECTURE.md` `documents.status` field reflects all 6 statuses
- [ ] `ARCHITECTURE.md` `documents` schema includes `source_document_id` row
- [ ] `ARCHITECTURE.md` quote API table includes `mark-won` and `mark-lost` endpoints
- [ ] `ARCHITECTURE.md` pilot event table is updated

---

## Verification

```bash
make backend-verify
make frontend-verify
```

Manual:
1. Share a quote → confirm `shared` badge; Mark as Won/Lost buttons visible
2. Press Mark as Won → confirm `approved` badge with check icon; action buttons gone
3. Press Mark as Lost on a `shared` quote → confirm modal → confirm → `declined` badge
4. Attempt Mark as Won on `draft`/`ready` → confirm 409
5. Attempt Mark as Won on already-`approved` quote → confirm 409
6. Edit a `shared`/`viewed`/`approved`/`declined` quote → confirm 409
7. Regenerate PDF on a `viewed` quote → confirm status stays `viewed` (not regressed to `ready`)
8. Check `event_logs` table directly — confirm `quote_approved` and `quote_marked_lost` rows are present after actions
