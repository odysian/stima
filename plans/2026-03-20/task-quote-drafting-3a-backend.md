# Task: Quote Drafting 3A — Backend: Extraction + Quote CRUD

## Goal

Wire the extraction integration (Claude structured output) into `POST /api/quotes/convert-notes`,
implement `documents` + `line_items` migrations, and deliver all five quote endpoints. This is the
backend half of the gated Task 3 spec. Its DoD gate unlocks Task 3B.

## Parent Spec / Roadmap Reference

Spec: Quote Drafting (V0 Task 3) — `docs/V0_ROADMAP.md` § Task 3A

Decision locks live in the Spec issue — do not re-open them here.

**Depends on:** Task 2 (customers exist, `customer_id` available) — complete

---

## Scope

**In:**
- `ANTHROPIC_API_KEY` + `EXTRACTION_MODEL` fields added to `Settings` in `config.py`
- Implement `integrations/extraction.py`: Claude structured output call, `ExtractionResult` pydantic model
- Migration: `documents` table (with `doc_sequence`, `doc_number`, `QuoteStatus` enum, `source_type`, `transcript`, `total_amount`, `notes`, `pdf_url NULL`, `shared_at NULL`)
- Migration: `line_items` table
- `Document` + `LineItem` SQLAlchemy 2.0 models; `QuoteStatus` StrEnum
- Register both models in `backend/app/features/registry.py`
- Endpoint: `POST /api/quotes/convert-notes` — stateless extraction, CSRF required, returns `ExtractionResult`
- Endpoint: `POST /api/quotes` — create quote from draft data, generates `doc_sequence` + `doc_number`, sets `status = 'draft'`
- Endpoint: `GET /api/quotes` — list for authenticated user, ordered `created_at DESC`
- Endpoint: `GET /api/quotes/:id` — detail with line items
- Endpoint: `PATCH /api/quotes/:id` — full line item replacement + `total_amount` / `notes` update
- Wire quote router into `main.py` under `/api` prefix
- `get_quote_service` dependency in `shared/dependencies.py`
- `backend/app/features/quotes/tests/fixtures/transcripts.py` — all six transcript fixtures
- `tests/test_extraction.py` — extraction tests against all six fixtures (mocked Claude)
- `tests/test_quotes.py` — CRUD happy path + auth isolation
- `docs/ARCHITECTURE.md` — add `documents` schema, `line_items` schema, quote endpoint contracts, `ExtractionResult` shape

**Out:**
- `POST /api/quotes/:id/pdf` (Task 4)
- `POST /api/quotes/:id/share` (Task 4)
- Audio/transcription integrations (Task 5)
- Any frontend changes

---

## File Targets

| File | Action | Purpose |
|---|---|---|
| `backend/app/core/config.py` | Modify | Add `anthropic_api_key`, `extraction_model` to `Settings` |
| `backend/app/integrations/extraction.py` | Implement (from stub) | Claude structured output call + `ExtractionResult` pydantic model |
| `backend/alembic/versions/<new>.py` | Create | `documents` + `line_items` migration |
| `backend/app/features/quotes/models.py` | Implement (from stub) | `Document`, `LineItem` models; `QuoteStatus` StrEnum |
| `backend/app/features/quotes/schemas.py` | Implement (from stub) | `ExtractionResult`, `LineItemDraft`, `QuoteCreateRequest`, `QuoteUpdateRequest`, `QuoteResponse`, `LineItemResponse` |
| `backend/app/features/quotes/repository.py` | Implement (from stub) | `list_by_user`, `get_by_id`, `create`, `update` (line item replacement) |
| `backend/app/features/quotes/service.py` | Implement (from stub) | `QuoteService` — orchestration, `doc_sequence` generation, ownership enforcement |
| `backend/app/features/quotes/api.py` | Implement (from stub) | 5 endpoints with auth/CSRF dependencies |
| `backend/app/shared/dependencies.py` | Modify | Add `get_quote_service` |
| `backend/app/main.py` | Modify | Include quote router under `/api` prefix |
| `backend/app/features/registry.py` | Modify | Import `Document`, `LineItem` models |
| `backend/app/features/quotes/tests/fixtures/transcripts.py` | Implement (from stub) | Six transcript fixtures |
| `backend/app/features/quotes/tests/test_extraction.py` | Implement (from stub) | Extraction tests (mocked Claude) |
| `backend/app/features/quotes/tests/test_quotes.py` | Implement (from stub) | Quote CRUD + auth isolation tests |
| `docs/ARCHITECTURE.md` | Modify | Schema tables, endpoint contracts, ExtractionResult shape |

