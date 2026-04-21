# PR1 — Quotes List UI Adoption

## Status

**Shipped — PR #487.** Visual and interaction adoption of the generated design package on the Quotes List screen (authenticated home) **only** for **composition and list-specific primitives**. This PR introduces the shared primitives and applies them to the Quotes List; they are not yet applied to other feature screens.

This PR does **not** change routes, data shape, API contracts, or domain language. `ui_kits/stima-mobile/Home.jsx` was used as a visual hierarchy reference only; it is not production truth for nav IA, FAB behavior, segmented-control behavior, or list summary format (see scope item 4).

**Shared chrome:** `ScreenHeader` already had glass styling in the repo — no changes were needed to `ScreenHeader.tsx`. `BottomNav` received a corrected `glass-shadow-bottom` (was `glass-shadow-top`), a stronger active-tab capsule (`bg-primary/20`), and a filled-icon variant for the active state. These components are **shared** — changes affect **every route** that renders them (e.g. Quote Preview, Settings, Customers). **Intended impact is visual only** (same props, same links, same `active` tab behavior). No intentional behavior change.

---

## Exact scope

**In scope**
1. Apply glass styling to the Quotes List **screen header** via `ScreenHeader` (used by `QuoteList`). **Note:** glass treatment was already present in the repo; no code change was required.
2. Apply glass styling to **`BottomNav`** (visual only; no per-tab logic changes). Active tab: `bg-primary/20` capsule + `material-symbols-filled` icon variant. Shadow corrected to `glass-shadow-bottom`.
3. Restyle the **inline** floating action on Quotes List (forest gradient, target size per spec, `active:scale-95`) — **preserve** Material Symbol **`description`**, **`aria-label="New quote"`**, and existing `quoteCreateFlow` / navigation behavior.
4. The **ScreenHeader subtitle** (`"X active · Y pending"`) is the **sole** Quotes List summary. No bento or stat cards are rendered. The subtitle generation function (`buildQuoteSubtitle` in `QuoteList.helpers.ts`) is unchanged. A summary bento was explored during implementation and removed in favor of the subtitle-only approach to reclaim vertical space. **Do not reintroduce a bento without an explicit product decision.**
5. Render each quote/invoice row using `<QuoteListRow>` (`frontend/src/ui/QuoteListRow.tsx`) to avoid name collision with the existing `DocumentRow` interface inside `QuoteList.tsx`. Row typography uses three tiers: headline customer name (primary), optional `text-sm` secondary title, `text-xs` doc-number / date caption. Row surfaces use `rounded-[var(--radius-document)]` (12px). Draft rows use the glass-surface + `border-warning-accent` left-rail treatment. **"Needs customer"** is rendered as a pill badge from the same family as `StatusPill` — same height, padding, radius, and typography — with amber attention semantics (`bg-warning-container text-warning`). It is not a separate legacy component.
6. Replace or wrap status badges with **`StatusPill`** (`frontend/src/ui/StatusPill.tsx`) whose **variants match** `frontend/src/shared/components/StatusBadge.tsx` (`draft`, `ready`, `shared`, `viewed`, `approved`, `declined`, `sent`, `paid`, `void`). **"Needs customer"** belongs to the same pill-badge family: same `pillBase` classes (`text-[0.6875rem] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full`), amber color only.
7. Tokens added additively to `:root` in `frontend/src/index.css`: `--radius-document: 0.75rem`, `--tap-target-min: 44px`, `--tap-target-fab: 56px`. CSS utility `.material-symbols-filled` added for active-icon fill variant. No existing token redefined. Primitives created in `frontend/src/ui/`: `Eyebrow`, `Card`, `StatusPill`, `QuoteListRow`. `<Card>` is available for subsequent slices; it is not used directly in `QuoteList.tsx`.

**Out of scope (for this PR)**
- Review, Capture, Preview, Line Item editor, Settings, Onboarding **screen composition** (files under those features), except **incidental visual changes** from shared `ScreenHeader` / `BottomNav` edits.
- **Behavioral** changes to the Quotes / Invoices segmented control — **restyle only** (preserve `documentMode`, `aria-label="Document type filter"`, and fetches).
- Changing the FAB glyph from **`description`** to another icon (product decision; not part of styling-only PR1).
- Changing search **behavior** or routes; **visuals only** for search UI.
- Dedicated light-theme token redesign (smoke-test only: `[data-theme="light"]` must not break).
- Empty / error / loading **redesigns** beyond surface styling of what already renders.

