# UI System — Stima Frontend

**For:** Agents and humans working on `area:frontend` scope.  
**Canonical source:** [`frontend/src/index.css`](src/index.css) for tokens; [`frontend/src/ui/`](src/ui/) + [`frontend/src/shared/components/`](src/shared/components/) for primitives.  
**Historical record:** [`stima-design-system/Stima_Design_Adoption_Spec_revised.md`](../stima-design-system/Stima_Design_Adoption_Spec_revised.md) (read for context, not contracts).

---

## 1. Token Catalog

Canonical CSS custom properties live in `frontend/src/index.css`. `stima-design-system/*` is reference only.

| Token | Value | Purpose | When to use |
|-------|-------|---------|-------------|
| `--radius-document` | `0.75rem` (12px) | Document/card/row radius | Every document-style surface: `<Card>`, `<Sheet>`, list rows, toasts, banners, modals. Use via `rounded-[var(--radius-document)]`. |
| `--radius-DEFAULT` | `0.125rem` | Tailwind default radius | Small inline chips, tags. Do NOT use for document surfaces. |
| `--radius-lg` | `0.25rem` | Tailwind `rounded-lg` | Legacy small-radius surfaces. Do NOT remap without migration plan. |
| `--radius-xl` | `0.5rem` | Tailwind `rounded-xl` | Legacy medium-radius surfaces. Do NOT remap without migration plan. |
| `--tap-target-min` | `44px` | Minimum tap target | Every tappable control. `<Button>` sizes `sm`/`md`/`lg` satisfy this. `iconButton` `xs` is explicitly below floor for dismiss/close inside larger containers only. |
| `--tap-target-fab` | `56px` | FAB size target | Floating action buttons (inline in feature code, not a shared primitive). |
| `--surface-glass` | `rgb(248 249 255 / 0.8)` (light) / `rgb(11 16 19 / 0.8)` (dark) | Glass surface background | Sticky headers, nav bars, footers. |
| `--surface-glass-strong` | `rgb(248 249 255 / 0.82)` (light) / `rgb(11 16 19 / 0.82)` (dark) | Stronger glass | Bottom nav specifically. |
| `--overlay-backdrop` | `rgb(0 0 0 / 0.35)` (light) / `rgb(0 0 0 / 0.55)` (dark) | Modal/sheet backdrop | `<Sheet>` overlay. |
| `--shadow-ghost` | `0 0 24px rgba(13, 28, 46, 0.04)` | Resting card elevation | Cards, rows, banners, toasts. |
| `--shadow-glass-top` | `0 0 24px rgba(13, 28, 46, 0.04)` | Top chrome shadow | `ScreenHeader`. |
| `--shadow-glass-bottom` | `0 -4px 24px rgba(0, 0, 0, 0.04)` | Bottom chrome shadow | `BottomNav`, `ScreenFooter`. |
| `--shadow-modal` | `0 24px 64px rgba(13, 28, 46, 0.24)` | Modal elevation | `<Sheet>` content. |
| `--color-warning-accent` | `#f59e0b` (light) / `#f0b44b` (dark) | Attention-only accent | 4px left-rail on needs-attention cards, AI banners, "needs customer" states. Never destructive. |
| `--color-primary` | `#004532` (light) / `#1b8e6c` (dark) | Brand action color | Primary CTAs, FABs, key actions. |
| `--color-secondary` | `#904a45` (light) / `#c07a71` (dark) | Secondary accent | Destructive tones, recording stop controls. |
| `--color-success` | `#166534` (light) / `#8cdeaa` (dark) | Success states | Status pills, success banners. |
| `--color-error` | `#ba1a1a` (light) / `#ffb4ab` (dark) | Error states | Error banners, error fields, destructive actions. |
| `--font-headline` | `"Space Grotesk"` | Display typeface | Headlines, money values, document labels. |
| `--font-body` / `--font-label` | `"Inter"` | Body and UI labels | All other text. |

