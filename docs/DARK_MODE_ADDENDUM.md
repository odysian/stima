# Dark Theme Addendum — Stima

## Status
Canonical dark-mode addendum for planning and execution. This document is a **dark-mode addendum** to `docs/DESIGN.md`, not a replacement.

## Relationship To Existing Design Docs
- `docs/DESIGN.md` remains the authoritative source for:
  - design philosophy
  - spacing rhythm
  - typography scale
  - card/list anatomy
  - motion rules
  - button hierarchy
  - status semantics
  - anti-patterns
- This addendum only defines how those same rules should be expressed in dark mode.
- If this doc conflicts with `docs/DESIGN.md` on a non-dark-specific rule, `docs/DESIGN.md` wins.

## Goal
Introduce a dark theme that feels like **the same Stima system** rather than a separate skin.

The dark theme should preserve:
- the "Precision Blueprint" identity
- hierarchy through depth instead of borders
- scanability on phone-sized screens
- one dominant primary action per screen
- semantic status colors
- the existing mobile-first card/list structure

## Non-Goals
- No component redesigns solely for dark mode
- No layout changes
- No alternate icon set
- No green-heavy or tactical/military visual direction
- No screen-by-screen palette improvisation
- No raw hex usage in components

## Decision Locks
These decisions are locked for implementation. Do not reopen them during execution unless this spec is revised first.

- **Theme model:** `System / Light / Dark`
- **Theme mechanism:** Option B, attribute toggle with OS fallback
- **Theme application target:** set theme on the `<html>` element
- **Toggle UI scope:** in scope for this task, implemented in Settings
- **Toggle UI pattern:** use the segmented control pattern
- **Default behavior:** if no saved preference exists, follow `prefers-color-scheme`
- **Persistence behavior:** store the user preference in `localStorage` under `stima-theme`; no server-side theme preference storage is used in this spec
- **Invalid preference behavior:** missing, corrupted, or unexpected values in `stima-theme` are treated as `system`; implementations may also clear the invalid key after fallback
- **System-mode live behavior:** while preference is `System`, the app should update live if the OS theme changes during an open session
- **Boot behavior:** apply the effective theme before React mounts so the first paint uses the correct theme
- **Coverage boundary:** full shipped frontend surface, not Quotes-only
- **Contrast rule:** dark `primary` may be brightened as needed so active text/icon use remains accessible on dark surfaces, subject to manual review

---

# 1. Dark Theme Philosophy

## 1.1 Core Direction
Dark mode should be **charcoal / ink first** and **forest-green second**.

Green remains a reserved signal for:
- the single primary action
- active navigation state
- selected / current step state
- FABs
- focused emphasis where the light theme already uses `primary`

Dark mode must **not** turn the application into a green-tinted interface.
The overall mood should feel:
- architectural
- deliberate
- premium
- calm
- professional for business workflows

Not:
- military
- rugged outdoor
- terminal/gamer neon
- monochrome black glass

## 1.2 Depth Model Must Survive The Theme Switch
The most important requirement is preserving the existing surface hierarchy:
- page background
- grouping region
- interactive card surface
- recessed/input surface

Dark mode succeeds only if these levels remain immediately legible.
If the UI collapses into “dark gray on dark gray,” the design fails even if the palette itself looks acceptable.

## 1.3 Visual Identity Source
In dark mode, the Stima identity should come mostly from:
- tonal depth
- rigid spacing
- precise typography
- restrained labels and annotations
- disciplined accent usage

It should **not** rely on flooding large surfaces with green.

---

# 2. Dark Theme Token Strategy

## 2.1 Implementation Rule
Keep the same semantic token names already used by the app.
Dark mode should remap token values at the theme layer rather than introducing ad-hoc one-off utility classes in feature code.

Recommended implementation pattern:
- define dark tokens in `frontend/src/index.css`
- scope them under `[data-theme="dark"]` on the `<html>` element
- keep all component usage semantic (`bg-background`, `text-on-surface`, etc.)

### Tailwind v4 Key Insight
Because every component class in the app references a CSS custom property token (e.g. `bg-background` compiles to `var(--color-background)`), overriding the custom property value under `[data-theme="dark"]` automatically remaps every element using that class. **No `dark:` prefix is needed in any component JSX.** The token override propagates everywhere.

