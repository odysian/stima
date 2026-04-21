# Stima Design Adoption Spec — v2 (hardened)

## Status

**Draft for review — revised after package audit, JSX research, and repo cross-check.** Supersedes the prior adoption spec. This document is scoped as a **visual and interaction refresh only**. It does not introduce new product behavior, routes, schema, or domain vocabulary. Items not verifiable against `odysian/stima` are explicitly marked **[DECISION REQUIRED]** or **[VERIFY]** rather than asserted.

**PR1 (Quotes List UI adoption) shipped in PR #487.** The Quotes List section and related primitives/tokens now reflect the shipped state. Remaining slices are pre-implementation.

**Repo access during the original pass was limited to artifacts already pulled into the design project** (screenshots under `assets/screens/`, the Stitch light-theme mockups, the generated UI kit, and the Nucleus .fig). Claims that require reading current production source are marked **[VERIFY]** where still applicable. A coding agent must resolve every [VERIFY] before merging a slice that touches that area.

---

## Source separation

Every statement downstream is tagged one of:

- **[FACT]** — verified against concrete artifacts in this project or widely-known repo facts (stack, token file location, font choices, domain glossary).
- **[NUCLEUS]** — visual pattern from the Nucleus UI kit; inspiration, not contract.
- **[PROPOSAL]** — Stima-specific design decision being proposed by this spec; needs sign-off.
- **[VERIFY]** — claim that requires reading live repo source before implementation.
- **[DECISION REQUIRED]** — open question that blocks implementation of the affected slice until answered.

### Repo-verified facts

- **[FACT]** Stack: React 19 + TypeScript + Tailwind v4. Source of truth for tokens is `frontend/src/index.css`.
- **[FACT]** Theme: dark default with `[data-theme="light"]` opt-in. Token names mirror Material You roles.
- **[FACT]** Primary brand color is theme-dependent in `frontend/src/index.css` (e.g. dark default uses `#1b8e6c` for `--color-primary` under dark / system-dark paths; light `@theme` uses `#004532` unless overridden by `[data-theme="light"]` / product theme wiring).
- **[FACT]** Typography: Space Grotesk (display) + Inter (body/labels), Google-hosted.
- **[FACT]** Icon system: Google Material Symbols Outlined (variable font).
- **[FACT]** Domain vocabulary fixed in `CONTEXT.md`: *Capture, Extraction, Quote Draft, Review, Share, Line Item, Customer, Job.*
- **[FACT]** Product is mobile-first web, single-column at all breakpoints.
- **[FACT]** Stitch mockups in `stitch_stima_home/` are **light-theme reference only** — they are not the shipping direction.
- **[FACT]** Quotes List (authenticated home `/`) is implemented in `frontend/src/features/quotes/components/QuoteList.tsx`. It includes a **Quotes / Invoices** segmented control (`documentMode`), loads quotes via `quoteService.listQuotes()` and invoices via `invoiceService.listInvoices()`, and preserves existing navigation targets per row. Adoption is **restyle only**; do not remove or change IA.
- **[FACT]** The floating “New quote” control on Quotes List is an **inline** `<button>` in `QuoteList.tsx` (not a standalone `FAB.tsx`). It uses Material Symbol `**description`**, `aria-label="New quote"`, `fixed` positioning (`bottom-20 right-4`), `h-14 w-14`, `forest-gradient`, and `active:scale-95`. Visual refresh must not swap the glyph or label unless product explicitly approves (that is a product change, not a styling default).
- **[FACT]** Top and bottom chrome on Quotes List come from `frontend/src/shared/components/ScreenHeader.tsx` and `frontend/src/shared/components/BottomNav.tsx`. Editing these shared components can change **appearance on every route that imports them**; props, routing, and tab behavior must stay the same unless a slice explicitly scopes a behavioral change (this adoption does not).

### Nucleus-inspired patterns (inspiration, not canon)

- **[NUCLEUS]** 12px card radius as the dominant container radius for **document-style** surfaces (use repo token strategy below — do not assume `rounded-lg` mapping).
- **[NUCLEUS]** Glass-blurred sticky top-bar / bottom-nav.
- **[NUCLEUS]** Pill segmented control.
- **[NUCLEUS]** 4px left-rail accent on cards (draft / review / primary highlight).
- **[NUCLEUS]** Bento stat cells. **→ Not used in PR1.** Quotes List shipped a subtitle-only summary ("X active · Y pending") in the ScreenHeader. Bento remains available as a pattern for future slices if the product introduces dashboard-style stats; do not re-introduce it without explicit product sign-off.
- **[NUCLEUS]** Uppercase tracked-label eyebrows.
- **[NUCLEUS]** Ghost shadow as the sole resting card elevation.

