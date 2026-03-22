# Task B: Frontend component splits — QuotePreview, CustomerDetail, ReviewScreen, CustomerSelect

**Parent Spec:** Codebase modularization
**Mode:** gated child task
**Type:** no-contract refactor
**Depends on:** Task A (shared foundation components must exist first)

## Summary

Split four oversized frontend components into focused sub-components. Each extraction targets a self-contained UI section with a clean prop boundary.

## Scope

### 1. Split `QuotePreview.tsx` (357 -> ~150 LOC)

Extract into `features/quotes/components/`:

| New component | Responsibility | Props |
|---|---|---|
| `QuotePreviewActions.tsx` (~80 LOC) | Generate PDF button + Share button + feedback messages (pdfError, shareError, shareMessage, isGeneratingPdf, isSharing) | `onGeneratePdf`, `onShare`, `isGeneratingPdf`, `isSharing`, `canShare`, `disabled`, `pdfError`, `shareError`, `shareMessage` |
| `QuoteDetailsCard.tsx` (~50 LOC) | Total amount card + client info card | `totalAmount`, `clientName`, `clientContact` |
| `ShareLinkRow.tsx` (~30 LOC) | Share URL display + copy-to-clipboard button | `shareUrl`, `onCopy` |

**Parent keeps:** Data fetching effect, PDF blob URL lifecycle, `onGeneratePdf`/`onShare`/`copyToClipboard` handlers, layout shell with `ScreenHeader` (trailing = `StatusBadge`).

Helper functions stay in parent:
- `isShareAbortError()` — used only by `onShare` handler
- `readOptionalQuoteText()` — used to compute `clientName`/`clientContact` props

### 2. Split `CustomerDetailScreen.tsx` (302 -> ~100 LOC)

Extract into `features/customers/components/`:

| New component | Responsibility | Props |
|---|---|---|
| `CustomerInfoForm.tsx` (~100 LOC) | 4-field edit form (name, phone, email, address) + save button + save/error feedback | `name`, `phone`, `email`, `address`, `onNameChange`, `onPhoneChange`, `onEmailChange`, `onAddressChange`, `onSubmit`, `isSaving`, `saveError`, `saveSuccess` |
| `QuoteHistoryList.tsx` (~60 LOC) | Quote cards list for a customer + empty state + count label | `quotes`, `onQuoteClick` |

**Parent keeps:** Data fetching (customer + quotes), form state management, `onSaveChanges` handler, layout shell with `ScreenHeader`.

### 3. Split `ReviewScreen.tsx` (276 -> ~230 LOC)

Extract into `features/quotes/components/`:

| New component | Responsibility | Props |
|---|---|---|
| `TotalAmountSection.tsx` (~50 LOC) | Line item sum display + editable total input with `$` prefix | `lineItemSum`, `total`, `onTotalChange` |

**Parent keeps:** Draft state, all validation logic (`normalizeLineItem`, `isBlankLineItem`, `isInvalidLineItem`), submission handler, line items list (already uses `LineItemCard`), notes textarea, AI confidence banner, `ScreenHeader` + `ScreenFooter`.

Rationale: Line items and notes are too tightly coupled to draft state for clean extraction without excessive prop drilling. `TotalAmountSection` is the one self-contained piece.

### 4. Split `CustomerSelectScreen.tsx` (264 -> ~180 LOC)

Extract into `features/customers/components/`:

| New component | Responsibility | Props |
|---|---|---|
| `CustomerInlineCreateForm.tsx` (~80 LOC) | Name/phone/email/address create form with cancel + submit | `name`, `phone`, `email`, `address`, `onNameChange`, `onPhoneChange`, `onEmailChange`, `onAddressChange`, `onSubmit`, `onCancel`, `isCreating`, `error` |

**Parent keeps:** Mode switching, customer list fetch, search filtering, search view rendering, `ScreenHeader`.

Note: `CustomerInlineCreateForm` and `CustomerInfoForm` share the same 4 fields but serve different purposes (create vs edit). Keep separate — no premature abstraction.

## Files touched

**New files:**
- `frontend/src/features/quotes/components/QuotePreviewActions.tsx`
- `frontend/src/features/quotes/components/QuoteDetailsCard.tsx`
- `frontend/src/features/quotes/components/ShareLinkRow.tsx`
- `frontend/src/features/quotes/components/TotalAmountSection.tsx`
- `frontend/src/features/customers/components/CustomerInfoForm.tsx`
- `frontend/src/features/customers/components/QuoteHistoryList.tsx`
- `frontend/src/features/customers/components/CustomerInlineCreateForm.tsx`

**Modified files:**
- `frontend/src/features/quotes/components/QuotePreview.tsx`
- `frontend/src/features/quotes/components/ReviewScreen.tsx`
- `frontend/src/features/customers/components/CustomerDetailScreen.tsx`
- `frontend/src/features/customers/components/CustomerSelectScreen.tsx`

## Acceptance criteria

- [ ] `QuotePreview.tsx` is under 250 LOC
- [ ] `CustomerDetailScreen.tsx` is under 250 LOC
- [ ] `ReviewScreen.tsx` is under 250 LOC
- [ ] `CustomerSelectScreen.tsx` is under 250 LOC
- [ ] All new sub-components are under 120 LOC each
- [ ] No behavior change — same rendering, same interactions, same error handling
- [ ] All existing tests pass without modification

## Parity lock

- Status code parity: N/A (frontend-only)
- Response schema parity: N/A
- Error semantics parity: same error messages, same rendering paths
- Side-effect parity: same service calls, same navigation

## Verification

```bash
make frontend-verify
```
