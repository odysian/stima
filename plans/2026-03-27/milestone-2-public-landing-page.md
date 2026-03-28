# Plan: Milestone 2 — Public Quote Landing Page

**Date:** 2026-03-27
**Roadmap ref:** `docs/V1_ROADMAP.md` — Milestone 2
**Mode:** single (one task, one PR)

---

## Goal

Replace the direct PDF stream with a branded, mobile-first customer-facing page at `/doc/:token` where customers view the quote and download the PDF — read-only, no action buttons.

---

## Non-Goals

- Customer-facing approve/decline/request_changes buttons (removed from V1)
- `expired` status handling (deferred)
- Invoice landing page (Milestone 5 reuses this route for invoices)
- Email delivery of the link (Milestone 3)
- Any write action by the customer beyond the passive `shared → viewed` status transition

---

## Current State Audit

### Public share route (backend)
`backend/app/features/quotes/api.py:257-276` — `GET /share/{share_token}` streams raw PDF bytes with `Cache-Control: no-store` and `X-Robots-Tag: noindex`. This is the only public endpoint today.

### Frontend routing
`frontend/src/App.tsx` — no public `/doc/:token` route exists. No unauthenticated route shell exists at all. All routes are behind `ProtectedRoute` or `OnboardingRoute`.

### Share token
`share_token` is a `uuid4()` string, created on first share and reused (`repository.py:287-288`). The column already exists on `documents` from V0 migration `20260320_0005_add_share_token_to_documents`.

### QuoteRenderContext
`repository.py:215-232` — `get_render_context_by_share_token` already fetches the full render context (Document + Customer + User with eager-loaded line_items) by share token. This is currently used only for the public PDF stream, but provides exactly the data the landing page needs.

### PDF generation (public)
`service.py:266-278` — `generate_shared_pdf` looks up by share_token, attaches logo, renders PDF. The landing page's "Download PDF" link needs this same endpoint.

### Status transition
M1 ships the `viewed` status and the guard logic. M2 triggers the `shared → viewed` transition from the backend when the landing page is loaded.

### Event logger
After M1, `_PILOT_EVENT_NAMES` will include `quote_approved` and `quote_marked_lost`. M2 must add `quote_viewed`.

---

## Schema Changes

None. All schema work is handled by M1.

---

## Backend Changes

### 1. New public API endpoint: `GET /api/public/doc/{share_token}`

**Why a new endpoint instead of reusing `GET /share/{share_token}`:**
The existing `/share/{share_token}` returns raw PDF bytes. The landing page needs structured JSON (quote data, line items, customer info, logo URL). Keep the PDF endpoint alive for direct downloads; add a new endpoint that returns JSON for the frontend to render.

**Route:** `GET /api/public/doc/{share_token}` — no auth required.

**Response schema (`PublicQuoteResponse`):**

```python
class PublicLineItem(BaseModel):
    description: str
    details: str | None
    price: Decimal | None
    sort_order: int

class PublicQuoteResponse(BaseModel):
    doc_number: str
    title: str | None
    status: str                    # "shared" | "viewed" | "approved" | "declined"
    business_name: str
    contractor_name: str           # first_name + last_name
    logo_url: str | None           # relative URL to proxy endpoint, not raw GCS path
    customer_name: str
    line_items: list[PublicLineItem]
    total_amount: Decimal | None
    notes: str | None
    issued_date: str               # formatted per contractor timezone
    updated_date: str | None       # only if has_meaningful_update
```

**Design decisions to flag for human review:**

1. **Logo delivery:** The landing page needs the contractor's logo. Options:
   - (a) Embed as base64 data URI in the JSON response (works but bloats the payload, ~50-100KB for a logo)
   - (b) Return a relative URL (`/api/public/doc/{share_token}/logo`) that the frontend `<img>` tag fetches separately (clean separation, cacheable, progressive loading)
   - **Recommendation:** Option (b). Add a second public endpoint for the logo. The PDF template already uses data URI, but the web page should use a normal image tag.

2. **Status transition timing:** The `shared → viewed` transition should fire on the JSON fetch, not on a separate event. This means the first `GET /api/public/doc/{share_token}` call for a `shared` quote will transition it to `viewed` and log the event.

### 2. Repository additions

**New method: `get_public_quote_by_token(share_token: str) -> PublicQuoteData | None`**

Fetches document + customer + user (for business_name, contractor name, timezone, logo_path) by share_token. Returns a lightweight DTO with only the fields the public page needs.

**Reuse consideration:** `get_render_context_by_share_token` already does most of this. Could reuse it and map to the public response, or write a purpose-built query. Leaning toward reuse since the query is identical — just map the output differently.

**New method: `transition_to_viewed(document_id: UUID) -> None`**

Sets `status = viewed` only if current status is `shared`. No-op for any other status (idempotent).

### 3. Service additions

**New method: `get_public_quote(share_token: str) -> PublicQuoteResponse`**

