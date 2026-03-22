## Task: Reskin Quote Preview and Settings Screens

**Type:** `type:task`
**Labels:** `area:frontend`, `area:quotes`, `area:profile`
**Depends on:** Design Foundation task (#37) — tokens, `BottomNav`, `TradeTypeSelector`, `StatusBadge` must be merged first; Auth/Onboarding task (#38) — `TradeType` backend enum must be expanded before SettingsScreen can submit `trade_type` without 422

---

### Goal

Reskin `QuotePreview.tsx` and `SettingsScreen.tsx` to match the Stitch design. These two screens are grouped together because they share no dependencies on the quote flow task and can run in parallel with it once the Design Foundation is merged.

### Non-Goals

- Do not implement real PDF generation or remote file hosting
- Do not implement the Share link flow end-to-end — render the button, keep existing `shareQuote` handler wired, display the URL row when a share token exists
- Do not change profile update API calls or settings service logic
- Do not add new settings fields

---

### Background and Design Reference

Design reference: `plans/2026-03-22/stitch-design-notes.md` section 3:
- "Quote Preview"
- "Settings"

Stitch HTML source (authoritative for exact class structure):
- `stitch_stima_home/quote_preview_refined/code.html`
- `stitch_stima_home/settings_screen/code.html`

Screen PNGs:
- `stitch_stima_home/quote_preview_refined/screen.png`
- `stitch_stima_home/settings_screen/screen.png`

---

### Implementation Plan

**Step 1 — `QuotePreview.tsx`**

**Top app bar** (glassmorphism, fixed):
```tsx
<header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md shadow-[0_0_24px_rgba(13,28,46,0.04)] flex items-center gap-3 px-4 h-16">
  <button className="p-2 rounded-full hover:bg-slate-50 active:scale-95 transition-all text-emerald-900" onClick={() => navigate(-1)}>
    <span className="material-symbols-outlined">arrow_back</span>
  </button>
  <h1 className="font-headline font-bold tracking-tight text-on-surface text-lg">{quote.doc_number}</h1>
  <StatusBadge variant={quote.status} />
</header>
```

Body needs `pt-16 pb-24` to clear fixed header and bottom nav.

**Bottom nav:**
`QuotePreview` is always accessed from the quote list (home screen). Render `<BottomNav active="quotes" />`.

**PDF preview area** (~55vh tall):
```tsx
<div className="mx-4 mt-4 bg-surface-container-low rounded-xl overflow-hidden" style={{ height: "55vh" }}>
  {pdfUrl ? (
    <iframe src={pdfUrl} className="w-full h-full border-0" title="Quote PDF preview" />
  ) : (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <span className="material-symbols-outlined text-5xl text-outline">description</span>
      <p className="text-sm text-outline">Generate the PDF to preview it here.</p>
    </div>
  )}
</div>
```

**Action buttons** (below preview, `px-4 mt-4 flex flex-col gap-3`):
- `"Generate PDF"` — `Button variant="primary"`. Keep existing `onClick` handler that calls `quoteService.generatePdf`.
- `"Share"` — outlined secondary style. This is not `variant="destructive"` (terracotta) or `variant="primary"`. Use inline classes: `w-full border border-primary text-primary font-semibold py-4 rounded-lg disabled:opacity-40 active:scale-[0.98] transition-all`. Disabled until PDF has been generated. Keep existing share handler.

**Share URL row** (only rendered when `quote.share_token` exists):
```tsx
<div className="flex items-center gap-3 bg-surface-container-low rounded-lg p-3 mx-4">
  <span className="text-sm text-on-surface-variant flex-1 truncate">{shareUrl}</span>
  <button className="p-2 rounded-lg hover:bg-surface-container active:scale-95" onClick={copyToClipboard}>
    <span className="material-symbols-outlined text-primary">content_copy</span>
  </button>
</div>
```

**Info cards** (`px-4 mt-4 flex flex-col gap-3`):
- TOTAL AMOUNT card: `bg-surface-container-lowest rounded-lg p-4 ghost-shadow border-l-4 border-primary`. Label `"TOTAL AMOUNT"` in uppercase tracking style. Value: `font-headline text-2xl font-bold text-primary`. Show `"—"` when null.
- CLIENT card: `bg-surface-container-lowest rounded-lg p-4 ghost-shadow border-l-4 border-teal-500`. Customer name `font-bold text-on-surface`. Contact info `text-sm text-on-surface-variant`. (Use literal `border-teal-500` — the `surface-tint` token value `#1b6b51` is close enough; annotate the colour choice in a comment.)

**Step 2 — `SettingsScreen.tsx`**

**Top app bar** (same glassmorphism pattern):
```tsx
<header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md shadow-[0_0_24px_rgba(13,28,46,0.04)] flex items-center px-4 h-16">
  <button className="mr-4 p-2 rounded-full hover:bg-slate-50 active:scale-95 transition-all text-emerald-900" onClick={() => navigate(-1)}>
    <span className="material-symbols-outlined">arrow_back</span>
  </button>
  <h1 className="font-headline font-bold text-on-surface text-lg">Settings</h1>
</header>
```

**No bottom nav on Settings.** Settings is accessed via the BottomNav from other screens, but the Settings screen itself does not render BottomNav. This is per the design notes: "No bottom nav (accessed from Home via nav)."

Body: `pt-16 pb-24 px-4 space-y-4`

**"Business Profile" card** (`bg-surface-container-lowest rounded-xl p-6 ghost-shadow`):
- Section heading: `"BUSINESS PROFILE"` — `text-[0.6875rem] font-bold uppercase tracking-widest text-outline mb-4`
- Fields: Business Name, First Name, Last Name — use `Input` component
- `TradeTypeSelector` — pass current `tradeType` value and an `onChange` handler that updates local form state. The selector renders the full 6-option grid (from the Design Foundation task).

**"Account" card** (`bg-surface-container-lowest rounded-xl p-6 ghost-shadow`):
- Section heading: `"ACCOUNT"` — same uppercase tracking style
- Email row: `"EMAIL"` label (`text-xs text-outline uppercase tracking-wide`) above the email as plain read-only text (`text-on-surface text-sm`). No `Input` component here — it is display-only.
- Sign Out row: right-aligned small filled terracotta button (per design notes: "SIGN OUT terracotta filled button inline right (not full-width)"):
  ```tsx
  <div className="flex items-center justify-between mt-4">
    <span className="text-xs text-outline uppercase tracking-wide">Session</span>
    <button
      className="bg-secondary text-white text-sm font-semibold px-4 py-2 rounded-lg active:scale-[0.98] transition-all"
      onClick={handleSignOut}
    >
      Sign Out
    </button>
  </div>
  ```
  Note: this is a **filled** `bg-secondary` button (terracotta background, white text), NOT outlined. This is different from the `"destructive"` `Button` variant which uses an outlined style. Use inline classes here rather than the shared `Button` component since the size and width differ. Annotate the decision.

**"SAVE CHANGES" primary button** — `Button variant="primary"` full-width. Keep existing submit handler. Placed below both cards.

**Step 3 — Update tests**

- Update `QuotePreview.test.tsx`: top app bar renders with `doc_number` and `StatusBadge`, preview area shows placeholder when no PDF, Generate PDF button present, Share button disabled initially, `BottomNav` renders with `active="quotes"`, TOTAL AMOUNT card shows value, CLIENT card shows customer name.
- Update `SettingsScreen.test.tsx`: Business Profile card renders three inputs and `TradeTypeSelector` with current value, Account card shows email as plain text, Sign Out button is a filled terracotta button (not outlined), Save Changes calls update handler.

---

### Acceptance Criteria

- [ ] `QuotePreview` fixed top app bar shows `doc_number` as title and inline `StatusBadge`
- [ ] PDF preview area is ~55vh, shows placeholder (icon + text) when no PDF is loaded, shows iframe when PDF is available
- [ ] Generate PDF button is full-width primary; Share button is outlined primary-coloured and disabled until PDF exists
- [ ] Share URL row renders only when `quote.share_token` is set
- [ ] `BottomNav` renders on `QuotePreview` with `active="quotes"`
- [ ] TOTAL AMOUNT card renders with `border-l-4 border-primary`; CLIENT card renders with `border-l-4 border-teal-500`
- [ ] `SettingsScreen` fixed top app bar shows "Settings"; **no bottom nav rendered**
- [ ] Business Profile card renders Business Name, First Name, Last Name inputs and `TradeTypeSelector` with 6 options
- [ ] `TradeTypeSelector` in Settings reflects saved `tradeType` value; selecting a new option updates local state
- [ ] Account card shows email as plain read-only text (no `Input` component)
- [ ] Sign Out button is **filled** terracotta (`bg-secondary text-white`), small, inline — not full-width
- [ ] Save Changes is full-width primary at the bottom
- [ ] All existing `QuotePreview` and `SettingsScreen` tests pass; new assertions added per above
- [ ] `make frontend-verify` passes cleanly

---

### Files in Scope

```
frontend/src/features/quotes/components/QuotePreview.tsx
frontend/src/features/settings/components/SettingsScreen.tsx
```

Tests to update:
```
frontend/src/features/quotes/tests/QuotePreview.test.tsx
frontend/src/features/settings/tests/SettingsScreen.test.tsx
```

---

### Files Explicitly Out of Scope

- All backend files
- `quoteService.ts`, `profileService.ts` — no API changes
- `App.tsx` — no routing changes
- Any other feature screen

---

### Verification

```bash
make frontend-verify
```

Raw fallback:
```bash
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
