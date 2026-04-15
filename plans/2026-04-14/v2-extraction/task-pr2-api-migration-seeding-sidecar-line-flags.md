# Task — PR 2: V2 API migration, initial extract seeding, sidecar, line-item flags

**Parent:** [`spec-v2-extraction.md`](./spec-v2-extraction.md).

**PR slot:** PR 2 — V2 API/persistence migration + direct seeding + JSON sidecar (**no append overwrite behavior yet**).

## GitHub labels (Task issue)

When filing this Task issue, apply (`docs/ISSUES_WORKFLOW.md`):

- `type:task`
- `area:quotes`
- `area:database`
- `area:frontend`

---

## 1. Goal

Switch extraction API responses and persistence from V1 to **V2** in one coordinated window: backend schemas, worker persistence, **and** frontend types/services. Add sidecar storage and **net-new** direct seeding of notes/pricing into real draft fields when rules allow. Close the **line-item flag persistence gap** with DB columns.

---

## 2. In scope

**Backend / data**

- Alembic migration: nullable JSONB **`extraction_review_metadata`** on `documents` (default `NULL`).
- Replace V1 extraction result with **V2** in extract/append API responses (shape per parent `ExtractionResultV2`).
- **Direct seeding** when Phase 1 rules permit: `notes`, `tax_rate`, `discount_type`, `discount_value`, `deposit_amount`, `total_amount` (from `pricing_hints.explicit_total` as document total per parent), `line_items` — replacing current behavior that leaves notes/pricing null on create.
- **Sidecar persistence** with grouped review state, seeded-field provenance, minimal hidden structure per **`ExtractionReviewMetadataV1`** in parent spec (initial population from extraction result).
- **`pipeline_version`** in sidecar JSON only (not a new top-level Document column). Existing `extraction_tier` / `extraction_degraded_reason_code` columns unchanged.
- **`line_items` table:** add **`flagged`** (boolean, default false) and **`flag_reason`** (nullable string); thread through `LineItemDraft` / persistence / API responses.
- **Backward compatibility:** `NULL` sidecar → safe defaults (`notes_pending`/`pricing_pending` false, empty hidden details).

**Frontend (same PR / deployment window)**

- Update **`ExtractionResult`** (or renamed) in `quote.types.ts` and extraction/append methods in **`quoteService.ts`** in lockstep with backend.
- **Minimal draft hydration change:** after sync/async V2 extract completes, **fetch `QuoteDetail`** and reseed the review draft from persisted document fields **and** sidecar — not from extraction response alone for notes/pricing/review state. (Data-flow change; review form layout unchanged in PR 2 per parent.)

**Explicit total / tax representation**

- Map `pricing_hints.explicit_total` to persisted **`total_amount`** as document total; tax as decimal (e.g. 8% → `0.08`) per parent.

---

## 3. Out of scope

- **`PATCH /api/quotes/{id}/extraction-review-metadata`** and append suggestion lifecycle (PR 4).
- **Review UI** simplification, Capture Details modal, removing `reviewConfidenceNotes` localStorage (PR 3).
- **Append** populated-field protection and append suggestions (PR 4).
- Eval/golden expansion beyond what is needed to lock PR 2 behavior (PR 5).

---

## 4. Dependencies / ordering

- **Requires** PR 1 complete (internal V2 contract, segmentation, guards).
- **Blocks** PR 3 (UI reads sidecar from detail) and PR 4 (append + lifecycle endpoint).

---

## 5. Acceptance criteria

(from parent spec — PR 2)

- V2 extraction result replaces V1 in API responses.
- Frontend types and service layer updated in lockstep.
- `extraction_review_metadata` JSONB column added.
- Notes/pricing seed into real fields when allowed by rules.
- Sidecar persists grouped review state and minimal provenance.
- Transcript persists as product data.
- `flagged` / `flag_reason` on `line_items`; flags survive reseed and appear in API.
- Existing documents with `NULL` sidecar load safely with defaults.
- Review draft seeded from persisted document + sidecar after extract, not from extraction response alone.
- **No** append overwrite behavior for notes/pricing introduced in this PR.

---

## 6. First test / assertion

Pick **one** of the following as the first automated lock:

1. **API contract:** an integration or API test that performs extract (sync or async completion path used in CI) and asserts the response body matches `ExtractionResultV2` (including `pipeline_version: "v2"`, `pricing_hints`, no top-level legacy `total` field) while a control document still deserializes with `extraction_review_metadata: null` defaults.
2. **Sidecar defaults:** a test that loads a document row with `extraction_review_metadata IS NULL` through the quote-detail serializer/handler and asserts `notes_pending` / `pricing_pending` are false and hidden collections are empty.
3. **Line-item flags:** a test that persists an extracted line item with `flagged=True` and non-null `flag_reason`, reloads the quote, and asserts the API returns the same flags (closes the PR-2 persistence gap explicitly).

---

## 7. Verification

Run from repo root (`docs/workflow/VERIFY.md`, `Makefile`).

**Tier 1 — targeted:**

```bash
cd backend && .venv/bin/ruff check . --cache-dir .ruff_cache && .venv/bin/ruff format --check .
cd backend && .venv/bin/pytest app/features/quotes/tests/test_extraction.py app/features/quotes/tests/test_extraction_service.py app/features/quotes/tests/test_quote_extraction.py app/features/quotes/tests/test_quote_append_extraction.py -v -m "not live and not extraction_eval and not extraction_quality" -o cache_dir=.pytest_cache
cd frontend && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint src/features/quotes && ./node_modules/.bin/vitest run src/features/quotes
```

**Tier 3 — final gate:**

```bash
make verify
```

**Note:** `make verify` runs `backend-verify` and `frontend-verify` (see root `Makefile`). Use `make backend-verify` or `make frontend-verify` alone only when iterating one side after the other is already green.

---

## 8. Implementation notes

- **Risk 6:** backend + frontend must switch together; no mixed V1 frontend / V2 API.
- Quote **list** responses do not include `extraction_review_metadata` (detail only) per parent.
