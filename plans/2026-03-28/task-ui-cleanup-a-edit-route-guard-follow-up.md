## Task 118 Follow-Up: Quote Edit Route Guard

### Problem

After a quote is shared or closed, the browser back button can still land on `/quotes/:id/edit` if that route exists in history. The preview screen cannot reliably prevent this because browser history is outside the app's control.

### Approach

Treat the edit route as the enforcement point:

1. `QuoteEditScreen` fetches the quote as it already does.
2. If the fetched status is no longer editable (`shared`, `viewed`, `approved`, `declined`), the screen immediately redirects to `/quotes/:id/preview` with `replace: true`.
3. Clear any saved edit draft before redirecting so stale draft state does not survive a blocked visit.

### Why This Approach

- It fixes browser-back navigation, stale tabs, and direct URL entry in one place.
- It keeps preview navigation simple instead of trying to outsmart browser history.
- `replace: true` avoids trapping the user in a back-button loop.

### Scope

- In scope: frontend guard on `QuoteEditScreen` plus focused tests.
- Out of scope: backend edit-lock enforcement and nested edit-route guarding unless this follow-up reveals a broader issue.

### Verification

```bash
cd frontend && npx vitest run src/features/quotes/tests/QuoteEditScreen.test.tsx
cd frontend && npx eslint src/features/quotes/components/QuoteEditScreen.tsx src/features/quotes/utils/quoteStatus.ts src/features/quotes/tests/QuoteEditScreen.test.tsx
```
