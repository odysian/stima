# Spec: Quote list UI polish — card hierarchy, list rhythm, interaction quality

## Summary

The quote list screen (`QuoteList.tsx`) is the app's primary landing surface. A UI evaluation identified seven improvements ranked by impact-to-effort. This spec groups them into three child tasks: a focused quote list redesign, a consistency pass across all list screens, and a Radix UI foundation for headless accessibility.

No backend changes. No API contract changes. No new routes. Frontend-only.

## Issue mode

`gated` — 1 Spec issue + 3 Task issues.

| Issue | Type | Labels |
|-------|------|--------|
| Spec: Quote list UI polish | `type:spec` | `area:frontend`, `area:quotes` |
| Task A: Quote list screen redesign | `type:task` | `area:frontend`, `area:quotes` |
| Task B: List pattern consistency pass | `type:task` | `area:frontend`, `area:quotes`, `area:customers` |
| Task C: Radix UI Dialog foundation | `type:task` | `area:frontend` |

## Motivation

### Problems identified

1. **Card information hierarchy is vertical and slow to scan.** Customer name (top-left), total (bottom-right), status (top-right), and metadata are spread across 4 lines. A tradesperson checking quotes on a job site needs customer + amount in one eye-sweep. The current layout forces full card reading to extract the two most important values.

