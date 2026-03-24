# Design System — Stima

This document is the authoritative reference for all frontend visual and interaction decisions. An agent building a new screen should be able to produce pixel-consistent UI by following this doc alone (plus `docs/PATTERNS.md` for code-structure conventions and shared component APIs).

**Scope:** Visual language, color usage, typography, spacing, elevation, layout anatomy, card/list patterns, interaction states, icons.
**Not in scope:** Code architecture, test strategy, component prop interfaces (see `docs/PATTERNS.md`), API contracts (see `docs/ARCHITECTURE.md`).

---

## 1. Design Philosophy

**North star: "The Precision Blueprint"**

Stima is a tool for tradespeople. The interface mirrors the qualities a tradesperson respects: precision, reliability, clarity. We draw from architectural drafting — rigid geometry, deliberate whitespace, tonal depth instead of decorative borders.

**Organic Brutalism:** The marriage of rigid geometry with a sophisticated, high-contrast palette. Surfaces feel physical — cards sit on backgrounds, floating elements hover with glassmorphic blur, primary actions carry visual weight through gradients.

**Three principles that resolve every ambiguity:**

1. **Hierarchy through depth, not decoration.** Use tonal surface shifts and ambient shadows to separate content. Never use 1px solid borders for sectioning. If something needs to feel distinct, change the background — don't draw a line around it.

2. **Scanability over density.** A tradesperson checks quotes between jobs, on a phone, possibly wearing gloves. Every screen should answer "what am I looking at?" within one second. Put the two most important values on the same scan line. Collapse metadata. Use whitespace as a separator.

3. **Weight signals importance.** Primary actions use the forest gradient (visual weight through color mass). Destructive actions use terracotta (a warm, intentional red — not alarming, but serious). Ghost actions disappear into the background. The gradient is reserved for the single most important action on a screen.

---

## 2. Color System

All colors are defined as Tailwind theme tokens in `frontend/src/index.css`. Always use token classes (e.g., `text-primary`, `bg-surface-container-low`). Never use raw hex values or Tailwind's default palette (`bg-red-500`, `text-gray-700`, etc.).

### Semantic roles

| Role | Token | Hex | Usage |
|------|-------|-----|-------|
| **Primary** | `primary` | `#004532` | CTAs, FABs, active states, brand marks |
| **Primary container** | `primary-container` | `#065f46` | Gradient endpoint, elevated primary surfaces |
| **On-primary** | `on-primary` | `#ffffff` | Text/icons on primary backgrounds |
| **Secondary** | `secondary` | `#904a45` | Destructive borders, terracotta accents |
| **Success** | `success` | `#166534` | "Ready" status text |
| **Success container** | `success-container` | `#dcfce7` | "Ready" status background |
| **Warning** | `warning` | `#92400e` | Warning text |
| **Warning accent** | `warning-accent` | `#f59e0b` | AI confidence borders, "pending" accents |
| **Warning container** | `warning-container` | `#fef3c7` | Warning/confidence backgrounds |
| **Error** | `error` | `#ba1a1a` | Error text, error borders |
| **Error container** | `error-container` | `#ffdad6` | Error backgrounds |
| **Info** | `info` | `#075985` | "Shared" status text |
| **Info container** | `info-container` | `#e0f2fe` | "Shared" status background |

### Surface hierarchy

This is the most important visual concept in the system. Depth is created by stacking surfaces at different tonal levels — not by adding borders or shadows.

| Level | Token | Hex | Usage |
|-------|-------|-----|-------|
| **Level 0** (base) | `background` | `#f8f9ff` | Page background, screen base |
| **Level 1** (grouping) | `surface-container-low` | `#eff4ff` | List containers, content grouping regions |
| **Level 2** (interactive) | `surface-container-lowest` | `#ffffff` | Cards, list items, input fills (focused state) |
| **Level 3** (recessed) | `surface-container-high` | `#dce9ff` | Input fills (default state), recessed surfaces |

**The rule:** Cards (Level 2) sit on grouped regions (Level 1), which sit on the page (Level 0). A card on a page without a grouping region still works because `#ffffff` on `#f8f9ff` has enough contrast. But inside a list of 5+ items, the grouping region is mandatory to prevent a "wall of white."

### Text hierarchy

| Role | Token | Usage |
|------|-------|-------|
| **Primary text** | `on-surface` (`#0d1c2e`) | Headings, names, amounts — never use `#000000` |
| **Secondary text** | `on-surface-variant` (`#3f4944`) | Descriptions, subtitles, non-primary details |
| **Tertiary text** | `outline` (`#6f7973`) | Metadata, timestamps, labels, counts |

