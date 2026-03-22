## Task: Design System Foundation — Tokens, Fonts, and Shared Components

**Type:** `type:task`
**Labels:** `area:frontend`, `area:tooling`
**Blocks:** All other design tasks (auth/onboarding, home screen, quote flow, preview/settings, customer hub)

---

### Goal

Establish the complete Stima design system in the frontend codebase so that all subsequent screen-reskin tasks can build on a stable, correct token set and component API.

This is the foundation task. No screen reskins belong here — only the token layer, font imports, and shared component updates/additions.

### Non-Goals

- Do not reskin any feature screens (login, register, onboarding, home, capture, review, etc.)
- Do not create `tailwind.config.ts` — the project uses Tailwind CSS v4 and the token layer lives in `index.css` via an `@theme` block
- Do not add CDN Tailwind or inline script config blocks

---

### Background and Design Reference

Design tokens, component patterns, and exact Tailwind class structures are documented in:
`plans/2026-03-22/stitch-design-notes.md`

- Section 1 "Design System" — all color tokens, fonts, border radius, shadow utilities
- Section 2 "Component Patterns" — exact HTML/class structure for every shared component

The visual philosophy is "Organic Brutalism": sharp 4px geometry, tonal surface shifts instead of borders, forest green primary, terracotta destructive, amber for AI warnings. Read the philosophy block before touching any styling.

Stitch-exported HTML source files (authoritative reference for exact class structures):
- `stitch_stima_home/stima_metric/DESIGN.md` — full design token reference
- Any `stitch_stima_home/*/code.html` — per-screen Tailwind class reference

---

### Implementation Plan

**Step 1 — Tailwind v4 `@theme` block in `frontend/src/index.css`**

The file currently contains only `@import "tailwindcss";`. Add a `@theme` block immediately after that import with all design tokens from `plans/2026-03-22/stitch-design-notes.md` section 1.

In Tailwind CSS v4 the `@theme` block registers custom tokens as CSS custom properties. Colors follow the pattern `--color-<name>: <value>` which makes them available as utility classes `bg-<name>`, `text-<name>`, `border-<name>`, etc. Font families use `--font-<name>`, border radius uses `--radius-<name>`.

Tokens to register:
- Complete color palette — copy every entry from the `colors` object in the design notes section 1. Do not approximate or invent values. Use exact hex codes.
- Font families: `--font-headline: "Space Grotesk"`, `--font-body: "Inter"`, `--font-label: "Inter"`
- Border radius: `--radius-DEFAULT: 0.125rem`, `--radius-lg: 0.25rem`, `--radius-xl: 0.5rem`, `--radius-full: 0.75rem`

Also add two CSS utility classes in `index.css` below the `@theme` block:
```css
.forest-gradient { background: linear-gradient(135deg, #004532 0%, #065f46 100%); }
.ghost-shadow { box-shadow: 0 0 24px rgba(13, 28, 46, 0.04); }
```

**Step 2 — Google Fonts + Material Symbols in `frontend/index.html`**

Add to `<head>`:
```html
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
```

Add to `index.css` below the utility classes:
```css
.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}
body { font-family: 'Inter', sans-serif; }
h1, h2, h3 { font-family: 'Space Grotesk', sans-serif; }
```

Usage in JSX: `<span className="material-symbols-outlined">icon_name</span>`

**Step 3 — Update `frontend/src/shared/components/Button.tsx`**

The current `ButtonProps` interface is:
```ts
interface ButtonProps {
  children: ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  isLoading?: boolean;
  onClick?: () => void;
}
```

Replace with the expanded interface:
```ts
interface ButtonProps {
  children: ReactNode;
  variant?: "primary" | "destructive" | "ghost";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  isLoading?: boolean;
  onClick?: () => void;
}
```

Variant class map (applied to the `<button>` element, merged with `className`):
- `primary`: `forest-gradient text-white font-semibold py-4 rounded-lg active:scale-[0.98] transition-all`
- `destructive`: `border border-secondary text-secondary font-semibold py-4 rounded-lg active:scale-[0.98] transition-all`
- `ghost`: `p-2 rounded-full hover:bg-slate-50 active:scale-95 transition-all` — for icon-only buttons (back arrows, copy icons, etc.)

Default `variant` to `"primary"` so existing callers do not break.