### Generated JSX kit usage rule

- **[PROPOSAL]** `ui_kits/stima-mobile/*.jsx` are **visual hierarchy and primitive styling references only**. They are not production code and do not override repo routes, action sets, navigation IA, screen ownership, or form schema.
- **[PROPOSAL]** `Home.jsx` may inform Quotes List spacing, row hierarchy, and chrome styling, but it does **not** decide bottom-nav IA, FAB icon/destination, or whether a segmented Quotes/Invoices control exists — those are **defined in the repo** (`QuoteList.tsx` + `BottomNav.tsx`). **Note (post-PR1):** The summary bento treatment from `Home.jsx` was not adopted; Quotes List ships subtitle-only summary. Do not re-introduce bento without explicit product sign-off.
- **[PROPOSAL]** `Review.jsx`, `Preview.jsx`, `Capture.jsx`, and `LineItem.jsx` may inform card hierarchy and primitive styling, but repo truth wins anywhere the generated JSX drifts on CTA labels, action sets, recorder placement, or field schema.

### Stima design proposals

- **[PROPOSAL]** Amber `#e6b44c` / `#f0b44b` is the **attention-only** color for both AI-review and needs-customer / needs-attention states. It is never destructive; destructive remains error red (`#ffb4ab`).
- **[PROPOSAL]** Forest gradient restricted to FAB and primary-CTA footer buttons.
- **[PROPOSAL]** Uppercase 11px tracked eyebrows as signature micro-typography.
- **[PROPOSAL]** `active:scale-95` tap feedback on all tappables; no hover-scale.
- **[PROPOSAL]** Grouped-list inset surface wrapping stacked cards.
- **[PROPOSAL]** Dashed-border treatment limited to the *Add manual line item* affordance.

### Unresolved decisions (tracked in §"Approval decisions still required")

See that section. Amber semantics are approved in this revision. Remaining slice-blocking items: Review-screen primary CTA label, Preview action set, Line Item full schema vs mock, Onboarding structure, light-theme reconciliation.

---

## Approved design direction

1. **Dark-first.** Light is opt-in. Mockups in `stitch_stima_home/` are reference only; they do not override dark-first direction.
2. **One brand action color** — Stima green. Amber is the approved attention-only color for AI-review and needs-customer / needs-attention states.
3. **Two families, nothing else** — Space Grotesk for display, Inter for everything else.
4. **Material Symbols Outlined** is the only icon system.
5. **Mobile-first web, single-column at every breakpoint.**
6. **Tight radii for document cards (12px target via dedicated token), pill buttons, ghost shadows, no borders.**
7. **Sticky glass chrome** on top-bar and bottom-nav only.
8. **Functional motion only** — 200ms transitions, `active:scale-95`, no hover-scale.

---

## Approval decisions still required

These block implementation of the **affected slice** until resolved. Recommendations align with repo-truth-first adoption.

1. **[DECISION REQUIRED] Review-screen primary CTA label.** The generated mock uses *"Generate Quote"*. The shipping flow routes Review → Preview, where PDF is *generated* on Preview. Proposal: keep the repo's current label unless the product explicitly approves a copy change. **[VERIFY]** current label in Review/Edit implementation.
2. **[DECISION REQUIRED] Preview action set.** Generated mock shows extra actions. Proposal: adopt **only** the actions the repo currently ships; do not add actions. **[VERIFY]** against `QuotePreview` and related action components.
3. **[DECISION REQUIRED] Line Item schema.** Generated Line Item mock shows 3 fields (Description / Details / Price). Real schema has more fields. Proposal: use the repo's actual schema; the mock is visual only. **[VERIFY]** types in `frontend/src/features/quotes/types/quote.types.ts` and editors.
4. **[DECISION REQUIRED] Onboarding flow.** Generated mock is a single card. Shipping onboarding may be multi-step. Proposal: adopt visuals per step; do not collapse steps. **[VERIFY]** `OnboardingForm` and routes.
5. **[DECISION REQUIRED] Light-theme token values.** Kit values may not match `frontend/src/index.css`. Proposal: the repo's light-theme tokens win; reconcile before any dedicated light-theme redesign.

