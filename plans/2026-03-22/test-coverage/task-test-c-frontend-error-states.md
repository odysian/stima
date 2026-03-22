# Task C: Frontend error & loading state tests

**Parent Spec:** [Test gap coverage](spec-test-coverage.md)
**Mode:** gated child task
**Type:** test-only (no behavior changes)

## Summary

Frontend component tests cover happy paths and basic interactions but skip error rendering, loading states, and validation edge cases. This task adds targeted tests for the failure modes users actually encounter: network errors, 404s, empty states, and form validation.

All tests follow the existing test layer discipline: component tests use `vi.mock` on service modules.

## Scope

### 1. QuotePreview error/loading states (in `QuotePreview.test.tsx`)

**Already covered:** Basic rendering with quote data. Should NOT be duplicated.

**Missing — add these:**

- `test_shows_loading_state_while_fetching_quote` — verify "Loading quote..." text renders before service resolves
- `test_shows_error_when_quote_fetch_fails` — mock `getQuote` to reject → verify error message renders with `role="alert"`
- `test_shows_error_when_pdf_generation_fails` — mock `generatePdf` to reject → verify pdfError renders
- `test_shows_error_when_share_fails` — mock `shareQuote` to reject → verify shareError renders
- `test_share_button_disabled_until_pdf_generated` — verify share button has `disabled` attribute when pdfUrl is null

### 2. ReviewScreen validation states (in `ReviewScreen.test.tsx`)

**Already covered:** Basic rendering, line item editing, total editing. Should NOT be duplicated.

**Missing — add these:**

- `test_shows_save_error_when_create_fails` — mock `createQuote` to reject → verify error message renders
- `test_submit_blocked_when_no_line_items` — verify Generate Quote button is disabled with empty line items
- `test_submit_blocked_when_line_item_has_no_description` — add a line item with only a price → verify button disabled
- `test_redirects_to_home_when_no_draft` — render without draft → verify redirect to `/`

### 3. CaptureScreen error states (in `CaptureScreen.test.tsx`)

**Already covered:** Recording flow, clip management. Should NOT be duplicated.

**Missing — add these:**

- `test_shows_error_when_extraction_fails` — mock `extract` to reject → verify error message renders
- `test_extract_button_disabled_when_no_input` — no clips and empty notes → verify button is disabled
- `test_shows_browser_unsupported_warning` — mock `useVoiceCapture` with `isSupported: false` → verify warning renders

### 4. CustomerDetailScreen error states (in `CustomerDetailScreen.test.tsx`)

**Already covered:** Basic rendering, quote filtering. Should NOT be duplicated.

**Missing — add these:**

- `test_shows_loading_state_while_fetching` — verify loading text renders before service resolves
- `test_shows_error_when_customer_fetch_fails` — mock `getCustomer` to reject → verify error renders
- `test_shows_save_error_when_update_fails` — mock `updateCustomer` to reject → verify error message
- `test_shows_empty_state_when_no_quotes` — mock `listQuotes` to return `[]` → verify empty state message

### 5. CustomerSelectScreen edge cases (in `CustomerSelectScreen.test.tsx`)

**Already covered:** Customer list rendering, selection. Should NOT be duplicated.

**Missing — add these:**

- `test_shows_error_when_customer_list_fails` — mock `listCustomers` to reject → verify error renders
- `test_shows_error_when_inline_create_fails` — mock `createCustomer` to reject → verify error in create form

### 6. QuoteList edge cases (in `QuoteList.test.tsx`)

**Already covered:** Rendering, empty state, search filtering. Should NOT be duplicated.

**Missing — add these:**

- `test_shows_loading_state_while_fetching` — verify loading text renders before service resolves
- `test_shows_error_when_fetch_fails` — mock `listQuotes` to reject → verify error renders
- `test_search_no_results_shows_message` — type a query that matches nothing → verify "No quotes match" message

## Files touched

**Modified:**
- `frontend/src/features/quotes/tests/QuotePreview.test.tsx` (add ~5 tests)
- `frontend/src/features/quotes/tests/ReviewScreen.test.tsx` (add ~4 tests)
- `frontend/src/features/quotes/tests/CaptureScreen.test.tsx` (add ~3 tests)
- `frontend/src/features/quotes/tests/QuoteList.test.tsx` (add ~3 tests)
- `frontend/src/features/customers/tests/CustomerDetailScreen.test.tsx` (add ~4 tests)
- `frontend/src/features/customers/tests/CustomerSelectScreen.test.tsx` (add ~2 tests)

## Acceptance criteria

- [ ] QuotePreview: loading state, fetch error, PDF error, share error, and disabled share button all tested
- [ ] ReviewScreen: save error, empty line items, invalid line item, and no-draft redirect all tested
- [ ] CaptureScreen: extraction error, disabled button, and browser unsupported warning all tested
- [ ] CustomerDetailScreen: loading state, fetch error, save error, and empty quotes all tested
- [ ] CustomerSelectScreen: list error and create error tested
- [ ] QuoteList: loading state, fetch error, and no-results message tested
- [ ] All tests use `vi.mock` on service modules (component test layer — no MSW)
- [ ] All existing tests still pass
- [ ] No behavior changes — tests only

## Do NOT duplicate

Each section above specifies what is already covered in the existing test file. Review the current tests before adding new ones. If a scenario is partially covered (e.g., error rendering exists for one error type but not another), add only the missing variant.

## Verification

```bash
make frontend-verify
```