**`w-full` is NOT part of any variant class.** Width is the caller's responsibility — pass `className="w-full"` at each call site that needs a full-width CTA. This keeps the component from imposing layout on inline usages (header buttons, FAB wrappers, cancel actions) that exist on screens that will not be updated in this task. Each screen update task will add `className="w-full"` to its CTA buttons when it lands.

The current button is hardcoded to `bg-slate-900`. Remove that in favour of the variant-based class map. Before merging, scan all existing call sites across feature screens and confirm they either rely on the `"primary"` default without breaking, or explicitly pass a variant. Do not change any call sites in this task — that is the job of each screen update task.

Keep `isLoading` and `disabled` props as-is.

**Step 4 — Update `frontend/src/shared/components/Input.tsx`**

The current `InputProps` interface is:
```ts
interface InputProps {
  label: string;     // required
  id: string;        // required
  type?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  error?: string;
}
```

Replace with the expanded interface:
```ts
interface InputProps {
  label?: string;       // optional — omit for label-free usages (search fields)
  id?: string;          // optional — omit when no label association is needed
  placeholder?: string;
  className?: string;   // merged onto the <input> element
  type?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  error?: string;
}
```

When `label` is omitted, render no `<label>` element. When `id` is omitted, set no `id` on the `<input>`. This allows the component to serve both labeled form fields (login, register, onboarding, settings) and label-free search inputs (home screen, customer list).

New `<input>` classes (applied to the `<input>` element, merged with `className`):
```
w-full bg-surface-container-high rounded-lg px-4 py-3 font-body text-sm text-on-surface
placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-white transition-all
```

Key changes from current state:
- Remove any default border class (no border by default)
- Fill with `bg-surface-container-high` (resolves to `#dce9ff` via `@theme` tokens from step 1)
- Focus ring: `focus:ring-primary/30`
- Placeholder: `placeholder:text-outline`
- `label` and `id` are now optional
- `placeholder` and `className` props added

**Step 5 — Create new shared components**

Create all four files in `frontend/src/shared/components/`:

---

**`StatusBadge.tsx`** — prop: `variant: "draft" | "ready" | "shared"`

```tsx
const styles = {
  draft:  "bg-slate-100 text-slate-600",
  ready:  "bg-emerald-100 text-emerald-800",
  shared: "bg-sky-100 text-sky-800",
};
// Base classes (all variants): text-[0.6875rem] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg
```

---

**`AIConfidenceBanner.tsx`** — prop: `message: string`

Full structure from design notes section 2 "AI Confidence Banner":
```html
<div class="bg-amber-500/10 border-l-4 border-amber-500 rounded-lg p-4 backdrop-blur-md shadow-[0_0_24px_rgba(0,0,0,0.04)]">
  <div class="flex gap-3">
    <span class="material-symbols-outlined text-amber-600" style="font-variation-settings:'FILL' 1;">info</span>
    <div>
      <p class="text-[0.6875rem] font-bold text-amber-800 uppercase tracking-wider">AI Confidence Note</p>
      <p class="text-sm font-medium text-amber-900 leading-snug">{message}</p>
    </div>
  </div>
</div>
```

---

**`TradeTypeSelector.tsx`** — props: `value: string`, `onChange: (value: string) => void`

Options (6, in this order): `["Plumber", "Electrician", "Builder", "Painter", "Landscaper", "Other"]`

This list replaces the previous two-value set ("Landscaping", "Power Washing"). The backend `trade_type` column is `String(50)` with no check constraint — it accepts any of these values without a migration. The `profile.types.ts` `TRADE_TYPES` const will be updated in the auth/onboarding task when the selector is first wired into a screen.

```tsx
const TRADE_OPTIONS = ["Plumber", "Electrician", "Builder", "Painter", "Landscaper", "Other"] as const;
// Grid: grid grid-cols-2 gap-2
// Selected button: border-2 border-primary bg-primary/5 text-primary font-semibold
// Unselected button: border border-outline-variant/30 bg-surface-container-lowest text-on-surface-variant
// Each button: py-3 rounded-lg font-label text-sm
```

---

**`BottomNav.tsx`** — prop: `active: "quotes" | "customers" | "settings"`

Three tabs with their routes and active contexts:

| Tab label | Icon name | Navigates to | Active when path matches |
|---|---|---|---|
| Quotes | `description` | `/` | `/` or `/quotes/*/preview` |
| Customers | `group` | `/customers` | `/customers` or `/customers/*` |
| Settings | `settings` | `/settings` | `/settings` |

