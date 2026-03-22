# Stima Design Notes — Implementation Reference

Compiled from the Stitch design session, exported HTML, and DESIGN.md.
All token values are extracted directly from the exported code — use these
exact values in the Tailwind config.

---

## 1. Design System

### Philosophy
"Organic Brutalism" — rigid 4px architectural geometry, high-contrast palette,
editorial typography. No separator lines; use tonal surface shifts to define
sections. Feels like a precision tool, not a consumer app.

### Fonts
Load both from Google Fonts:
```
Space Grotesk — headlines (h1, h2, h3). Always tracking-tight.
Inter — body text, labels, all other copy.
```
```html
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
```

Tailwind font families:
```js
fontFamily: {
  headline: ["Space Grotesk"],
  body: ["Inter"],
  label: ["Inter"],
}
```

CSS baseline:
```css
body { font-family: 'Inter', sans-serif; }
h1, h2, h3 { font-family: 'Space Grotesk', sans-serif; }
```

### Icons
Material Symbols Outlined from Google Fonts. Thin-stroke style.
```html
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
```
```css
.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}
```
Usage: `<span class="material-symbols-outlined">arrow_back</span>`

### Color Tokens (exact values from exported HTML)

Paste this into the Tailwind config `theme.extend.colors`:

```js
colors: {
  // Core semantic
  "primary":                    "#004532",  // dark forest green — buttons, active states
  "primary-container":          "#065f46",  // mid forest green — gradient end, headers
  "on-primary":                 "#ffffff",
  "secondary":                  "#904a45",  // terracotta — destructive actions only
  "on-secondary":               "#ffffff",
  "error":                      "#ba1a1a",  // error banners and validation only
  "on-error":                   "#ffffff",
  "error-container":            "#ffdad6",

  // Surfaces (use tonal shifts, not borders, to separate sections)
  "background":                 "#f8f9ff",  // page background
  "surface":                    "#f8f9ff",
  "surface-bright":             "#f8f9ff",
  "surface-dim":                "#ccdbf3",
  "surface-container-lowest":   "#ffffff",  // white cards — sits "on top"
  "surface-container-low":      "#eff4ff",  // section backgrounds
  "surface-container":          "#e6eeff",
  "surface-container-high":     "#dce9ff",  // input field fill
  "surface-container-highest":  "#d5e3fc",
  "surface-variant":            "#d5e3fc",
  "surface-tint":               "#1b6b51",

  // Text
  "on-surface":                 "#0d1c2e",  // near-black — never use pure #000
  "on-surface-variant":         "#3f4944",
  "on-background":              "#0d1c2e",
  "on-secondary-container":     "#783733",

  // Borders
  "outline":                    "#6f7973",
  "outline-variant":            "#bec9c2",

  // Inverse
  "inverse-surface":            "#233144",
  "inverse-on-surface":         "#eaf1ff",
  "inverse-primary":            "#8bd6b6",

  // Tertiary (amber warning system)
  "tertiary":                   "#5b3300",
  "tertiary-container":         "#7b4700",
  "tertiary-fixed":             "#ffdcbe",
  "tertiary-fixed-dim":         "#ffb870",
  "on-tertiary":                "#ffffff",
  "on-tertiary-container":      "#ffba73",
  "on-tertiary-fixed":          "#2c1600",
  "on-tertiary-fixed-variant":  "#693c00",

  // Fixed variants
  "primary-fixed":              "#a6f2d1",
  "primary-fixed-dim":          "#8bd6b6",
  "on-primary-fixed":           "#002116",
  "on-primary-fixed-variant":   "#00513b",
  "on-primary-container":       "#8bd6b6",
  "secondary-fixed":            "#ffdad6",
  "secondary-fixed-dim":        "#ffb3ac",
  "on-secondary-fixed":         "#3b0908",
  "on-secondary-fixed-variant": "#73332f",
  "secondary-container":        "#fda49c",
}
```

### Border Radius
```js
borderRadius: {
  DEFAULT: "0.125rem",  // 2px — very sharp, architectural
  lg:      "0.25rem",   // 4px — main radius for cards, buttons, inputs
  xl:      "0.5rem",
  full:    "0.75rem",
}
```

### Shadows
**The Ghost Shadow** — extremely subtle. Use instead of hard borders.
```css
.ghost-shadow { box-shadow: 0 0 24px rgba(13, 28, 46, 0.04); }
```
Tailwind: `shadow-[0_0_24px_rgba(0,0,0,0.04)]`

**Glassmorphism** — for floating elements (bottom nav, FAB):
```css
backdrop-filter: blur(12px);
background: rgba(255,255,255,0.8);
```
Tailwind: `bg-white/80 backdrop-blur-md`