---

## Architecture Detail

### Config additions (`config.py`)

```python
anthropic_api_key: str = Field(
    default="",
    validation_alias="ANTHROPIC_API_KEY",
)
extraction_model: str = Field(
    default="claude-haiku-4-5-20251001",
    validation_alias="EXTRACTION_MODEL",
)
```

`.env` sets `EXTRACTION_MODEL=claude-sonnet-4-6` for real dev use.
Tests mock the Claude client entirely — model choice is irrelevant in CI.

### `ExtractionResult` schema

```python
class LineItemDraft(BaseModel):
    description: str
    details: str | None = None
    price: Decimal | None = None  # None = not stated, never zero-filled

class ExtractionResult(BaseModel):
    transcript: str
    line_items: list[LineItemDraft]  # never None, may be empty
    total: Decimal | None = None
    confidence_notes: list[str] = []
```

### `extraction.py` integration

Uses Claude tool use / structured output. Tool schema mirrors `ExtractionResult`. On API
error or JSON schema mismatch: raise a typed `ExtractionError` caught in the route and
returned as `422 { detail: "Extraction failed: ..." }`. Never propagate as 500.

### `documents` table

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users | indexed, cascade delete |
| customer_id | UUID FK → customers | indexed |
| doc_type | VARCHAR(20) | default `'quote'` |
| doc_sequence | INTEGER | per-user sequence counter |
| doc_number | VARCHAR(20) | `Q-001` format, set at create time |
| status | VARCHAR(20) | `QuoteStatus` CHECK constraint, default `'draft'` |
| source_type | VARCHAR(20) | `'text'` or `'audio'` |
| transcript | TEXT | raw input text |
| total_amount | NUMERIC(10,2) | nullable, user-controlled |
| notes | TEXT | nullable, customer-facing notes |
| pdf_url | TEXT | nullable (Task 4) |
| shared_at | TIMESTAMPTZ | nullable (Task 4) |
| created_at, updated_at | TIMESTAMPTZ | server defaults |

Unique constraint: `(user_id, doc_sequence)`.

### `line_items` table

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| document_id | UUID FK → documents | indexed, cascade delete |
| description | TEXT | required |
| details | TEXT | nullable |
| price | NUMERIC(10,2) | nullable — null means not stated |
| sort_order | INTEGER | default 0 |
| created_at, updated_at | TIMESTAMPTZ | server defaults |

### `doc_sequence` generation

```python
# In the repository, within the same transaction:
seq = await session.scalar(
    select(func.coalesce(func.max(Document.doc_sequence), 0) + 1)
    .where(Document.user_id == user_id)
)
doc = Document(doc_sequence=seq, doc_number=f"Q-{seq:03d}", ...)
session.add(doc)
# UNIQUE(user_id, doc_sequence) constraint catches any race.
# Service catches IntegrityError and retries once.
```

### `PATCH /api/quotes/:id` line item strategy

If `line_items` is present in the request body: delete all existing `LineItem` rows for
the document, then bulk-insert the new array. If `line_items` is absent: leave them untouched.
`total_amount` and `notes` update independently.

### Endpoints