### Theme tokens
Dark is default. Light is opt-in via `[data-theme="light"]`. System dark mode uses `@media (prefers-color-scheme: dark)` on `:root:not([data-theme="light"])`. When adding new surfaces, verify both paths.

---

## 2. Primitive Catalog

Every primitive is dumb: no data fetching, no routing. Call-sites own behavior.

### `Button`
**Path:** [`src/shared/components/Button.tsx`](src/shared/components/Button.tsx)

```tsx
import { Button } from "@/shared/components/Button";

<Button variant="primary" size="md" onClick={…}>Save</Button>
<Button variant="iconButton" size="sm" aria-label="Close" onClick={…}>×</Button>
```

- **When to use:** Any action button. Variants: `primary` | `secondary` | `tonal` | `destructive` | `ghost` | `iconButton`.
- **When NOT to use:**
  - Full-row list/card triggers (use raw `<button>` or row primitive).
  - Tab/segmented toggles (use raw `<button role="tab"` or `aria-pressed`).
  - FABs (use inline raw `<button>` with `forest-gradient`).
  - Drag handles, recording controls, input adornments (see [RAW_BUTTON_WHITELIST](src/ui/RAW_BUTTON_WHITELIST.md)).
- **Sizes:** `sm` (min-h-11) | `md` (min-h-12) | `lg` (min-h-14). `iconButton` adds `xs` (h-8×w-8) for close/dismiss inside larger containers only.
- **Tap target:** `sm`/`md`/`lg` satisfy `--tap-target-min`. `xs` intentionally breaks it.

### `Input`
**Path:** [`src/shared/components/Input.tsx`](src/shared/components/Input.tsx)

```tsx
import { Input } from "@/shared/components/Input";

<Input label="Customer name" value={name} onChange={…} />
```

- **When to use:** All text input fields.
- **When NOT to use:** Numeric currency fields (use `<NumericField>`), password fields (use `<PasswordField>`), select menus (use `<Select>`).
- **Features:** Label, hint, error, adornments, accessibility ids auto-generated.

### `NumericField`
**Path:** [`src/ui/NumericField.tsx`](src/ui/NumericField.tsx)

```tsx
import { NumericField } from "@/ui/NumericField";

<NumericField value={amount} onChange={setAmount} currencySymbol="$" />
```

- **When to use:** Currency, quantity, or any numeric input with optional step controls.
- **When NOT to use:** Plain text, phone, email (use `<Input>`).
- **Notes:** `showStepControls` renders `+`/`-` raw buttons (h-6×w-6, whitelisted).

### `PasswordField`
**Path:** [`src/ui/PasswordField.tsx`](src/ui/PasswordField.tsx)

```tsx
import { PasswordField } from "@/ui/PasswordField";

<PasswordField label="Password" value={password} onChange={…} />
```

- **When to use:** Password entry with show/hide toggle.
- **When NOT to use:** Non-password fields.

### `Select`
**Path:** [`src/ui/Select.tsx`](src/ui/Select.tsx)

```tsx
import { Select } from "@/ui/Select";

<Select label="Status" value={status} onChange={…}>
  <option value="draft">Draft</option>
</Select>
```

- **When to use:** Single-choice dropdowns.
- **When NOT to use:** Multi-select or combobox (not yet built).

### `Eyebrow`
**Path:** [`src/ui/Eyebrow.tsx`](src/ui/Eyebrow.tsx)

```tsx
import { Eyebrow } from "@/ui/Eyebrow";

<Eyebrow>Client</Eyebrow>
<Eyebrow as="h2">Section title</Eyebrow>
```

- **When to use:** Section labels, metadata headers, column headers.
- **When NOT to use:** Body copy, button labels, standalone headings without section context.
- **Style:** 11px / bold / uppercase / `tracking-[0.12em]` / `text-outline`.

### `StatusPill`
**Path:** [`src/ui/StatusPill.tsx`](src/ui/StatusPill.tsx)

```tsx
import { StatusPill } from "@/ui/StatusPill";

<StatusPill variant="ready" />
```