### Primary Button Gradient
```css
.forest-gradient { background: linear-gradient(135deg, #004532 0%, #065f46 100%); }
```
Apply to all primary buttons and key hero sections.

---

## 2. Component Patterns

### Top App Bar (header)
Fixed, full-width, glassmorphism blur:
```html
<header class="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md shadow-[0_0_24px_rgba(13,28,46,0.04)] flex items-center px-4 h-16">
  <button class="mr-4 text-emerald-900 p-2 rounded-full hover:bg-slate-50 active:scale-95 transition-all">
    <span class="material-symbols-outlined">arrow_back</span>
  </button>
  <h1 class="font-headline font-bold tracking-tight text-emerald-900 text-lg">Screen Title</h1>
</header>
```
Body needs top padding: `pt-16` or `pt-20` to clear the fixed header.

### Bottom Navigation
Glassmorphism, fixed bottom, 3 tabs: Home | Quotes | Settings.
Only shown on: Home, Quote Preview. NOT shown mid-flow (Capture, Review,
Customer Select, Edit Line Item, Onboarding, Login, Register).
```html
<nav class="fixed bottom-0 w-full bg-white/80 backdrop-blur-md shadow-[0_0_24px_rgba(13,28,46,0.04)] flex justify-around py-3 z-50">
  <!-- active tab: text-primary; inactive: text-outline -->
</nav>
```

### FAB (Floating Action Button)
Green circle, fixed bottom-right. Used on Home screen only.
```html
<button class="fixed bottom-20 right-4 z-50 w-14 h-14 rounded-full forest-gradient text-white shadow-[0_0_24px_rgba(0,0,0,0.12)] flex items-center justify-center active:scale-95 transition-all">
  <span class="material-symbols-outlined">add</span>
</button>
```

### Primary Button
Full-width, forest gradient, white text, 4px radius:
```html
<button class="w-full forest-gradient text-white font-label font-semibold py-4 rounded-lg active:scale-[0.98] transition-all">
  Button Label
</button>
```

### Destructive Button (Sign Out, Delete)
Terracotta outlined:
```html
<button class="w-full border border-secondary text-secondary font-label font-semibold py-4 rounded-lg active:scale-[0.98] transition-all">
  Delete Line Item
</button>
```

### Input Fields
No border by default. Fill with `surface-container-high`. Focus adds green border.
```html
<input class="w-full bg-surface-container-high rounded-lg px-4 py-3 font-body text-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-white transition-all"/>
```

### AI Confidence Banner (amber)
Left-bordered, amber tint, glassmorphism. Used ONLY for AI warning states.
```html
<div class="bg-amber-500/10 border-l-4 border-amber-500 rounded-lg p-4 backdrop-blur-md shadow-[0_0_24px_rgba(0,0,0,0.04)]">
  <div class="flex gap-3">
    <span class="material-symbols-outlined text-amber-600" style="font-variation-settings:'FILL' 1;">info</span>
    <div>
      <p class="text-[0.6875rem] font-bold text-amber-800 uppercase tracking-wider">AI Confidence Note</p>
      <p class="text-sm font-medium text-amber-900 leading-snug">Message here.</p>
    </div>
  </div>
</div>
```

### Error Banner
Red, for form validation errors only (not destructive actions):
```html
<div class="bg-error-container border-l-4 border-error rounded-lg p-4">
  <p class="text-sm font-medium text-error">Error message here.</p>
</div>
```

### Status Badges
4px radius, low-opacity fill, high-contrast text:
```html
<!-- Draft -->
<span class="bg-slate-100 text-slate-600 text-[0.6875rem] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg">Draft</span>
<!-- Ready -->
<span class="bg-emerald-100 text-emerald-800 text-[0.6875rem] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg">Ready</span>
<!-- Shared -->
<span class="bg-sky-100 text-sky-800 text-[0.6875rem] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg">Shared</span>
```

