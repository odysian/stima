## Spec: Post-spec #255 polish follow-up

Polish pass on the unified quote capture and review flow, plus one cross-cutting UX pattern (Toast)
that covers the review surface and the Settings screen. Items sourced from the spec #255 gap review
and the scratch improvement notes.

The Settings save UX is explicitly in scope because it uses the identical inline-paragraph pattern
being replaced, and adding it at the same time as the Toast component avoids a stranded call site.

---

## Problem framing

### Goal

Clean up two categories of rough edges left after spec #255:

1. **Spec gaps** — things the spec explicitly required that landed partially or incorrectly.
2. **Interaction polish** — small but noticeable UX annoyances identified during post-ship review.

### Non-goals

- Redesigning the loading spinner (needs a separate design decision)
- Favicon and landing page (separate concerns, not blocked on this)
- Extraction timeout handling (needs backend + frontend scoping, separate task)
- PDF address line formatting (separate backend + template change)
- Autosave (deferred by spec #255 decision D10)

---

## Items in scope

### S1. Draft card glassmorphic treatment (spec gap from D8)

`DESIGN.md` line 237 specifies:
```
rounded-xl border-l-4 border-warning-accent bg-white/80 p-4 backdrop-blur-md ghost-shadow
```

The landed implementation uses `bg-surface-container-lowest` (solid white) without `backdrop-blur-md`.
Draft cards are visually distinct due to the accent border, but lack the glassy language the spec required
to match the app-chrome family (bottom nav, header, footer).

**Fix:** Change `draftRowClasses` in `QuoteList.tsx` from `bg-surface-container-lowest` to `bg-white/80 backdrop-blur-md`.

---

### S2. Confirm and test that suggested tax rate does not auto-enable the tax toggle (improvement note)

The existing behavior is already correct: `isTaxEnabled` in `TotalAmountSection` is derived from
`draft.taxRate` (the persisted quote value), not from `suggestedTaxRate` (the profile default, loaded
separately and passed as a prop). If `draft.taxRate` is null the toggle starts disabled; the suggested
rate only pre-fills the input when the user explicitly enables the checkbox.

However there is no explicit test asserting this boundary. Without test coverage the invariant is fragile
and could regress silently.

**Required behavior (no code change):**
- The tax toggle starts disabled when `taxRate` prop is `null`, regardless of whether `suggestedTaxRate`
  is set.
- When the user enables the tax checkbox with `taxRate === null`, the field pre-fills with
  `suggestedTaxRate` as a convenience starting point.
- A persisted `taxRate` (non-null) still restores normally with the toggle pre-enabled.

**Scope:** `TotalAmountSection.test.tsx` (or nearest test file) — add one assertion that the tax row
is not pre-enabled when `taxRate={null}` and `suggestedTaxRate={0.1}`.

---

### S3. Review footer — always single row (improvement note: "single row - two buttons on review screen")

The current `ReviewActionFooter` uses `flex-col sm:flex-row` — two buttons stack vertically on mobile.
On a phone both buttons are thumb-reachable and should always be side-by-side.

**Required behavior:**
- `Continue to Preview` and `Save Draft` always render in a single row (`flex-row`) at all breakpoints.
- Equal width (`flex-1` each).
- `Continue to Preview` remains left/primary, `Save Draft` remains right/secondary.
- Disabled state on `Continue to Preview` when no customer assigned stays as-is.

**Scope:** `ReviewActionFooter.tsx` — remove `flex-col` and the `sm:` responsive prefix.

---

### S4. Customer row pulse animation on unassigned review (improvement note: "glowing warning to select customer on draft review with no customer selected")

The current customer row shows static text when the quote is unassigned. The improvement note wants
a more visually prominent cue — a glow/pulse to draw the eye toward assignment on first open.

**Required behavior:**
- When `requires_customer_assignment` is true, the customer row renders with a `ring-2 ring-warning-accent/60`
  class and Tailwind's `animate-pulse` set to `[animation-iteration-count:3]` so the ring pulses exactly
  three times and stops without any JavaScript timer or state.
- The ring and animation are absent when a customer is assigned.
- No session persistence or tap-suppression logic — the animation is purely declarative and CSS-controlled.
  Re-entry after navigation will pulse again, which is desirable as a re-prompt.

**Scope:** `frontend/src/features/quotes/components/ReviewCustomerRow.tsx` — add conditional ring
classes to the customer row button.

---

### S5. Toast notifications for "Draft saved" and similar stateful actions (improvement note)

Two screens currently show inline success paragraphs on save that would be better served by a
transient toast:

- `ReviewScreen` / `ReviewFormContent.tsx:93` — `saveNotice` state threaded as a prop, rendered as
  an inline green `<section>` inside the form.
- `SettingsScreen.tsx:195` — `saveSuccess` state rendered as an inline `<p role="status">` inside
  the form.

Both are the same ad-hoc pattern. The fix is one shared component, wired into both screens.

**Required behavior:**
- Add `shared/components/Toast.tsx` — fixed, bottom-center, auto-dismisses after 2.5s, `z-50`.
- Style: `bg-on-surface text-background rounded-xl px-4 py-2.5 text-sm ghost-shadow`,
  positioned `fixed bottom-20 left-1/2 -translate-x-1/2`.
- `ReviewScreen`: remove `saveNotice` state and its prop threading into `ReviewFormContent`;
  render `<Toast>` directly in `ReviewScreen` instead.
- `ReviewFormContent`: remove `saveNotice` prop from interface and JSX.
- `SettingsScreen`: remove `saveSuccess` inline paragraph; render `<Toast>` in its place.
- Error paths (`FeedbackMessage`) are untouched.

**Scope:** new `shared/components/Toast.tsx` + `ReviewScreen.tsx` + `ReviewFormContent.tsx` +
`SettingsScreen.tsx`.

---

### S6. Record button — lower thumb-reach position (improvement note: "slide record button down to more user friendly thumb position")

The record button sits in the middle of the capture screen content area (`my-6`). On taller phones the
natural thumb zone is in the bottom third of the screen.

**Required behavior:**
- Move the record/stop button section below the clips list (currently it is above the "Extract" footer).
- Keep it inside the scrollable content area, just above the sticky footer, so it is naturally in the
  thumb zone without a fixed-position hack.
- The "TAP TO START" label and the button stay as a unit; just reorder the sections.

**Scope:** `CaptureScreen.tsx` — reorder JSX so the record section comes after the clips list section
and just before `<ScreenFooter>`.

---

### S7. React `act()` warning cleanup in `ReviewScreen.test.tsx` (spec gap note)

PR #269 acknowledged a non-blocking `act(...)` warning in one `ReviewScreen` test path. Non-blocking
today but a hygiene smell that can mask real async leaks.

**Required behavior:**
- Identify the source of the unresolved `act()` warning (likely an unhandled async state update after
  unmount in the poll/refresh flow).
- Wrap the offending assertion or `waitFor` block correctly.
- Verify `make frontend-verify` exits clean with no console warnings in the test run.

**Scope:** `ReviewScreen.test.tsx`.

---

### S8. Home list search toggle (improvement note)

The search bar is always visible on the QuoteList home screen, occupying ~52px of vertical space on every load. Search is a secondary action — most sessions are browse-only. Progressive disclosure frees real estate on the densest screen in the app.

**Required behavior:**
- Search bar is hidden by default (`isSearchOpen = false`).
- A magnifying glass ghost icon button sits in the trailing slot of the tab pills row (right side, same row as Quotes / Invoices pills).
- Tapping the icon shows the search bar and moves focus into it.
- The search bar renders a `×` close button inside/adjacent to the input field. Tapping `×` closes the bar and resets `searchQuery` to `""` in one step.
- Re-opening always starts with an empty input — no persistence of the previous query.
- The search icon is hidden while the bar is open; `×` is the sole close affordance.
- Tab switching (Quotes ↔ Invoices) while search is open preserves `isSearchOpen` and resets `searchQuery` (same as current tab-switch behavior).

**Scope:** `QuoteList.tsx` — add `isSearchOpen` state, restructure tab row to `flex items-center justify-between`, add trailing search icon button, conditionally render `Input` with a close affordance. No new shared components required.

---

## Items deferred to separate tasks

| Item | Reason |
|---|---|
| PDF address line formatting | Backend PDF template change; separate scoping needed |
| Extraction timeout (frontend + backend) | Needs backend timeout config + frontend polling abort; separate task |
| Loading spinner redesign (spin color not object, triangle shape) | Needs design decision before implementation |
| Favicon / thumbnail | Separate asset + deploy task |
| Landing page | Separate product + design scope |

---

## Proposed task breakdown

### Task A — Quick fixes (fast mode, one PR)
Items: S1, S2, S3, S6, S7
All are surgical, frontend-only. S2 is test-only. No new components, no contract changes.

### Task B — Review interaction polish (single PR)
Items: S4, S5
S4 and S5 are additive and share the review surface. S5 needs one new shared component.
Together they are PR-sized without being tiny enough to batch with A.

### Task C — Home list search toggle (fast mode, one PR)
Item: S8
Self-contained QuoteList change. No new shared components. Fast mode — no issue creation required.

---

## Acceptance criteria

- Draft rows in `QuoteList` use `bg-white/80 backdrop-blur-md` and match the DESIGN.md spec.
- `TotalAmountSection` test asserts the tax toggle is not pre-enabled when `taxRate={null}` and
  `suggestedTaxRate` is set; no production code change required.
- Review footer shows both action buttons in a single row at all viewport sizes.
- Record button appears below the clips list, above the sticky footer.
- `make frontend-verify` exits clean with no `act()` warnings.
- A new `Toast` component exists in `shared/components`; `ReviewScreen` and `SettingsScreen` both
  use it for their respective save-success confirmations; `saveNotice` prop is removed from
  `ReviewFormContent`; `saveSuccess` inline paragraph is removed from `SettingsScreen`.
- The customer row in `ReviewCustomerRow` has `ring-2 ring-warning-accent/60 animate-pulse
  [animation-iteration-count:3]` when `requires_customer_assignment` is true, and these classes
  are absent when a customer is assigned. No timer or session state required.
- `QuoteList` search bar is hidden by default; a trailing search icon in the tab row toggles it open; `×` in the bar closes and resets the query; re-opening always starts empty.