- **When to use:** Document status badges. Variants: `draft` | `ready` | `shared` | `viewed` | `approved` | `declined` | `sent` | `paid` | `void` | `needs_customer`.
- **When NOT to use:** General labels, tags, or non-status metadata.

### `Card`
**Path:** [`src/ui/Card.tsx`](src/ui/Card.tsx)

```tsx
import { Card } from "@/ui/Card";

<Card accent="warn">…</Card>
```

- **When to use:** Content containers, empty-state wrappers, grouped information.
- **When NOT to use:** List rows (use `<QuoteListRow>`), hero document surfaces (use `<DocumentHeroCard>`), modal content (use `<Sheet>`).
- **Accent:** `primary` | `warn` optional left-rail.

### `Banner`
**Path:** [`src/ui/Banner.tsx`](src/ui/Banner.tsx)

```tsx
import { Banner } from "@/ui/Banner";

<Banner kind="warn" title="AI Confidence" message="Low confidence." onDismiss={…} />
```

- **When to use:** Inline alerts, AI confidence notes, validation summaries.
- **When NOT to use:** Toast notifications (use `useToast`), error boundaries (use `<ErrorFallback>`), modal dialogs (use `<ConfirmModal>`).
- **Kinds:** `warn` | `info` | `success` | `error`.

### `Sheet`
**Path:** [`src/ui/Sheet.tsx`](src/ui/Sheet.tsx)

```tsx
import { Sheet, SheetHeader, SheetTitle, SheetBody, SheetFooter, SheetCloseButton } from "@/ui/Sheet";

<Sheet open={isOpen} onOpenChange={setIsOpen}>
  <SheetHeader>
    <SheetTitle>Edit line item</SheetTitle>
    <SheetCloseButton />
  </SheetHeader>
  <SheetBody>…</SheetBody>
  <SheetFooter>…</SheetFooter>
</Sheet>
```

- **When to use:** Bottom sheets, dialogs, modals.
- **When NOT to use:** Full-screen page transitions (use `<PageTransition>`), inline expandable panels.
- **Rule:** `Dialog.Root` from Radix must only appear inside `<Sheet>`; never import `Dialog.Root` directly in feature code.

### `EmptyState`
**Path:** [`src/ui/EmptyState.tsx`](src/ui/EmptyState.tsx)

```tsx
import { EmptyState } from "@/ui/EmptyState";

<EmptyState icon="description" title="No quotes yet" body="Create your first quote." action={…} />
```

- **When to use:** Empty lists, missing data surfaces.
- **When NOT to use:** Loading states (use skeletons), error states (use `<ErrorFallback>` or `<Banner>`).

### `Toast` / `ToastProvider` / `useToast`
**Path:** [`src/ui/Toast.tsx`](src/ui/Toast.tsx)

```tsx
import { ToastProvider, useToast } from "@/ui/Toast";

const { show, dismiss } = useToast();
show({ message: "Saved", variant: "success" });
```

- **When to use:** Transient success/error/info/warning feedback after actions.
- **When NOT to use:** Persistent inline alerts (use `<Banner>`), form field errors (use `<Input>` error prop).

### `PageTransition`
**Path:** [`src/ui/PageTransition.tsx`](src/ui/PageTransition.tsx)

```tsx
import { PageTransition } from "@/ui/PageTransition";

// In router shell:
<PageTransition />
```

- **When to use:** Global route-level cross-fade transition.
- **When NOT to use:** Component-level micro-interactions, sheet open/close.

### `QuoteListRow`
**Path:** [`src/ui/QuoteListRow.tsx`](src/ui/QuoteListRow.tsx)

```tsx
import { QuoteListRow } from "@/ui/QuoteListRow";

<QuoteListRow
  customerLabel="Acme Co"
  docAndDate="Q-1001 · Oct 12, 2023"
  totalAmount={2450}
  status="ready"
  onClick={…}
/>
```

- **When to use:** Quote/invoice list rows.
- **When NOT to use:** Customer list rows, history rows (use feature-specific row components or raw `<button>` with same surface tokens).

