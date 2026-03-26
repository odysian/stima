# Pre-V1 Quote Title Field

## Problem Framing

### Goal
Add an optional short `title` to quotes so contractors can identify jobs by name across
review, list, preview, PDF, and future V1 email/public document flows.

### Non-Goals
- No invoice implementation yet
- No public landing page implementation yet
- No V1 status expansion in this task
- No forced backfill of titles for existing quotes

### Constraints
- This is a backend-coupled change: schema, API responses, frontend types, and PDF output
  must stay aligned
- Existing quotes without a title must continue working exactly as before
- The task should prepare V1 surfaces without prematurely implementing V1 behaviors

## Current Code Context

- `documents` currently has no `title` column in
  `backend/app/features/quotes/models.py`.
- Quote create/update/list/detail schemas currently do not expose `title` in
  `backend/app/features/quotes/schemas.py` and
  `frontend/src/features/quotes/types/quote.types.ts`.
- The review screen creates quotes without a title in
  `frontend/src/features/quotes/components/ReviewScreen.tsx`.
- Quote list and customer quote history currently use `doc_number` as the primary label in
  `frontend/src/features/quotes/components/QuoteList.tsx` and
  `frontend/src/features/customers/components/QuoteHistoryList.tsx`.
- The PDF template has no title slot in `backend/app/templates/quote.html`.

## Proposed Implementation Plan

1. Add a nullable `title` column to `documents` with a new Alembic migration and thread it
   through SQLAlchemy models, schemas, repository rows, and frontend quote types.
2. Extend quote create/update flows so review/edit screens can save an optional title and
   existing quotes can omit it safely.
3. Update quote list, customer quote history, and quote preview/detail surfaces so title is
   the primary label when present and `doc_number` becomes supporting metadata.
4. Render title in the quote PDF and cover the new behavior with backend and frontend tests.

## Risks And Edge Cases

- Nullable-title handling must stay consistent across create, update, list, and detail
  responses.
- Search behavior should be decided explicitly if titles appear in the list but are not
  searchable yet.
- PDF layout needs a graceful fallback when title is blank.
- If quote update remains locked after sharing, title editing must follow the current quote
  edit rules rather than silently introducing an exception.

## Decision Locks

- `title` is nullable and optional in both API requests and stored documents.
- Existing quotes are not backfilled.
- When `title` is present, it becomes the primary label in list/history/detail UI.
- When `title` is absent, all current displays fall back to `doc_number` behavior.

## Acceptance Criteria Draft

- A nullable `title` column exists on `documents`.
- Quote create and update payloads accept an optional `title`.
- Quote list and customer quote history show `title` as the primary label when present and
  keep `doc_number` visible as supporting metadata.
- Quote preview/detail shows the title below or alongside the document number when present.
- Quotes without a title display and function exactly as before.
- Generated quote PDFs render the title when present and fall back cleanly when absent.
- Tests cover at least one create/update path, one list/history display path, and one PDF
  rendering path.

## Verification Plan

```bash
make backend-verify
make frontend-verify
```

Targeted test focus:
- `backend/app/features/quotes/tests/*`
- `frontend/src/features/quotes/tests/QuoteList.test.tsx`
- `frontend/src/features/quotes/tests/ReviewScreen.test.tsx`
- `frontend/src/features/customers/tests/QuoteHistoryList.test.tsx`

## Recommended Task Issue Body

```md
## Summary

Add an optional short `title` field to quotes so contractors can identify jobs by name
instead of only by document number, and propagate it through the current V0 quote flows.

## Goal

Land the quote title foundation before V1 so public docs, email, and invoice conversion
can build on a stable contract.

## Non-Goals

- No invoice implementation
- No V1 public document route
- No required title/backfill for existing quotes

## Decision Locks

- `title` is nullable on `documents`
- Existing quotes remain valid with `title = null`
- UI falls back to current `doc_number` behavior when no title exists

## Scope

- New Alembic migration for nullable `documents.title`
- Update quote model, schemas, repository/service rows, and frontend types
- Add optional title input to the review/edit flow
- Show title in quote list, customer quote history, and quote preview/detail
- Render title in the quote PDF template

## Risks / Edge Cases

- Null/blank title normalization
- Display fallback for existing quotes
- Search behavior if titles are shown but not yet indexed in the list filter
- Keeping create/update/list/detail contracts aligned across backend and frontend

## Acceptance Criteria

- Nullable `title` column added to `documents`
- Quote create/update requests accept optional `title`
- Quote list and customer quote history show title as primary label when present
- Quote preview/detail renders title when present
- Quotes without titles behave exactly as before
- PDF renders title when present and falls back cleanly when absent
- Tests cover API/schema and UI display behavior

## Verification

```bash
make backend-verify
make frontend-verify
```

## Files In Scope

- `backend/alembic/versions/*`
- `backend/app/features/quotes/models.py`
- `backend/app/features/quotes/schemas.py`
- `backend/app/features/quotes/service.py`
- `backend/app/features/quotes/repository.py`
- `backend/app/templates/quote.html`
- `frontend/src/features/quotes/types/quote.types.ts`
- `frontend/src/features/quotes/components/ReviewScreen.tsx`
- `frontend/src/features/quotes/components/QuoteList.tsx`
- `frontend/src/features/quotes/components/QuotePreview.tsx`
- `frontend/src/features/customers/components/QuoteHistoryList.tsx`
- related tests
```

## Suggested `gh` Command

```bash
gh issue create \
  --title "Pre-V1 polish: add optional quote title field" \
  --label "type:task" \
  --label "area:quotes" \
  --label "area:frontend" \
  --label "area:database" \
  --body-file plans/2026-03-26/issue-pre-v1-quote-title-field.md
```
