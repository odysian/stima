# Fix light mode visual clarity regressions in selection, focus, and surface tokens

**Scope:** Full shipped frontend surface — visual clarity regressions in light theme introduced during the dark-mode-first redesign (gh #485).

**Root cause:** Light mode's `primary` (`#004532`) is much darker than dark mode's `primary` (`#1b8e6c`), so percentage-based opacity tints (`primary/30`, `primary/20`, `primary/15`) are significantly less visible on light backgrounds. The light-mode surface ladder (`#ffffff` → `#eff4ff` → `#dce9ff`) compresses into near-white tones that are hard to distinguish.

**Fix strategy (locked): Option C — Hybrid.** Widen the light-mode surface ladder (token-level, one-time change) and increase selection-specific opacity values in light mode only via theme-scoped tokens. Dark mode remains untouched.

---

## Non-goals

- Do not change dark mode tokens or component styles.
- Do not address low-priority atmospheric items (ghost shadow opacity, auth screen radial gradient) — defer to follow-up.
- No new components or primitives.
- No raw hex values introduced; all changes route through tokens.

---

## Acceptance criteria

- [ ] Selected state in `ReviewDocumentTypeSelector` is obvious at a glance in light mode.
- [ ] Active tab in `QuoteList` switcher is obvious at a glance in light mode.
- [ ] Focus rings on all inputs (`Input`, `Select`, textareas) are clearly visible in light mode.
- [ ] `TradeTypeSelector` selected state is clearly distinct from unselected.
- [ ] Draft rows in quote list are visually distinct from non-draft rows.
- [ ] Tonal buttons have visible background tint in light mode.
- [ ] Native `<Select>` dropdown options are readable in light mode (not white-on-white).
- [ ] Line Item Sheet tabs do not jump in height when switching between Manual and Catalog.
- [ ] Overflow Menu dropdown has visible edge definition in light mode.
- [ ] All changes preserve dark mode appearance (no regressions).
- [ ] No raw hex values introduced; all changes route through tokens.
- [ ] `make frontend-verify` passes.

**Note:** Light-mode visual verification is manual/operator-run; automated visual regression is not in the test suite.

---

## Files in scope

### Critical fixes
1. `frontend/src/ui/Select.tsx` — native dropdown white-on-white text.
2. `frontend/src/features/quotes/components/ReviewDocumentTypeSelector.tsx` — selection state invisible.

### High-priority component fixes
3. `frontend/src/features/quotes/components/QuoteList.tsx` (tab switcher)
4. `frontend/src/shared/components/TradeTypeSelector.tsx`
5. `frontend/src/features/quotes/components/ReviewLineItemsSection.tsx` (reorder toggle)
6. `frontend/src/shared/components/Input.tsx`
7. `frontend/src/features/quotes/components/ReviewFormContent.tsx` (textarea)
8. `frontend/src/features/quotes/components/CaptureInputPanel.tsx` (textarea + empty clip dropzone)
9. `frontend/src/features/quotes/components/LineItemEditSheet.tsx` (tab height mismatch)

### Medium-priority component fixes
10. `frontend/src/shared/components/OverflowMenu.tsx` (blends into background)
11. `frontend/src/ui/QuoteListRow.tsx` (draft row glass surface)
12. `frontend/src/ui/Sheet.tsx` (border opacity)
13. `frontend/src/shared/components/Button.tsx` (tonal variant)
14. `frontend/src/shared/components/BottomNav.tsx` (active bg)

### Token-level fixes
15. `frontend/src/index.css` (surface ladder remap + selection opacity tokens)

---

## Verification

```bash
cd frontend && make frontend-verify
```

Manual verification: toggle to light mode and confirm the critical/high items above are clearly visible.

---

## References

- Analysis doc: `plans/follow-ups/light-mode-visual-clarity-analysis.md`
- Parent redesign: gh #485
