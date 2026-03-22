# Task: Server-side customer quote filter

**Mode:** single

## Summary

`CustomerDetailScreen` fetches ALL user quotes via `GET /api/quotes` then filters client-side by `customer_id`. This works for early users but degrades as quote volume grows. Add an optional `customer_id` query parameter to the list endpoint so filtering happens at the database level.

## Scope

### Backend

**`repository.py` — `list_by_user()`**
Add optional `customer_id: UUID | None = None` parameter. When provided, add `WHERE documents.customer_id = :customer_id` to the existing query. The query already joins `Customer` for `customer_name`, so this is a single additional `where()` clause.

**`service.py` — `QuoteRepositoryProtocol` + `list_quotes()`**
The protocol stub at line 48 (`async def list_by_user(self, user_id: UUID)`) must be updated to include the new optional parameter — mypy will fail if the concrete signature diverges from the protocol. Then pass through the optional `customer_id: UUID | None = None` in `list_quotes()` to `repository.list_by_user()`.

**`api.py` — `list_quotes` endpoint**
Add `customer_id: UUID | None = Query(default=None)` parameter. Pass to service. No CSRF needed (GET endpoint). Use `UUID` not `str` — consistent with all other ID types in the API (e.g. `quote_id: UUID` on PATCH/GET endpoints). FastAPI handles UUID parsing from query strings.

**`schemas.py`** — No changes. Response schema is unchanged.

### Frontend

**`quoteService.ts` — `listQuotes()`**
Accept optional `params?: { customer_id?: string }`. Append `?customer_id=...` to URL when provided.

```ts
function listQuotes(params?: { customer_id?: string }): Promise<QuoteListItem[]> {
  const query = params?.customer_id ? `?customer_id=${params.customer_id}` : "";
  return request<QuoteListItem[]>(`/api/quotes${query}`);
}
```

**`CustomerDetailScreen.tsx`**
Replace:
```ts
const [nextCustomer, nextQuotes] = await Promise.all([
  customerService.getCustomer(customerId),
  quoteService.listQuotes(),
]);
const filteredQuotes = nextQuotes.filter((quote) => quote.customer_id === customerId);
```
With:
```ts
const [nextCustomer, nextQuotes] = await Promise.all([
  customerService.getCustomer(customerId),
  quoteService.listQuotes({ customer_id: customerId }),
]);
```
Remove the client-side filter and sort — backend already returns results ordered by `created_at DESC, doc_sequence DESC`.

### Backward compatibility

Existing callers (`QuoteList`, etc.) call `listQuotes()` with no params and continue getting all quotes. Non-breaking change.

## Files touched

**Modified:**
- `backend/app/features/quotes/repository.py` (add `customer_id: UUID | None` param to `list_by_user` — type must be `UUID`, not `str`)
- `backend/app/features/quotes/service.py` (update `QuoteRepositoryProtocol` stub + pass through param in `list_quotes`)
- `backend/app/features/quotes/api.py` (add query param)
- `frontend/src/features/quotes/services/quoteService.ts` (add optional param)
- `frontend/src/features/customers/components/CustomerDetailScreen.tsx` (use server filter)

## Acceptance criteria

- [ ] `GET /api/quotes?customer_id=<uuid>` returns only quotes for that customer
- [ ] `GET /api/quotes` without param returns all quotes (unchanged behavior)
- [ ] `CustomerDetailScreen` no longer fetches all quotes and filters client-side
- [ ] Existing `QuoteList` behavior unchanged (no param passed)
- [ ] Backend tests cover: filter returns correct subset, filter with no matches returns empty list
- [ ] Frontend integration test covers: `listQuotes({ customer_id })` sends query param

## Verification

```bash
make backend-verify
make frontend-verify
```
