# Milestone 4 — Quote PDF Presentation Refinement

**Date:** 2026-03-29
**Roadmap ref:** `docs/V1_ROADMAP.md` — Milestone 4
**Mode:** single (one task, one PR)
**Depends on:** M0 (logo in PDF already shipped); no schema dependencies

---

## Goal

Make the quote PDF look professional and trustworthy enough to send to a new customer without
apology. The current template is functional but uses generic typography, wastes space on empty
details columns, and lacks the visual weight a client-ready document needs. This milestone
tightens the layout, improves typographic hierarchy, and polishes the details that shape a
customer's first impression.

---

## Why This Over Reminder Workflow

Reminder workflow (the original M4) helped the contractor chase quotes that went quiet.
PDF Presentation Refinement improves what the customer actually receives.

The reminder is operational convenience — it helps the contractor act on an outcome. This
milestone improves the document that causes the outcome. Stima's core value proposition is
"fast, professional quotes." The landing page (M2) and email delivery (M3) now put the PDF
directly in front of customers. If the document looks like a generic printout, it undercuts
everything the contractor built by using Stima at all.

Reminder workflow is a V2 candidate. Once a contractor is actively sending polished documents
and tracking outcomes manually via Mark as Won / Mark as Lost, the operational cadence is
established. Automation can refine it later. PDF quality cannot be easily patched after a
contractor has already sent real quotes to real customers.

---

## Current State

PDFs are rendered by a Jinja2 HTML template (`backend/app/templates/quote.html`) fed to
WeasyPrint, which produces PDF bytes. The pipeline is already in place; all improvements in
this milestone are template-and-CSS changes.

**Known weaknesses in the current template:**

- **Font:** Arial/Helvetica — generic, system-dependent, no character
- **Header separator:** `border-bottom: 2px solid #e5e7eb` — flat, no visual weight
- **Logo size:** `max-height: 48px` — too small to anchor a document header
- **Contractor contact:** business name and owner name only; no phone or email visible on the PDF
- **Title placement:** appears inside the meta grid as `QUOTE TITLE / value` — feels like a
  metadata field rather than the document's headline
- **Line items:** fixed 3-column layout (Description | Details | Price); when details are absent
  the middle column is an empty gap that wastes width and looks unfinished
- **Total row:** shares the line-items table visually, no separation; feels like just another row
- **Notes:** bordered box with gray fill — reads as a "warning" area rather than supplementary
  context
- **Page setup:** no `@page` CSS rule; WeasyPrint uses layout defaults that vary across versions
- **Empty field safety:** `{{ first_name or "" }} {{ last_name or "" }}` renders a lone space
  when both fields are null

---

## Scope

### 1. Typography

Upgrade the font treatment. **Use Option A by default.** Switch to Option B only if WeasyPrint
cannot resolve the embedded WOFF2 fonts during rendering (detected during local verification).

**Option A — Embed Inter (default):** Inter is the app's design-system body font. Embedding
it in the PDF creates visual continuity between the app and the document. Add `Inter-Regular.woff2`
and `Inter-Bold.woff2` to `backend/app/templates/` and load them via `@font-face` with a path
relative to the template directory. WeasyPrint resolves these via `base_url`. Commit the font
files (approximately 140–160 KB each).

**Option B — Improved system stack (fallback only):** Prefer `Noto Sans, Ubuntu, DejaVu Sans, Arial`
in that order. No new files required. Use only if WeasyPrint cannot resolve the WOFF2 assets at
render time — do not pre-emptively choose this path without a confirmed render failure.

Either option is a significant improvement over bare `Arial, Helvetica, sans-serif`.

### 2. Header

- Increase logo `max-height` from 48px to 72px. The logo is a brand mark — it should read at a
  glance, not require squinting.
- Add contractor phone number to the identity block below the owner name when present. Customers
  need to know who to call back; the PDF is the artifact that travels furthest from the app.
- Add contractor email below phone when present (optional, secondary to phone).
- **Context change required:** `QuoteRenderContext` currently does not include `phone_number` or
  contractor `email`. The repository query must be extended to include both from the `users` table.
  Update the dataclass, the `get_render_context` query, and the test fixtures.