```html
<nav class="fixed bottom-0 w-full bg-white/80 backdrop-blur-md shadow-[0_0_24px_rgba(13,28,46,0.04)] flex justify-around py-3 z-50">
  <!-- active tab: text-primary; inactive: text-outline -->
  <!-- each tab: flex flex-col items-center gap-0.5 text-xs font-medium -->
</nav>
```

Use `useNavigate` from react-router-dom. Each tab is a `<button>` with a Material Symbol icon above the label text.

Visibility rule (enforced by each screen, not by a global layout): `BottomNav` renders on `QuoteList`, `QuotePreview`, `CustomerListScreen`, `CustomerDetailScreen`. It does NOT render on `CaptureScreen`, `ReviewScreen`, `EditLineItemScreen`, `CustomerSelectScreen`, `OnboardingForm`, `LoginForm`, `RegisterForm`, `SettingsScreen`.

**Sequencing note — `/customers` route:** The Customers tab navigates to `/customers`, which is added by the Customer Hub task (#43). Until that task merges, tapping the Customers tab redirects to `/login` (the catch-all route in `App.tsx`). This is expected behavior in a partial deploy — do not add conditional rendering or disabled-state logic to work around it. Build the tab as specified; the redirect is harmless in a dev environment.

**Step 6 — Update `LoadingScreen.tsx`**

Apply `bg-background` and `text-primary` so the loading screen uses design tokens and does not look out of place when the app boots.

---

### Acceptance Criteria

- [ ] `frontend/src/index.css` has a complete `@theme` block with all color tokens from design notes section 1 — no values invented or approximated, exact hex codes used
- [ ] `frontend/index.html` loads Space Grotesk, Inter, and Material Symbols Outlined from Google Fonts
- [ ] `forest-gradient` and `ghost-shadow` CSS utility classes are defined in `index.css` and usable via `className`
- [ ] `Button` accepts `variant` prop (defaults to `"primary"`) and `className` prop (merged onto `<button>`); existing call sites unbroken; `"destructive"` renders terracotta outline; `"ghost"` renders icon-button style; no variant includes `w-full`
- [ ] `Input` accepts optional `label`, optional `id`, `placeholder`, and `className` props; renders no `<label>` element when `label` is omitted; renders with `bg-surface-container-high` fill, no default border, green focus ring, correct placeholder color
- [ ] `StatusBadge` renders correct colour for all three variants
- [ ] `AIConfidenceBanner` renders amber left-border card with filled info icon and `message` prop text
- [ ] `TradeTypeSelector` renders 6 options in a `grid grid-cols-2` layout; selected option shows green border and background tint; clicking an option fires `onChange`
- [ ] `BottomNav` renders three tabs (Quotes, Customers, Settings) with correct Material Symbol icons and routes; `active` prop highlights the correct tab in `text-primary`
- [ ] No feature screen files are modified in this task
- [ ] Tests added for all new/updated shared components (see scope below) — no existing test files to update, these are all new
- [ ] `make frontend-verify` passes cleanly

---

### Files in Scope

```
frontend/index.html
frontend/src/index.css
frontend/src/shared/components/Button.tsx
frontend/src/shared/components/Input.tsx
frontend/src/shared/components/LoadingScreen.tsx
frontend/src/shared/components/StatusBadge.tsx          (new)
frontend/src/shared/components/AIConfidenceBanner.tsx   (new)
frontend/src/shared/components/TradeTypeSelector.tsx    (new)
frontend/src/shared/components/BottomNav.tsx            (new)
```

Tests to add (no existing shared component test files exist — add, do not update):
```
frontend/src/shared/components/Button.test.tsx
frontend/src/shared/components/Input.test.tsx
frontend/src/shared/components/StatusBadge.test.tsx
frontend/src/shared/components/AIConfidenceBanner.test.tsx
frontend/src/shared/components/TradeTypeSelector.test.tsx
frontend/src/shared/components/BottomNav.test.tsx
```

---

### Files Explicitly Out of Scope

All feature screen components in `features/auth`, `features/profile`, `features/quotes`, `features/customers`, `features/settings`.

---

### Verification

```bash
make frontend-verify
```

Raw fallback:
```bash
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