### Hard rules

- **No raw hex.** Use token classes. If a color isn't in the token set, it doesn't exist.
- **No Tailwind defaults.** `bg-red-50`, `text-gray-700`, `border-blue-500` are banned. Use `bg-error-container`, `text-on-surface-variant`, `border-primary`.
- **No `#000000` text.** Always use `text-on-surface` for the darkest text.
- **No 1px solid borders for sectioning.** Use tonal surface shifts. The only acceptable borders are: input focus rings, ghost borders at 15% opacity for accessibility, status badge outlines, and the `border-l-4` accent on emphasis cards.

---

## 3. Typography

Dual-font strategy: **Space Grotesk** for display/headline (architectural character), **Inter** for body/label (maximum legibility for data-dense quoting screens).

Fonts are set globally in `index.css`:
- `body { font-family: "Inter", sans-serif; }`
- `h1, h2, h3 { font-family: "Space Grotesk", sans-serif; }`
- Theme tokens: `--font-headline`, `--font-body`, `--font-label`

### Scale

| Level | Tailwind classes | Intent |
|-------|-----------------|--------|
| **Display** | `font-headline text-3xl font-bold tracking-tight` | Quote totals on detail screens, stat numbers |
| **Headline** | `font-headline text-2xl font-bold tracking-tight` | Screen titles |
| **Title** | `font-headline font-bold text-on-surface` | Card primary text (customer name), item names |
| **Body** | `text-sm text-on-surface-variant` | Descriptions, metadata lines, subtitles |
| **Label (section)** | `text-[0.6875rem] font-bold uppercase tracking-widest text-outline` | Section headers, stat labels |
| **Label (meta)** | `text-xs text-outline` | Timestamps, counts, footnotes |

### Rules

- Use `tracking-tight` (-0.025em) on Space Grotesk at headline sizes for the "premium" feel. Tailwind's `tracking-tight` is close enough to the -0.02em spec.
- Section labels are always uppercase + wide tracking (`tracking-widest`). This creates the "architectural drawing annotation" look.
- Data values (currency, counts) use `font-bold` to anchor the eye. Labels next to them stay regular weight.

---

## 4. Elevation & Depth

### Ghost shadows

The only shadow in the system. Defined as `.ghost-shadow` in `index.css`:

```css
.ghost-shadow {
  box-shadow: 0 0 24px rgba(13, 28, 46, 0.04);
}
```

Usage: Cards, stat blocks, empty-state containers. The shadow is a soft ambient glow — if you can see a hard edge, it's wrong. Ghost shadows require enough surrounding space (minimum `gap-3` between siblings) so the glow has room to breathe.

**Do not** create custom shadows. If a component needs elevation, use `ghost-shadow`. If it needs stronger elevation, it's a floating element and uses glassmorphism instead.

### Glassmorphism (floating elements)

For elements that float over content: headers, footers, bottom nav, FABs.