### `DocumentHeroCard`
**Path:** [`src/ui/DocumentHeroCard.tsx`](src/ui/DocumentHeroCard.tsx)

```tsx
import { DocumentHeroCard } from "@/ui/DocumentHeroCard";

<DocumentHeroCard
  documentLabel="QUOTE"
  status="ready"
  clientName="Acme Co"
  clientContact="alice@acme.com"
  totalAmount={2450}
  …
/>
```

- **When to use:** Quote/invoice detail hero surfaces.
- **When NOT to use:** List rows, preview cards.

### `ScreenHeader`
**Path:** [`src/shared/components/ScreenHeader.tsx`](src/shared/components/ScreenHeader.tsx)

```tsx
import { ScreenHeader } from "@/shared/components/ScreenHeader";

<ScreenHeader title="Quotes" eyebrow="Overview" onBack={…} />
```

- **When to use:** Every screen top chrome. `layout="top-level"` for home route.
- **When NOT to use:** Workflow screens with exit-to-home (use `<WorkflowScreenHeader>`).

### `WorkflowScreenHeader`
**Path:** [`src/shared/components/WorkflowScreenHeader.tsx`](src/shared/components/WorkflowScreenHeader.tsx)

```tsx
import { WorkflowScreenHeader } from "@/shared/components/WorkflowScreenHeader";

<WorkflowScreenHeader title="Review" onBack={…} onExitHome={…} />
```

- **When to use:** Capture, review, edit, preview flows with an exit-to-home affordance.

### `ScreenFooter`
**Path:** [`src/shared/components/ScreenFooter.tsx`](src/shared/components/ScreenFooter.tsx)

```tsx
import { ScreenFooter } from "@/shared/components/ScreenFooter";

<ScreenFooter>
  <Button variant="primary" className="w-full">Generate Quote</Button>
</ScreenFooter>
```

- **When to use:** Sticky action footers on mobile screens.
- **When NOT to use:** Inline bottom content that scrolls with the page.

### `BottomNav`
**Path:** [`src/shared/components/BottomNav.tsx`](src/shared/components/BottomNav.tsx)

```tsx
import { BottomNav } from "@/shared/components/BottomNav";

<BottomNav active="quotes" />
```

- **When to use:** Primary app navigation on authenticated routes.
- **When NOT to use:** Wizard/step navigation, tab panels inside a screen.

### `ConfirmModal`
**Path:** [`src/shared/components/ConfirmModal.tsx`](src/shared/components/ConfirmModal.tsx)

```tsx
import { ConfirmModal } from "@/shared/components/ConfirmModal";

<ConfirmModal
  title="Delete quote?"
  confirmLabel="Delete"
  cancelLabel="Cancel"
  onConfirm={…}
  onCancel={…}
  variant="destructive"
/>
```

- **When to use:** Destructive or irreversible action confirmations.
- **When NOT to use:** Inline warnings (use `<Banner>`), non-blocking hints (use `<Toast>`).

### `OverflowMenu`
**Path:** [`src/shared/components/OverflowMenu.tsx`](src/shared/components/OverflowMenu.tsx)

```tsx
import { OverflowMenu } from "@/shared/components/OverflowMenu";

<OverflowMenu items={[ { label: "Edit", icon: "edit", onSelect: … } ]} />
```

- **When to use:** Secondary actions that don't fit the primary chrome.
- **When NOT to use:** Primary CTAs, inline action lists.

### `DocumentActionSurface`
**Path:** [`src/shared/components/DocumentActionSurface.tsx`](src/shared/components/DocumentActionSurface.tsx)

```tsx
import { DocumentActionSurface } from "@/shared/components/DocumentActionSurface";

<DocumentActionSurface
  sectionLabel="Share"
  primaryAction={<a className={documentActionPrimaryLinkClassName}>Copy link</a>}
  utilityActions={…}
/>
```

- **When to use:** Preview/share action panels with primary + utility grid layout.
- **When NOT to use:** General form footers (use `<ScreenFooter>`), inline buttons.

