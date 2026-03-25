# Task: Slice 2 Quote Preview Mobile-First PDF Actions

Parent Spec: #90

## Goal

Redesign `QuotePreview` so the primary mobile experience works without an embedded PDF
viewer. Replace the dead 55vh blob-URL iframe block with a mobile-first layout that
centers quote details and document actions, while preserving the existing backend
behavior for PDF generation, sharing, editing, and deletion.

Parent context:
- Current screen: `frontend/src/features/quotes/components/QuotePreview.tsx`
- PDF blob preview in iframe does not render on mobile browsers
- Backend changes are out of scope

---

## Problem Framing

### Goal

Make `QuotePreview` usable and clear on phones, where blob-URL PDF iframes render
blank and the current hero section communicates almost nothing.

### Non-goals

- No backend or API changes
- No change to share endpoint behavior
- No PDF landing page
- No redesign of other quote screens
- No desktop-only alternate layout in this task

### Constraints

- Mobile-first layout is the source of truth
- Only one visually primary CTA per state
- Preserve current actions:
  - generate PDF
  - open PDF
  - share quote
  - edit quote
  - delete quote
- Keep fixed bottom nav spacing (`pb-24`)
- Follow `docs/DESIGN.md` surface hierarchy and token rules

---

## Locked Design Decisions

### Remove the iframe hero entirely

Do not keep the 55vh iframe on mobile and hide it with breakpoints. The iframe is not
reliable on the app's primary device class, and keeping it would anchor the layout to
the wrong mental model.

This task replaces the iframe block with a document-status card for all breakpoints.
Desktop can still open the generated PDF in a new tab; an embedded viewer is not part
of this screen anymore.

### Lead with quote status + actions, not with PDF preview chrome

The screen should answer these questions immediately:
1. What quote is this?
2. Is the PDF ready yet?
3. What can I do next?

So the top content block becomes a compact status/action card:
- pre-PDF: "PDF not generated yet"
- post-PDF: "PDF ready to open or share"
- post-share: "Quote shared"

This replaces the current blank-preview rectangle.

### Keep "Generate PDF" and "Share" as separate steps

Do not merge the flow into "share generates + shares in one tap." Backend behavior and
current status semantics already distinguish:
- `draft` -> `ready` on PDF generation
- `ready` -> `shared` on share

Those are useful states, and combining them would blur the existing product model.

### State-specific primary action

The primary CTA changes with screen state:
- `draft` with no generated PDF in session:
  - Primary: `Generate PDF`
- `ready` or once PDF is generated locally:
  - Primary: `Share Quote`
  - Secondary: `Open PDF`
- `shared`:
  - Primary: `Open PDF`
  - Secondary: `Copy Share Link`

This follows the design rule of one heavy primary action per screen.

### "Open PDF" becomes a real action button, not a tiny link

The current small corner link is too weak for the importance of the action. After PDF
generation, `Open PDF` should be a full-width or clearly grouped secondary action
button in the action card.

### Keep direct PDF share-link behavior

The public share URL already opens a PDF directly from the backend. That customer
experience stays unchanged in this task. A branded landing page is a separate product
question and out of scope here.

---

## Proposed Screen Model

### Before PDF is generated

Top card:
- document icon
- label: `PDF STATUS`
- title: `PDF not generated`
- supporting text: `Generate the quote PDF to open it or share it with your customer.`

Actions:
- primary forest-gradient button: `Generate PDF`
- no `Share` button yet

Below:
- quote total / customer summary card(s)
- line items list
- edit / delete actions

### After PDF is generated

Top card:
- success/document-ready state
- label: `PDF STATUS`
- title: `PDF ready`
- supporting text: `Open the PDF or share the quote link with your customer.`

Actions:
- primary forest-gradient button: `Share Quote`
- secondary outlined button: `Open PDF`

Below:
- optional inline success copy after generation if useful, but not duplicated if the
  state card already communicates readiness
- share link row appears only once `share_token` exists
- quote total / customer summary
- line items list
- edit / delete actions if status is not `shared`

### After quote is shared

Top card:
- info/success state
- label: `SHARE STATUS`
- title: `Quote shared`
- supporting text: `Use the link below to copy or resend the quote.`

Actions:
- primary button: `Open PDF`
- secondary button: `Copy Share Link`