```
POST /api/quotes/convert-notes   Depends(get_current_user), Depends(require_csrf) → ExtractionResult
POST /api/quotes                 Depends(get_current_user), Depends(require_csrf) → 201 QuoteResponse
GET  /api/quotes                 Depends(get_current_user) → list[QuoteResponse]
GET  /api/quotes/{id}            Depends(get_current_user) → QuoteResponse
PATCH /api/quotes/{id}           Depends(get_current_user), Depends(require_csrf) → QuoteResponse
```

### Transcript fixtures (`fixtures/transcripts.py`)

All six from the setup doc:
- `clean_with_total` — clean line items with explicit total
- `clean_no_prices` — clean line items, no prices stated
- `total_only` — total stated, no individual prices
- `partial_ambiguous` — some prices stated, some missing
- `noisy_with_hesitation` — spoken hesitation markers ("um", "uh")
- `no_pricing_at_all` — no prices, no total

### Extraction test requirements (`test_extraction.py`)

Each test mocks the Claude client and asserts on `ExtractionResult` output:
1. Null pricing: no zero-fill, no invented prices — `price` is `None`
2. Total-only input: `total` preserved, all `line_items[].price` are `None`
3. Ambiguous input: returns a result (non-empty `line_items`), does not raise
4. Malformed/partial JSON from Claude: caught, surfaced as `ExtractionError`, not 500
5. All six fixtures exercised — at minimum one meaningful assertion per fixture

### Quote CRUD test requirements (`test_quotes.py`)

**Happy path:**
1. `POST /api/quotes/convert-notes` returns `ExtractionResult` with correct shape
2. `POST /api/quotes` creates quote, returns `QuoteResponse` with `doc_number` in `Q-001` format, `status = 'draft'`
3. `GET /api/quotes` returns empty list for new user; grows after creation; ordered by `created_at DESC`
4. `GET /api/quotes/:id` returns quote with nested line items
5. `PATCH /api/quotes/:id` full line item replacement works; `total_amount` and `notes` update

**Auth and scoping:**
6. All endpoints unauthenticated → 401
7. `POST /api/quotes/convert-notes` missing CSRF → 403
8. `POST /api/quotes` missing CSRF → 403
9. `PATCH /api/quotes/:id` missing CSRF → 403
10. `GET /api/quotes/:id` for another user's quote → 404
11. `PATCH /api/quotes/:id` for another user's quote → 404

---

## Acceptance Criteria

- [ ] `ANTHROPIC_API_KEY` + `EXTRACTION_MODEL` load from env via `Settings`
- [ ] `alembic upgrade head` clean with `documents` + `line_items` tables present
- [ ] `Document` + `LineItem` registered in `registry.py`
- [ ] `UNIQUE(user_id, doc_sequence)` constraint present in migration
- [ ] `POST /api/quotes/convert-notes` returns `ExtractionResult` with locked schema (flat, no envelope)
- [ ] Null prices never zero-filled — `price: null` in output when not stated in transcript
- [ ] Malformed Claude response returns `422`, not `500`
- [ ] `POST /api/quotes` generates `Q-{n:03d}` format `doc_number`, sets `status = 'draft'`
- [ ] All five endpoints enforce `get_current_user`; three mutating endpoints enforce `require_csrf`
- [ ] Quote data scoped to authenticated user — cross-user access returns `404` (not `403`)
- [ ] `PATCH` with `line_items` array replaces all existing items for the document
- [ ] All six transcript fixtures present in `fixtures/transcripts.py`
- [ ] All extraction tests pass (mocked Claude, no real API calls)
- [ ] `docs/ARCHITECTURE.md` updated: `documents` table, `line_items` table, quote endpoint contracts, `ExtractionResult` schema
- [ ] `make backend-verify` passes

## DoD Gate for Task 3B

`POST /api/quotes/convert-notes` returns a validated `ExtractionResult` with the locked schema.
All extraction tests pass. Schema documented in `docs/ARCHITECTURE.md`.

## Verification

```bash
make backend-verify
```

Fallback:
```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest
```