2. **Cards visually merge ("wall of white").** `mb-2` (8px) gap + `ghost-shadow` at 4% opacity + `surface-container-lowest` (#fff) over `background` (#f8f9ff) produces insufficient tonal contrast. At 5+ quotes, the list reads as a single white block with faint horizontal lines.

3. **Stat cards consume prime vertical real estate.** The two-column "Active Quotes" / "Pending Review" section uses ~120px above the fold with large `text-3xl` numbers. The user already knows their quote count — they're here to find a specific quote. This pushes the actual list below the fold on shorter devices.

4. **Active state feedback is imperceptible.** `active:scale-[0.99]` is a 1% scale change — undetectable on mobile. For a "glove-friendly" app (per DESIGN.md), pressed cards need visible confirmation the tap registered.

5. **Search label is redundant.** The `Input` component renders a `"Search quotes"` label above the field while the placeholder says `"Search customer or quote ID..."`. For search inputs, the visible label duplicates the placeholder and adds visual noise.

6. **Card border radius is too subtle on mobile.** `rounded-lg` maps to `--radius-lg: 0.25rem` (4px). On a 375px phone screen, 4px corners look nearly square. The "4px architectural geometry" from DESIGN.md reads better on desktop; on mobile, `0.5rem` (8px) preserves the crisp intent without looking like a sharp rectangle.

7. **Headless accessibility primitives are missing.** `ConfirmModal` manually implements focus trapping, keyboard dismissal, and scroll lock. Radix UI primitives handle these correctly for free, including edge cases (nested focus traps, iOS scroll lock quirks, portal rendering).

### Design system alignment

The DESIGN.md already prescribes solutions for several of these problems but they aren't fully applied:

- **Section 4 (Layering Principle):** "Level 1: `surface-container-low` (Content groupings). Level 2: `surface-container-lowest` (Interactive cards/List items)." The quote list doesn't use the Level 1 background for its list region.
- **Section 6 (Do's):** "Use vertical white space (1.75rem or 2.25rem) to separate sections instead of divider lines." Current card gap is 0.5rem.
- **Section 4 (Ghost Shadows):** "Should feel like a soft glow, not a drop shadow." The current ghost-shadow works, but only when cards have enough spacing for the glow to breathe.

## Decision locks

1. **Card layout: 2-line horizontal scan.** Customer name + total on row 1. Doc number + date + item count + status badge on row 2. This collapses the current 4-line layout into 2 lines and puts the highest-value fields (name + amount) on the same scan line.

2. **List separation: tonal background shift (not borders, not increased shadow).** The list region (`<ul>`) gets `bg-surface-container-low` (#eff4ff). Cards remain `bg-surface-container-lowest` (#fff). This applies the DESIGN.md layering principle and creates the "nested depth" described in section 4. Gap increases from `mb-2` to `gap-3`.

3. **Stat section: collapse to inline summary row.** Replace the two tall stat cards with a single `text-sm` inline row: `"3 active · 2 pending review"` positioned below the page title. Recovers ~100px of vertical space.

4. **Active state: background shift + stronger scale.** `active:scale-[0.98] active:bg-surface-container-low` provides unmistakable pressed feedback through both color and size change.

5. **Search label: visually hidden, kept for screen readers.** Apply `sr-only` class to the label element. Preserves accessibility without visual noise.

6. **Card border radius: bump cards from `rounded-lg` (4px) to `rounded-xl` (8px).** Keep buttons at `rounded-lg` (4px) to preserve the hierarchy. This is a targeted class change on card elements, NOT a theme token change — we don't want to break button/input radius globally.

7. **Radix UI: install only `@radix-ui/react-dialog`.** Refactor `ConfirmModal` to use it. Other primitives (Select, Toast, DropdownMenu) deferred to when features need them.

## Non-goals

- No new screens or routes
- No backend or API changes
- No new features (filtering, sorting, pagination)
- No theme token modifications in `index.css` (card radius change is at the class level, not the token level)
- No changes to quote detail, capture, or review screens (except consistency pass in Task B for list patterns)
- No full design system overhaul

## Child tasks

### Task A: Quote list screen — card redesign, stat compaction, interaction polish

**Scope:** All changes are in or directly affect `QuoteList.tsx`. This is the highest-impact task.

**Changes:**

1. **Card layout restructure.** Replace the current 4-line card body with a 2-line horizontal layout:

   Current:
   ```
   [Customer Name]              [DRAFT]
   Q-001 · Mar 14
   3 items
                                $1,250.00
   ```

   Target:
   ```
   [Customer Name]              $1,250.00
   Q-001 · Mar 14 · 3 items      [DRAFT]
   ```

   Implementation guidance:
   - Row 1: `flex items-baseline justify-between gap-3`. Customer name left (`font-headline font-bold text-on-surface`), total right (`font-headline font-bold text-on-surface`). Use `items-baseline` so the text baselines align regardless of font size.
   - Row 2: `flex items-center justify-between gap-3 mt-1`. Metadata left (`text-sm text-on-surface-variant`): doc number + middot + date + middot + item count. Status badge right.
   - Item count moves from its own line into the metadata string. Format: `"Q-001 · Mar 14 · 3 items"`. Use correct singular/plural: `"1 item"` vs `"N items"`.
   - Total amount: call `formatCurrency(quote.total_amount)` directly — the formatter already returns `"—"` for `null`. No additional null check needed.

2. **List tonal background.** Wrap the `<ul>` in a container with `bg-surface-container-low rounded-xl p-3` to create the Level 1 surface. Cards inside remain `bg-surface-container-lowest`. The tonal shift (#eff4ff → #fff) creates separation without borders.

   Implementation guidance:
   - The container replaces the current `<ul className="px-4 pb-2">`.
   - New structure: `<div className="mx-4 rounded-xl bg-surface-container-low p-3"><ul className="flex flex-col gap-3">...</ul></div>`.
   - Remove `mb-2` from `<li>` elements — gap is now on the `<ul>`.
   - The "PAST QUOTES" / "Sorted by" header row stays outside this container, above it.

3. **Stat section compaction.** Replace the two-column `<section>` (lines 84-101) with a single inline row below the title:

   Implementation guidance:
   - Remove the `<section className="mb-4 grid grid-cols-2 ...">` block entirely.
   - Add a `<p>` after the `<h1>` inside the header `<div>`:
     ```tsx
     <p className="mt-1 text-sm text-on-surface-variant">
       {activeQuoteCount} active{" · "}{pendingReviewCount} pending review
     </p>
     ```
   - Keep the `activeQuoteCount` and `pendingReviewCount` memos — just change their rendering.

4. **Card active state.** Change card button classes from:
   ```
   active:scale-[0.99]
   ```
   to:
   ```
   active:scale-[0.98] active:bg-surface-container-low
   ```

5. **Card border radius.** Change card button classes from `rounded-lg` to `rounded-xl` on quote card buttons only.

6. **Search label sr-only.** The `Input` component is shared and used in forms where the visible label is needed. Two options:
   - **Option A (preferred):** Add an optional `hideLabel` boolean prop to `Input`. When true, applies `sr-only` to the label. No visual change for other consumers.
   - **Option B:** Pass a custom `className` to the label. More flexible but less explicit.
   - The implementer should use Option A unless there's a reason not to.

**Files touched:**
- `frontend/src/features/quotes/components/QuoteList.tsx` (main changes)
- `frontend/src/shared/components/Input.tsx` (add `hideLabel` prop)

**Acceptance criteria:**
- [ ] Quote cards display customer name and total on the same row
- [ ] Quote cards display doc number, date, item count, and status badge on a second row
- [ ] Quote list region has a tonal background (`surface-container-low`) with cards on `surface-container-lowest`
- [ ] Card gap is `gap-3` (12px), not `mb-2` (8px)
- [ ] Stat section is a single inline text row, not two tall cards
- [ ] Card press state shows visible background color shift and scale change
- [ ] Card corners use `rounded-xl` (8px)
- [ ] Search input label is visually hidden but accessible to screen readers
- [ ] Null total displays em dash, not `$0.00`
- [ ] Empty state still renders correctly (no quotes, no search matches)
- [ ] Loading and error states still render correctly
- [ ] All existing QuoteList tests pass (update snapshots/assertions if they check specific class names or DOM structure)
- [ ] `make frontend-verify` passes

**Tests to update/add:**
- Existing QuoteList tests may assert on DOM structure or specific text content. Update these to match the new 2-line card layout.
- Add test: null `total_amount` renders em dash
- Add test: search label has `sr-only` class (or is not visually rendered)

---

### Task B: List pattern consistency — apply card layout to all list screens

**Scope:** After Task A establishes the new card pattern on QuoteList, apply the same tonal background + card spacing + active state + border radius to all other list screens. This is mechanical work — the pattern is defined in Task A.

**Depends on:** Task A (must be merged first so the pattern is established).

**Screens to update:**

1. **`CustomerListScreen.tsx`** — Customer list cards.
   - Apply tonal list container (`bg-surface-container-low rounded-xl p-3` wrapper).
   - Update card gap to `gap-3`.
   - Update active state to `active:scale-[0.98] active:bg-surface-container-low`.
   - Update border radius to `rounded-xl`.
   - Customer card layout stays as-is (name + contact is already a clean 2-line layout). No hierarchy change needed — customer cards don't have the same multi-field density problem as quote cards.

2. **`CustomerSelectScreen.tsx`** — Customer selection cards in quote creation flow.
   - Same tonal container + gap + active state + radius changes.
   - Card layout stays as-is.

3. **`QuoteHistoryList.tsx`** — Quote history within customer detail screen.
   - Same tonal container + gap + active state + radius changes.
   - Apply the 2-line card layout, adapted for context (customer name is already known from the parent screen):
     ```
     Row 1: [Q-001]                    [$1,250.00]
     Row 2: [Mar 14 · 3 items]          [DRAFT]
     ```
   - Row 1: `flex items-baseline justify-between gap-3`. Doc number left (`font-headline font-bold text-on-surface`), total right (`font-headline font-bold text-on-surface`).
   - Row 2: `flex items-center justify-between gap-3 mt-1`. Date + item count left (`text-sm text-on-surface-variant`), status badge right.
   - Use correct singular/plural for item count: `"1 item"` vs `"N items"`.
   - If a quote title field is added later, it replaces `doc_number` as the row 1 left field — the layout pattern does not change.

4. **`LineItemCard.tsx`** — Line item cards on ReviewScreen.
   - Active state and radius changes only.
   - No tonal container needed — line items are within a single quote context, not a browsable list.

**Files touched:**
- `frontend/src/features/customers/components/CustomerListScreen.tsx`
- `frontend/src/features/customers/components/CustomerSelectScreen.tsx`
- `frontend/src/features/customers/components/QuoteHistoryList.tsx`
- `frontend/src/features/quotes/components/LineItemCard.tsx`

**Acceptance criteria:**
- [ ] All list screens use `bg-surface-container-low` tonal container around their list regions
- [ ] All list cards use `gap-3` spacing
- [ ] All list cards use `active:scale-[0.98] active:bg-surface-container-low` active state
- [ ] All list cards use `rounded-xl` border radius
- [ ] QuoteHistoryList quote cards use the 2-line layout: doc number + total on row 1, date + item count + status badge on row 2
- [ ] No layout regressions on customer screens
- [ ] All existing tests pass (update if they assert specific classes or DOM structure)
- [ ] `make frontend-verify` passes

---

### Task C: Radix UI Dialog — headless accessibility foundation

**Scope:** Install `@radix-ui/react-dialog` and refactor `ConfirmModal` to use it. This replaces manual focus trapping, keyboard dismissal, and scroll lock with battle-tested primitives.

**Depends on:** Nothing (can run in parallel with Task A).

**Why Radix, not a full component library:**
- The design system ("Organic Brutalism" with custom surface hierarchy, ghost shadows, forest gradient) is too opinionated for Material UI, Chakra, or shadcn to respect without heavy overrides.
- Radix is headless (zero styling opinions). It provides interaction logic and accessibility only.
- Install only what's needed now. Other primitives (Select, Toast, Popover) can be added per-feature later.

**Changes:**

1. **Install dependency:** `@radix-ui/react-dialog` (single package, ~8KB gzipped). Per repo policy, dependency installation requires human approval — the agent will pause for confirmation before running `npm install`.

2. **Refactor `ConfirmModal.tsx`:**

   Current manual implementation handles:
   - `Escape` key to dismiss
   - Focus on cancel button on mount

   Current manual implementation does NOT handle (bugs):
   - Backdrop click to dismiss (no handler on backdrop div)
   - Focus trap (tab can escape the modal)
   - Scroll lock (potential bug on iOS)

   Radix Dialog provides all of the above plus:
   - Proper focus trap (tab cycling within modal)
   - Scroll lock that works on iOS Safari
   - Portal rendering (avoids z-index stacking context issues)
   - `aria-labelledby` / `aria-describedby` wiring
   - Return focus to trigger element on close

   Implementation guidance:
   ```tsx
   import * as Dialog from "@radix-ui/react-dialog";

   export function ConfirmModal({ title, body, confirmLabel, cancelLabel, onConfirm, onCancel, variant = "primary" }: ConfirmModalProps) {
     return (
       <Dialog.Root open onOpenChange={(open) => { if (!open) onCancel(); }}>
         <Dialog.Portal>
           <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
           <Dialog.Content
             className="fixed inset-x-4 bottom-4 z-50 ... (existing card styles)"
             onOpenAutoFocus={(e) => {
               // Focus cancel button instead of first focusable
               e.preventDefault();
               cancelButtonRef.current?.focus();
             }}
           >
             <Dialog.Title>...</Dialog.Title>
             <Dialog.Description>...</Dialog.Description>
             {/* existing button layout */}
           </Dialog.Content>
         </Dialog.Portal>
       </Dialog.Root>
     );
   }
   ```

   - Keep ALL existing Tailwind classes and visual styling. Only the interaction/accessibility layer changes.
   - Remove manual `useEffect` for focus management and the `onKeyDown` Escape handler on the backdrop div — Radix handles both.
   - The component's external API (`ConfirmModalProps`) stays identical — this is an internal refactor.

3. **Verify existing ConfirmModal tests still pass.** The component's props and behavior are unchanged. Tests that check `onCancel` fires on Escape, `onConfirm` fires on confirm click, etc. should pass without modification. If Radix's portal rendering breaks test queries, update the test render setup to query within the portal (Radix portals append to `document.body` by default).

**Files touched:**
- `frontend/package.json` (add `@radix-ui/react-dialog`)
- `frontend/src/shared/components/ConfirmModal.tsx` (refactor internals)
- `frontend/src/shared/components/ConfirmModal.test.tsx` (update if portal rendering changes query scope)

**Acceptance criteria:**
- [ ] `@radix-ui/react-dialog` is installed and listed in `package.json` dependencies
- [ ] `ConfirmModal` uses Radix Dialog primitives internally
- [ ] `ConfirmModal` external API (props) is unchanged
- [ ] Focus trap works correctly (tab cycles within modal)
- [ ] Escape dismisses modal and calls `onCancel`
- [ ] Backdrop click dismisses modal and calls `onCancel`
- [ ] Initial focus lands on cancel button
- [ ] Focus returns to trigger element on close
- [ ] Scroll lock prevents background scroll on iOS Safari
- [ ] All existing ConfirmModal tests pass (or are minimally updated for portal rendering)
- [ ] No visual changes to the modal's appearance
- [ ] `make frontend-verify` passes
- [ ] No other Radix packages installed (only `react-dialog` for now)

## Task dependency graph

```
Task A (quote list redesign)  ──→  Task B (list consistency pass)
Task C (Radix dialog)         ──→  (independent, can parallel with A)
```

Task B depends on Task A. Task C is independent.

## Verification

Each task runs:
```bash
make frontend-verify   # tsc + eslint + vitest + build
```

No backend verification needed — all tasks are frontend-only.

## Revisit triggers

- **Card layout:** If quote cards gain more fields (e.g., due date, assigned crew), the 2-line layout may need a third line. Revisit when new fields are added to `QuoteListItem`.
- **Stat compaction:** If the app adds dashboard-style analytics, the inline summary may grow back into cards. Revisit if a dedicated dashboard screen is added (which would remove stats from the quote list entirely).
- **Radix adoption:** If 3+ Radix primitives are installed, evaluate whether `@radix-ui/react-primitives` (bundle) is smaller than individual packages. Current threshold: just Dialog.
