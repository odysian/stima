# Task: Quote Drafting 3B — Frontend: CaptureScreen + ReviewScreen

## Goal

Implement the typed-notes quote drafting flow: `CaptureScreen` accepts user notes and calls
`convert-notes`, `useQuoteDraft` persists the extraction result in `sessionStorage`,
`ReviewScreen` lets the user edit line items and total before confirming. Submitting creates
the quote via `POST /api/quotes` and navigates to the (placeholder) preview route.

## Parent Spec / Roadmap Reference

Spec: Quote Drafting (V0 Task 3) — `docs/V0_ROADMAP.md` § Task 3B

Decision locks live in the Spec issue — do not re-open them here.

**Blocked on Task 3A DoD gate:** `POST /api/quotes/convert-notes` must return the locked
`ExtractionResult` schema before this task begins. MSW handler is written against that contract.

---

## Scope

**In:**
- `quote.types.ts` — `ExtractionResult`, `LineItemDraft`, `Quote`, `LineItem`, `QuoteCreateRequest`, `QuoteUpdateRequest`
- `useQuoteDraft.ts` hook — `sessionStorage`-backed draft state; `clearDraft()` on flow start and post-save
- `quoteService.ts` — `convertNotes`, `createQuote`, `getQuote`, `updateQuote`
- `CaptureScreen.tsx` — textarea input, "Generate Draft" button, loading state "Extracting line items...", calls `convertNotes`, writes draft, navigates to `/quotes/review`
- `ReviewScreen.tsx` — reads draft, editable line items (edit/add/delete), editable total, `notes` textarea, "Generate Quote PDF" CTA → `POST /api/quotes` → navigate `/quotes/:id/preview`
- `LineItemRow.tsx` — editable row: description, details, price; null price shows as empty field (never `$0.00`)
- Route `/quotes/review` added to `App.tsx` protected routes
- Route `/quotes/:id/preview` added to `App.tsx` as stub placeholder (Task 4 fills it in)
- `CustomerSelectScreen` calls `clearDraft()` on mount (wipes stale draft on new quote flow)
- MSW handlers: `POST /api/quotes/convert-notes`, `POST /api/quotes`
- Component tests (`vi.mock` on `quoteService`) for `CaptureScreen` and `ReviewScreen`
- Integration tests (MSW against real transport chain) for `quoteService`

**Out:**
- Voice capture — `useVoiceCapture.ts` stays stub (Task 5)
- PDF preview/download (Task 4)
- Quote list (Task 6)
- `GET /api/quotes` list call (not needed in this flow)
- Any backend changes

---

## File Targets

| File | Action | Purpose |
|---|---|---|
| `frontend/src/features/quotes/types/quote.types.ts` | Implement (from stub) | All quote + extraction types |
| `frontend/src/features/quotes/hooks/useQuoteDraft.ts` | Implement (from stub) | `sessionStorage`-backed draft state |
| `frontend/src/features/quotes/services/quoteService.ts` | Implement (from stub) | `convertNotes`, `createQuote`, `getQuote`, `updateQuote` |
| `frontend/src/features/quotes/components/CaptureScreen.tsx` | Implement (from stub) | Typed notes → extraction → navigate to review |
| `frontend/src/features/quotes/components/ReviewScreen.tsx` | Implement (from stub) | Edit draft → confirm → create quote |
| `frontend/src/features/quotes/components/LineItemRow.tsx` | Implement (from stub) | Editable line item row |
| `frontend/src/features/quotes/tests/CaptureScreen.test.tsx` | Create | Component tests (`vi.mock` on quoteService) |
| `frontend/src/features/quotes/tests/ReviewScreen.test.tsx` | Implement (from stub) | Component tests (`vi.mock` on quoteService + useQuoteDraft) |
| `frontend/src/features/quotes/tests/quoteService.integration.test.ts` | Create | MSW integration tests |
| `frontend/src/App.tsx` | Modify | Add `/quotes/review`, `/quotes/:id/preview` routes |
| `frontend/src/features/customers/components/CustomerSelectScreen.tsx` | Modify | Call `clearDraft()` on mount |
| `frontend/src/shared/tests/mocks/handlers.ts` | Modify | Add `POST /api/quotes/convert-notes`, `POST /api/quotes` handlers |

---

## Architecture Detail

### Types (`quote.types.ts`)

```typescript
export interface LineItemDraft {
  description: string;
  details: string | null;
  price: number | null;  // null = not stated, never 0
}

export interface ExtractionResult {
  transcript: string;
  line_items: LineItemDraft[];
  total: number | null;
  confidence_notes: string[];
}

export interface LineItem {
  id: string;
  description: string;
  details: string | null;
  price: number | null;
  sort_order: number;
}

export interface Quote {
  id: string;
  customer_id: string;
  doc_number: string;
  status: 'draft' | 'ready' | 'shared';
  transcript: string;
  total_amount: number | null;
  notes: string | null;
  line_items: LineItem[];
  created_at: string;
  updated_at: string;
}

export interface QuoteCreateRequest {
  customer_id: string;
  transcript: string;
  line_items: LineItemDraft[];
  total_amount: number | null;
  notes: string;
}
```

### `useQuoteDraft.ts`

```typescript
interface QuoteDraft {
  customerId: string;
  transcript: string;
  lineItems: LineItemDraft[];
  total: number | null;
  confidenceNotes: string[];
  notes: string;
}

// Backed by sessionStorage under key 'stima_quote_draft'
// Exposes: draft | null, setDraft(draft: QuoteDraft), clearDraft()
```