| Element | Classes |
|---------|---------|
| **ScreenHeader** | `bg-white/80 backdrop-blur-md shadow-[0_0_24px_rgba(13,28,46,0.04)]` |
| **ScreenFooter** | `bg-white/80 backdrop-blur-md shadow-[0_-4px_24px_rgba(0,0,0,0.04)]` |
| **BottomNav** | `bg-white/80 backdrop-blur-md shadow-[0_0_24px_rgba(13,28,46,0.04)]` |
| **FAB** | `shadow-[0_0_24px_rgba(0,0,0,0.12)]` (stronger because it's a small element) |
| **Modal backdrop** | `bg-black/35` (no blur on backdrop itself) |
| **Modal dialog** | `shadow-[0_24px_64px_rgba(13,28,46,0.24)]` (strongest in the system) |

### Ghost borders

If accessibility or visual clarity requires a stroke, use `outline-variant` at low opacity:

```
border border-outline-variant/30
```

Never use full-contrast borders. Ghost borders are optional aids, not structural elements.

---

## 5. Border Radius

Defined in theme tokens:

| Token | Size | Tailwind class | Usage |
|-------|------|----------------|-------|
| `DEFAULT` | 2px | `rounded` | Rarely used |
| `lg` | 4px | `rounded-lg` | Buttons, inputs, status badges — small interactive elements |
| `xl` | 8px | `rounded-xl` | Cards, list containers, tonal regions — larger surfaces |
| `full` | 12px | `rounded-full` | FABs, avatar circles, pill shapes |

**The hierarchy:** Larger surfaces get larger radii. Cards are `rounded-xl`. Buttons and inputs inside cards are `rounded-lg`. FABs are `rounded-full`. This creates a nested visual rhythm.

**Exception:** `ConfirmModal` uses `rounded-[1.75rem]` (28px) for the sheet-like appearance. This is the only hardcoded radius in the system.

---

## 6. Screen Anatomy

Every screen follows the same structural skeleton:

```
┌─────────────────────────────┐
│ ScreenHeader (fixed, z-50)  │  h-16, glassmorphic
├─────────────────────────────┤
│                             │
│  Main content area          │  min-h-screen bg-background
│  pt-20 (clears header)     │  pb-24 (clears nav/footer)
│  px-4 (side padding)       │
│  mx-auto max-w-3xl         │
│                             │
├─────────────────────────────┤
│ ScreenFooter (fixed, z-40)  │  glassmorphic, for primary actions
│  — OR —                     │
│ BottomNav (fixed, z-50)     │  glassmorphic, for tab navigation
└─────────────────────────────┘
```

### Spacing rhythm

- **Screen horizontal padding:** `px-4` (16px) on the content area.
- **Section separation:** `mb-4` to `mb-6` between major sections. Prefer the design doc's recommendation of 1.75-2.25rem (28-36px) when sections are visually distinct.
- **Card gap in lists:** `gap-3` (12px) — enough for ghost shadows to breathe.
- **Form field gap:** `gap-4` (16px) between form fields.
- **Bottom padding:** `pb-24` on main content to clear fixed bottom elements (nav or footer + FAB).

### Z-index stack

| Layer | z-index | Elements |
|-------|---------|----------|
| **Modals/overlays** | `z-50` | ConfirmModal overlay + dialog |
| **Fixed chrome** | `z-50` | ScreenHeader, BottomNav |
| **FAB** | `z-50` | Floating action button |
| **Footer** | `z-40` | ScreenFooter |
| **Content** | default | Everything else |

---

## 7. Cards & Lists

### Card pattern (interactive)

The canonical card for list items (quotes, customers, line items):

```
rounded-xl bg-surface-container-lowest p-4 text-left ghost-shadow
transition-all active:scale-[0.98] active:bg-surface-container-low
```

All interactive cards are `<button>` elements with `type="button"` and full-width (`w-full`). This gives proper accessibility semantics and click/tap handling.

### Card information hierarchy

Cards prioritize **scanability** — a user should extract the primary information from a horizontal sweep, not a vertical read.

**Quote card (2-line layout):**
```
Row 1: [Customer Name]              [$1,250.00]
Row 2: [Q-001 · Mar 14 · 3 items]    [DRAFT]
```

- Row 1: `flex items-baseline justify-between gap-3`. Name left (Title weight), amount right (Title weight). These are the two highest-value fields.
- Row 2: `flex items-center justify-between gap-3 mt-1`. Metadata string left (Body), status badge right.
- Metadata collapses into a single middot-separated string: `"{doc_number} · {date} · {count} items"`.
- Null amounts display as `"—"` (em dash), never `$0.00`.

**Customer card (2-line layout):**
```
Row 1: [Customer Name]              [chevron]
Row 2: [Phone · Email]
```

- Simpler structure — fewer fields to prioritize.
- Customer cards keep the same card classes but don't need the horizontal amount alignment.

### List container (tonal grouping)

When a screen shows 3+ cards in a list, wrap the list in a tonal container:

```html
<div className="mx-4 rounded-xl bg-surface-container-low p-3">
  <ul className="flex flex-col gap-3">
    {items.map(item => (
      <li key={item.id}>
        <button className="w-full rounded-xl bg-surface-container-lowest p-4 ...">
          ...
        </button>
      </li>
    ))}
  </ul>
</div>
```

The `surface-container-low` → `surface-container-lowest` shift creates the nested depth described in the surface hierarchy. Cards are visually distinct without borders.

### Emphasis cards (accent border)

For cards that highlight a specific metric or status:

```
rounded-lg border-l-4 border-primary bg-surface-container-lowest p-4 ghost-shadow
```

The `border-l-4` left accent uses a semantic color:
- `border-primary` for primary metrics (totals, active counts)
- `border-warning-accent` for attention items (pending review, flagged items)
- `border-surface-tint` for neutral emphasis (client info blocks)

### Empty states

Centered in a card container, using the list region background if within a list context:

```
flex flex-col items-center rounded-lg bg-surface-container-lowest p-8 text-center ghost-shadow
```

- Icon: `material-symbols-outlined text-3xl text-outline`
- Text: `text-sm text-outline`
- Keep messaging action-oriented: "No quotes yet. Tap + to create your first."

---

## 8. Interaction & Motion

### Touch targets

This is a "glove-friendly" app. Minimum interactive area: 44x44px (per WCAG). Prefer 48px+ for primary actions.

| Element | Minimum size | Implementation |
|---------|-------------|----------------|
| Card buttons | Full-width, min 56px tall | `p-4` padding on card content handles this |
| Primary buttons | Full-width, 56px tall | `py-4` + text creates ~56px |
| Ghost/icon buttons | 44x44px | `p-2` on a 24px icon = 40px; use `min-h-11 min-w-11` if needed |
| FAB | 56x56px | `h-14 w-14` |

### Active/pressed states

Every tappable element must have visible press feedback. The default card active state:

```
transition-all active:scale-[0.98] active:bg-surface-container-low
```

- The scale provides physical "press" feeling.
- The background shift provides color confirmation of the tap target.
- Both together are unmistakable on mobile.

Button variants have their own active states defined in the Button component. Ghost buttons use `active:scale-95` (stronger scale because they're smaller).

### Transitions

Keep transitions subtle and fast:
- `transition-all` on interactive elements (covers scale, background, opacity).
- No explicit duration override — Tailwind's default 150ms is correct.
- No `ease-in-out` override — Tailwind's default `cubic-bezier(0.4, 0, 0.2, 1)` is correct.
- No entrance/exit animations on cards or list items. Content appears immediately.
- Modal overlays: fade in via CSS. No JavaScript animation libraries.

---

## 9. Buttons

Three variants. A screen should have at most **one** primary button visible at a time.

| Variant | Classes | Usage |
|---------|---------|-------|
| **Primary** | `forest-gradient text-white font-semibold py-4 rounded-lg` | The single most important action. Submit, Continue, Generate. |
| **Destructive** | `border border-secondary text-secondary font-semibold py-4 rounded-lg` | Irreversible actions. Delete, Sign Out. Outlined style (not filled) to reduce accidental taps. |
| **Ghost** | `p-2 rounded-full hover:bg-surface-container-low active:scale-95` | Back buttons, trailing actions, icon-only buttons. Disappears into the background until hovered/pressed. |

### FAB (Floating Action Button)

One per screen, positioned bottom-right above the nav:

```
fixed bottom-20 right-4 z-50
h-14 w-14 rounded-full forest-gradient text-white
shadow-[0_0_24px_rgba(0,0,0,0.12)]
transition-all active:scale-95
```

The FAB is always the "create new" action for the screen's primary entity.

---

## 10. Status Badges

Pill-shaped labels for document status:

**Base classes:** `text-[0.6875rem] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg`

| Status | Background | Text | Label |
|--------|-----------|------|-------|
| **Draft** | `bg-neutral-container` | `text-on-surface-variant` | "Draft" |
| **Ready** | `bg-success-container` | `text-success` | "Ready" |
| **Shared** | `bg-info-container` | `text-info` | "Shared" |

New statuses should follow the same pattern: low-opacity semantic background + high-contrast semantic text.

---

## 11. Input Fields

**Default state:** `bg-surface-container-high rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline`
**Focused state:** `focus:ring-2 focus:ring-primary/30 focus:bg-surface-container-lowest`
**Error state:** Error text below input in `text-xs text-error`. Use `FeedbackMessage` for form-level errors.

Inputs fill with `surface-container-high` by default (recessed look), then shift to `surface-container-lowest` (white) on focus. This "lift" effect signals active engagement.

Labels: `text-sm font-medium text-on-surface`. For search inputs, the label should be visually hidden (`sr-only`) with the placeholder providing visual context.

---

## 12. Banners & Feedback

### AI Confidence Banner

For extraction confidence notes and AI-generated review hints:

```
rounded-lg border-l-4 border-warning-accent bg-warning-container p-4
```

Includes a filled Material icon (`info`), an uppercase label ("AI Confidence Note"), and message text. Always positioned inline with the content it refers to — not as a toast or fixed banner.

### Error Feedback

Use the `FeedbackMessage` component with `variant="error"`:

```
border-l-4 border-error bg-error-container text-error rounded-lg p-4 text-sm
```

Position inline, close to the element that errored. For form-level errors, place above the form or below the submit button.

### Loading States

- Use the shared `Button` `isLoading` prop for button loading states (shows "Loading..." text with disabled styling).
- For screen-level loading: `<p role="status" className="px-4 text-sm text-on-surface-variant">Loading...</p>`
- For app bootstrap: use the `LoadingScreen` component (full-screen centered spinner).

---

## 13. Icons

**Icon set:** Material Symbols Outlined (loaded via Google Fonts CDN).

**Default settings** (defined in `index.css`):
```css
.material-symbols-outlined {
  font-variation-settings: "FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24;
}
```

- **Style:** Outlined (not filled). Thin-stroke to match Space Grotesk weight.
- **Filled variant:** Only for special emphasis (e.g., the filled `info` icon in AIConfidenceBanner). Override inline: `style={{ fontVariationSettings: '"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 24' }}`.
- **Size:** Default 24px (matches `opsz` 24). Use `text-3xl` for feature icons in empty states.
- **Color:** Inherit from parent text color. Common: `text-primary` for active nav, `text-outline` for inactive/metadata, `text-white` for icons on primary backgrounds.

### Common icons

| Icon name | Context |
|-----------|---------|
| `description` | Quotes |
| `group` | Customers |
| `settings` | Settings |
| `add` | FAB create action |
| `arrow_back` | Back navigation |
| `chevron_right` | List item drill-in indicator |
| `info` | Confidence notes, info banners |
| `person_add` | Add customer |
| `edit` | Edit action |
| `delete` | Delete action |
| `picture_as_pdf` | PDF generation |
| `share` | Share action |

---

## 14. Modals

Bottom-sheet style on mobile, centered on desktop:

**Overlay:** `fixed inset-0 z-50 flex items-end justify-center bg-black/35 px-4 pb-4 sm:items-center sm:pb-0`

**Dialog:** `w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-[0_24px_64px_rgba(13,28,46,0.24)]`

- `items-end` on mobile makes the modal rise from the bottom (sheet behavior).
- `sm:items-center` on desktop centers it vertically.
- Title: `font-headline text-xl font-bold tracking-tight text-on-surface`
- Body: `mt-2 text-sm leading-6 text-on-surface-variant`
- Actions: `mt-6 flex flex-col gap-3 sm:flex-row-reverse` (stacked on mobile, inline on desktop with confirm on the right).

**Behavior:**
- Initial focus on the cancel/safe action.
- Escape key dismisses.
- Backdrop click dismisses.
- Focus trapped within the modal.

---

## 15. Decision Rules For New Screens

When building a new screen, follow this checklist:

1. **Screen shell:** `ScreenHeader` (top) + content area (`min-h-screen bg-background pb-24 pt-20`) + `BottomNav` or `ScreenFooter` (bottom). Never both BottomNav and ScreenFooter on the same screen.

2. **Lists of 3+ items:** Wrap in a tonal container (`bg-surface-container-low rounded-xl p-3`). Cards inside use `bg-surface-container-lowest rounded-xl p-4 ghost-shadow`.

3. **Card content:** Put the two most important fields on the first row, left and right. Collapse metadata into a second row.

4. **Primary action:** One primary button per screen. Use `forest-gradient`. If the action is at the bottom of a form, put it in `ScreenFooter`. If the action is a "create new" floating trigger, use the FAB.

5. **Separation:** Use tonal shifts and `gap-3`/`gap-4` spacing. Never add `border-b` or `<hr>` between items. If a section boundary needs emphasis, shift the background level.

6. **Feedback:** Use `FeedbackMessage` for errors, `AIConfidenceBanner` for AI notes. Never use `window.alert()` or `window.confirm()`.

7. **Currency and dates:** Always use `formatCurrency()` and `formatDate()` from `@/shared/lib/formatters`. Never create local formatting helpers.

8. **Responsive:** Mobile-first. The app is primarily used on phones. Desktop gets `max-w-3xl mx-auto` centering. No desktop-specific layouts — the mobile layout scales up.

---

## 16. Anti-Patterns (Don'ts)

These are hard failures in review:

- **Tailwind default colors** (`bg-red-50`, `text-gray-700`). Use design tokens only.
- **1px solid borders for sectioning** (`border-b`, `divide-y`). Use tonal surface shifts.
- **Custom shadows** (`shadow-md`, `shadow-lg`). Use `ghost-shadow` or the specific glassmorphism shadows.
- **`#000000` text**. Use `text-on-surface`.
- **`window.confirm()` or `window.alert()`**. Use `ConfirmModal` and `FeedbackMessage`.
- **Local formatting helpers** for currency/dates. Import from `@/shared/lib/formatters`.
- **Multiple primary buttons** on one screen. One `forest-gradient` button maximum.
- **Filled icons by default**. Use outlined. Fill only for specific semantic emphasis.
- **`rounded-md`, `rounded-sm`** or other non-token radii on UI elements. Use `rounded-lg` (buttons/inputs), `rounded-xl` (cards/containers), or `rounded-full` (FABs/pills).
- **Inline styles** for colors, spacing, or typography. Everything goes through Tailwind utility classes referencing the theme tokens.