### Section Dividers
Never use `<hr>` or borders. Use `border-b border-outline-variant/20` on section headers only,
or transition surface colors (white card on #eff4ff background).

### Trade Type Selector (Onboarding + Settings)
2×3 grid of tap targets. Selected state: green border.
```html
<div class="grid grid-cols-2 gap-2">
  <button class="py-3 rounded-lg border-2 border-primary bg-primary/5 font-label text-sm font-semibold text-primary">Plumber</button>
  <button class="py-3 rounded-lg border border-outline-variant/30 bg-surface-container-lowest font-label text-sm text-on-surface-variant">Electrician</button>
  <!-- Builder, Painter, Landscaper, Other -->
</div>
```

---

## 3. Screen-by-Screen Reference

### Home (Quote List)
- Background: `bg-background` (`#f8f9ff`)
- No fixed header — title "Stima Quotes" is inline, `font-headline text-primary`
- Stats bar: two tiles side by side. Left: green left border (`border-l-4 border-primary`). Right: amber left border (`border-l-4 border-amber-500`). Labels uppercase, values in `font-headline text-3xl font-bold`
- Search: full-width `surface-container-high` input, no label, placeholder "Search customer or quote ID..."
- "Past Quotes" section heading left + "Sorted by: Most Recent" right in `text-[0.6875rem] text-outline uppercase tracking-widest`
- Quote cards: `bg-surface-container-lowest rounded-lg p-4 ghost-shadow`. Customer name `font-headline font-bold`. Quote number + date `text-sm text-on-surface-variant`. Status badge top-right. "X items" plain text `text-xs text-outline`. Total `font-bold text-on-surface`
- FAB: green circle bottom-right, clears bottom nav
- Bottom nav: Home | Quotes | Settings

### Login
- Full screen, `bg-background`, no header/nav
- "Stima" centered top, `font-headline text-3xl font-bold text-primary`
- White card `bg-surface-container-lowest rounded-xl p-6 ghost-shadow`
- "Welcome Back" in `font-headline text-2xl font-bold text-on-surface`
- Email + Password inputs stacked
- Error banner above button when login fails
- "Sign In →" primary button
- "Don't have an account? **Register**" link below

### Register
- Identical structure to Login
- Heading: "Create your account"
- Button: "Create Account →"
- Link: "Already have an account? **Sign In**"

### Onboarding
- Full screen, `bg-background`, no header/nav
- "Stima" centered top, same as auth screens
- White card
- Heading: "Set up your business"
- Subtitle: "Tell us a bit about your work so we can tailor your quotes."
- Business Name (required, `* required` label right-aligned in red)
- First Name + Last Name side by side (2-col grid)
- Trade Type: 2×3 grid selector (Plumber, Electrician, Builder, Painter, Landscaper, Other)
- "Continue →" primary button
- No support links, no badges, no helper banners
- Note for implementation: remove any "support@stima.com" link — doesn't exist

### Customer Select — Search
- Header: back arrow + "New Quote" `text-primary font-headline font-bold`
- Subtitle: "Select a customer to continue" `text-sm text-on-surface-variant`
- Search input full-width
- Customer rows: `bg-surface-container-lowest rounded-lg p-4`. Name `font-bold`. Contact info `text-sm text-on-surface-variant`. Right chevron `material-symbols-outlined`
- Empty state: subtle muted text
- Fixed bottom: "ADD NEW CUSTOMER" primary button with person+ icon
- No bottom nav

### Customer Select — Create
- Header: back arrow + "New Customer" `text-primary font-headline font-bold`
- No section headers
- Fields stacked: Full Name (required), Phone Number, Email Address, Address (multi-line textarea)
- "Create & Continue >" primary button
- No banners, no helper copy

### Capture Job Notes
- Header: back arrow + "Capture Job Notes" `font-headline font-bold text-emerald-900` + subtitle below title `text-xs text-slate-500`
- No bottom nav
- Voice and text shown simultaneously (not a toggle)
- Layout top → bottom:
  1. "RECORDED CLIPS" section label `font-headline text-sm font-semibold uppercase tracking-wide` + "0 CLIPS" counter badge
  2. Empty state card: `bg-surface-container-lowest border-2 border-dashed border-outline-variant/30 rounded-lg p-10` — mic_off icon, "No clips recorded yet"
  3. When clips exist: compact rows — play icon | "Clip 1 · 0:23" | × delete
  4. "WRITTEN DESCRIPTION" label + textarea `bg-surface-container-high`
  5. "TAP TO START" label + green mic button (centered, bottom third)
  6. "Extract Line Items ✦" primary button (disabled until clips or text present)
- Active recording state: mic button → terracotta stop button + "Recording... 0:23" red dot timer above it. Everything else stays identical.

### Review & Edit
- Header: back arrow + "Review & Edit" `font-headline font-bold text-emerald-900`
- No bottom nav
- AI Confidence banner (amber) — only when items flagged
- "Line Items" `font-headline font-bold text-primary` + "X ITEMS EXTRACTED" `text-[0.6875rem] text-outline uppercase tracking-widest` — separated by `border-b border-outline-variant/20`
- Line item cards: `bg-surface-container-lowest rounded-lg p-4 ghost-shadow`. Flagged items add `border border-amber-500/20`. Chevron right. REVIEW badge (amber) inline with name.
- Line items are tap-to-edit (drill-down to Edit Line Item screen) — not inline editable
- Totals section: `bg-surface-container-low rounded-lg p-4`. "Line Item Sum" muted + value. "TOTAL AMOUNT" label + large editable input.
- "+ Add Manual Line Item" dashed border button: `border-2 border-dashed border-outline-variant/30`
- "CUSTOMER NOTES" textarea
- "Generate Quote >" primary button fixed/pinned at bottom

### Edit Line Item (new screen — not yet implemented)
- Header: "REVIEW & EDIT" breadcrumb `text-xs text-outline uppercase` + "Edit Line Item" `font-headline font-bold text-emerald-900`
- No bottom nav
- AI Confidence banner at top — only when item is flagged
- Fields: Description (required, `REQUIRED` label right in green), Details (optional, `OPTIONAL` label right), Price (optional, `$ 0.00` placeholder)
- "Save Changes" primary button
- "Delete Line Item" terracotta outlined button below it
- Requires new route + component — Task issue needed before implementation

### Quote Preview
- Header: quote number as title (e.g. "Q-004") + status badge inline
- Back arrow top-left
- No bottom nav (or bottom nav depends on entry point — from home, show nav)
- "Generate PDF" primary button full-width
- "Share" outlined secondary button below (disabled until PDF generated)
- Preview area: `bg-surface-container-low rounded-xl` ~55vh tall. Placeholder: document icon + "Generate the PDF to preview it here."
- After PDF: iframe fills preview area
- After Share: "Share Link" row with URL + copy-to-clipboard icon button
- Below preview: "TOTAL AMOUNT" info card (green left border) + "CLIENT" info card (teal left border)

### Settings
- Header: back arrow + "Settings" `font-headline font-bold`
- No bottom nav (accessed from Home via nav)
- "Business Profile" card: `bg-surface-container-lowest rounded-xl p-6 ghost-shadow`
  - Business Name, First Name, Last Name inputs
  - Trade Type grid selector (same as Onboarding)
- "Account" card: `bg-surface-container-lowest rounded-xl p-6 ghost-shadow`
  - EMAIL label + email as plain text (read-only)
  - "SIGN OUT" terracotta filled button inline right (not full-width)
- "SAVE CHANGES" primary button full-width at bottom

---

## 4. Implementation Notes

### Tailwind Config Setup
The Stitch HTML uses CDN Tailwind. For the actual app, translate the inline
`tailwind.config` block into `frontend/tailwind.config.ts` (or CSS `@theme`
block in Tailwind v4).

### What to NOT copy from the HTML
- CDN Tailwind script tag — app uses Vite + @tailwindcss/vite
- Inline `<script id="tailwind-config">` — use project tailwind config instead
- Material Symbols font — decide if keeping or using a different icon set
- Space Grotesk — add to project via Google Fonts or self-host

### Existing Components to Update
- `Button` — add `variant` prop: `primary` (forest gradient), `destructive` (terracotta outlined), `ghost`
- `Input` — update to match: `bg-surface-container-high`, no border default, focus ring green

### New Components Needed
- `StatusBadge` — Draft / Ready / Shared variants
- `LineItemCard` — read-only card with chevron (for Review screen)
- `TradeTypeSelector` — 2×3 grid with selected state
- `AIConfidenceBanner` — amber banner component
- `BottomNav` — Home | Quotes | Settings with active state

### New Screens Needed
- `LineItemEditScreen` — new route, drill-down from Review. Task issue required.

### Asset References
All approved screen PNGs are in `stitch_stima_home/*/screen.png`.
All HTML source is in `stitch_stima_home/*/code.html`.
Full design token reference: `stitch_stima_home/stima_metric/DESIGN.md`.

The notes above are sufficient for implementation. If a specific layout detail
is ambiguous, check the relevant `code.html` file for the exact Tailwind
class structure Stitch used. Screen-to-directory mapping:
- Home → `stitch_stima_home/stima_home_refined/`
- Login → `stitch_stima_home/login_screen_final/`
- Register → `stitch_stima_home/register_screen_final_clean/`
- Onboarding → `stitch_stima_home/onboarding_screen/`
- Customer Select (search) → `stitch_stima_home/customer_select_search/`
- Customer Select (create) → `stitch_stima_home/new_customer_create/`
- Capture (idle) → `stitch_stima_home/capture_notes_idle_state_v2/`
- Capture (recording) → `stitch_stima_home/capture_notes_active_recording_v2/`
- Review → `stitch_stima_home/review_edit_quote_final/`
- Quote Preview → `stitch_stima_home/quote_preview_refined/`
- Edit Line Item (clean) → `stitch_stima_home/edit_line_item_clean/`
- Edit Line Item (flagged) → `stitch_stima_home/edit_line_item_flagged/`
- Settings → `stitch_stima_home/settings_screen/`