Draft lifecycle:
```
CustomerSelectScreen mounts    → clearDraft()           (wipes any stale draft)
CaptureScreen: extraction OK   → setDraft(result)
ReviewScreen: user edits       → setDraft(updated)
ReviewScreen: POST /api/quotes → clearDraft()
```

### `CaptureScreen.tsx`

- Reads `:customerId` from URL param
- Large textarea, placeholder: `"5 yards brown mulch, edge front beds..."`
- "Generate Draft" button — disabled when textarea is empty
- On submit: calls `quoteService.convertNotes(text)` → loading state "Extracting line items..."
- On success: writes `customerId` + extraction result into `useQuoteDraft` → `navigate('/quotes/review')`
- On error: inline error message, stays on screen

### `ReviewScreen.tsx`

- Reads draft from `useQuoteDraft`; redirects to `/` if draft is null (e.g., direct URL access)
- Transcript card at top (read-only)
- Confidence notes displayed if `confidenceNotes.length > 0`
- `LineItemRow` per item: description, details, price — all directly editable
- Null price renders as empty field (not `$0.00`)
- Add line item button (appends empty `{ description: '', details: null, price: null }` row)
- Delete button per row
- `notes` textarea (customer-facing message, optional)
- Editable total field (independent of line item sum)
- Line item sum shown as read-only display (client-side calculation, not persisted)
- "Generate Quote PDF" CTA — disabled until at least one line item with a non-empty description exists
- On CTA: `quoteService.createQuote({ customer_id, transcript, line_items, total_amount, notes })` → `clearDraft()` → `navigate(\`/quotes/${quote.id}/preview\`)`

### `LineItemRow.tsx`

```typescript
interface LineItemRowProps {
  item: LineItemDraft;
  onChange: (updated: LineItemDraft) => void;
  onDelete: () => void;
}
```

Price input: uncontrolled number field. Empty input → `price: null` (not 0). Never format
a null price as `$0.00`.

### MSW handlers (`handlers.ts`)

```typescript
http.post('/api/quotes/convert-notes', ({ request }) => {
  if (!request.headers.get('X-CSRF-Token'))
    return HttpResponse.json({ detail: 'CSRF required' }, { status: 403 });
  return HttpResponse.json({
    transcript: 'Five yards brown mulch, edge front beds.',
    line_items: [{ description: 'Brown mulch', details: '5 yards', price: 120.00 }],
    total: 120.00,
    confidence_notes: [],
  });
}),

http.post('/api/quotes', ({ request }) => {
  if (!request.headers.get('X-CSRF-Token'))
    return HttpResponse.json({ detail: 'CSRF required' }, { status: 403 });
  return HttpResponse.json(
    { id: 'quote-1', doc_number: 'Q-001', status: 'draft',
      customer_id: 'cust-1', transcript: '', total_amount: 120.00,
      notes: '', line_items: [], created_at: '', updated_at: '' },
    { status: 201 },
  );
}),
```

---

## Test Cases

### `CaptureScreen.test.tsx` (component, `vi.mock` on quoteService)

1. Renders textarea and "Generate Draft" button
2. "Generate Draft" is disabled when textarea is empty
3. "Generate Draft" enables when textarea has content
4. Loading state "Extracting line items..." renders while call is in-flight
5. On success: `useQuoteDraft.setDraft` called with extraction result; `navigate('/quotes/review')` called
6. On error: inline error message renders; user stays on screen

### `ReviewScreen.test.tsx` (component, `vi.mock` on quoteService + useQuoteDraft)

1. Renders line items from mocked draft
2. Null price renders as empty field, not `$0.00`
3. User can edit a line item description
4. User can delete a line item
5. User can add a new empty line item row
6. "Generate Quote PDF" disabled when line items list is empty
7. "Generate Quote PDF" enabled when at least one line item with a description exists
8. Transcript card renders (read-only)
9. Confidence notes section renders when `confidenceNotes` is non-empty
10. Notes textarea renders and is editable
11. On CTA click: `quoteService.createQuote` called with correct payload; `clearDraft` called; navigate to `/quotes/quote-1/preview`

### `quoteService.integration.test.ts` (MSW)

1. `convertNotes(text)` → 200 → returns parsed `ExtractionResult`; `X-CSRF-Token` header sent
2. `convertNotes(text)` — no CSRF token set → MSW returns 403 → error propagates
3. `createQuote(data)` → 201 → returns `Quote`; `X-CSRF-Token` header sent

---

## Acceptance Criteria

- [ ] `useQuoteDraft` persists draft in `sessionStorage`; survives page refresh within same tab
- [ ] `clearDraft()` called on `CustomerSelectScreen` mount (new flow wipes stale draft)
- [ ] `clearDraft()` called after `POST /api/quotes` succeeds
- [ ] `CaptureScreen` textarea submits to `convert-notes`; writes result to draft hook
- [ ] Loading state "Extracting line items..." renders during extraction call
- [ ] `ReviewScreen` renders all draft line items; null prices show as empty fields (not `$0.00`)
- [ ] Add / edit / delete line item all work correctly
- [ ] `notes` textarea is present and its value is included in `POST /api/quotes` payload
- [ ] "Generate Quote PDF" disabled until at least one line item with a description exists
- [ ] `POST /api/quotes` called on CTA; navigates to `/quotes/:id/preview` on success
- [ ] `/quotes/review` and `/quotes/:id/preview` routes added to `App.tsx` protected routes
- [ ] All component tests pass (no MSW, `vi.mock` layer only)
- [ ] All integration tests pass (MSW layer)
- [ ] `make frontend-verify` passes
- [ ] Existing test suite unbroken

## Verification

```bash
make frontend-verify
```

Fallback:
```bash
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