```css
/* index.css — no component changes required for token-backed classes */
[data-theme="dark"] {
  --color-background: #0b1013;
  --color-primary: #0a6a50;
  /* etc. */
}
```

The only exceptions are utility classes that embed hardcoded values rather than referencing custom properties. These are addressed in §2.6.

If `dark:` prefix support is also needed in future (e.g. for third-party components), add this to `index.css`:
```css
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));
```

For this task, explicit light override support is also required so Settings can force light mode even when the OS is dark:
```css
[data-theme="light"] {
  color-scheme: light;
}
```

## 2.2 Proposed Dark Tokens

### Surface hierarchy
| Role | Token | Proposed dark value | Intent |
|---|---|---:|---|
| Level 0 base | `background` | `#0b1013` | Main screen background |
| Level 1 grouping | `surface-container-low` | `#121920` | List grouping regions, section containers |
| Level 2 interactive | `surface-container-lowest` | `#182128` | Cards, raised surfaces, focused inputs |
| Level 3 recessed | `surface-container-high` | `#0f161b` | Default inputs, recessed controls |

### Text hierarchy
| Role | Token | Proposed dark value | Intent |
|---|---|---:|---|
| Primary text | `on-surface` | `#eef2ef` | Headings, names, amounts |
| Secondary text | `on-surface-variant` | `#b5beb8` | Descriptions, subtitles |
| Tertiary text | `outline` | `#7f8a84` | Metadata, counts, labels |
| Ghost border / subtle stroke | `outline-variant` | `#5b6761` | Optional low-contrast borders |
| Neutral container | `neutral-container` | `#202830` | Draft badge background, neutral fills |
| Surface tint | `surface-tint` | `#8e9992` | Neutral emphasis accents when needed |

### Brand + semantic colors
| Role | Token | Proposed dark value | Intent |
|---|---|---:|---|
| Primary | `primary` | `#0a6a50` | CTA base, active state, FAB — see contrast note below |
| Primary container | `primary-container` | `#0e7a5d` | Gradient endpoint, elevated primary surface |
| On primary | `on-primary` | `#ffffff` | Text/icons on primary |
| Secondary | `secondary` | `#c07a71` | Destructive outline/text |
| Success | `success` | `#8cdeaa` | Ready/approved text |
| Success container | `success-container` | `#173423` | Ready/approved background |
| Warning | `warning` | `#e6b44c` | Warning text |
| Warning accent | `warning-accent` | `#f0b44b` | Accent border/icon |
| Warning container | `warning-container` | `#3b2d10` | Warning background |
| Error | `error` | `#ffb4ab` | Error text |
| Error container | `error-container` | `#4a1f1c` | Error background |
| Info | `info` | `#86c9f0` | Shared/info text |
| Info container | `info-container` | `#163246` | Shared/info background |

> **Contrast lock — `text-primary` use cases:** `primary` doubles as `text-primary` for active nav icons and active segmented tab text. The initial proposal `#0a6a50` is too dark for reliable text contrast on `background` (`#0b1013`). Before implementation is considered done, dark `primary` must be brightened as needed until active text/icon use is readable and manually approved on dark surfaces. Keep the hue in the current forest family; do not rotate toward neon or teal.

## 2.3 Tone Rules
- `background` should be a deep ink, not pure black.
- `surface-container-low` should be visibly lifted from `background`.
- `surface-container-lowest` should be clearly readable as the raised card level.
- `surface-container-high` should read as recessed rather than raised.
- `on-surface` should be warm off-white, not harsh pure white everywhere.
- `outline` should remain readable for scanable metadata on mobile.

## 2.4 Brand Continuity Rule
Preserve the current Stima forest hue family.
If contrast tuning is needed, adjust brightness/saturation slightly, but do not rotate toward olive, neon green, or teal.

## 2.5 Token Audit — What Already Exists

All tokens referenced in §2.2 already exist in `frontend/src/index.css`. No net-new `@theme` entries are required. Dark mode is a pure value remap.

Confirmed present: `primary`, `primary-container`, `on-primary`, `secondary`, `success`, `success-container`, `warning`, `warning-accent`, `warning-container`, `error`, `error-container`, `info`, `info-container`, `neutral-container`, `surface-tint`, `background`, `surface-container-lowest`, `surface-container-low`, `surface-container-high`, `on-surface`, `on-surface-variant`, `outline`, `outline-variant`

