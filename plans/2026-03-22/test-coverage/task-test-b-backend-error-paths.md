# Task B: Backend error path hardening

**Parent Spec:** [Test gap coverage](spec-test-coverage.md)
**Mode:** gated child task
**Type:** test-only (no behavior changes)

## Summary

Most backend tests verify that features work correctly. This task adds targeted tests for failure modes: 404 on non-existent resources, 409 on invalid state transitions, 422 on malformed input, and edge cases in the public share flow. These tests document expected error behavior and catch regressions if error handling is accidentally changed.

## Scope

### 1. Quote error paths (in `test_quotes.py`)

**Already covered:** CSRF validation, auth requirements, ownership isolation, extraction errors, rate limits, oversized clips. These should NOT be duplicated.

**Missing — add these:**

- `test_get_quote_returns_404_for_nonexistent_id` — GET with random UUID → 404
- `test_update_quote_returns_404_for_nonexistent_id` — PATCH with random UUID → 404
- `test_create_quote_returns_404_for_nonexistent_customer` — POST with random customer_id → 404
- `test_create_quote_rejects_empty_line_items` — POST with `line_items: []` — verify behavior (should this be allowed? document the current contract)
- `test_update_quote_preserves_line_items_when_omitted` — PATCH without `line_items` field → existing items unchanged (verifies the `model_fields_set` conditional in service)
- `test_update_quote_replaces_line_items_when_provided` — PATCH with new `line_items` → old items fully replaced, not appended

### 2. PDF/Share error paths (in `test_pdf.py`)

**Already covered:** PDF generation, share endpoint, CSRF, ownership. These should NOT be duplicated.

**Missing — add these:**

- `test_generate_pdf_returns_404_for_nonexistent_quote` — POST `/quotes/{random-uuid}/pdf` → 404
- `test_share_quote_returns_404_for_nonexistent_quote` — POST `/quotes/{random-uuid}/share` → 404
- `test_public_share_returns_404_for_invalid_token` — GET `/share/invalid-token-xyz` → 404
- `test_public_share_returns_pdf_content_type` — verify response headers include `Content-Type: application/pdf` and `X-Robots-Tag: noindex`

### 3. Customer error paths (in `test_customers.py`)

**Already covered:** CRUD happy paths, auth, CSRF, ownership, empty name rejection. These should NOT be duplicated.

**Missing — add these:**

- `test_get_customer_returns_404_for_nonexistent_id` — GET with random UUID → 404
- `test_update_customer_returns_404_for_nonexistent_id` — PATCH with random UUID → 404
- `test_create_customer_rejects_empty_name_string` — POST with `name: ""` → 422 (verify empty string is caught, not just missing field)
- `test_update_customer_partial_update` — PATCH with only `phone` field → other fields unchanged (verifies partial update semantics)

### 4. Profile error paths (in `test_profile.py`)

**Already covered:** Get/update happy path, business_name required, onboarding state. These should NOT be duplicated.

**Missing — add these:**

- `test_update_profile_rejects_invalid_trade_type` — PATCH with `trade_type: "InvalidType"` — document current behavior (does Pydantic reject it or does the service accept any string?)
- `test_update_profile_partial_update` — PATCH with only `first_name` → other fields unchanged

## Files touched

**Modified:**
- `backend/app/features/quotes/tests/test_quotes.py` (add ~6 test functions)
- `backend/app/features/quotes/tests/test_pdf.py` (add ~4 test functions)
- `backend/app/features/customers/tests/test_customers.py` (add ~4 test functions)
- `backend/app/features/profile/tests/test_profile.py` (add ~2 test functions)

## Acceptance criteria

- [ ] Quote 404s: nonexistent quote GET/PATCH, nonexistent customer on create
- [ ] Quote PATCH semantics: line items preserved when omitted, replaced when provided
- [ ] PDF/Share 404s: nonexistent quote, invalid share token
- [ ] Public share response headers verified (content-type, x-robots-tag)
- [ ] Customer 404s: nonexistent customer GET/PATCH
- [ ] Customer validation: empty string name rejected
- [ ] Profile partial update behavior documented with test
- [ ] All existing tests still pass
- [ ] No behavior changes — tests only

## Do NOT duplicate

Each test file section above specifies what is already covered. The "Do NOT duplicate" principle is critical — these tests target _only_ the specific gaps identified. Adding redundant tests wastes maintenance effort and obscures what each test is actually verifying.

## Verification

```bash
make backend-verify
```