**Not decision-gated (repo facts for adoption):**

- **Quotes / Invoices segmented control:** **[FACT]** Shipped on `QuoteList`. **Preserve behavior and data loading; restyle only.**
- **FAB on Quotes List:** **[FACT]** Inline button; Material Symbol `description`; preserve `aria-label` and navigation behavior unless product approves otherwise.

---

## Design principles

- **Capture first, refine later.** No flow changes; this is a design principle, not an IA change.
- **One action color.** Primary tappable → Stima green. Attention → amber. Everything else → surface tone.
- **Thumb-safe.** 44px minimum hit target; FAB sits above bottom nav.
- **Domain language in the UI.** *Quote Draft*, *Line Item*, *Capture*, *Extraction*, *Share* remain verbatim where already used.
- **Formatted numbers and dates.** `$2,450.00`, `04`, `Oct 12, 2023`. No relative times in lists unless the repo already uses them.
- **No filler.** No decorative SVG, no stats that aren't informative.

---

## Token changes

Changes are **additive** to `frontend/src/index.css` unless marked otherwise. **[FACT]** Many glass, shadow, and warning-accent tokens **already exist** in the repo (including dark-mode `--color-warning-accent`, `--surface-glass`, `--shadow-ghost`, `--shadow-glass-*`). A slice PR should **only add missing keys** (e.g. tap targets, `--radius-document`) or **adjust values deliberately** with full-app visual QA — not re-specify the entire table as if greenfield.

### 4.1 Keep unchanged

- **[FACT]** Existing Material You role names (`--color-primary`, `--color-surface-container-lowest`, etc.) are not renamed.
- **[FACT]** Existing Stima green values in the repo are not shifted without an explicit design decision.

### 4.2 Add or confirm (do not break Tailwind `rounded-lg`)


| Token                    | Purpose                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--color-warning-accent` | Already present in repo dark theme (`#f0b44b`); 4px left-rail on needs-attention cards; AI-banner rail. Confirm during slice; do not duplicate conflicting definitions.                                                                                                                                                                                                   |
| `--surface-glass`        | Already present; sticky top-bar / bottom-nav background.                                                                                                                                                                                                                                                                                                                  |
| `--shadow-ghost`         | Already present; resting card elevation.                                                                                                                                                                                                                                                                                                                                  |
| `--shadow-glass-top`     | Already present; sticky top-bar.                                                                                                                                                                                                                                                                                                                                          |
| `--shadow-glass-bottom`  | Already present; bottom nav / sticky footer.                                                                                                                                                                                                                                                                                                                              |
| `--shadow-modal`         | Already present; dialogs.                                                                                                                                                                                                                                                                                                                                                 |
| `--radius-document`      | **Added in PR1:** `0.75rem` (12px) for **document/card/row** surfaces. Defined in `:root` (not `@theme`) so it does not remap `rounded-lg` app-wide. Use as `rounded-[var(--radius-document)]` in Tailwind arbitrary values. |
| `--tap-target-min`       | **Added in PR1:** `44px` minimum hit target.                                                                                                                                                                                  |
| `--tap-target-fab`       | **Added in PR1:** `56px` FAB size target.                                                                                                                                                                                     |
| `.material-symbols-filled` (CSS class) | **Added in PR1:** `font-variation-settings: "FILL" 1, "wght" 600, "GRAD" 0, "opsz" 24`. Apply alongside `.material-symbols-outlined` for the filled icon variant (appears later in CSS; order is intentional). Used on active BottomNav icons. |


### 4.3 Token governance

- Tokens land in `frontend/src/index.css`. This package's `colors_and_type.css` is **reference**, not canonical.
- If the repo and this package disagree, the repo wins; update this package when syncing.
- `colors_and_type.css` and `ui_kits/stima-mobile/*.jsx` may be used to confirm design intent, but they do not override production tokens, routing, action sets, or schema.

### 4.4 Package README / SKILL.md

