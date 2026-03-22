# Spec: Codebase modularization — extract shared components, split oversized files

## Summary

All V0 tasks (1-7) plus design reskins and customer hub are merged. Several files now exceed project file-size budgets (250 LOC for frontend components, 220 LOC for backend modules). Before adding Slice 2 features — which will touch these same files — we split them now so new work lands in clean, focused modules.

This is a **no-behavior-change refactor**. All existing tests must continue to pass. No new features, no API contract changes.

## Motivation

| File | Current LOC | Budget | Over by |
|------|-------------|--------|---------|
| `QuotePreview.tsx` | 357 | 250 | +107 |
| `CustomerDetailScreen.tsx` | 302 | 250 | +52 |
| `ReviewScreen.tsx` | 276 | 250 | +26 |
| `CustomerSelectScreen.tsx` | 264 | 250 | +14 |
| `quotes/service.py` | 359 | 220 | +139 |
| `quotes/repository.py` | 381 | 220 | +161 |
| `quotes/api.py` | 254 | 220 | +34 |

Additional issues:
- Currency/date formatting duplicated across 4+ frontend files
- Glassmorphism header implemented inline with inconsistent styling across 8 screens
- Error/success feedback uses mix of hardcoded Tailwind colors and design tokens
- Dead stub files (`useApi.ts`, `api.types.ts`, `exceptions.py`) add noise
- Backend `QuoteService` mixes extraction pipeline and CRUD concerns with zero dependency overlap

## Decision Locks

1. **Shared `ScreenHeader` adopts the majority glassmorphism pattern** (`bg-white/80 backdrop-blur-md shadow-[0_0_24px_rgba(13,28,46,0.04)]`). Screens that deviated (ReviewScreen solid white, EditLineItemScreen no shadow, CustomerDetailScreen border-bottom) will be normalized.
2. **`FeedbackMessage` uses design tokens only** — `border-error bg-error-container text-error` for errors. All hardcoded `bg-red-50`/`text-red-700` are replaced in Task A. The success variant (`bg-emerald-50`/`text-emerald-700`) is deferred to the design token sweep task, which adds success tokens to `index.css` and extends `FeedbackMessage` with `variant="success"` in one pass.
3. **Backend extraction split**: `ExtractionService` extracted from `QuoteService`. Extraction methods never touch the repository — clean zero-dependency boundary.
4. **`repository.py` stays as-is**: 381 LOC is over budget but cohesive. A read/write split would share helpers across files with no decoupling benefit. Revisit only if it exceeds 450 LOC.
5. **No premature abstraction on customer forms**: `CustomerInfoForm` (edit) and `CustomerInlineCreateForm` (create) stay separate despite sharing the same 4 fields. Different submit handlers and validation contexts.

## Non-goals

- No new features, routes, or API endpoints
- No test behavior changes (tests must pass as-is)
- No dependency additions
- No migration or schema changes
- No API contract changes

## Child Tasks

- **Task A**: Shared foundation — extract `formatters.ts`, `ScreenHeader`, `ScreenFooter`, `FeedbackMessage`; delete dead stubs; apply shared components across all screens
- **Task B**: Frontend component splits — split `QuotePreview`, `CustomerDetailScreen`, `ReviewScreen`, `CustomerSelectScreen`
- **Task C**: Backend service split — extract `ExtractionService`, deduplicate clip validation in `api.py`

## Parity Lock Checklist (applies to all child Tasks)

Since this is a no-contract refactor, each Task PR must verify:
- [ ] Status code parity (all success + error paths unchanged)
- [ ] Response schema parity (no field/type/envelope changes)
- [ ] Error semantics parity (same externally visible behavior)
- [ ] Side-effect parity (same DB writes, same integration calls)
- [ ] All existing tests pass without modification

## Verification

```bash
make frontend-verify   # tsc + eslint + vitest + build
make backend-verify    # ruff + mypy + bandit + pytest
```
