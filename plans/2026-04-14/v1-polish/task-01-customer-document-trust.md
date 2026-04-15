# Task 01: Customer-facing document trust pass (V1 polish)

Parent spec: [#385](https://github.com/odysian/stima/issues/385) · Canonical markdown: `plans/2026-04-14/spec-v1-polish.md` · This Task: [#386](https://github.com/odysian/stima/issues/386).

## Summary
Deliver Phase 1 of the V1 polish spec: improve trust and readability on the **shared public document page** (quotes and invoices via `PublicQuotePage`) and on **PDF output** from the shared `quote.html` template, without changing share tokens, lifecycle, or API contracts.

## Scope
**In scope**
- PDF (`quote.html`): larger bounded logo; multiline customer address; compact **Prepared By** block; **quote-only** bottom acceptance area (`Accepted By`, `Date`). **Render that acceptance block only when** `doc_label == "Quote"`; invoice contexts use `doc_label="Invoice"` and omit it (single shared template).
- Frontend: **`PublicQuotePage.tsx`** only — layout (line items before pricing breakdown) and hero/logo thumbnail polish for mobile and desktop. No other routes or authenticated quotes UI in this Task.

**Out of scope**
- Phase 2 (auth) and Phase 3 (favicon / loading shell) — separate Task issues.
- Backend API, schema, share semantics, extraction, invoice **route** behavior changes.
- Persisted acceptance / signature state; customer approve/decline actions.
- Contractor-facing quote/invoice preview, list, or settings pages (public share + PDF only).

## Decision locks (confirm parent spec locks before merge)
- [ ] Polish-only — no migration, no new routes, no document-status contract change.
- [ ] Public page remains read-only and token-gated.
- [ ] PDF signature block is presentational and **quote-only** (`doc_label` quote path); invoice PDFs omit it.
- [ ] Multiline address uses stored customer address only (no new columns / schema).

## Acceptance criteria
- [ ] Public document loads from existing token-gated route; no auth or payload contract changes.
- [ ] Top customer/summary stays above the fold; **line items render before** subtotal / discount / tax / total (quotes **and** invoices on `PublicQuotePage`).
- [ ] Hero/logo reads cleanly on narrow and wide viewports; long/wide logos stay bounded.
- [ ] PDF logo is visibly larger than baseline with safe max bounds; header does not break for long business names.
- [ ] Multiline `customer_address` preserves line breaks in PDF output.
- [ ] **Prepared By** on PDF: business name if set, else owner name; then phone and/or email lines; omit empties.
- [ ] Quote PDFs show acceptance area with `Accepted By` and `Date`; invoice PDFs do not.
- [ ] **Regression tests:** extend `test_pdf_template.py` with a paired check in the existing HTML-capture style — quote render includes acceptance-area copy (e.g. `Accepted By`); invoice render (`doc_label="Invoice"`) does **not**.
- [ ] Download PDF and public read-only behavior unchanged from user perspective.

## Implementation notes
- Implement the acceptance block with stable, assertable copy (e.g. literal `Accepted By` / `Date` labels) so template tests can grep or substring-match captured HTML without brittle layout coupling.

## Files (expected)
- `backend/app/templates/quote.html`
- `backend/app/features/quotes/tests/test_pdf_template.py`
- `backend/app/integrations/pdf.py` (only if strictly needed)
- `frontend/src/features/public/components/PublicQuotePage.tsx`
- `frontend/src/features/public/tests/PublicQuotePage.test.tsx`

## Verification (Tier 1)
```bash
cd backend && .venv/bin/pytest app/features/quotes/tests/test_pdf_template.py
cd frontend && npx vitest run src/features/public/tests/PublicQuotePage.test.tsx
```

Tier 3 gate before merge: `make backend-verify` and `make frontend-verify` for touched scope.

## PR
- Branch: `task-386-v1-polish-document-trust` (or equivalent slug).
- PR body references spec **#385**; use `Closes #386` in the PR description so merging closes this Task (not the Spec).