The existing `ShareLinkRow` stays, but it should feel like a supporting utility row,
not the first discoverable share affordance.

---

## Risks And Edge Cases

- Removing the iframe changes existing tests that assert `<iframe title="Quote PDF preview">`
- Share should remain disabled until PDF generation has occurred in the current screen
  session unless the quote already has a `share_token`
- Native share cancellation must still be a non-error path
- The screen must not regress desktop usability even though mobile is the primary
  target
- Action/state messaging must not duplicate itself excessively across the status card,
  inline feedback, and share row

---

## Scope

### Frontend

**`frontend/src/features/quotes/components/QuotePreview.tsx`**
- Remove the iframe preview container and corner-link affordance
- Add a mobile-first document status/action card near the top of the screen
- Reorder content so status/actions come first, then quote detail content
- Preserve load, error, delete, and share behaviors already implemented
- Keep bottom nav layout and spacing intact

**`frontend/src/features/quotes/components/QuotePreviewActions.tsx`**
- Redesign actions around explicit screen states:
  - pre-PDF
  - PDF ready
  - shared
- Promote `Open PDF` to a first-class button once a blob URL exists
- Avoid showing two equally strong primary buttons at once

**`frontend/src/features/quotes/components/ShareLinkRow.tsx`**
- Keep as a supporting utility row
- Minor styling adjustments only if needed to fit the new hierarchy

**Supporting shared primitives**
- Reuse `ScreenHeader`, `FeedbackMessage`, `ConfirmModal`, `StatusBadge`
- Do not introduce a new modal/toast system

### Tests

**`frontend/src/features/quotes/tests/QuotePreview.test.tsx`**
- Replace iframe-specific assertions with status-card and action-state assertions
- Cover pre-PDF, PDF-ready, and shared states
- Keep share/delete/error/cancel tests that still reflect current behavior
- Add assertion that `Open PDF` becomes visible as a real action after generation

---

## File Targets

| File | Action | Purpose |
|---|---|---|
| `frontend/src/features/quotes/components/QuotePreview.tsx` | Modify | Replace iframe-led layout with status/action-first mobile layout |
| `frontend/src/features/quotes/components/QuotePreviewActions.tsx` | Modify | State-driven primary/secondary CTA group |
| `frontend/src/features/quotes/components/ShareLinkRow.tsx` | Modify | Optional hierarchy/styling alignment with new layout |
| `frontend/src/features/quotes/tests/QuotePreview.test.tsx` | Modify | Lock new mobile-first behavior |

---

## Implementation Plan

1. Replace the iframe hero in `QuotePreview` with a top-level document status card and
   move quote details into the main scroll flow below it.
2. Refactor `QuotePreviewActions` so CTA hierarchy changes by state:
   pre-PDF, PDF-ready, and shared.
3. Keep share-link, edit, delete, and error handling behaviors intact while aligning
   their placement and styling with the new hierarchy.
4. Update component tests to assert the new state-driven layout instead of iframe
   rendering.

---

## Acceptance Criteria

- [ ] `QuotePreview` no longer renders the 55vh PDF iframe block
- [ ] The top of the screen communicates document/share status clearly before any PDF is generated
- [ ] Before generation, the only visually primary action is `Generate PDF`
- [ ] After generation, `Open PDF` is exposed as a real action button
- [ ] After generation, `Share Quote` becomes the visually primary action
- [ ] After sharing, the screen communicates that the quote has been shared
- [ ] `ShareLinkRow` still appears when a `share_token` exists
- [ ] Edit/Delete actions remain available for non-shared quotes
- [ ] Edit/Delete actions remain hidden for shared quotes
- [ ] Quote load errors, PDF generation errors, share errors, and delete errors still render inline
- [ ] Native share cancellation remains a non-error path
- [ ] Layout follows `docs/DESIGN.md` token and hierarchy rules
- [ ] `make frontend-verify` passes

## DoD Gate

On a phone, a user can understand the quote's state, generate the PDF, open it, and
share it without depending on an embedded PDF preview that does not render.

---

## Verification

```bash
make frontend-verify
```

Fallback:

```bash
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```

---

## Suggested Issue Command

```bash
gh issue create --title "Task: mobile-first quote preview PDF actions" --label "type:task,area:quotes,area:frontend" --body-file plans/2026-03-25/task-quote-preview-mobile-first-pdf-actions.md
```
