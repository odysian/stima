# Spec: Quote Drafting (V0 Task 3)

## Goal

Build the quote drafting pipeline end-to-end: extract structured line items from typed notes
via Claude, create and persist a quote, and give the user a review screen to edit the draft
before confirming. This is a gated spec — 3A (backend) must reach its DoD gate before
3B (frontend) begins.

## Parent Spec / Roadmap Reference

`docs/V0_ROADMAP.md` — Task 3 — Quote Drafting (Gated Spec)

---

## Decision Locks (resolved in whiteboard — do not re-open)

| # | Decision | Rationale |
|---|---|---|
| 1 | `ExtractionResult` is flat (not enveloped) | Consistent with all other API responses. No pagination or top-level metadata needed. `confidence_notes` handles ambiguity inline. |
| 2 | `confidence_notes: string[]` — array of strings | Composable; multiple uncertainty notes are possible from a single transcript. |
| 3 | `total: number \| null` on extraction result | `null` means "not stated in transcript", not zero. Decimal as number on the wire is fine for V0 amounts. |
| 4 | `line_items` is never null — always an array (may be empty) | Simplifies frontend null checks. Empty array = no items extracted. |
| 5 | Drop `subtotal` column from `documents` | With an independently editable `total_amount`, a `subtotal` column creates a second source of truth with no clear update trigger. ReviewScreen computes line item sum client-side for display only. |
| 6 | `doc_sequence INTEGER` + `UNIQUE(user_id, doc_sequence)` for quote numbering | Separates the authoritative integer from the display string. `MAX(doc_sequence) + 1` in the same transaction + unique constraint + one retry on collision. Cleaner than parsing `Q-001` VARCHAR. |
| 7 | `doc_number VARCHAR` stored at write time, derived as `Q-{doc_sequence:03d}` | Simplifies queries and PDF rendering — no format derivation at read time. |
| 8 | Full `QuoteStatus` enum in migration now: `draft \| ready \| shared` | Task 4 needs `ready` and `shared`. Defining all three in 3A avoids an ALTER TABLE migration in Task 4. |
| 9 | `native_enum=False` for `QuoteStatus` in SQLAlchemy | Stores as VARCHAR + CHECK constraint. Adding values later requires only a Python change + migration, not `ALTER TYPE`. |
| 10 | Draft state persists via `sessionStorage`-backed `useQuoteDraft` hook | Survives page refresh within the same tab (lost on tab close — correct scope for a draft). Cleared on new quote flow start and after `POST /api/quotes` succeeds. |
| 11 | CSRF required on `POST /api/quotes/convert-notes` | Per cross-cutting rule: all POSTs use `require_csrf`. Stateless-but-POST endpoints are not exempt. |
| 12 | Structured outputs (Claude JSON mode / tool use) for extraction | Schema-validated at the API boundary. Handles malformed-response case cleanly without fragile `json.loads` + ad-hoc parsing. |
| 13 | `EXTRACTION_MODEL` env var, defaults to `claude-haiku-4-5-20251001` | Automated tests mock Claude entirely (no cost). The env var controls real calls. `.env` sets `claude-sonnet-4-6` for manual/dev use. Default Haiku protects cost for fresh clones. |
| 14 | `notes TEXT` surfaced as textarea on ReviewScreen, renders on PDF | Customer-facing message field. Present in schema and UI from Task 3. |
| 15 | `PATCH /api/quotes/:id` uses full line item replacement | ReviewScreen always holds full state. Send whole array; server deletes existing items and re-inserts. No per-item CRUD endpoints needed in V0. |
| 16 | `source_type` hardcoded to `"text"` in 3A endpoints | Task 5 will write `"audio"`. No enum needed — string constant in the route handler. |

---

## Child Tasks

- [ ] Task 3A — Backend: Extraction + Quote CRUD (`area:backend`)
- [ ] Task 3B — Frontend: CaptureScreen + ReviewScreen (`area:frontend`) — **blocked on Task 3A DoD gate**

### Task 3A DoD Gate (required before 3B begins)

`POST /api/quotes/convert-notes` returns a validated `ExtractionResult` with the locked schema.
All six transcript fixture tests pass. Schema documented in `docs/ARCHITECTURE.md`.

---

## Out of Scope for This Spec

- PDF generation and preview (Task 4)
- Voice capture (Task 5)
- Quote list / home screen (Task 6)
- Settings screen (Task 7)
