# Task — PR 4: Append behavior + hidden-item lifecycle

**Parent:** [`spec-v2-extraction.md`](./spec-v2-extraction.md).

**PR slot:** PR 4 — Append safety, append suggestions, deterministic hidden IDs, lifecycle persistence.

## GitHub labels (Task issue)

When filing this Task issue, apply (`docs/ISSUES_WORKFLOW.md`):

- `type:task`
- `area:quotes`
- `area:backend`
- `area:frontend`

---

## 1. Goal

Implement **conservative append**: never overwrite populated notes/pricing; store **append suggestions** in sidecar hidden details when blocked. Persist **reviewed/dismissed** state for hidden items. Expose a narrow **PATCH** endpoint for sidecar-only mutations. Preserve **line-item total recomputation** on append while protecting **`total_amount`** from pricing-hint overwrite when already populated.

---

## 2. In scope

**Append rules**

- **Populated means protected** for notes and pricing fields (no distinction AI-seeded vs user-curated for overwrite).
- **Line-item merge + subtotal recompute** preserved: appending line items still drives total recalculation from priced line items as today.
- **`pricing_hints.explicit_total` on append:** if `total_amount` already populated → **append suggestion** (hidden), not overwrite. If `total_amount` null/empty → may seed from subtotal or explicit total per same rules as initial extract (parent §Append).
- Append suggestions vs **unresolved** segments: distinct semantics and grouping in hidden details.

**Hidden items**

- **Backend-owned deterministic IDs** for hidden items (kind + normalized content + subtype); IDs returned in API; frontend does not synthesize IDs.
- **Parallel `hidden_detail_state` map** for reviewed/dismissed; UI renders from **current** hidden item lists, not lifecycle map alone.
- **Same-batch dedupe**; **resurfacing** when genuinely new append output reintroduces content.
- Unresolved leftovers: read-only, no auto-clear from destination edits; operator reviewed/dismissed flows per parent.

**API**

- **`PATCH /api/quotes/{id}/extraction-review-metadata`** with body per parent (`dismiss_hidden_item`, `review_hidden_item`, `clear_review_state` for notes/pricing pending).
- Endpoint mutates **only** the JSONB column, not arbitrary document fields.
- **`PATCH /api/quotes/{id}`** (normal quote update): server-side side effect to clear related append suggestions and review state when **actual value changes** occur on notes/pricing fields (focus/blur does not count; programmatic hydration does not count) per parent **Review-state clearing rule**.

**Clearing / UX**

- Manual edits clear related append suggestions (server-side).
- Dismissed append suggestions: no extra lifecycle requirement on manual edit beyond parent notes.

---

## 3. Out of scope

- One-click **apply** actions for append suggestions (explicit non-goal Phase 1).
- New extraction metadata **table** (sidecar only).
- Eval/golden matrix expansion (PR 5).

---

## 4. Dependencies / ordering

- **Requires** PR 2 (sidecar schema, V2 extract seeding) and **PR 3** (Capture Details UI to surface hidden items and mutations in product).

---

## 5. Acceptance criteria

(from parent spec — PR 4)

- Append never overwrites populated notes/pricing.
- Line-item total recomputation continues on append; populated `total_amount` protected from pricing-hint overwrite.
- Append suggestions persist as hidden items.
- Manual field edits clear related append suggestions (server-side on quote PATCH).
- Unresolved leftovers do not auto-clear from field edits.
- Reviewed/dismissed state persists via extraction-review-metadata PATCH.
- Same-batch dedupe and later-append resurfacing behave correctly.

---

## 6. First test / assertion

Pick **one** of the following as the first automated lock:

1. **Append non-overwrite:** integration test — document with populated `notes` (or another protected pricing field) receives append extraction; assert field value unchanged and an append suggestion (or equivalent hidden detail) is recorded in `extraction_review_metadata` rather than an in-place overwrite.
2. **Sidecar PATCH:** API test — `PATCH /api/quotes/{id}/extraction-review-metadata` with `dismiss_hidden_item` or `review_hidden_item` updates only the JSONB column and persists lifecycle state; subsequent GET detail reflects the change.
3. **Deterministic IDs:** unit test — same hidden payload content yields the same hidden item id; distinct content yields distinct ids (stability for dedupe).

---

## 7. Verification

Run from repo root (`docs/workflow/VERIFY.md`, `Makefile`).

**Tier 1 — targeted:**

```bash
cd backend && .venv/bin/ruff check . --cache-dir .ruff_cache && .venv/bin/ruff format --check .
cd backend && .venv/bin/pytest app/features/quotes/tests/test_quote_append_extraction.py app/features/quotes/tests/test_extraction.py app/features/quotes/tests/test_extraction_service.py -v -m "not live and not extraction_eval and not extraction_quality" -o cache_dir=.pytest_cache
cd frontend && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint src/features/quotes && ./node_modules/.bin/vitest run src/features/quotes
```

**Tier 3 — final gate:**

```bash
make verify
```

**Coverage intent (PR 4):** extend tests for append merge + line-item total recompute vs populated `total_amount` protection, quote PATCH clearing related append suggestions on real field edits, hidden-item lifecycle via the new PATCH route, and frontend Capture Details interactions for dismiss/review.

---

## 8. Implementation notes

- **Transcript** append merge behavior stays consistent with product expectations; suggestions are for blocked **notes/pricing** placements.
- Stale lifecycle keys in `hidden_detail_state` may remain for Phase 1; UI must not list items solely from stale map entries.