- Keep the two-column table structure (business name left, logo right). Improve the separator:
  increase weight slightly or use a left-aligned primary-color accent (`#004532`, the app's brand
  green) on the business name block rather than a full-width gray rule.

### 3. Title as Document Headline

Current: title appears in the right column of the meta grid as a labeled field (`QUOTE TITLE` /
value). This makes it feel like an identifier rather than a job description.

New: when a title is present, render it as a distinct element between the header and the meta
grid — large type, no label, clearly the human name for the job.

```
[ Header: business name / logo ]
[ Separator ]

  Back Patio Rebuild                     ← title: 22–24px bold, bottom margin before meta

[ Meta grid: Prepared For / Quote Number / Issued ]
```

When title is absent, the meta grid starts immediately after the header. No blank space, no
label, no placeholder.

Remove the `QUOTE TITLE` label and title value from the meta grid entirely. The title either
stands on its own or is invisible.

### 4. Line Item Layout

Replace the fixed 3-column layout (Description | Details | Price) with a 2-column layout
(Description+Details | Price).

- Description on the first line of the cell (regular weight, same size as now)
- Details on a second line within the same cell when present (smaller size, muted color —
  approximately `#6b7280`; add `padding-top: 2px`)
- Price column unchanged (right-aligned)

This eliminates the empty-column problem, gives description text the width it needs, and
makes items with and without details look equally intentional.

```
DESCRIPTION                                PRICE
------                                     ------
Install timber retaining wall            $1,200.00
  6m run, 1.2m high, treated pine

Remove existing fence                      $350.00

Labour                                         —
```

Price cells where `price` is null show `—` (em dash), not blank.

### 5. Total Section

Visually separate the total from the line items table. After the last line item row, close the
table. Render the total in a standalone block below:

- Right-aligned
- `font-weight: 700`, `font-size: 16px` for the amount
- `margin-top: 16px`, a top border to visually close the item list
- Label (`Total`) in the same uppercase small-caps style as other labels

```
                                   ──────────────
                            TOTAL  $1,550.00
```

When total is null, show `—` in muted text at the same position. The label still renders — the
line is present but the amount is unstated.

This section is deliberately simple. M7 (optional pricing controls: discounts, deposits,
simple tax when needed) will expand it. The structure established here should accommodate
those additional rows without a rewrite: a
right-aligned two-column block where each row is `label | value`.

### 6. Notes Section

Replace the bordered box with an accent-bar treatment:

```css
.notes {
  border-left: 3px solid #d1d5db;
  padding: 0 0 0 14px;
  margin-top: 24px;
}
```

Cleaner, less "alert box." The label (`NOTES`, uppercase small caps) sits above the note text
as it does now. The left bar provides enough visual structure without shouting.

### 7. Page Setup

Add an explicit `@page` rule:

```css
@page {
  margin: 20mm 20mm 24mm 20mm;
  size: A4;
}
```

Consistent print margins regardless of WeasyPrint version defaults. A4 is the standard for V1.
Letter-size support (for US-based contractors) is a future preference setting, not a V1 concern.

### 8. Empty Field Safety

Fix the owner name rendering so it emits no output when both `first_name` and `last_name` are null:

```jinja2
{% if first_name or last_name %}
<p class="owner-name">{{ first_name or "" }} {{ last_name or "" }}</p>
{% endif %}
```

All other optional fields (customer phone/email/address, notes, title) are already conditionally
rendered. No other empty-field issues known.

---

## Out of Scope

- **Invoice template:** Milestone 5 introduces invoices. The implementation agent for M5 should
  inherit the improved quote template structure — keep both templates aligned. Whether to use a
  single template with a `doc_type` variable or two near-identical templates is M5's decision, not
  M4's. M4 does not create an invoice template.
- **M7 fields (discount, deposit, tax when used):** The total section established here must
  accommodate them,
  but M4 does not implement them.
- **Per-user color themes:** Not in V1.
- **Custom branding fonts uploaded by contractor:** Not in V1.
- **WYSIWYG or drag-and-drop template editing:** Not in V1.
- **Email template styling (M3):** Separate artifact. Not touched in M4.
- **Watermarks on draft/pending quotes:** Future feature.
- **Letter vs. A4 user preference:** Hardcode A4 for V1.
- **Quote preview screen:** No frontend changes required unless the contractor phone/email
  addition (scope item 2) reveals a gap in the app's settings screen. If it does, that is a
  separate task.