**Generated design-package rule for PR1**
- `ui_kits/stima-mobile/Home.jsx` was used for visual structure, row hierarchy, and primitive styling reference.
- The summary bento in `Home.jsx` was explored and removed. It must **not** be treated as a shipping requirement for Quotes List summary display.
- It must **not** be treated as a source of truth for bottom-nav IA, FAB icon or destination, segmented-control **existence**, or route/action behavior.

---

## Exact files / components touched

| Area | Path | Change |
| ---- | ---- | ------ |
| Tokens | `frontend/src/index.css` | **Additive only:** `--radius-document`, `--tap-target-min`, `--tap-target-fab` added to `:root`; `.material-symbols-filled` utility added. No existing token redefined; `@theme --radius-lg` untouched. |
| Primitives | `frontend/src/ui/Eyebrow.tsx` **(new)** | Created. 11px / Inter 700 / `tracking-[0.12em]` / uppercase. Used for section labels in `DocumentRowsSection`. |
| Primitives | `frontend/src/ui/StatusPill.tsx` **(new)** | Created. `rounded-full` pill shape; variant union mirrors `StatusBadge`. "Needs customer" uses same `pillBase` with amber color. |
| Primitives | `frontend/src/ui/Card.tsx` **(new)** | Created. `accent` prop; `rounded-[var(--radius-document)]` + ghost shadow. Not used directly in `QuoteList.tsx`; available for future slices. |
| Primitives | `frontend/src/ui/QuoteListRow.tsx` **(new)** | Created. Three-tier typography. `rounded-[var(--radius-document)]` on row surfaces. "Needs customer" pill-family amber badge. |
| Helpers | `frontend/src/features/quotes/components/QuoteList.helpers.ts` **(new)** | Extracted `matchesSearch`, `buildQuoteSubtitle`, `buildInvoiceSubtitle` to keep `QuoteList.tsx` under the 450-line split threshold. |
| Chrome | `frontend/src/shared/components/ScreenHeader.tsx` | **No changes.** Glass treatment was already present in the repo. |
| Chrome | `frontend/src/shared/components/BottomNav.tsx` | `glass-shadow-top` → `glass-shadow-bottom`; active tab: `bg-primary/20` capsule; `material-symbols-filled` class on active icon. Navigation targets and `active` prop behavior unchanged. |
| Screen | `frontend/src/features/quotes/components/QuoteList.tsx` | Composed primitives. No bento. No data-layer or navigation-target changes. |
| FAB | **Inline in** `QuoteList.tsx` | Unchanged: `description` icon, `aria-label="New quote"`, `h-14 w-14`, `forest-gradient`, `active:scale-95`. |

**Not touched in this PR**
- Router config (`frontend/src/App.tsx`) — no route edits.
- Data-fetching hooks / service signatures — no API contract edits.
- `CONTEXT.md`.
- Global Tailwind config beyond additive tokens in `index.css`.
- `frontend/src/shared/components/ScreenHeader.tsx` — glass was already present.

---

## Tokens / primitives shipped in this slice

### Tokens (additive; reconcile with existing `index.css`)

**[FACT]** The repo already defined (in dark / `[data-theme="dark"]` / system-dark paths) keys such as `--color-warning-accent`, `--surface-glass`, `--shadow-ghost`, `--shadow-glass-top`, `--shadow-glass-bottom`, and related Material color roles. PR1 added only what was missing:

| Token | Value | Purpose |
| ----- | ----- | ------- |
| `--radius-document` | `0.75rem` (12px) | Document/card surfaces in this adoption — applied to `QuoteListRow` row surfaces and the `Card` primitive. **Do not** remap global `--radius-lg`. |
| `--tap-target-min` | `44px` | Minimum hit target reference. |
| `--tap-target-fab` | `56px` | FAB size reference. FAB was already `h-14 w-14` (56px); token documents the intent. |

CSS utility added (not a token):

| Class | Purpose |
| ----- | ------- |
| `.material-symbols-filled` | `font-variation-settings: "FILL" 1, "wght" 600` — active icon state in `BottomNav`. Defined after `.material-symbols-outlined` so it wins when both classes are applied. |

### Primitives

