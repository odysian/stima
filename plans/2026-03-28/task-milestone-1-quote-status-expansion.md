## Summary

Expand the quote status lifecycle from `draft → ready → shared` to `draft → ready → shared → viewed → approved | declined`. Add contractor-facing **Mark as Won** and **Mark as Lost** actions to the quote preview screen. `viewed` is wired to the DB, model, and frontend in this milestone but is only *set* by the M2 public landing page.

**Plan reference:** `plans/2026-03-27/milestone-1-quote-status-expansion.md`
**Roadmap reference:** `docs/V1_ROADMAP.md` — Milestone 1

---

## Decision Locks

### Single migration: status constraint expansion + `source_document_id`
One Alembic migration adds both the 6-value CHECK constraint and the `source_document_id` self-referential FK. The two changes are intentionally coupled — M5 invoice conversion needs a stable FK anchor, and shipping them together avoids an orphan migration.

### Six values, not five
`draft | ready | shared | viewed | approved | declined` — six values. The migration must drop the existing `quote_status` CHECK constraint and recreate it with all six. Alembic autogenerate does not handle non-native enum expansion correctly; write the migration by hand.

### `share_quote()` non-regression guard is a silent 200 no-op
If a quote is already `viewed`, `approved`, or `declined` when `share_quote()` is called, return the current document as-is with 200. No 409. Prevents status regression from an accidental or M3 re-share without surfacing an error to the contractor.

### `mark-won` / `mark-lost` response is the base `Quote` document
The frontend refetches the full detail via `GET /quotes/{id}` on success, so the endpoint response only needs to confirm the write succeeded. Base `Quote` shape — consistent with `PATCH /quotes/{id}`.

### Mark as Won has no confirm modal; Mark as Lost does
Mark as Lost modal: title "Mark quote as lost?", body "This records the quote as lost. You can still view the quote and its PDF.", confirm button "Mark as Lost" (destructive styling). Mark as Won goes straight to the request with no friction gate — positive actions don't need a friction gate.

### Both buttons use disable-while-in-flight + refetch pattern
Button disables on press, POST fires, on success the quote detail is refetched and the new status/actions render naturally. Mark as Lost adds a modal gate before this sequence starts; Mark as Won does not.

### `quote_marked_lost` event name (not `quote_declined`)
Preserves analytics distinction between contractor-closure (this milestone) and a potential future customer-initiated decline. Both map to `DECLINED` DB status, but the event names diverge for analytics.

---

## Scope

### New files
- `backend/alembic/versions/<date>_quote_status_expansion.py` — migration: 6-value CHECK constraint + `source_document_id` self-ref FK
- `frontend/src/features/quotes/tests/QuotePreviewActions.test.tsx` — component tests for Mark as Won/Lost

### Modified files
- `backend/app/features/quotes/models.py` — extend `QuoteStatus` (add `VIEWED`, `APPROVED`, `DECLINED`); add `source_document_id: Mapped[UUID | None]` to `Document`
- `backend/app/features/quotes/repository.py` — narrow `mark_ready_if_not_shared` WHERE to `status == DRAFT` only; add `set_quote_outcome(quote_id, user_id, status)`
- `backend/app/features/quotes/service.py` — introduce `_NON_EDITABLE_STATUSES` set; expand edit/delete guards; add `mark_quote_outcome()`; add `share_quote()` non-regression guard
- `backend/app/shared/event_logger.py` — add `quote_approved` and `quote_marked_lost` to `_PILOT_EVENT_NAMES`
- `backend/app/features/quotes/api.py` — add `POST /api/quotes/{id}/mark-won` and `POST /api/quotes/{id}/mark-lost`
- `backend/app/features/quotes/tests/test_quotes.py` — new tests for outcome actions, guards, event persistence, `mark_ready` regression
- `frontend/src/shared/components/StatusBadge.tsx` — add `viewed`, `approved`, `declined` variants; inline `check_circle` filled icon for `approved`
- `frontend/src/shared/components/StatusBadge.test.tsx` — cover 3 new variants and icon assertion
- `frontend/src/features/quotes/components/QuotePreviewActions.tsx` — expand `QuotePreviewActionState` to 6 statuses; render Mark as Won/Lost for `shared`/`viewed`; Open PDF only for `approved`/`declined`
- `frontend/src/features/quotes/tests/QuotePreview.test.tsx` — expand for new status states
- `frontend/src/features/quotes/components/QuotePreview.tsx` — audit and expand any hardcoded `"shared"` status comparisons to the 6-variant union
- `docs/ARCHITECTURE.md` — update `documents.status` (6 values), add `source_document_id` row, add mark-won/mark-lost to API table, update pilot event set

---

## Acceptance Criteria

- [ ] `viewed`, `approved`, `declined` are valid at the DB level; existing rows unaffected
- [ ] `source_document_id` column exists, self-referential FK with `ON DELETE SET NULL`, NULL for all existing rows
- [ ] `POST /api/quotes/{id}/mark-won`: `shared`/`viewed` → `approved`; emits `quote_approved`; row persisted to `event_logs`
- [ ] `POST /api/quotes/{id}/mark-lost`: `shared`/`viewed` → `declined`; emits `quote_marked_lost`; row persisted to `event_logs`
- [ ] Both actions return 409 when quote is already `approved` or `declined`
- [ ] Both actions return 409 when quote is `draft` or `ready`
- [ ] Edit (`PATCH /quotes/{id}`) returns 409 for `shared`, `viewed`, `approved`, `declined`
- [ ] Delete returns 409 for `shared`, `viewed`, `approved`, `declined`
- [ ] PDF regeneration on a `viewed`/`approved`/`declined` quote does not flip status to `ready`
- [ ] `share_quote()` on `viewed`/`approved`/`declined` returns 200, status unchanged
- [ ] All 6 status badges render correctly; `approved` badge displays `check_circle` icon inline
- [ ] `QuotePreviewActions` renders correct actions for all 6 states; no silent empty state for new statuses
- [ ] Mark as Won / Mark as Lost buttons visible only on `shared` and `viewed` quotes
- [ ] Mark as Won fires immediately on press (no modal); button disables while in-flight; quote detail refetches on success
- [ ] Mark as Lost triggers confirm modal ("Mark quote as lost?" / exact body copy) before firing; same disable/refetch pattern on confirm
- [ ] `ARCHITECTURE.md`: `documents.status` shows 6 values; `source_document_id` row added; mark-won/mark-lost in API table; pilot event set updated

---

## Verification

```bash
make backend-verify
make frontend-verify
```

Manual:
1. Share a quote → `shared` badge; Mark as Won/Lost buttons visible
2. Press Mark as Won → `approved` badge with `check_circle`; action buttons gone
3. Press Mark as Lost on a `shared` quote → confirm modal → confirm → `declined` badge
4. Attempt Mark as Won on a `draft`/`ready` quote → 409
5. Attempt Mark as Won on an already-`approved` quote → 409
6. Edit a `shared` quote → 409
7. Regenerate PDF on a `viewed` quote → status stays `viewed`
8. Check `event_logs` table directly — `quote_approved` and `quote_marked_lost` rows present