1. Fetch render context by share_token (reuse existing repo method)
2. If not found → raise 404
3. If status is `shared` → call `transition_to_viewed()`, log `quote_viewed` event
4. If status is `viewed` → log `quote_viewed` event (repeat views still logged)
5. If status is `approved` or `declined` → return data with terminal status (page will show closed state)
6. If status is `draft` or `ready` → raise 404 (quote hasn't been shared yet, token shouldn't be exposed)
7. Map render context to `PublicQuoteResponse`

**Decision for human review:** Should `draft`/`ready` quotes return 404 on the public endpoint? The share token doesn't exist until the contractor shares, so this case shouldn't happen in practice. But defensively, returning 404 prevents accidental exposure if a token is somehow set before sharing. **Recommendation:** Yes, 404.

**Decision for human review:** Should repeat `quote_viewed` events be logged every time the page loads, or only on the first view (the `shared → viewed` transition)? Logging every load provides traffic data but could be noisy. **Recommendation:** Log on every load. It's a cheap DB write, and "how often are customers looking at this quote" is useful analytics.

### 4. Public logo proxy endpoint: `GET /api/public/doc/{share_token}/logo`

Returns raw image bytes with correct `Content-Type` from storage service. Returns 404 if no logo. Adds `Cache-Control: public, max-age=3600` (logos don't change often). No auth required — the share token gates access.

### 5. Event logger

Add `quote_viewed` to `_PILOT_EVENT_NAMES`. After M1 + M2, the whitelist will be:

```python
_PILOT_EVENT_NAMES = frozenset({
    "quote_started",
    "audio_uploaded",
    "draft_generated",
    "draft_generation_failed",
    "quote_pdf_generated",
    "quote_shared",
    "quote_approved",
    "quote_marked_lost",
    "quote_viewed",           # M2
})
```

### 6. Existing `GET /share/{share_token}` endpoint

Keep it alive. The landing page's "Download PDF" button links to this URL. No changes needed — it already works for unauthenticated access.

---

## Frontend Changes

### 1. Public route shell

The app currently has no unauthenticated page routes. M2 introduces the first.

**New route in `App.tsx`:** `/doc/:token` → `PublicQuotePage`

This route must be **outside** the `ProtectedRoute` wrapper. It needs its own minimal layout — no `BottomNav`, no `ScreenHeader` (those are contractor-app chrome). The page is standalone.

### 2. New feature: `frontend/src/features/public/`

Create a new feature directory for public-facing pages. This is where M5's invoice page will also live.

```
frontend/src/features/public/
  components/
    PublicQuotePage.tsx       # route component
  services/
    publicService.ts          # API calls (fetch quote, logo URL builder)
  types/
    public.types.ts           # PublicQuoteResponse type
```

### 3. `PublicQuotePage.tsx` — the landing page

**Layout anatomy:**

```
┌─────────────────────────────────┐
│  [Logo]  Business Name          │  Header: logo + business name
│  Quote #Q-001                   │  Doc number + optional title
│  "Spring Cleanup"               │
├─────────────────────────────────┤
│                                 │
│  Prepared for: Customer Name    │  Customer info block
│                                 │
│  ┌─────────────────────────┐    │
│  │ Line Item 1      $200   │    │  Line items list
│  │ Line Item 2      $450   │    │
│  │ Line Item 3        —    │    │
│  ├─────────────────────────┤    │
│  │ Total           $650    │    │  Total row
│  └─────────────────────────┘    │
│                                 │
│  Notes: ...                     │  Optional notes section
│                                 │
│  [Download PDF]                 │  PDF download button
│                                 │
│  Issued: Mar 14, 2026           │  Date metadata
│                                 │
├─────────────────────────────────┤
│  Powered by Stima               │  Minimal footer
└─────────────────────────────────┘
```

**Closed state (approved/declined):**

When the quote has a terminal status, the page still renders all quote content but adds a banner at the top:

- `approved` → "This quote has been accepted" (success container styling)
- `declined` → "This quote is no longer available" (neutral/muted styling)

The banner is informational only — no action is required from the customer.

**Design system compliance:**

- Uses design tokens from `docs/DESIGN.md` (no raw hex, no Tailwind defaults)
- Mobile-first layout with `max-w-3xl mx-auto` for desktop
- `font-headline` for business name and doc number
- `ghost-shadow` on the main content card
- `forest-gradient` on the Download PDF button (single primary action)
- No `ScreenHeader` or `BottomNav` — this is a standalone public page
- Background: `bg-background` (the standard page base)

**Loading and error states:**

- Loading: simple centered spinner (can use `LoadingScreen` or a lighter variant)
- 404: "This link is not valid or has expired" with no further action
- Network error: "Something went wrong. Try refreshing the page."

### 4. `publicService.ts`

```typescript
export async function getPublicQuote(token: string): Promise<PublicQuoteResponse> {
  // GET /api/public/doc/{token} — no auth, no CSRF
}

export function getPublicPdfUrl(token: string): string {
  // Returns the URL for the existing /share/{token} endpoint
}

export function getPublicLogoUrl(token: string): string {
  // Returns the URL for /api/public/doc/{token}/logo
}
```

**Important:** This service must NOT use the shared `request()` function from `http.ts` because that function injects CSRF headers and `credentials: 'include'`. Public endpoints need a plain `fetch` with no cookies or CSRF. Create a minimal `publicFetch` helper or use raw `fetch`.

### 5. Frontend share link update

Currently, `QuotePreview.tsx` constructs the share URL as `${apiBase}/share/${quote.share_token}` (pointing to the PDF stream). After M2, this should point to the landing page instead: `${frontendBase}/doc/${quote.share_token}`.

**Decision for human review:** Should the share URL in the contractor's clipboard change immediately, or should we keep the PDF link as the primary share mechanism until M3 (email) ships? **Recommendation:** Change it now. The landing page is the V1 experience. Contractors who copy the link should send customers to the branded page, not a raw PDF.

This means the `shareUrl` construction in `QuotePreview.tsx:126` needs to switch from `apiBase` to `window.location.origin` (or a config value for the frontend URL).

---

## Key Risks and Edge Cases

| Risk | Mitigation |
|---|---|
| Public endpoint exposes data for `draft`/`ready` quotes | Return 404 for any status before `shared`; share_token is only set on share so this is defensive |
| CORS on public API endpoint | Public endpoints are same-origin (frontend and API on same parent domain); verify CORS config includes the public route pattern |
| `publicService.ts` accidentally uses authenticated `request()` | Create a separate fetch helper; code review catch |
| Logo fetch fails silently | Return 404 from logo endpoint; frontend `<img>` tag handles missing gracefully with `onError` fallback |
| Race condition: two tabs load simultaneously, both try `shared → viewed` | `transition_to_viewed` is idempotent — WHERE clause checks current status. Second call is a no-op |
| Large logos slow page load | Logo is a separate HTTP request, not embedded in JSON. Browser caches with `max-age=3600` |
| SEO crawlers index public pages | Keep `X-Robots-Tag: noindex` on the API response and add `<meta name="robots" content="noindex">` to the page |

---

## Implementation Order

1. Backend: add `quote_viewed` to `_PILOT_EVENT_NAMES`
2. Backend: add `PublicQuoteResponse` schema (response model for public endpoint)
3. Backend: add `transition_to_viewed` repository method
4. Backend: add `get_public_quote` service method (fetch + transition + event log)
5. Backend: add `GET /api/public/doc/{share_token}` API route
6. Backend: add `GET /api/public/doc/{share_token}/logo` proxy route
7. Backend tests: public endpoint (happy path, 404, status transition, repeat views, terminal states, logo proxy)
8. Frontend: create `features/public/` directory structure
9. Frontend: add `publicService.ts` with plain fetch (no auth)
10. Frontend: build `PublicQuotePage.tsx` (layout, loading, error, closed states)
11. Frontend: add `/doc/:token` route outside `ProtectedRoute` in `App.tsx`
12. Frontend: update share URL construction in `QuotePreview.tsx` to point to `/doc/:token`
13. Frontend tests: PublicQuotePage rendering, loading states, closed state banners
14. Update `docs/ARCHITECTURE.md`: add public API endpoint, add `quote_viewed` to event table

---

## Acceptance Criteria

- [ ] `GET /api/public/doc/{share_token}` returns quote data as JSON without authentication
- [ ] Unknown tokens return 404 ("This link is not valid")
- [ ] `draft` and `ready` quotes return 404 on the public endpoint
- [ ] First load of a `shared` quote transitions status to `viewed`
- [ ] `quote_viewed` event is logged on every page load (not just first)
- [ ] `approved` quotes show a "quote accepted" banner; all content still visible
- [ ] `declined` quotes show a "quote no longer available" banner; all content still visible
- [ ] Landing page renders: logo, business name, doc number, title (if present), customer name, line items, total, notes, date
- [ ] "Download PDF" button links to existing `/share/{share_token}` PDF endpoint
- [ ] Logo loads from `/api/public/doc/{share_token}/logo`; graceful fallback if no logo
- [ ] Page is mobile-first and readable without scrolling horizontally
- [ ] No action buttons on the page — read-only for the customer
- [ ] `X-Robots-Tag: noindex` header present on API response
- [ ] Share URL in contractor clipboard points to `/doc/:token` (not the raw PDF)
- [ ] Existing `/share/{share_token}` PDF endpoint is unchanged and still works
- [ ] `docs/ARCHITECTURE.md` updated with new public endpoint and `quote_viewed` event

---

## Verification

```bash
make backend-verify
make frontend-verify
```

Manual:
1. Share a quote → copy link → open in incognito → confirm landing page loads
2. Check quote status in the app → confirm it transitioned to `viewed`
3. Check `event_logs` for `quote_viewed` row
4. Open landing page for an `approved` quote → confirm closed-state banner
5. Open landing page for a `declined` quote → confirm closed-state banner
6. Try `/doc/nonexistent-token` → confirm 404 page
7. Click "Download PDF" on landing page → confirm PDF downloads
8. View page on mobile viewport → confirm responsive layout
9. View page for a quote with no logo → confirm no broken image