- `<Eyebrow>` — 11px / Inter 700 / `+0.12em` / uppercase. Used for `DRAFTS` / `PAST QUOTES` / `PAST INVOICES` section labels.
- `<StatusPill>` — `rounded-full` pill; variant union mirrors `StatusBadge`. **"Needs customer"** uses the same `pillBase` classes with `bg-warning-container text-warning` amber semantics.
- `<Card accent?>` — `rounded-[var(--radius-document)]` + ghost shadow. `accent ∈ warn | primary`. Available for future slices; not used directly in `QuoteList.tsx`.
- `<QuoteListRow>` — Three-tier row typography. Row surfaces `rounded-[var(--radius-document)]`. "Needs customer" rendered as pill-family badge. Props: `customerLabel`, `titleLabel?`, `docAndDate`, `totalAmount`, `status`, `isDraft?`, `needsCustomerAssignment?`, `onClick`.
- Chrome: **`ScreenHeader`** unchanged. **`BottomNav`** restyled — `glass-shadow-bottom`, `bg-primary/20` active capsule, filled icon.

---

## What must not change

- **Routes.** Authenticated home remains `/` → `QuoteList` via `App` routing. No new routes.
- **Data shape.** `QuoteListItem`, `InvoiceListItem`, filter state, `documentMode`, search state — untouched in meaning.
- **API calls.** Same endpoints, payloads, error handling.
- **Domain language and user-visible strings** — every string that exists before PR1 remains present **verbatim** (including section labels `DRAFTS`, `PAST QUOTES`, status words from `StatusBadge`, empty states, and the header subtitle pattern `X active · Y pending`). Subtitle generation is unchanged.
- **Flow.** Row `navigate` targets unchanged. FAB still opens the same create flow as today. Segmented control still switches quotes vs invoices and loads the same lists.
- **Light theme.** `[data-theme="light"]` still renders (smoke-test); PR1 does not redesign light tokens.
- **Existing tests** for Quotes List / `BottomNav` — pass or be updated **only** for className/structure assertions tied to intentional visual changes.

---

## Acceptance criteria (Quotes List-specific)

### Visual
- Screen header uses glass styling (already present in repo pre-PR1; no code change). ScreenHeader subtitle `"X active · Y pending"` is the **sole** list summary; no bento or stat cards.
- Bottom nav uses `glass-shadow-bottom` and `var(--surface-glass-strong)`. Active item: `bg-primary/20` capsule + `material-symbols-filled` icon; tab destinations and behavior unchanged.
- FAB: `h-14 w-14` (56px = `--tap-target-fab`), forest gradient, `active:scale-95`, Material Symbol **`description`**, `aria-label="New quote"` — all unchanged.
- Rows use `<QuoteListRow>`: headline customer name; optional `text-sm` secondary title; `text-xs` doc/date caption; status via `StatusPill`; row surfaces `rounded-[var(--radius-document)]`. Draft rows: glass-surface + `border-warning-accent` left rail. "Needs customer" rows: pill-family badge with amber semantics — same shape/size as all other pills.
- Status display uses the same **variant labels and meanings** as `StatusBadge`. "Needs customer" is pill-family amber, not a legacy separate badge component.

### Interaction
- FAB and rows use `active:scale-95` / `active:scale-[0.98]` as appropriate.
- No **new** hover-scale on surfaces this PR touches.
- Tappable targets meet **≥ 44px** where this PR modifies controls.
- Bottom nav tab switching and links work as before.

### Preserved behavior
- All **pre-existing user-visible strings** remain verbatim. Subtitle `"X active · Y pending"` is unchanged. Section labels `DRAFTS`, `PAST QUOTES`, `PAST INVOICES` unchanged. Empty states and status labels unchanged.
- Tapping a quote or invoice row navigates to the **same** destination as today.
- FAB triggers the **same** create entry flow.
- Search filtering and `documentMode` behavior unchanged.
- Light theme: smoke-test only (no full light QA in PR1).

### Code hygiene
- No new inline hex in files touched by this PR where a CSS variable exists; prefer **`var(--…)`**.
- No new `rounded-2xl` / `rounded-3xl` for adoption surfaces; `--radius-document` used via `rounded-[var(--radius-document)]`.
- TypeScript strict mode; no new `any`.

**Softened:** Amber rules apply to **files this PR touches**, not a repo-wide audit.

---

## Review checklist

### Diffs
- [x] Router config diff is **empty**.
- [x] Data-fetching hook / service diffs are **empty**.
- [x] `CONTEXT.md` diff is **empty**.
- [x] `QuoteList` + new primitives + `BottomNav` (+ `index.css` + `QuoteList.helpers.ts`) are the expected scope; `ScreenHeader.tsx` **not touched**; other feature screens unchanged except via shared chrome.