---

## Implementation Constraints

1. All layout changes live in `backend/app/templates/quote.html`. No new files except optional
   font assets.
2. `QuoteRenderContext` is a dataclass in `backend/app/features/quotes/repository.py`. Adding
   `phone_number: str | None` and `contractor_email: str | None` requires updating the dataclass
   definition, the `get_render_context` repository query, the `get_render_context_by_token` query
   (used by the public endpoint), and the test fixtures in `test_pdf.py` / `test_pdf_template.py`.
3. Font embedding (Option A): font files go in `backend/app/templates/`. WeasyPrint resolves
   relative paths via the `base_url` already set in `PdfIntegration.render()`. Load with
   `@font-face { src: url("Inter-Regular.woff2"); }`.
4. The public PDF route (`/share/:token`) uses `get_render_context_by_token` — keep it aligned
   with `get_render_context` when extending the dataclass.
5. Do not modify `PdfIntegration` in `backend/app/integrations/pdf.py` unless unavoidable.
   All improvements should come from the template.

---

## Acceptance Criteria

- [ ] PDF renders correctly for quotes with and without a logo
- [ ] PDF renders correctly for quotes without a title (no blank headline gap, no `QUOTE TITLE`
  label)
- [ ] PDF renders correctly for sparse quotes: no customer contact, no notes, no item details,
  null total, null owner name
- [ ] Line items with `details` show description + details in the same cell (two-line stack);
  items without details show description only — no empty column
- [ ] Null prices render as `—`, not blank
- [ ] Title (when present) appears as a standalone headline above the meta grid, not as a labeled
  field inside it
- [ ] Contractor phone number appears in the header identity block when present on the user profile
- [ ] Public PDF route (`/share/:token`) renders phone number and email correctly — `get_render_context_by_token` returns the same fields as `get_render_context` (template test with a token-based fixture); additionally, a `test_pdf.py` test using a stubbed `PdfIntegration` confirms the token-based render path passes `phone_number` and `contractor_email` from the context to the integration call
- [ ] Total section: rendered HTML places the total block outside any `<table>` element; the rendered stylesheet (or inline style) contains `font-weight: 700` and `font-size: 16px` for the total amount; the total block markup includes a `border-top` declaration (asserted via regex on rendered HTML/CSS string)
- [ ] Notes section: rendered stylesheet contains a `.notes` rule (or equivalent) with `border-left` present; the same rule does not contain a `border:` shorthand that would add a full surrounding border, and does not contain a `background` or `background-color` fill declaration
- [ ] `@page` margin and A4 size are set
- [ ] Owner name does not render when both `first_name` and `last_name` are null
- [ ] All existing `test_pdf.py` and `test_pdf_template.py` tests pass (update fixtures and
  assertions as needed for layout changes)
- [ ] A sparse-quote test case exists: no title, no logo, no customer contact, one item with no
  details, no notes, null total
- [ ] `make backend-verify` passes

---

## Testing Notes

- Primary test files: `backend/app/features/quotes/tests/test_pdf_template.py` (Jinja2 HTML
  output assertions) and `test_pdf.py` (WeasyPrint rendering).
- Template tests (HTML output only) are fast and safe to run in CI. Full WeasyPrint rendering
  tests are slower; check whether the existing suite already runs them in CI before adding more.
- Test the sparse-quote case explicitly — this is the most common failure mode for
  conditional rendering changes.
- For the `QuoteRenderContext` extension, ensure test fixtures are updated in both test files.

---

## Sequencing Note

M4 has no schema dependencies and does not block any other milestone. It can ship:

- As a standalone task between M3 and M5
- Or immediately after M3 is confirmed working end-to-end, so the PDF that travels via email
  is already polished before M5 inherits the template

**Recommended order:** ship after M3. M3 validates the delivery pipeline. M4 then upgrades the
document quality. M5 (invoice conversion) inherits the improved template structure with minimal
coordination overhead.

If M5 begins before M4 completes, coordinate so M5 does not design a new invoice template
based on the old layout.