**Additional token requiring a dark override:**
`on-background` exists in `index.css` and currently mirrors `on-surface`. Add `--color-on-background` to the dark block with the same value as `--color-on-surface` (`#eef2ef`).

**Tokens in `index.css` not covered by this spec:**
`surface`, `surface-bright`, `surface-dim`, `surface-container`, `surface-container-highest`, `surface-variant`, and several tertiary/fixed tokens. None are used in components per `docs/DESIGN.md`. They can receive dark overrides for completeness but are not blocking.

## 2.6 Hardcoded Values Requiring Conversion

Three utility definitions in `index.css` currently embed hardcoded color values that are not backed by CSS custom properties. They will **not** update automatically under `[data-theme="dark"]` and must be converted before dark mode works correctly.

### `.forest-gradient`
Current:
```css
.forest-gradient {
  background: linear-gradient(135deg, #004532 0%, #065f46 100%);
}
```
Fix — switch to custom property references so the gradient picks up dark-mode primary values:
```css
.forest-gradient {
  background: linear-gradient(
    135deg,
    var(--color-primary) 0%,
    var(--color-primary-container) 100%
  );
}
```

### `.ghost-shadow`
Current:
```css
.ghost-shadow {
  box-shadow: 0 0 24px rgba(13, 28, 46, 0.04);
}
```
Fix — back the value with a CSS custom property, then override in the dark block:
```css
/* global scope */
.ghost-shadow {
  box-shadow: var(--shadow-ghost);
}

/* in @theme or :root */
:root {
  --shadow-ghost: 0 0 24px rgba(13, 28, 46, 0.04);
}

/* in [data-theme="dark"] block */
[data-theme="dark"] {
  --shadow-ghost: 0 0 24px rgba(0, 0, 0, 0.22);
}
```

### Glassmorphic shell shadows (ScreenHeader, ScreenFooter, BottomNav)
These components currently use inline Tailwind JIT shadow utilities (e.g. `shadow-[0_0_24px_rgba(13,28,46,0.04)]`) that cannot be remapped via CSS custom properties.

Preferred fix — define named CSS classes backed by custom properties, then replace the JIT shadow strings in component JSX:
```css
/* index.css */
.glass-shadow-top {
  box-shadow: var(--shadow-glass-top);
}
.glass-shadow-bottom {
  box-shadow: var(--shadow-glass-bottom);
}

:root {
  --shadow-glass-top: 0 0 24px rgba(13, 28, 46, 0.04);
  --shadow-glass-bottom: 0 -4px 24px rgba(0, 0, 0, 0.04);
}

[data-theme="dark"] {
  --shadow-glass-top: 0 0 24px rgba(0, 0, 0, 0.20);
  --shadow-glass-bottom: 0 -4px 24px rgba(0, 0, 0, 0.24);
}
```
Do not leave these as hardcoded JIT shadows — they will render the light-mode shadow tint on dark backgrounds.

## 2.7 Repo-Wide Hardcoded Visual Audit

The three items above are not the full audit scope.

Before implementation is complete, review the shipped frontend for any hardcoded visual values that would break dark mode or light-theme parity, including:
- `bg-white` and other light-only fills in inputs, dialogs, cards, and form surfaces
- hardcoded white/black alpha overlays such as `bg-white/80`, `bg-white/15`, `bg-black/35`
- inline Tailwind JIT shadow utilities outside the shared shell primitives
- hardcoded radial/linear gradients not backed by theme tokens
- placeholder opacity tweaks that become too dim on dark surfaces
- one-off borders whose contrast assumes the light theme

Known current hotspots include shared shell primitives, modal/dialog surfaces, FAB/capture shadows, selected quote/invoice form surfaces, and the public shared quote page. The implementation must not stop after only the three named utility fixes if other hardcoded light-theme assumptions remain in scope.

---

# 3. Gradient, Shadows, And Glass In Dark Mode

## 3.1 Forest Gradient
The existing “single dominant action” rule remains unchanged.
Dark mode still allows only one visually dominant primary action per screen.

Recommended dark gradient:
```css
.forest-gradient {
  background-image: linear-gradient(
    135deg,
    var(--color-primary),
    var(--color-primary-container)
  );
  color: var(--color-on-primary);
}
```

