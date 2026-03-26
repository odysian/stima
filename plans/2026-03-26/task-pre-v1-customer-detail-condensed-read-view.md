# Pre-V1 Customer Detail Condensed Read View

## Problem Framing

### Goal
Replace the always-open customer edit form on the customer detail screen with a condensed
read view that shows customer info first and only opens the edit form on demand.

### Non-Goals
- No backend contract changes
- No customer schema changes
- No V2 tabbed customer-detail redesign
- No quote-history feature changes beyond fitting the cleaner layout

### Constraints
- Preserve all existing customer edit behavior and validation
- Keep the current route and navigation flow unchanged
- Stay frontend-only unless an unexpected contract gap is discovered

## Current Code Context

- The screen currently renders `CustomerInfoForm` inline by default in
  `frontend/src/features/customers/components/CustomerDetailScreen.tsx`.
- The existing edit form already owns save validation and feedback in
  `frontend/src/features/customers/components/CustomerInfoForm.tsx`.
- Quote history already exists below the form in
  `frontend/src/features/customers/components/QuoteHistoryList.tsx`.
- Existing screen tests assume the form fields are visible immediately in
  `frontend/src/features/customers/tests/CustomerDetailScreen.test.tsx`.

## Proposed Implementation Plan

1. Refactor `CustomerDetailScreen` to render a read-only customer summary card by default
   with a single `Edit` action and existing `Create Quote` CTA.
2. Keep `CustomerInfoForm` as the edit surface, but render it only when edit mode is open.
3. Preserve save success/error behavior and collapse back to read mode after a successful
   save only if that feels consistent with the UX during implementation.
4. Update customer-detail tests to cover default read view, edit toggle, and unchanged save
   behavior.

## Risks And Edge Cases

- Save feedback must remain visible and understandable if the form closes after save.
- Empty optional fields need a clear read-only fallback so the screen does not feel broken.
- The change should not make the screen harder to scan on mobile.
- The quote history and create-quote CTA should remain visible without extra scrolling.

## Acceptance Criteria Draft

- Customer info displays as read-only text by default on first load.
- The read view shows customer name prominently, with phone, email, and address grouped as
  supporting metadata.
- An edit action opens the existing customer edit form without losing any current fields or
  validation behavior.
- Saving still calls `customerService.updateCustomer` with the same trimmed/null-normalized
  payload shape as today.
- Load, save success, and save error states still render correctly.
- The create-quote CTA and quote history remain available from the customer detail screen.

## Verification Plan

```bash
make frontend-verify
```

Targeted test focus:
- `frontend/src/features/customers/tests/CustomerDetailScreen.test.tsx`
- `frontend/src/features/customers/tests/QuoteHistoryList.test.tsx`

## Recommended Task Issue Body

```md
## Summary

Replace the always-open customer edit form on the customer detail screen with a condensed
read view that makes the customer header and quote history easier to scan before V1 work
lands on top of it.

## Goal

Make customer detail feel less form-heavy on first open while preserving existing edit
behavior.

## Non-Goals

- No backend or schema changes
- No tabbed customer-detail redesign
- No quote-history contract changes

## Scope

- Update `frontend/src/features/customers/components/CustomerDetailScreen.tsx` to show a
  read-only customer summary by default
- Add an edit toggle/button that opens the existing `CustomerInfoForm`
- Preserve current save payload semantics, feedback states, and navigation
- Keep quote history and create-quote CTA visible in the cleaned-up layout

## Risks / Edge Cases

- Read-only display of missing phone/email/address values
- Save feedback visibility if the edit form closes after save
- Mobile spacing so the new summary card does not crowd quote history

## Acceptance Criteria

- Customer info displays as read-only text by default
- Customer name is prominent, with address/phone/email shown as metadata below it
- Edit button opens an inline or separate edit form
- No loss of existing edit functionality or validation
- Saving preserves current trimmed/null-normalized payload behavior
- Load, success, and error states still render correctly
- Quote history and create-quote CTA remain visible and usable

## Verification

```bash
make frontend-verify
```

## Files In Scope

- `frontend/src/features/customers/components/CustomerDetailScreen.tsx`
- `frontend/src/features/customers/components/CustomerInfoForm.tsx`
- `frontend/src/features/customers/tests/CustomerDetailScreen.test.tsx`
- `frontend/src/features/customers/tests/QuoteHistoryList.test.tsx`
```

## Suggested `gh` Command

```bash
gh issue create \
  --title "Pre-V1 polish: condensed customer detail read view" \
  --label "type:task" \
  --label "area:customers" \
  --label "area:frontend" \
  --body-file plans/2026-03-26/issue-pre-v1-customer-detail-condensed-read-view.md
```