### `PricingRow`
**Path:** [`src/shared/components/PricingRow.tsx`](src/shared/components/PricingRow.tsx)

```tsx
import { PricingRow } from "@/shared/components/PricingRow";

<PricingRow label="Subtotal" value={subtotal} />
<PricingRow label="Total" value={total} emphasized />
```

- **When to use:** Money breakdown lines inside pricing blocks.
- **When NOT to use:** General key/value pairs outside pricing context.

### `LoadingScreen`
**Path:** [`src/shared/components/LoadingScreen.tsx`](src/shared/components/LoadingScreen.tsx)

```tsx
import { LoadingScreen } from "@/shared/components/LoadingScreen";

<LoadingScreen />
```

- **When to use:** Full-page app initialization loading state.

### `ErrorFallback`
**Path:** [`src/shared/components/ErrorFallback.tsx`](src/shared/components/ErrorFallback.tsx)

```tsx
import { ErrorFallback } from "@/shared/components/ErrorFallback";

<ErrorFallback />
```

- **When to use:** React error boundary fallback.

### `ThemeProvider`
**Path:** [`src/shared/components/ThemeProvider.tsx`](src/shared/components/ThemeProvider.tsx)

```tsx
import { ThemeProvider } from "@/shared/components/ThemeProvider";

<ThemeProvider>{app}</ThemeProvider>
```

- **When to use:** Root app wrapper. Manages `preference`, `effectiveTheme`, and `data-theme` attribute.

---

## 3. Composition Rules

| Context | Primitive to use |
|---------|-----------------|
| Sticky footer with primary action | `<ScreenFooter>` |
| Bottom sheet / dialog / modal | `<Sheet>` (never raw `Dialog.Root`) |
| Status badge on document | `<StatusPill>` |
| Section label / metadata header | `<Eyebrow>` |
| Empty list surface | `<EmptyState>` |
| Inline alert / AI confidence | `<Banner>` |
| Transient action feedback | `useToast()` |
| Full-page load | `<LoadingScreen>` |
| Error boundary | `<ErrorFallback>` |
| Form text input | `<Input>` |
| Form password input | `<PasswordField>` |
| Form numeric/currency input | `<NumericField>` |
| Form dropdown | `<Select>` |
| Quote/invoice list row | `<QuoteListRow>` |
| Document hero detail card | `<DocumentHeroCard>` |
| Pricing breakdown line | `<PricingRow>` |
| Share/preview action panel | `<DocumentActionSurface>` |
| Screen top chrome | `<ScreenHeader>` or `<WorkflowScreenHeader>` |
| Primary app nav | `<BottomNav>` |
| Destructive confirmation | `<ConfirmModal>` |
| Secondary actions overflow | `<OverflowMenu>` |
| Route transition | `<PageTransition>` |

---

## 4. Decision Tree

```
I need to show...
├─ A transient message after an action
│  └─ useToast()
├─ A persistent alert or AI note
│  └─ <Banner>
├─ A document status
│  └─ <StatusPill>
├─ A section label or metadata header
│  └─ <Eyebrow>
├─ An empty list state
│  └─ <EmptyState>
├─ A modal / bottom sheet
│  └─ <Sheet>
├─ A sticky action footer
│  └─ <ScreenFooter>
├─ A primary/secondary/destructive button
│  └─ <Button>
├─ A text input
│  ├─ Password → <PasswordField>
│  ├─ Numeric/currency → <NumericField>
│  └─ Plain text → <Input>
├─ A dropdown
│  └─ <Select>
├─ A card/container
│  ├─ Quote/invoice hero → <DocumentHeroCard>
│  └─ Generic content → <Card>
├─ A list row
│  ├─ Quote/invoice → <QuoteListRow>
│  └─ Other → raw <button> with row surface tokens (see whitelist)
├─ A pricing line
│  └─ <PricingRow>
├─ Share/preview actions
│  └─ <DocumentActionSurface>
├─ Top screen chrome
│  ├─ With exit-to-home → <WorkflowScreenHeader>
│  └─ Standard → <ScreenHeader>
├─ Bottom nav
│  └─ <BottomNav>
├─ Confirmation dialog
│  └─ <ConfirmModal>
├─ Overflow menu
│  └─ <OverflowMenu>
└─ Full-page loading / error
   ├─ Loading → <LoadingScreen>
   └─ Error → <ErrorFallback>
```