Rules:
- use only for the most important action on a screen
- do not use gradient as a card background
- do not use gradient in section containers
- do not use gradient on multiple competing actions

## 3.2 Ghost Shadow In Dark Mode
Do not replace `ghost-shadow` with stock Tailwind shadows.
The shadow should stay soft and atmospheric.

Proposed dark value:
```css
.ghost-shadow {
  box-shadow: 0 0 24px rgba(0, 0, 0, 0.22);
}
```

Rule:
- shadow should suggest lift, not outline the object with a hard edge

## 3.3 Glassmorphism In Dark Mode
Floating chrome keeps the same behavior as the light theme but uses dark glass instead of white glass.

The examples below describe visual intent. In implementation, prefer shared/token-backed classes and custom-property-backed shadows over inline raw shadow/color utilities where possible.

### Proposed shell styles
- `ScreenHeader`: `bg-background/80 backdrop-blur-md glass-shadow-top`
- `ScreenFooter`: `bg-background/80 backdrop-blur-md glass-shadow-bottom`
- `BottomNav`: `bg-background/82 backdrop-blur-md glass-shadow-top`
- optional clarity aid: `border border-outline-variant/20`

Rule:
- a ghost border is allowed here only if needed for visual separation from content
- the glass should feel subtle and integrated, not like a glossy panel

---

# 4. Component-Level Dark Theme Rules

## 4.1 Screen Shell
Do not alter the structural shell defined by the light theme.
Only swap tokens.

Canonical shell remains:
- `min-h-screen bg-background`
- `pt-20 pb-24 px-4`
- `mx-auto max-w-3xl`
- `ScreenHeader` top
- `BottomNav` or `ScreenFooter` bottom, never both

## 4.2 Section Labels
Section labels remain uppercase, widely tracked, and tertiary in emphasis.
In dark mode they should still be readable at a glance.

Rule:
- use `text-outline`
- do not dim labels so far that they become decorative rather than useful

## 4.3 Tonal List Containers
For 3+ items, keep the required grouping region.

Canonical dark list container:
```txt
bg-surface-container-low rounded-xl p-3
```

Rule:
- the grouping region should be visible, but quieter than the cards inside it
- avoid making the region so subtle that the list becomes a “wall of cards”

## 4.4 Interactive Cards
Canonical dark card:
```txt
rounded-xl bg-surface-container-lowest p-4 text-left ghost-shadow transition-all active:scale-[0.98] active:bg-surface-container-low
```

Rules:
- keep the 2-line scan layout exactly as in the light theme
- preserve first-row emphasis on name/customer + amount
- metadata stays condensed on row two
- cards should be clearly lifted from the grouping region
- cards must not rely on visible section borders to feel separate

## 4.5 Inputs
Dark inputs must preserve the “recessed by default, lifted on focus” behavior.

Default state:
```txt
bg-surface-container-high rounded-lg px-4 py-3 text-sm text-on-surface placeholder:text-outline
```

Focused state:
```txt
focus:ring-2 focus:ring-primary/30 focus:bg-surface-container-lowest
```

Rules:
- the default input should read as recessed
- the focused state should visibly lift into the card plane
- placeholders should be legible, but clearly less important than entered text

## 4.6 Segmented Tabs / View Switchers
For controls like `Quotes / Invoices`, dark mode should avoid muddy low-contrast pills.

Recommended pattern:
- container: `bg-surface-container-low rounded-xl p-1`
- inactive tab: `text-on-surface-variant`
- active tab: `bg-surface-container-lowest text-on-surface ghost-shadow`
- keep `rounded-lg` on the selected segment

Rules:
- active state must be obvious without using bright green
- this is a selection control, not a primary CTA
- do not use the forest gradient for segmented tabs

## 4.7 Status Badges
Status semantics remain unchanged.
Only container/text values shift for dark mode.

### Draft
- bg: `bg-neutral-container`
- text: `text-on-surface-variant`

### Ready / Approved
- bg: `bg-success-container`
- text: `text-success`

### Shared
- bg: `bg-info-container`
- text: `text-info`

Rules:
- badges stay low-profile and semantic
- the green used here is a semantic status signal, not the page theme
- badge contrast must be readable without becoming louder than the card title/amount

