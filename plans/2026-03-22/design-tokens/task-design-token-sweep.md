# Task: Design token sweep — replace all hardcoded Tailwind colors with design tokens

**Mode:** single
**Type:** no-contract refactor

## Summary

After the modularization spec (Tasks #54, #55), the hardcoded color surface area is significantly reduced: `FeedbackMessage` handles all error states (already tokenized), `ScreenHeader` centralizes the header back-button color (one fix instead of eight), and component splits consolidated success messages into `QuotePreviewActions`, `CustomerInfoForm`, and `SettingsScreen`. This task adds the missing token definitions and replaces every remaining hardcoded color with its token equivalent.

**Depends on:** Modularization spec (Tasks #54 and #55) — completed and merged.

## Motivation

- Three semantic color states (success, warning, info) have no tokens — forcing `emerald-*`, `amber-*`, and `sky-*` hardcoded classes
- `ScreenHeader` still uses `text-emerald-900 hover:bg-slate-50` on the back button
- `LineItemRow` is the most token-deficient file — every input, label, and border uses hardcoded slate
- `AIConfidenceBanner` uses five different amber classes with no token backing
- Token drift will compound as Slice 2 features are added

## Scope

### 1. Add missing tokens to `index.css`

Add to the `@theme` block:

**Success** (saved, shared, ready confirmations):
```css
--color-success: #166534;           /* green-800 */
--color-success-container: #dcfce7; /* green-100 */
```

**Warning** (flagged line items, AI confidence, unsupported browser):
```css
--color-warning: #92400e;           /* amber-800 — dark text */
--color-warning-accent: #f59e0b;    /* amber-500 — vivid border/icon accent */
--color-warning-container: #fef3c7; /* amber-100 — light background */
```

**Info** (shared status badge):
```css
--color-info: #075985;              /* sky-800 */
--color-info-container: #e0f2fe;    /* sky-100 */
```

**Neutral surface** (inactive/draft badge — slate-100, no blue tint):
```css
--color-neutral-container: #f1f5f9; /* slate-100 */
```

Note: No `on-*` variants (`on-success`, `on-warning`, `on-info`) — none are currently used. Add them when a filled solid-colored button or badge requires them.

### 2. Shared components

#### `ScreenHeader.tsx`
| Pattern | Replacement |
|---------|-------------|
| `text-emerald-900` | `text-primary` |
| `hover:bg-slate-50` | `hover:bg-surface-container-low` |

#### `Button.tsx` (ghost variant)
| Pattern | Replacement |
|---------|-------------|
| `hover:bg-slate-50` | `hover:bg-surface-container-low` |

#### `Input.tsx`
| Pattern | Replacement |
|---------|-------------|
| `text-slate-700` (label) | `text-on-surface` |
| `text-red-600` (error) | `text-error` |

#### `StatusBadge.tsx`
| Variant | Current | Replacement |
|---------|---------|-------------|
| `draft` | `bg-slate-100 text-slate-600` | `bg-neutral-container text-on-surface-variant` |
| `ready` | `bg-emerald-100 text-emerald-800` | `bg-success-container text-success` |
| `shared` | `bg-sky-100 text-sky-800` | `bg-info-container text-info` |

#### `AIConfidenceBanner.tsx`
| Pattern | Replacement | Note |
|---------|-------------|------|
| `bg-amber-500/10` | `bg-warning-container` | background |
| `border-amber-500` | `border-warning-accent` | vivid left accent stripe — must stay bright |
| `text-amber-600` (icon) | `text-warning-accent` | |
| `text-amber-800` (label) | `text-warning` | |
| `text-amber-900` (body) | `text-warning` | intentional one-shade normalization — amber-900 → amber-800, contrast maintained |

### 3. Quote components

#### `LineItemRow.tsx` — full replacement
| Pattern | Replacement |
|---------|-------------|
| `border-slate-200` (outer wrapper) | `border-outline-variant` |
| `border-amber-300 bg-amber-50 text-amber-900` (flag alert) | `border-warning-accent/40 bg-warning-container text-warning` |
| `text-slate-700` (labels ×3) | `text-on-surface` |
| `border-slate-300 text-slate-900` (inputs ×3) | `border-outline-variant text-on-surface` |
| `focus:border-slate-500` (inputs ×3) | `focus:border-primary` |
| `focus:ring-slate-200` (inputs ×3) | `focus:ring-primary/30` |
| `text-red-600` (description error) | `text-error` |
| `border-slate-300 text-slate-700 hover:bg-slate-100` (delete button) | `border-outline-variant text-on-surface hover:bg-surface-container-low` |

#### `LineItemCard.tsx`
| Pattern | Replacement |
|---------|-------------|
| `border-amber-500/20` (flagged card border) | `border-warning-accent/20` |
| `bg-amber-100 text-amber-700` (REVIEW badge) | `bg-warning-container text-warning` |

#### `QuoteList.tsx`
| Pattern | Replacement |
|---------|-------------|
| `border-amber-500` (pending review stat card) | `border-warning-accent` |

#### `CaptureScreen.tsx`
| Pattern | Replacement |
|---------|-------------|
| `border-amber-200 bg-amber-50 text-amber-900` (browser unsupported banner) | `border-warning-accent/40 bg-warning-container text-warning` |

#### `QuotePreviewActions.tsx` *(new — split from QuotePreview in Task #55)*
| Pattern | Replacement |
|---------|-------------|
| `bg-emerald-50 text-emerald-800` (share success message) | `bg-success-container text-success` |

#### `QuoteDetailsCard.tsx` *(new — split from QuotePreview in Task #55)*
| Pattern | Replacement |
|---------|-------------|
| `border-teal-500` (client card left accent) | `border-surface-tint` |

### 4. Customer components

#### `CustomerInfoForm.tsx` *(new — split from CustomerDetailScreen in Task #55)*
| Pattern | Replacement |
|---------|-------------|
| `bg-emerald-50 text-emerald-700` (save success) | `bg-success-container text-success` |
| `text-slate-700` (address label) | `text-on-surface` |

#### `CustomerCreateScreen.tsx`
| Pattern | Replacement |
|---------|-------------|
| `text-slate-700` (address label) | `text-on-surface` |

### 5. Settings components

#### `SettingsScreen.tsx`
| Pattern | Replacement |
|---------|-------------|
| `bg-emerald-50 text-emerald-700` (save success) | `bg-success-container text-success` |
| `text-slate-700` (trade type legend) | `text-on-surface` |

## Non-goals

- No layout or spacing changes
- No component extraction
- No new components
- No behavior changes
- No `FeedbackMessage` success variant — the three inline success messages (`QuotePreviewActions`, `CustomerInfoForm`, `SettingsScreen`) will use token classes directly; a success variant is a natural follow-up but out of scope here

## What was eliminated by modularization

These were in the original plan and are already resolved:

| Was | Resolved by |
|-----|-------------|
| `bg-red-50 text-red-700` across 6 feature screens | `FeedbackMessage` (already tokenized) |
| `text-emerald-900 hover:bg-slate-50` in 8 screen back buttons | `ScreenHeader` (single canonical location — fixed in step 2) |
| `border-slate-100` in `ReviewScreen` footer | `ScreenFooter` (clean, no hardcoded colors) |
| `text-slate-500` subtitle in `CaptureScreen` | Now passed as `subtitle` prop to `ScreenHeader` → `text-on-surface-variant` |
| `hover:bg-slate-50` in `EditLineItemScreen`, `CustomerSelectScreen` | Now using `ScreenHeader` back button |

## Files touched

**Modified:**
- `frontend/src/index.css`
- `frontend/src/shared/components/ScreenHeader.tsx`
- `frontend/src/shared/components/StatusBadge.tsx`
- `frontend/src/shared/components/AIConfidenceBanner.tsx`
- `frontend/src/shared/components/Button.tsx`
- `frontend/src/shared/components/Input.tsx`
- `frontend/src/features/quotes/components/LineItemRow.tsx`
- `frontend/src/features/quotes/components/LineItemCard.tsx`
- `frontend/src/features/quotes/components/QuoteList.tsx`
- `frontend/src/features/quotes/components/CaptureScreen.tsx`
- `frontend/src/features/quotes/components/QuotePreviewActions.tsx`
- `frontend/src/features/quotes/components/QuoteDetailsCard.tsx`
- `frontend/src/features/customers/components/CustomerInfoForm.tsx`
- `frontend/src/features/customers/components/CustomerCreateScreen.tsx`
- `frontend/src/features/settings/components/SettingsScreen.tsx`

## Acceptance criteria

- [ ] `index.css` defines `success`, `warning`, `warning-accent`, `info`, and `neutral-container` token groups
- [ ] Zero remaining `text-slate-*`, `bg-slate-*`, `border-slate-*` classes in component files
- [ ] Zero remaining `text-red-*`, `bg-red-*` classes in component files
- [ ] Zero remaining `text-emerald-*`, `bg-emerald-*` classes in component files
- [ ] Zero remaining `text-amber-*`, `bg-amber-*`, `border-amber-*` classes in component files
- [ ] Zero remaining `text-sky-*`, `bg-sky-*` classes in component files
- [ ] Zero remaining `border-teal-*` classes in component files
- [ ] `StatusBadge`, `AIConfidenceBanner`, `LineItemRow` fully token-based
- [ ] All existing tests pass without modification

## Parity lock

- `warning-accent` (#f59e0b, amber-500) preserves the vivid accent intent of `border-amber-500` and `text-amber-600`
- `warning` (#92400e, amber-800) is used for all warning text; `text-amber-900` consumers shift one shade lighter — contrast maintained, intentional normalization
- `border-teal-500` → `border-surface-tint` (#1b6b51): teal-500 (#14b8a6) and surface-tint (#1b6b51) differ in hue; this is an intentional alignment to the design system's brand-tinted accent rather than a raw teal. Note in PR.
- `neutral-container` (#f1f5f9, slate-100) keeps the `draft` badge visually neutral/gray rather than the blue-tinted surface ladder
- All other substitutions are direct hex equivalents

## Verification

```bash
make frontend-verify
# Then confirm no hardcoded colors remain:
grep -rn "text-slate\|bg-slate\|border-slate\|text-red-\|bg-red-\|text-emerald\|bg-emerald\|text-amber\|bg-amber\|border-amber\|text-sky\|bg-sky\|border-teal" \
  frontend/src/features/ frontend/src/shared/components/ \
  --include="*.tsx" | grep -v "\.test\."
# Should return zero results
```
