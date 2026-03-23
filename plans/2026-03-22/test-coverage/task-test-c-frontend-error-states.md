# Task C: Frontend error & loading state tests

**Parent Spec:** [Test gap coverage](spec-test-coverage.md)
**Mode:** gated child task
**Type:** test-only (no behavior changes)

## Summary

Frontend component tests cover happy paths and basic interactions but skip error rendering, loading states, and validation edge cases. This task adds targeted tests for the failure modes users actually encounter: network errors, 404s, empty states, and form validation.

All tests follow the existing test layer discipline: component tests use `vi.mock` on service modules.

## Scope

### 1. QuotePreview error/loading states (in `QuotePreview.test.tsx`)

**Already covered — do NOT add these:**
- Basic rendering with quote data
- "shows an error when quote fetch fails" — mock getQuote reject (line 185)
- "shows an error when PDF generation fails" — mock generatePdf reject (line 259)
- "shows an error when share request fails" — mock shareQuote reject (line 437)
- Share button disabled on initial render (line 151, in the main render test)

**Missing — add this one:**

- `test_shows_loading_state_while_fetching_quote` — mock `getQuote` to return a never-resolving promise → verify a loading indicator renders before the promise settles

### 2. ReviewScreen validation states (in `ReviewScreen.test.tsx`)

**Already covered — do NOT add these:**
- Basic rendering, line item editing, total editing
- "blocks submit when a partially filled row has blank description" (line 274)
- "disables submit when no line items have a description" (line 287)

**Missing — add these:**

- `test_shows_save_error_when_create_fails` — mock `createQuote` to reject → verify error message renders
- `test_submit_blocked_when_no_line_items` — render with `lineItems: []` → verify Generate Quote button is disabled (distinct from the existing tests which pass a non-empty array with blank descriptions)
- `test_redirects_to_home_when_no_draft` — render with `draft: null` → verify redirect to `/`

### 3. CaptureScreen error states (in `CaptureScreen.test.tsx`)

**Already covered — do NOT add these:**
- Recording flow, clip management
- "shows inline error and does not navigate when extraction fails" (line 268)
- "keeps extract button disabled when there are no clips and notes are empty" (line 129)

**Missing — add this one:**

- `test_shows_browser_unsupported_warning` — mock `useVoiceCapture` with `isSupported: false` → verify a warning renders (e.g. "Voice recording is not supported in this browser" or equivalent)

### 4. CustomerDetailScreen error states (in `CustomerDetailScreen.test.tsx`)

**Already covered — do NOT add these:**
- Basic rendering, quote filtering
- "renders quote history empty state when customer has no quotes" — mock `listQuotes` to return `[]` (line 182)

**Missing — add these:**

- `test_shows_loading_state_while_fetching` — mock `getCustomer` to return a never-resolving promise → verify loading indicator renders before data arrives
- `test_shows_error_when_customer_fetch_fails` — mock `getCustomer` to reject → verify error renders
- `test_shows_save_error_when_update_fails` — mock `updateCustomer` to reject → verify error message renders

### 5. CustomerSelectScreen edge cases (in `CustomerSelectScreen.test.tsx`)

**Already covered — do NOT add these:**
- Customer list rendering, selection
- "shows inline error when create customer fails" — mock `createCustomer` to reject (line 161)

**Missing — add this one:**

- `test_shows_error_when_customer_list_fails` — mock `listCustomers` to reject → verify an error message renders

### 6. QuoteList (in `QuoteList.test.tsx`)

**No gaps remain.** All three scenarios identified in the original gap analysis are already covered:
- "shows loading state while list request is in flight" (line 203)
- "shows error state when list request fails" (line 233)
- "shows search empty state when filter has no matches" (line 137)

No new tests needed in this file.

## Files touched

**Modified:**
- `frontend/src/features/quotes/tests/QuotePreview.test.tsx` (add ~1 test)
- `frontend/src/features/quotes/tests/ReviewScreen.test.tsx` (add ~3 tests)
- `frontend/src/features/quotes/tests/CaptureScreen.test.tsx` (add ~1 test)
- `frontend/src/features/customers/tests/CustomerDetailScreen.test.tsx` (add ~3 tests)
- `frontend/src/features/customers/tests/CustomerSelectScreen.test.tsx` (add ~1 test)

**Not modified:**
- `frontend/src/features/quotes/tests/QuoteList.test.tsx` — all gaps already covered

## Acceptance criteria

- [ ] QuotePreview: loading state tested (fetch error, PDF error, share error, and disabled button already exist)
- [ ] ReviewScreen: save error, empty line items array, and no-draft redirect tested
- [ ] CaptureScreen: browser unsupported warning tested (extraction error and disabled button already exist)
- [ ] CustomerDetailScreen: loading state, fetch error, and save error tested (empty quotes state already exists)
- [ ] CustomerSelectScreen: list error tested (create error already exists)
- [ ] All tests use `vi.mock` on service modules (component test layer — no MSW)
- [ ] All existing tests still pass
- [ ] No behavior changes — tests only

## Do NOT duplicate

Each section above specifies what is already covered in the existing test file. Review the current tests before adding new ones. If a scenario is partially covered (e.g., error rendering exists for one error type but not another), add only the missing variant.

## Verification

```bash
make frontend-verify
```