## 4.8 FAB
Dark mode FAB remains one of the most acceptable places for strong green.

Canonical dark FAB:
```txt
fixed bottom-20 right-4 z-50 h-14 w-14 rounded-full forest-gradient text-white <shared-fab-shadow-class> transition-all active:scale-95
```

Rules:
- keep strong contrast
- keep FAB visually above the bottom nav
- do not add secondary ring glows or neon effects
- prefer a shared/token-backed shadow class over inline raw shadow utilities

## 4.9 Bottom Navigation
Bottom nav should remain glassmorphic and secondary to content.

Rules:
- inactive icons/labels use `text-outline`
- active destination uses `text-primary`
- do not make the full nav green
- maintain strong tap targets and clean icon legibility

## 4.10 Banners And Feedback
Semantic feedback patterns stay the same as light mode.
Only token values change.

Rules:
- AI confidence banner remains `border-l-4 border-warning-accent bg-warning-container`
- errors remain inline near the source of the problem
- do not use floating toast-like patterns for core form errors

## 4.11 Modals
Modals keep the same mobile sheet / desktop centered behavior.
Dark mode should make the dialog a lifted surface, not a flat black block.

Proposed dark dialog:
```txt
w-full max-w-md rounded-[1.75rem] bg-surface-container-lowest p-6 <shared-modal-shadow-class>
```

Backdrop:
```txt
<shared-modal-backdrop-class or token-safe backdrop utility>
```

Rule:
- these examples describe the target look, but implementation should prefer shared classes and token-safe utilities over raw inline shadow/color values

## 4.12 Theme Preference Control
Dark mode is not complete without a user-facing way to switch themes.

Rule:
- add a theme preference control to Settings
- use the segmented control pattern
- offer exactly three options: `System`, `Light`, `Dark`
- the control updates the saved preference and effective theme immediately
- `System` clears the explicit override and returns control to `prefers-color-scheme`
- the toggle UI is part of this task, not a follow-up

Recommended neutral label:
- `Theme`

---

# 5. Quotes Screen Dark Theme Reference

This section is the calibration target for the first implementation pass.
If the Quotes list screen feels correct, the rest of the theme will usually follow.

## 5.1 Intended Visual Read
The Quotes screen in dark mode should read like this:
- page is deep ink
- search bar is recessed
- tab switcher is grouped and legible
- list region is a slightly lifted tonal container
- quote cards are clearly raised above that region
- amount and customer/title remain the fastest elements to scan
- approved/shared/draft badges remain semantic and calm
- FAB is the strongest green object on the screen

## 5.2 Specific Fixes Relative To Auto-Inversion Look
A dark-mode pass should explicitly avoid these failure modes:
- tabs become muddy and the active tab is unclear
- search field blends into the page instead of reading as recessed
- cards sit too close to the background in luminance
- secondary text gets too dim for fast scanning
- bottom nav feels heavier than the main content
- too much green tint leaks into neutral surfaces

## 5.3 Quotes Screen Acceptance Snapshot
For the Quotes screen to be accepted:
- the segmented control active state is obvious within 1 second
- the search field reads as a lower surface than the cards
- each quote card is individually readable without borders
- title/customer and amount dominate the first scan line
- metadata remains readable in normal indoor mobile conditions
- the FAB is visually strongest without overpowering the screen

---

# 6. Accessibility And Contrast Rules

## 6.1 General
- preserve WCAG-friendly text contrast for primary and secondary text
- metadata may be softer, but must remain legible on a phone in average lighting
- do not rely on color alone for important state changes when position, emphasis, or iconography can help
- `text-primary` must not be used for active text/icon states unless the final dark `primary` value is validated for that usage

## 6.2 Focus
- preserve visible focus states in dark mode
- focus rings should use `primary/30` or equivalent semantic token behavior
- keyboard focus must remain visible on dark surfaces

## 6.3 Browser Chrome / Native Controls
- set `color-scheme` to match the effective theme so browser-native UI aligns with the surface theme
- when the effective theme is dark, browser-controlled surfaces should render as dark
- when the effective theme is light, browser-controlled surfaces should render as light

## 6.4 Touch
Touch target rules are unchanged:
- 44x44px minimum
- prefer 48px+
- primary buttons around 56px height
- FAB 56x56px

---

