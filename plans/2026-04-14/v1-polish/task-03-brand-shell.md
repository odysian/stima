# Task 03: Brand shell pass (V1 polish)

Parent spec: [#385](https://github.com/odysian/stima/issues/385) · Canonical markdown: `plans/2026-04-14/spec-v1-polish.md` · This Task: [#390](https://github.com/odysian/stima/issues/390).

## Summary
Deliver **Phase 3** of the V1 polish spec: lightweight **brand chrome** in the browser tab, link unfurls, first paint, and a more intentional **full-screen loading** state. **Frontend-only**; no PWA manifest, service worker, or backend changes.

**Status:** Icon / head / social **assets and wiring are largely in place** (see **Initial setup** below). The **main remaining work** for closing this Task is **`LoadingScreen.tsx`** polish (plus targeted tests and verification), with optional follow-ups called out below.

---

## Initial setup (already done — do not redo blindly)

The following is **already present** in the repo (verify paths on your branch before duplicating work):

### `frontend/public/`
- **`favicon.svg`** — light-style mark (white tile + `#004532` S, scaled path).
- **`favicon-dark.svg`** — dark-style mark (radial backdrop using `#0f161b` / `#0b1013` / `#121920`, S in **`#1b8e6c`**).
- **`apple-touch-icon.png`** — iOS “Add to Home Screen” / touch icon (exported from Figma; ~5 KB).
- **`og-image.png`** — Open Graph / Twitter preview image (**~1200×630**, pngquant-compressed social card).
- **`og-share-card.html`** — **local-only helper** to regenerate the OG art at exact 1200×630 (open via dev server, screenshot); not required at runtime.

### `frontend/index.html` (head)
- **`rel="icon"`** → **`/favicon-dark.svg`** (SVG; tab favicon — currently **dark** variant for preview).
- **`rel="apple-touch-icon"`** → **`/apple-touch-icon.png`**.
- **Open Graph:** `og:title`, `og:description`, `og:type`, `og:url`, `og:image` (+ type/width/height). **`og:url`** and **`og:image`** / **`twitter:image`** use absolute **`https://stima.odysian.dev/...`** (adjust if production origin changes).
- **Twitter Card:** `twitter:card` = `summary_large_image`, title, description, image.
- Existing **Google Fonts** + **`theme-bootstrap.js`** links unchanged in intent.

### Explicitly **not** done yet (for the kickoff agent)
- **`LoadingScreen.tsx`** visual/spinner polish (core Phase 3 gap).
- **`theme-color`** meta (optional; only if product wants tab UI tint on mobile).
- **`favicon.ico`** multi-size fallback (optional legacy browsers).
- **Product decision:** whether production should ship **`favicon.svg`** vs **`favicon-dark.svg`** (or both with media queries — out of scope unless requested).
- **OG image cache bust:** if replacing `og-image.png` after deploy, bump query on `og:image` / `twitter:image` URLs (e.g. `?v=2`) so Discord/Twitter refresh.

---

## Scope (unchanged intent)

**In scope**
- **`LoadingScreen.tsx`:** polish so full-screen load feels deliberate (no new loading architecture).
- **Light touch on `index.html` / `public/`** only if the kickoff finds gaps (e.g. `theme-color`, favicon swap, `favicon.ico`, copy tweaks to OG strings).

**Out of scope**
- Phase 1 and Phase 2 — separate Tasks.
- **PWA:** manifest, service worker, offline, install prompts.
- **Backend** / **API** / **extraction** changes.

## Decision locks (align with parent spec #385)
- [ ] Shell work stays **favicon / basic head / loading / social preview** only — no manifest or PWA expansion.
- [ ] No new persisted state or auth changes introduced by this Task.

## Acceptance criteria

### Already satisfied by initial setup (re-verify on PR)
- [ ] Branded **tab favicon** present (SVG) and resolves from **`/public`** in dev and production builds.
- [ ] **`apple-touch-icon`** linked; asset served at **`/apple-touch-icon.png`**.
- [ ] **OG + Twitter** meta present with absolute production image URL for **`og-image.png`** (or updated origin if changed).

### Remaining for Task close
- [ ] **`LoadingScreen`** is **visibly polished** (spinner / layout / motion) and remains lightweight (no heavy animation libraries).
- [ ] **`frontend/index.html`** stays **minimal** beyond any small fixes the kickoff adds (`theme-color`, favicon variant, etc.).
- [ ] **No asset-path regressions** for `public/` URLs; **`theme-bootstrap.js`** and app boot unchanged in behavior.
- [ ] **No backend** or extraction/capture changes attributable to this Task.

## Files (expected touch for remainder)

| Area | File |
|------|------|
| **Primary** | `frontend/src/shared/components/LoadingScreen.tsx` |
| **Tests** | `frontend/src/shared/components/LoadingScreen.test.tsx` (extend if markup/behavior warrants) |
| **Optional** | `frontend/index.html`, `frontend/public/*` |

## Verification (Tier 1)

```bash
cd frontend && npx vitest run src/shared/components/LoadingScreen.test.tsx
```

Tier 3 gate before merge: **`make frontend-verify`** (or `make verify` per PR norms).

## PR
- Branch: `task-390-v1-polish-brand-shell` (or equivalent slug).
- PR body references spec **#385**; use **`Closes #390`** for this Task only (not the Spec).
- PR description should briefly list **what was already landed** vs **what this PR adds** so reviewers do not re-review OG/favicon from scratch unless files changed.
