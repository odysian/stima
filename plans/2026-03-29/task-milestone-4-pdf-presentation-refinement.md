## Summary

Upgrade the quote PDF template to produce a client-ready document: embed Inter, promote title to a standalone headline, collapse line items to a two-column layout, visually separate the total block, refine the notes section, add contractor phone/email to the header, and extend `QuoteRenderContext` to supply those fields to both the authenticated and public PDF routes. No schema migration required.

**Plan reference:** `plans/2026-03-29/milestone-4-pdf-presentation-refinement.md`
**Roadmap reference:** `docs/V1_ROADMAP.md` — Milestone 4

---

## Decision Locks

### Font: embed Inter (Option A); fall back to system stack only on confirmed render failure
`Inter-Regular.woff2` and `Inter-Bold.woff2` go in `backend/app/templates/` and are loaded via `@font-face`. WeasyPrint resolves them via the `base_url` already set in `PdfIntegration.render()`. Switch to Option B (Noto Sans → Ubuntu → DejaVu Sans → Arial) only if WeasyPrint cannot resolve the WOFF2 assets during rendering — do not pre-emptively fall back.

### Line items collapse to 2-column: Description+Details | Price
Replace the fixed 3-column (Description | Details | Price) layout with a 2-column layout. When `details` is present it renders on a second line within the description cell (smaller, muted). When absent, only the description shows — no empty column gap. This is not configurable per-item.

### Total rendered as a standalone block outside the line-items table
Close the `<table>` after the last item row. Render the total as a separate right-aligned block below with a `border-top` separator and `font-weight: 700`. This establishes the right-aligned label/value structure that M7 (discounts, deposits, tax) will extend without a rewrite.

### `contractor_email` maps to `users.email` (login email)
No new column. The existing `users.email` field is the contractor's contact email on the PDF. No `business_email` column is introduced.

### Both context queries updated atomically
`get_render_context` and `get_render_context_by_token` are updated in the same change. Patching one without the other would silently drop phone/email from the public PDF route.

### Do not modify `PdfIntegration`
All improvements come from the template. `backend/app/integrations/pdf.py` is not touched unless a confirmed blocking issue arises.

---

## Scope

### New files
- `backend/app/templates/Inter-Regular.woff2`
- `backend/app/templates/Inter-Bold.woff2`

### Modified files
- `backend/app/templates/quote.html` — all layout, typography, and CSS changes
- `backend/app/features/quotes/repository.py` — add `phone_number: str | None` and `contractor_email: str | None` to `QuoteRenderContext`; update `get_render_context` and `get_render_context_by_token` queries
- `backend/app/features/quotes/tests/test_pdf_template.py` — update fixtures; add assertions for new layout and conditional rendering
- `backend/app/features/quotes/tests/test_pdf.py` — update fixtures; add sparse-quote test case; add stub test for token-based render path

---

## Acceptance Criteria

- [ ] PDF renders correctly for quotes with and without a logo
- [ ] PDF renders correctly for quotes without a title (no blank headline gap, no `QUOTE TITLE` label)
- [ ] PDF renders correctly for sparse quotes: no customer contact, no notes, no item details, null total, null owner name
- [ ] Line items with `details` show description + details in the same cell (two-line stack); items without details show description only — no empty column
- [ ] Null prices render as `—`, not blank
- [ ] Title (when present) appears as a standalone headline above the meta grid, not as a labeled field inside it
- [ ] Contractor phone number appears in the header identity block when present on the user profile
- [ ] Public PDF route (`/share/:token`) renders phone number and email correctly — `get_render_context_by_token` returns the same fields as `get_render_context` (template test with a token-based fixture); additionally, a `test_pdf.py` test using a stubbed `PdfIntegration` confirms the token-based render path passes `phone_number` and `contractor_email` from the context to the integration call
- [ ] Total section: rendered HTML places the total block outside any `<table>` element; the rendered stylesheet (or inline style) contains `font-weight: 700` and `font-size: 16px` for the total amount; the total block markup includes a `border-top` declaration (asserted via regex on rendered HTML/CSS string)
- [ ] Notes section: rendered stylesheet contains a `.notes` rule (or equivalent) with `border-left` present; the same rule does not contain a `border:` shorthand that would add a full surrounding border, and does not contain a `background` or `background-color` fill declaration
- [ ] `@page` margin and A4 size are set
- [ ] Owner name does not render when both `first_name` and `last_name` are null
- [ ] All existing `test_pdf.py` and `test_pdf_template.py` tests pass (update fixtures and assertions as needed for layout changes)
- [ ] A sparse-quote test case exists: no title, no logo, no customer contact, one item with no details, no notes, null total
- [ ] `make backend-verify` passes

---

## Verification

```bash
make backend-verify
```

Manual:
1. Generate a PDF for a full quote (logo, title, multiple line items with and without details, notes) and confirm the layout matches the plan
2. Generate a PDF for a sparse quote (no logo, no title, one item without details, no notes, null total) and confirm no blank gaps or missing-field artifacts
3. Open a shared quote via `/share/:token` and confirm the public PDF includes contractor phone and email when set on the profile