# 7. Implementation Rules For Agents

## 7.1 Scope Control
Implement dark mode as a token/chrome extension, not a visual redesign.

Allowed:
- token remap in `frontend/src/index.css`
- updates to shared shell primitives
- button / input / badge / nav / modal token adjustments
- low-risk class changes where components currently assume light surfaces

Disallowed unless separately scoped:
- changing layout structure
- redesigning card anatomy
- switching fonts
- changing interaction/motion rules
- replacing shared primitives with screen-local variants

## 7.2 Source Of Truth Rules
Before implementation, the agent should treat these as the order of truth for dark-theme work:
1. `docs/DESIGN.md`
2. this dark-mode addendum
3. `docs/PATTERNS.md`
4. shared component implementations already in repo

## 7.3 Token Rule
No feature code should introduce raw colors for dark mode.
All dark-mode changes should route through tokens or shared semantic classes.

## 7.4 Shared Primitive Rule
Prefer updating shared primitives first:
- `ScreenHeader`
- `ScreenFooter`
- `BottomNav`
- shared `Button`
- `FeedbackMessage`
- any shared input/surface wrappers

Only then patch screen-level classes that still assume light surfaces.

## 7.5 Theme Mechanism

This task uses Option B: attribute toggle with OS fallback.

Required behavior:
- persist one of `system`, `light`, or `dark` in `localStorage` under key `stima-theme`
- if `stima-theme` is missing, corrupted, or unexpected, treat it as `system` and optionally clear the invalid key
- apply the effective theme to the `<html>` element
- when preference is `dark`, set `data-theme="dark"`
- when preference is `light`, set `data-theme="light"`
- when preference is `system` or missing, remove the explicit override and let `prefers-color-scheme` decide
- while preference is `system`, keep the effective theme in sync if the OS theme changes during the session
- keep the CSS token overrides compatible with both the media-query path and explicit attribute overrides

Implementation note:
- in `system`, the `<html>` element should not keep a stale `data-theme` value; clearing the attribute is the contract that lets the OS-fallback selector path own dark tokens

Canonical selector pattern:
```css
/* Follows OS by default */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-background: #0b1013;
    /* ... */
  }
}

/* Explicit override wins */
[data-theme="dark"] {
  --color-background: #0b1013;
  /* ... */
}
```
Use explicit `light` override support so users can force the current light theme even on dark OS settings.

## 7.6 Boot / No-Flash Contract
The initial paint must use the correct effective theme.

Required boot sequence:
- determine the saved preference from `localStorage` key `stima-theme` before React mounts
- if saved preference is `dark`, apply dark theme immediately on `<html>`
- if saved preference is `light`, apply light theme immediately on `<html>`
- if saved preference is `system` or missing, resolve the effective theme from `prefers-color-scheme`
- set `color-scheme` at the same time as the theme
- run this logic before the app bootstraps, using a small inline boot script in `frontend/index.html`

Failure condition:
- a visible flash of the wrong theme on first paint is a spec failure

## 7.7 Coverage Matrix
This task covers the full shipped frontend surface.

Required review/calibration coverage:
- Quotes list
- Invoice list tab on the home screen document list
- Quote preview
- Quote capture flow
- Quote review flow
- Quote edit flow
- Customers list
- Customer detail
- Customer create/select/inline-create flows
- Customer quote/invoice history lists
- Invoice detail
- Invoice edit flow
- Settings
- Login
- Register
- Onboarding
- Public shared quote page
- modal/dialog states
- empty states
- loading states
- error states

Quotes remains the calibration target for the first pass, but completion requires review across the full matrix above.

## 7.8 Review Rule
The reviewer should reject any implementation that:
- uses Tailwind default colors
- adds borders for structural separation
- makes multiple elements compete as primary actions
- makes neutral surfaces visibly green
- removes the lifted/recessed surface model
- introduces custom shadows outside the sanctioned patterns
- makes secondary text too dim to scan on mobile

---

# 8. Suggested Execution Plan