- **[FACT]** `stima-design-system/README.md` and `stima-design-system/SKILL.md` are **design-package helpers**. They may say “verbatim” kit use for **throwaway prototypes**; for **production**, `**CONTEXT.md`, `frontend/src/index.css`, and this adoption spec** take precedence. Agents must not treat SKILL/README as API or routing contracts.

---

## Primitive / component changes

Introduce reusable React primitives under `**frontend/src/ui/`** (create the folder if absent) or, if the project prefers feature-first only, co-locate under `frontend/src/shared/components/` — **[VERIFY]** with `frontend/AGENTS.md` before filing structure.


| Primitive                    | Replaces (pattern in tree)      | Notes                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<Eyebrow>`                  | Free-form 11px uppercase spans  | 11px / Inter 700 / +0.12em / uppercase.                                                                                                                                                                                                                                                                   |
| `<StatusPill variant>`       | `StatusBadge` and ad-hoc badges | **Shipped in PR1** at `frontend/src/ui/StatusPill.tsx`. Maps same variants as `StatusBadge` (`draft`, `ready`, `shared`, `viewed`, `approved`, `declined`, `sent`, `paid`, `void`). **"Needs customer" uses the same pill shape** (`pillBase` constant) with amber semantics (`bg-warning-container text-warning`) — not a separate badge type. **[VERIFY]** if new variants are added in future slices. |
| `<Banner kind>`              | Ad-hoc AI-confidence boxes      | `kind ∈ warn · info · success · error`; left-rail + icon + eyebrow + body.                                                                                                                                                                                                                                |
| `<Card accent?>`             | Ad-hoc card wrappers            | **Shipped in PR1** at `frontend/src/ui/Card.tsx`. `accent ∈ warn · primary` optional. Uses `rounded-[var(--radius-document)]` + ghost-shadow. **Not used in `QuoteList.tsx`** (bento was removed from PR1 scope); available for future slices. |
| `<Button variant>`           | Mixed button styles             | `frontend/src/shared/components/Button.tsx` — rework variants; keep public API.                                                                                                                                                                                                                           |
| `<Field>`                    | Inline form inputs              | Via shared `Input` / field patterns — **[VERIFY]** call sites.                                                                                                                                                                                                                                            |
| `<ScreenFooter>`             | Per-screen sticky footers       | Glass + blur wrapper.                                                                                                                                                                                                                                                                                     |
| `<QuoteListRow>`             | Quote/invoice list rows         | **Shipped in PR1** at `frontend/src/ui/QuoteListRow.tsx`. Three-tier typography (headline / secondary / caption). Draft rows use glass surface + warn-accent left-rail. "Needs customer" badge uses same pill family as `<StatusPill>`. Both row variants use `rounded-[var(--radius-document)]`. |


**Primitive rules**

- Primitives are **dumb**. No data fetching, no routing. Call-sites own behavior.
- Primitives accept `className` / `style` overrides only when the Nucleus-derived look does not fit a rare case.
- Generated JSX screens may demonstrate primitive composition, but implementation must map those ideas onto repo-owned components rather than copying generated files verbatim.
- Every primitive ships with a small static preview card (location **[VERIFY]** — e.g. `stima-design-system/preview/` for design artifacts, or a repo convention if one exists).

---

## Exact repo-grounded component mapping

Paths reflect `**odysian/stima` as of spec correction**; **[VERIFY]** before editing if structure drifts.


| Kit name           | Stima call-site            | Path                                                                  | Action                                                                                                             |
| ------------------ | -------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `AppBar`           | Top-level screen header    | `frontend/src/shared/components/ScreenHeader.tsx`                     | Glass chrome; **preserve props and behavior.**                                                                     |
| `BottomNav`        | Bottom tab bar             | `frontend/src/shared/components/BottomNav.tsx`                        | Restyle active state + Material Symbols `FILL` where applicable; **preserve navigation targets.**                  |
| `FAB`              | “New quote” on Quotes List | **Inline in** `frontend/src/features/quotes/components/QuoteList.tsx` | Forest gradient, sizing, tap scale; **keep `description` icon and `aria-label` unless product approves a change.** |
| `Button`           | Buttons across app         | `frontend/src/shared/components/Button.tsx`                           | Variants; keep API.                                                                                                |
| Status row badge   | Quote/invoice rows         | `QuoteList` + `StatusBadge` / new `StatusPill` wrapper                | Consolidate styling; **same variant enum as `StatusBadge`.**                                                       |
| `Card` / list rows | Quotes List                | `frontend/src/features/quotes/components/QuoteList.tsx`               | **PR1:** Standardized list rows via `<QuoteListRow>`. Bento not used; `<Card>` available for future slices.        |
| Quote list row     | Quote list row UI          | `frontend/src/ui/QuoteListRow.tsx` (extracted in PR1)                 | **Shipped.** Layout swap complete; navigation targets unchanged.                                                   |
| `Field`            | Forms                      | `frontend/src/shared/components/Input.tsx` and form call sites        | **[VERIFY]**                                                                                                       |
| `Banner`           | AI-confidence on Review    | Review feature components                                             | Extract when that slice ships.                                                                                     |
| `Segmented`        | Quotes / Invoices          | `**QuoteList.tsx`** — **already shipped**                             | **Restyle only.**                                                                                                  |
| `ScreenFooter`     | Sticky footers             | Per-screen (e.g. `ScreenFooter.tsx`)                                  | Extract when needed.                                                                                               |
| `Eyebrow`          | Section headers            | Inline spans → primitive                                              | Extract when needed.                                                                                               |


---

## Screen-by-screen adoption rules

**Rule for every screen:** layout and copy stay, chrome and primitives swap — **unless** a **[VERIFY]** shows current copy differs; then repo wins.

### Quotes List

**Status: Shipped in PR #487.**

- **[FACT — PR1 shipped]** Route `/`, state (`documentMode`, search, etc.), data sources (`listQuotes` / `listInvoices`), and row navigation targets unchanged.
- **[FACT — PR1 shipped]** `ScreenHeader` already had glass chrome (`glass-surface glass-shadow-top`). No changes were needed for PR1.
- **[FACT — PR1 shipped]** **Summary:** Subtitle-only — `”X active · Y pending”` — computed by `buildQuoteSubtitle` in `frontend/src/features/quotes/components/QuoteList.helpers.ts`. Counts: `status === “ready” || status === “shared”` → active; `status === “draft”` → pending. **No bento stat cards.** Do not re-introduce bento without explicit product sign-off.
- **[FACT — PR1 shipped]** **Three-tier row typography:** headline (`font-headline font-bold` — customer name + total amount) / secondary (`text-sm text-on-surface-variant` — optional title label) / caption (`text-xs text-on-surface-variant` — docAndDate metadata + pill badge). The caption tier is intentionally below the 14px body floor; it applies only to dense metadata in list rows.
- **[FACT — PR1 shipped]** **”Needs customer” badge:** Same pill shape and size as `<StatusPill>` (`text-[0.6875rem] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full`). Amber semantics: `bg-warning-container text-warning`. Not a separate badge type — same family, different color.
- **[FACT — PR1 shipped]** **Row surfaces:** Base rows use `rounded-[var(--radius-document)] bg-surface-container-lowest ghost-shadow`. Draft rows add `glass-surface border-l-4 border-warning-accent backdrop-blur-md`. Both variants use `rounded-[var(--radius-document)]` (12px).
- **[FACT — PR1 shipped]** **BottomNav:** Active capsule uses `bg-primary/20` + `material-symbols-filled`. Chrome: `glass-surface-strong glass-shadow-bottom` (note: `glass-shadow-bottom`, not `glass-shadow-top`).
- **[FACT-preserved]** Search placeholders and labels for quotes vs invoices — existing strings kept for each mode.
- **[FACT-preserved]** Row content (customer, doc id, date, total, status) unchanged.
- **[FACT]** **Segmented Quotes/Invoices:** preserved; restyle only.
- **[FACT]** **FAB:** inline button; `description` icon; create flow behavior preserved.
- **[PROPOSAL]** `ui_kits/stima-mobile/Home.jsx` is visual reference only for spacing, row hierarchy, and chrome — **not** IA. The bento treatment from this kit was not adopted.

### Capture

- **[FACT]** Route, audio state machine, transcript persistence unchanged.
- **[PROPOSAL]** Glass header via `WorkflowScreenHeader` / capture layout — **[VERIFY]** exact component.
- **[PROPOSAL]** Waveform inside a `Card` tinted to `surface-container-low`. Bars solid green, no glow.
- **[FACT-preserved]** *Recorded Clips* / *Written Description* section labels.
- **[PROPOSAL – DRIFT FLAGGED]** Generated mock floats the recorder over content. If current Capture stacks vertically, **keep the stack**; the float is an exploration.
- **[PROPOSAL]** Sticky `ScreenFooter` with secondary *"Extract Line Items"* CTA. **[VERIFY]** exact label.

### Review / Edit

- **[FACT]** Route, line-item state, totals calc, override-total mechanism unchanged.
- **[PROPOSAL]** First element is `Banner kind="warn"` with *AI confidence note* eyebrow. **[VERIFY]** copy.
- **[PROPOSAL]** Flagged items get `accent="warn"` + status treatment per repo. Unflagged items: no inappropriate accent.
- **[FACT-preserved]** Price is Stima green, Space Grotesk. Meta line patterns per repo. Chevron affords tap-to-edit.
- **[PROPOSAL]** Totals block on `surface-container-low`. Total in 2px primary-ringed input. Caption: *"Tap to override calculated total"* — **[VERIFY]** exact string.
- **[FACT-preserved]** Dashed border only on *Add manual line item*.
- **[DECISION REQUIRED]** Primary-CTA label — see **Approval decision 1**. Default: keep repo's existing label.
- **[PROPOSAL – DRIFT FLAGGED]** Line Item sub-screen mock shows 3 fields. **Implementation uses the repo's full Line Item schema** — see **Approval decision 3**.

### Preview / Share

- **[FACT]** Route, PDF-gen flow, public-link mechanism, copy-link behavior unchanged.
- **[PROPOSAL]** Header shows quote context + status treatment — **[VERIFY]** `QuotePreview` + `ScreenHeader`.
- **[DECISION REQUIRED]** Action set — **Approval decision 2**. Adopt the repo's actual set; do not add actions.
- **[PROPOSAL]** Stat cards for totals / customer — use terms already in repo UI — **[VERIFY]**.
- **[PROPOSAL]** Public link presentation — only if it already exists — **[VERIFY]**.

---

## Non-goals

- No route, URL, or query-param changes.
- No domain vocabulary changes.
- No desktop or tablet-specific layouts.
- No new screens.
- No new actions or CTAs beyond what the repo already ships.
- No copying generated JSX files into production as-is; they are reference assets, not production source.
- No illustrations, hero imagery, decorative SVG.
- No hover-scale, parallax, page transitions.
- No icon-system swap.
- No font self-hosting in this pass.
- No removal of the **Quotes / Invoices** control from Quotes List; **restyle only.**

---

## Risks / mismatches in the generated package

Each risk below has a remediation that keeps repo truth authoritative.

1. **Light-theme mockups.** Reference only; dark-first wins.
2. **Line Item 3-field subset.** Mock is visual; schema stays.
3. **Capture recorder overlap.** Visual exploration; defer to shipping stack.
4. **Segmented toggle.** Repo **has** Quotes/Invoices on `QuoteList` — do not treat kit as authority.
5. **Preview two-row CTA layout.** Defer to repo's action set.
6. **FAB icon (`mic` vs kit).** Repo uses `**description`** on Quotes List — preserve unless product approves.
7. **Onboarding single-card layout.** Adopt visuals per step; do not collapse.
8. **Light-theme token values.** Repo values win; reconcile.
9. **Icon glyph inventory.** Illustrative only; do not add glyphs for new use-cases without product need.
10. **Status pill variants.** Must match `StatusBadge` / `QuoteStatus` (+ invoice statuses), not a fictional kit-only enum.
11. **Package README / SKILL.md as contract.** Not for production routing or schema; see §4.4.
12. **Generated JSX overreach.** `ui_kits/stima-mobile/*.jsx` drifts on nav IA, FAB, CTA labels, preview actions, and line-item schema. Reference only.

---

## Implementation order

Each step is independently shippable. PR1 is defined in `**PR1_Quotes_List_UI_Adoption_revised.md`**.

1. **Tokens** — additive merge into `frontend/src/index.css` (including `**--radius-document`** as needed). **Do not** redefine global `--radius-lg` in `@theme` in a way that remaps Tailwind `rounded-lg` app-wide without a deliberate migration. Visual QA; minimal or no UI code if token-only.
2. **Shared primitives** — introduce primitives needed for the next slice (not necessarily all at once).
3. **Glass chrome** — `ScreenHeader`, `BottomNav` — **visual updates may apply everywhere those components render**; behavior unchanged. Safe-area QA on iOS Safari.
4. **Quote List FAB + motion hygiene** — inline FAB on `QuoteList`; tap feedback; no hover-scale additions.
5. **Quotes List adoption (PR1)** — see companion doc. `ui_kits/stima-mobile/Home.jsx` is visual reference only.
6. **Review / Edit adoption** — after **Approval decisions 1** (Review CTA) and **3** (Line Item schema) are verified for that slice.
7. **Line Item screen adoption** — after **Approval decision 3**.
8. **Capture adoption** — after drift resolution for recorder layout.
9. **Preview adoption** — after **Approval decision 2** (Preview action set verified).
10. **Settings + Onboarding** — after **Approval decisions 4–5** as applicable.
11. **Regression pass** — real device, iOS Safari + Android Chrome, both text-scale settings.

---

## Acceptance criteria

Acceptance applies per slice, not globally. Each slice PR must satisfy these broad criteria; slice-specific criteria live in the slice document.

### Visual fidelity

- The slice's affected screens match the generated UI-kit screen **for visuals**, with repo-accurate content, schema, and copy.
- **New document/card surfaces** introduced in the slice use `**--radius-document` (12px)** (or explicit `rounded-[…]` tied to that token). Do not add ad-hoc `rounded-2xl` / `rounded-3xl` **in the slice** for those surfaces. **Do not** silently change all `rounded-lg` utilities by redefining `--radius-lg` globally.
- Amber usage in the slice is limited to approved attention surfaces: `<Banner kind="warn">`, `accent="warn"` cards, and status/attention treatments that align with repo semantics.
- Forest gradient appears **only** on FAB and primary-CTA footer buttons **in contexts where it already applies** unless the slice explicitly extends it (not default).
- Sticky chrome uses the glass token recipe (`var(--surface-glass)`, etc.).

### Typography

- Section headers in the slice go through `<Eyebrow>` where the slice introduces that primitive.
- Money values use Space Grotesk with the documented tracking.
- Body ≥ 14px. **Exception:** dense list-row metadata uses `text-xs` (12px) — the caption tier is permitted for docAndDate and pill badges inside `<QuoteListRow>`, not for body copy.

### Interaction

- Primary tap targets ≥ 44px (measured once per primitive, not per instance).
- Tappable surfaces show `active:scale-95` or `active:scale-[0.98]`.
- No hover-scale introduced.

### Preserved behavior

- No route, URL, query-param, or state-shape change in the slice.
- Domain strings and **status labels** appear as in repo (`StatusBadge` text).
- Light theme continues to render when `[data-theme="light"]` is set (tokens merge cleanly).
- Existing E2E suite passes for the happy path the slice touches.

### Code hygiene

- No new inline hex in files touched by the slice (existing untouched code is left alone).
- Every new primitive has a preview card (location per repo or design package — **[VERIFY]**).

**Softened from v1:** criteria like "codebase search returns zero amber hits" are **removed** — they are brittle. The rule is: no new amber outside approved attention semantics **in files the slice touches**.

---

## Open follow-ups (not blockers)

- Density modes for Quotes list.
- Tablet / desktop layout (out of scope for this spec).
- Contrast audit (amber-on-dark, green-on-dark) against WCAG AA.
- Internationalization / long-string overflow.
- Empty / error / loading / skeleton states.
- Print-CSS for generated PDF.
- Storybook integration (if the repo does not already have one).

---

## Decision log


| #   | Item                      | Recommended answer                                                                                                                                  | Confidence | Why                                      | Block / no-block                                       |
| --- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------- | ------------------------------------------------------ |
| 1   | Amber semantic scope      | **Approved:** amber means *attention* — AI-review and needs-customer. Destructive is error red, never amber.                                        | High       | Single attention semantic.               | **No-block. Confirmed by PR1** — "Needs customer" badge uses amber pill semantics. |
| 2   | Review-screen primary CTA | Keep exact label in repo; do not adopt mock *"Generate Quote"* unless product approves.                                                             | High       | Copy is product scope.                   | **Block Review slice** until [VERIFY].                 |
| 3   | Preview action set        | Ship only actions that exist today; do not add *Send to customer* / *Invoice* if absent.                                                            | High       | Prevents scope creep.                    | **Block Preview slice** until [VERIFY].                |
| 4   | FAB on Quotes List        | **FACT:** Inline button, Material Symbol `description`, `aria-label="New quote"` — preserve in visual refresh.                                      | High       | Glyph/behavior are product decisions.    | **No-block. Confirmed by PR1** — FAB unchanged.        |
| 5   | Quotes/Invoices control   | **FACT:** Shipped in `QuoteList.tsx`. **Restyle only;** preserve `documentMode` and fetches.                                                        | High       | IA already exists.                       | **No-block. Confirmed by PR1** — segmented control preserved. |
| 6   | Line Item schema          | Use repo fields; mock is visual.                                                                                                                    | High       | Schema is contract.                      | **Block Line Item slice** until [VERIFY].              |
| 7   | Onboarding steps          | Preserve step count; visuals per step.                                                                                                              | Medium     | Flow integrity.                          | **Block Onboarding slice** until [VERIFY].             |
| 8   | Light-theme tokens        | Repo wins; reconcile before light-theme projects.                                                                                                   | High       | `index.css` is source of truth.          | **Block dedicated light-theme work** until reconciled. |
| 9   | Package README/SKILL      | Not production contracts; repo + `CONTEXT.md` win.                                                                                                  | High       | Prevents double authority.               | **No-block. Confirmed by PR1.**                        |
| 10  | Card/document radius      | Use `--radius-document` (12px) for adoption cards; **do not** redefine global `@theme` `--radius-lg` to 12px without auditing all `rounded-lg`.     | High       | Avoids accidental full-app radius shift. | **Locked by PR1.** `--radius-document: 0.75rem` added to `:root`; rows use `rounded-[var(--radius-document)]`. |
| 11  | Generated JSX kit         | Reference only for hierarchy; not routing/schema/IA.                                                                                                | High       | Kit drifts from product.                 | **No-block. Confirmed by PR1** — bento not adopted.    |


---

## What PR1 proved / locked in

Stable lessons from the Quotes List slice that constrain future slices:

1. **`:root` token strategy works.** `--radius-document: 0.75rem` in `:root` (not `@theme`) correctly scopes the 12px card radius to adoption surfaces without remapping every `rounded-lg` utility. Use `rounded-[var(--radius-document)]` in arbitrary Tailwind classes — not `rounded-xl` or `rounded-lg`.

2. **Subtitle-only summary is sufficient.** The ScreenHeader subtitle ("X active · Y pending") communicates list state without bento stat cards. Bento adds visual complexity for marginal gain; it is explicitly out of scope for Quotes List and must not be re-introduced without product sign-off.

3. **Pill family unification works.** Sharing `pillBase` (`text-[0.6875rem] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full`) between `<StatusPill>` and the "Needs customer" badge keeps badge geometry consistent across all attention states. The distinction is color semantics only, not shape.

4. **Three-tier row typography is the pattern.** Headline / secondary / caption maps naturally to customer name + total / title label / metadata. The caption tier (`text-xs`) is approved for dense metadata inside `<QuoteListRow>` — not a body-copy exception.

5. **`glass-shadow-bottom` on fixed bottom elements.** Fixed elements at the bottom of the viewport must use `glass-shadow-bottom`, not `glass-shadow-top`. This was a correction in PR1.

6. **`material-symbols-filled` via CSS class.** The filled icon variant is achieved by adding `.material-symbols-filled` alongside `.material-symbols-outlined` (later CSS position handles the override). No separate icon font is needed.

7. **Helpers file split threshold.** `QuoteList.tsx` hit the 450-line FAIL threshold during PR1; `QuoteList.helpers.ts` was extracted. The split threshold is real — keep pure logic (search predicates, subtitle builders) out of component files.

8. **ScreenHeader required no changes.** It already had `glass-surface glass-shadow-top`. Future slices should verify component state before assuming adoption work is needed.

---

**Approval ↔ Decision log mapping** (same topics, two lists):


| § "Approval decisions still required" | Decision log # |
| ------------------------------------- | -------------- |
| 1 Review CTA                          | 2              |
| 2 Preview action set                  | 3              |
| 3 Line Item schema                    | 6              |
| 4 Onboarding                          | 7              |
| 5 Light-theme tokens                  | 8              |