### Visual QA on a real device (both) — operator-only
- [ ] iOS Safari. Safe-area insets; glass blur.
- [ ] Android Chrome. Blur fallback acceptable if unsupported.
- [ ] Dark theme correct.
- [ ] `[data-theme="light"]` smoke-test — no obvious breakage.
- [ ] Text scale — no critical clipping.

### Primitives
- [x] `StatusPill` variants match **`StatusBadge`** / `QuoteStatus` + invoice variants.
- [x] "Needs customer" uses same pill-family `pillBase` classes with amber color; no separate component shape.
- [x] Row primitive props typed; statuses use discriminated union `StatusPillVariant`.

### Behavior
- [x] Row navigation unchanged.
- [x] FAB behavior and **`description`** icon unchanged.
- [x] Segmented Quotes/Invoices: same modes and fetches.
- [x] Quotes List / BottomNav tests pass (`make frontend-verify` clean).

### Hygiene
- [x] No unnecessary new inline hex.
- [x] No new hover-scale introduced.
- [x] No decorative illustration added.
- [x] No icon family substitution.

---

## Explicit defer list

Work intentionally **after** PR1. Blockers use **Decision log** row numbers in `Stima_Design_Adoption_Spec_revised.md`.

- **Review / Edit screen adoption.** Blocked until **Approval §1** / **Decision log #2** (Review primary CTA) is verified for that slice and line-item editing aligns with **Approval §3** / **Decision log #6** (Line Item schema).
- **Capture screen adoption.** Blocked on recorder layout drift resolution (master **Implementation order**).
- **Preview / Share screen adoption.** Blocked until **Approval §2** / **Decision log #3** (Preview action set) is verified.
- **Line Item edit screen / deep editor.** Blocked until **Approval §3** / **Decision log #6** (Line Item schema).
- **Onboarding** visual pass. Blocked until **Approval §4** / **Decision log #7** (Onboarding steps verified).
- **Settings** and other screens. Later slices; may depend on shared primitives.
- **Banner / Field / ScreenFooter** primitives for other flows — ship with later slices.
- **Light-theme token reconciliation.** **Decision log #8**; not PR1's focus.
- **Density modes, tablet/desktop, skeleton/empty/error redesigns** — out of scope.

**Master spec Decision log (cross-reference):**

| Topic | Decision log # |
| ----- | -------------- |
| Amber semantics | 1 |
| Review primary CTA | 2 |
| Preview action set | 3 |
| FAB preserve `description` on Quotes List | 4 |
| Quotes/Invoices control (restyle only) | 5 |
| Line Item schema | 6 |
| Onboarding steps | 7 |
| Light-theme tokens | 8 |
| Package README/SKILL authority | 9 |
| `--radius-document` vs global `--radius-lg` | 10 |
| Generated JSX reference-only | 11 |

---

## Decision dependencies

PR1 **preserves** FAB glyph (**Decision log #4**), **restyles** Quotes/Invoices toggle (**#5**), and applies **`--radius-document`** to both row surfaces and the `Card` primitive (**#10**) without redefining global Tailwind `--radius-lg`. The ScreenHeader subtitle is the shipping list summary; no bento was shipped.

| PR1 shipped without resolving | PR1 required |
| ----------------------------- | ------------ |
| Review CTA copy (Approval **§1** / log **#2**) | Additive tokens; no duplicate token keys |
| Preview actions (Approval **§2** / log **#3**) | `StatusBadge` variant parity for list + "Needs customer" in pill family |
| Line Item editor schema (Approval **§3** / log **#6**) | Shared chrome regression spot-check on other tabs |
| Onboarding / light-theme projects (Approval **§4–§5** / log **#7–#8**) | Tests updated only for intentional DOM/class changes |
| FAB icon *change* (not requested) | **Preserved** `description` + `aria-label` |

---

## PR1 shipped

PR #487 merged. All acceptance criteria met. Verified against `make frontend-verify` (all test suites pass; no blocking file-size issues). Tier 4 (real-device QA) is operator-only and tracked as a follow-up.

Primitives created: `Eyebrow`, `Card`, `StatusPill`, `QuoteListRow` (all in `frontend/src/ui/`). Helpers extracted to `QuoteList.helpers.ts`. No routes, data flow, service contracts, or IA changed.