**Step 0 — Prerequisites (complete before any token work)**
- Lock the theme preference model as `System / Light / Dark` and keep it consistent across boot logic, Settings UI, and storage.
- Treat invalid `stima-theme` values as `system` and do not invent alternate fallback behavior during implementation.
- Convert `.forest-gradient` to use `var(--color-primary)` and `var(--color-primary-container)` (§2.6).
- Convert `.ghost-shadow` to a custom-property-backed value; define `:root` default and `[data-theme="dark"]` override (§2.6).
- Define `.glass-shadow-top` / `.glass-shadow-bottom` CSS classes backed by custom properties; replace inline JIT shadow strings in `ScreenHeader`, `ScreenFooter`, `BottomNav` JSX (§2.6).
- Define the inline boot script in `frontend/index.html` so theme and `color-scheme` are applied before React mounts (§7.6).
- Spot-check `primary` contrast for `text-primary` use cases at actual icon and text sizes; brighten the dark value as needed and keep the final choice in the forest hue family (§2.2 contrast lock).

1. Add all dark token overrides in `frontend/src/index.css` under the chosen theme selector.
2. Apply dark shadow overrides for `--shadow-ghost`, `--shadow-glass-top`, `--shadow-glass-bottom` in the same block.
3. Add the Settings theme preference control with `System`, `Light`, and `Dark`, wired to persisted preference and immediate theme application.
4. Update shared primitives (`ScreenHeader`, `ScreenFooter`, `BottomNav`, shared buttons, shared feedback, shared modal shell, shared inputs/surfaces) to reference the new CSS shadow classes and token-safe fills.
5. Calibrate the Quotes screen until the surface ladder is clearly readable.
6. Propagate token-correct fixes across the full coverage matrix in §7.7, including public/auth surfaces and state variants.
7. Complete the repo-wide hardcoded visual audit from §2.7 and remove any remaining in-scope light-only assumptions.
8. Run exact frontend verification with `make frontend-verify`.
9. Perform one visual review pass against the acceptance checklist below in both dark and light themes.

---

# 9. Acceptance Checklist

Dark mode is ready for review when all of the following are true:

## 9.1 System Consistency
- same layout, spacing rhythm, and typography hierarchy as light mode
- no raw hex or Tailwind default palette in feature components
- no screen-specific palette drift
- no remaining in-scope hardcoded visual values that force light-theme rendering on dark surfaces

## 9.2 Surface Hierarchy
- `background`, grouping regions, cards, and recessed controls are all visually distinct
- cards are separable without borders
- focused inputs visibly lift from recessed to interactive level

## 9.3 Primary Action Discipline
- only one dominant primary action per screen
- green emphasis is concentrated on CTA/FAB/active state usage
- neutral surfaces remain neutral

## 9.4 Quotes Screen Readability
- segmented control active state is obvious
- search field reads as recessed
- cards are readable at a glance
- metadata remains legible
- FAB is strongest action cue

## 9.5 Theme Preference Behavior
- Settings includes a `Theme` control with `System`, `Light`, and `Dark`
- changing the preference updates the effective theme immediately
- saved preference is reapplied on reload
- `System` follows `prefers-color-scheme`
- first paint uses the correct effective theme with no visible flash
- `color-scheme` matches the effective theme

## 9.6 Full App Coverage
- all routes and states listed in §7.7 receive a dark-mode review pass
- auth screens and the public shared quote page are included, not deferred
- modal/dialog, empty, loading, and error states are included, not deferred

## 9.7 Semantic Feedback
- draft / approved / shared / warning / error states remain recognizable
- semantic containers are calm and not oversaturated
- destructive actions still use terracotta, not bright alarming red

## 9.8 Light-Theme Parity
- the existing light theme still matches `docs/DESIGN.md`
- explicit `Light` selection renders the current light theme even on a dark OS setting
- no light-theme regressions are introduced while enabling dark mode

## 9.9 Verification And Done
- `make frontend-verify` passes
- one manual review pass is completed in `System`, `Light`, and `Dark`
- dark mode is considered done only when the acceptance checklist passes and light-theme parity is preserved

---

# 10. Reviewer Prompt Add-On

Use this as an extra instruction when asking an agent/reviewer to assess the implementation:

> Review this dark-mode implementation against `docs/DESIGN.md` plus `docs/DARK_MODE_ADDENDUM.md`. Focus on whether the surface hierarchy remains legible, whether primary green is still reserved rather than ambient, whether the Quotes screen preserves scanability, and whether any screen introduced palette drift, structural borders, default Tailwind colors, or custom shadow behavior that conflicts with the design system.