---

## 5. Banned Patterns

1. **No `rounded-xl` / `rounded-lg` / `rounded-2xl` / `rounded-3xl` on document surfaces.** Use `rounded-[var(--radius-document)]`.
2. **No inline `<button className="forest-gradient...">` in feature code.** FABs are the only allowed inline `forest-gradient` buttons and are documented in [RAW_BUTTON_WHITELIST](src/ui/RAW_BUTTON_WHITELIST.md).
3. **No raw `<input>` in feature code.** Use `<Input>`, `<NumericField>`, `<PasswordField>`, or `<Select>`.
4. **No Radix `Dialog.Root` outside `Sheet.tsx`.** Feature code imports `<Sheet>`; never imports `@radix-ui/react-dialog` directly.
5. **No inline eyebrow spans.** Use `<Eyebrow>` for all section labels.
6. **No hover-scale.** Tappables use `active:scale-[0.98]` or `active:scale-95`; never `hover:scale-*`.
7. **No new inline hex colors.** All colors reference tokens from `frontend/src/index.css`.
8. **No undocumented raw `<button>`.** Any raw button must be in [RAW_BUTTON_WHITELIST](src/ui/RAW_BUTTON_WHITELIST.md) with category and reason, or is a migration candidate.

---

## 6. Token Governance

- **Canonical source:** `frontend/src/index.css`. This is the only file that defines production tokens.
- **Reference only:** `stima-design-system/colors_and_type.css` and `stima-design-system/ui_kits/` are design references, not contracts.
- **Migration rule:** Redefining `@theme --radius-lg` or any other global Tailwind theme token is banned without a migration plan that audits every existing usage.
- **Adding tokens:** New tokens land in `:root` (not `@theme`) when they must not remap existing Tailwind utilities. Document them in this file.

---

## 7. Dark-First + Theme Rules

- **Dark is default.** `:root` sets `color-scheme: dark` tokens. Light is opt-in via `[data-theme="light"]`.
- **System mode:** When `data-theme` is absent, `@media (prefers-color-scheme: dark)` applies. Never assume `data-theme="dark"` is always present.
- **Smoke-testing light:** When adding a new surface or token, verify `[data-theme="light"]` renders correctly. At minimum, check that custom properties have light values in the `:root` block and dark overrides in the `@media` + `[data-theme="dark"]` blocks.
- **Light reconciliation:** If a light-theme bug is found, file it as a follow-up. Do not block a dark-first PR on light-theme polish unless the PR explicitly scopes light work.

---

## 8. Acceptance Gates

Every UI PR must satisfy:

- [ ] All document-style surfaces in touched files use `rounded-[var(--radius-document)]`.
- [ ] No new inline hex; all colors reference tokens.
- [ ] Tappables use `active:scale-*`; no hover-scale introduced.
- [ ] Tap targets ≥ 44px for new/touched controls (verify once per primitive).
- [ ] Section labels use `<Eyebrow>`; status displays use `<StatusPill>`; sheets use `<Sheet>`; empty states use `<EmptyState>`.
- [ ] Form inputs use `<Input>` / `<NumericField>` / `<Select>` / `<PasswordField>`.
- [ ] Safe-area insets respected where fixed/sticky elements are introduced (`safe-top`, `safe-bottom`, `safe-bottom-keyboard`, `sheet-safe-bottom`).
- [ ] Light theme smoke-tested (`[data-theme="light"]`).
- [ ] No raw `<button>` added without whitelist entry or migration plan.
- [ ] No Radix `Dialog.Root` imported in feature code.
