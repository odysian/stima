# Task #51 — Include customer details in quote detail response

## Goal

Extend `GET /quotes/{id}` to include `customer_name`, `customer_email`, and `customer_phone`
in the response payload so the Quote Preview CLIENT card can display real contact data.

## Scope Boundaries

- **In scope:** `GET /quotes/{id}` only. POST and PATCH responses are intentionally excluded.
- **Out of scope:** `customer_address` (no screen displays it; PDF render context already handles it separately).
- **No migration required** — read-only query change only.
- **No model change** — no new ORM relationship needed.

## Acceptance Criteria

- `GET /quotes/{id}` includes `customer_name`, `customer_email`, and `customer_phone` in the response.
- `POST /quotes` and `PATCH /quotes/{id}` responses are unchanged.
- Backend tests validate the three new fields with correct values.
- Frontend `Quote` type updated to match the new API contract.
- `make backend-verify` and `make frontend-verify` pass.

## Implementation Steps

### 1. `backend/app/features/quotes/repository.py`

Add a `QuoteDetailRow` dataclass (same pattern as existing `QuoteListItemSummary`):

```python
@dataclass(slots=True)
class QuoteDetailRow:
    id: UUID
    customer_id: UUID
    customer_name: str
    customer_email: str | None
    customer_phone: str | None
    doc_number: str
    status: str
    source_type: str
    transcript: str
    total_amount: Decimal | None
    notes: str | None
    shared_at: datetime | None
    share_token: str | None
    line_items: list[LineItem]
    created_at: datetime
    updated_at: datetime
```

Add `get_detail_by_id(quote_id: UUID, user_id: UUID) -> QuoteDetailRow | None` to `QuoteRepository`:

```python
async def get_detail_by_id(self, quote_id: UUID, user_id: UUID) -> QuoteDetailRow | None:
    result = await self._session.execute(
        select(Document, Customer)
        .join(Customer, Customer.id == Document.customer_id)
        .where(
            Document.id == quote_id,
            Document.user_id == user_id,
        )
        .options(selectinload(Document.line_items))
    )
    row = result.one_or_none()
    if row is None:
        return None
    document, customer = row
    return QuoteDetailRow(
        id=document.id,
        customer_id=document.customer_id,
        customer_name=customer.name,
        customer_email=customer.email,
        customer_phone=customer.phone,
        doc_number=document.doc_number,
        status=document.status.value if isinstance(document.status, QuoteStatus) else str(document.status),
        source_type=document.source_type,
        transcript=document.transcript,
        total_amount=document.total_amount,
        notes=document.notes,
        shared_at=document.shared_at,
        share_token=document.share_token,
        line_items=document.line_items,
        created_at=document.created_at,
        updated_at=document.updated_at,
    )
```

### 2. `backend/app/features/quotes/schemas.py`

Add `QuoteDetailResponse` extending `QuoteResponse`:

```python
class QuoteDetailResponse(QuoteResponse):
    """Quote detail payload including customer display fields."""
    customer_name: str
    customer_email: str | None
    customer_phone: str | None
```

`QuoteResponse` is left unchanged.

### 3. `backend/app/features/quotes/service.py`

Add `get_detail_by_id` to `QuoteRepositoryProtocol`:

```python
async def get_detail_by_id(self, quote_id: UUID, user_id: UUID) -> QuoteDetailRow | None: ...
```

Update the import from `repository.py` to include `QuoteDetailRow`.

Add `get_quote_detail` service method:

```python
async def get_quote_detail(self, user: User, quote_id: UUID) -> QuoteDetailRow:
    """Return one user-owned quote with customer fields or raise not found."""
    row = await self._repository.get_detail_by_id(quote_id, _resolve_user_id(user))
    if row is None:
        raise QuoteServiceError(detail="Not found", status_code=404)
    return row
```

### 4. `backend/app/features/quotes/api.py`

In the `GET /quotes/{id}` endpoint only:

- Change `response_model=QuoteResponse` → `response_model=QuoteDetailResponse`
- Change return type annotation to `QuoteDetailResponse`
- Call `service.get_quote_detail(...)` instead of `service.get_quote(...)`
- Import `QuoteDetailResponse` alongside `QuoteResponse`
- Validate with `QuoteDetailResponse.model_validate(row)`

POST (`/quotes`) and PATCH (`/quotes/{id}`) endpoints are not touched.

### 5. `frontend/src/features/quotes/types/quote.types.ts`

Add three fields to the existing `Quote` interface:

```ts
export interface Quote {
  // ... existing fields ...
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
}
```

No changes needed to `quoteService.ts` — `getQuote` already returns `Quote` and the response
will naturally include the new fields once the backend ships them.

### 6. Backend tests

In the existing quote detail test file, add assertions that the response body includes:

```python
assert data["customer_name"] == "Test Customer"
assert data["customer_email"] == expected_email   # or None
assert data["customer_phone"] == expected_phone   # or None
```

Cover at minimum:
- Customer with all three fields present
- Customer with `email` and `phone` as `None` (nullable fields)

## Files Touched

```
backend/app/features/quotes/repository.py   — QuoteDetailRow dataclass + get_detail_by_id
backend/app/features/quotes/schemas.py      — QuoteDetailResponse
backend/app/features/quotes/service.py      — protocol update + get_quote_detail
backend/app/features/quotes/api.py          — GET /quotes/{id} only
frontend/src/features/quotes/types/quote.types.ts — Quote interface
backend/tests/features/quotes/...           — new assertions
```

## Verification

```bash
make backend-verify
make frontend-verify
```

## Context

- `QuotePreview.tsx:68` calls `quoteService.getQuote(quoteId)` — the new fields will be consumed immediately.
- `QuoteRenderContext` in `repository.py` already joins Customer for PDF rendering; this task follows the same join pattern.
- `QuoteListItemSummary` is the direct precedent for the dataclass approach used here.
- POST `/quotes` response is intentionally excluded: `ReviewScreen` discards everything except `createdQuote.id` for navigation.
- PATCH `/quotes/{id}` response is intentionally excluded: not called from any component yet.
