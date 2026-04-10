## Task A: Post-#255 quick fixes

Surgical frontend-only fixes addressing spec gap S1, interaction improvements S2, S3, S6, and test
hygiene S7.

---

## Acceptance criteria

1. `QuoteList` draft rows use `bg-white/80 backdrop-blur-md` (matching DESIGN.md line 237); the
   `border-l-4 border-warning-accent` and `ghost-shadow` are preserved.
2. A test asserts that `TotalAmountSection` does not pre-enable the tax toggle when `taxRate={null}`
   and `suggestedTaxRate` is set. Enabling the checkbox pre-fills the suggested value. No production
   code change required — existing behavior is already correct.
3. `ReviewActionFooter` renders both buttons in one row at all breakpoints (no stacked mobile layout).
4. `CaptureScreen` record/stop button section appears after the clips list and before `ScreenFooter`.
5. `make frontend-verify` exits clean; no `act()` console warnings in the `ReviewScreen` test run.

---

## Files in scope

| File | Change |
|---|---|
| `frontend/src/features/quotes/components/QuoteList.tsx` | S1: `draftRowClasses` — swap `bg-surface-container-lowest` for `bg-white/80 backdrop-blur-md` |
| `frontend/src/features/quotes/components/TotalAmountSection.tsx` (or nearest test file) | S2: add test asserting tax toggle is disabled when `taxRate={null}` and `suggestedTaxRate` is set — no production code change |
| `frontend/src/features/quotes/components/ReviewActionFooter.tsx` | S3: remove `flex-col` + `sm:` prefix; always `flex-row gap-3` |
| `frontend/src/features/quotes/components/CaptureScreen.tsx` | S6: move record/stop section below clips list JSX block, above `<ScreenFooter>` |
| `frontend/src/features/quotes/tests/ReviewScreen.test.tsx` | S7: fix unresolved `act()` warning |

---

## Do NOT change

- `baseRowClasses` in `QuoteList` (non-draft rows stay solid white)
- `FeedbackMessage` (error feedback path untouched)
- Any backend files
- Any other test files

---

## Verification

```bash
make frontend-verify
cd frontend && npx vitest run \
  src/features/quotes/tests/ReviewScreen.test.tsx \
  src/features/quotes/tests/QuoteList.test.tsx \
  src/features/quotes/components/TotalAmountSection.test.tsx
```

Check: no `act()` warnings in test output.
