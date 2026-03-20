# Task: PDF Generation + Preview + Share (V0 Task 4)

## Goal

Wire PDF generation and quote sharing. After the review screen creates a quote, the user
lands on a preview screen that renders the PDF and lets them share a persistent public link
with their customer. Completes Slice 0 — the full end-to-end loop is proven.

## Parent Spec / Roadmap Reference

`docs/V0_ROADMAP.md` § Task 4

---

## Locked Design Decisions (Whiteboard 2026-03-20)

### PDF delivery
Frontend calls `POST /api/quotes/:id/pdf`, receives raw bytes, creates a Blob URL, renders
in an `<iframe>`. Not a direct iframe src — goes through the controlled fetch layer so
loading states and errors are catchable.

### Share mechanism
Link-based, not file attachment. `POST /api/quotes/:id/share` generates a `share_token`
(UUID stored on the document). Frontend constructs the public URL:
`${window.location.origin}/share/${token}`. On mobile, `navigator.share({ url, title })`
pops the native share sheet. On desktop (or when share API unavailable), copy-to-clipboard
or anchor download fallback.

Customers open a link in their browser — no "what do I do with this .pdf" confusion.
The link renders the PDF on-demand from the DB — no S3, no file storage.

### Quote versioning / staleness
No versioning, no banners. The public link always shows the current quote state.
Light transparency instead: the PDF template shows an "Updated" date if `updated_at`
differs from `created_at` by more than ~5 minutes. Shady edit = visible date.
Customer can download the PDF from their browser after opening the link.

### `QuoteResponse` additions
Add `shared_at` (nullable datetime) and `share_token` (nullable string).
Skip `pdf_url` — no S3, PDFs rendered on demand, field would be permanently null.

### Template data loading
Single repository method `get_render_context` returns a plain dataclass with everything
WeasyPrint needs: user profile fields, customer fields, quote fields, line items. All
loading happens inside one method call — typically `selectinload` for relationships, not
necessarily a single SQL JOIN. The contract is one method, one await, no lazy-load traps.

### PDF endpoint
Single `POST /api/quotes/:id/pdf` — renders PDF, flips status `draft → ready`,
streams bytes in one call via FastAPI `StreamingResponse`. Frontend does optimistic
status update to `ready` (no follow-up GET) because `StreamingResponse` cannot also
return JSON metadata.

### Share endpoint
`POST /api/quotes/:id/share` — generates `share_token` if not set, sets `shared_at`,
sets `status = 'shared'`. Returns full updated `QuoteResponse` (includes `share_token`
and `shared_at` so frontend can construct the URL without a second call).

### Status transition rules (locked)
- `draft → ready`: only via `POST /pdf`. `/pdf` must not downgrade `shared → ready`.
- `ready → shared`: only via `POST /share`.
- `POST /share` called while still `draft`: auto-advance — sets both `ready` and `shared`
  in one call (tradesperson may skip preview and share directly).
- Repeated `POST /share`: idempotent on `share_token` (reuse existing token),
  updates `shared_at` to latest call time.
- `POST /pdf` called on an already-`shared` quote: re-renders and streams PDF bytes
  but does **not** change status back to `ready`.

---

## Considerations / Follow-Ups

- **Optimistic status after PDF generation:** If stale `draft` status causes the share
  button to not enable correctly on the preview screen, add a follow-up
  `GET /api/quotes/:id` after the PDF call resolves. Intentionally deferred — keep it
  simple until there's a concrete problem.

- **`navigator.share` file vs URL:** We chose URL sharing. This means the customer gets
  a link, not a file attachment. Link sharing (`{ url }`) has broader browser support
  than file sharing (`{ files }`) and avoids the "what is a .pdf" UX problem for
  older customers on mobile.

- **Quote edit after sharing:** Current state: edits silently update what the link shows,
  with the `updated_at` date on the PDF as the only signal. If pilot users raise this
  as a concern, revisit with link invalidation on edit or explicit reshare flow.

- **Local dev: `/share` route not proxied.** Vite proxies only `/api`. In local dev,
  `window.location.origin/share/:token` hits the Vite server and 404s. Fix: add
  `/share` to the Vite proxy config (`vite.config.ts`), or test the public endpoint
  directly against the backend port (`localhost:8000/share/:token`). The issue should
  call this out so the agent doesn't mistake a proxy gap for a backend bug.

---

## Scope

### Backend

**Migration:**
- Add `share_token TEXT NULL` to `documents` table
- Add unique index on `share_token`

**`QuoteResponse` schema additions:**
- `shared_at: datetime | None`
- `share_token: str | None`

**Render context dataclass + repository method:**
- `QuoteRenderContext` dataclass: `business_name`, `first_name`, `last_name`,
  `customer_name`, `customer_phone`, `customer_email`, `customer_address`, `doc_number`,
  `status`, `total_amount`, `notes`, `line_items`, `created_at`, `updated_at`
- Note: user model has `first_name` + `last_name`, not `owner_name`. Template composes
  them as `{{ first_name }} {{ last_name }}`. Do not add a new DB column.
- `QuoteRepository.get_render_context(quote_id, user_id)` — loads across `documents`,
  `line_items`, `users`, `customers` in one method call. Returns `QuoteRenderContext`
  or `None`.

**`integrations/pdf.py`** (implement from stub):
- `render_quote_pdf(context: QuoteRenderContext) -> bytes`
- Uses WeasyPrint + Jinja2 to render `app/templates/quote.html`
- Returns raw PDF bytes

**`quote.html` template** (implement from stub):
- Business name + `{{ first_name }} {{ last_name }}` (top header)
- Customer name, phone, email, address (if present)
- Quote number and issued date
- Updated date row — only rendered if `updated_at` differs from `created_at` by >5min
- Line items table: description, details, price (blank cell for null, never `$0.00`)
- Total row (blank if null)
- Notes section (if present)
- Inline CSS only, system fonts only (WeasyPrint limitation)
- Must look clean enough that a tradesperson sends it without embarrassment

**New endpoints:**
- `POST /api/quotes/{id}/pdf` — auth + CSRF. Calls `get_render_context`, renders PDF,
  flips status to `ready`, streams `application/pdf` with
  `Content-Disposition: inline; filename="quote-{doc_number}.pdf"`.
  Returns 404 if quote not found. Returns 422 if render fails (not 500).
- `POST /api/quotes/{id}/share` — auth + CSRF. Generates `share_token` (UUID) if not
  set, sets `shared_at`, sets `status = 'shared'`. Returns full `QuoteResponse`.
- `GET /share/{token}` — **no auth**. Loads quote by `share_token`, renders and streams
  PDF. Returns 404 if token not found. Mounted outside `/api/` prefix.
  Must include `Cache-Control: no-store` and `X-Robots-Tag: noindex` response headers
  (PDF contains customer PII; must not be cached or indexed).

**Service layer:**
- `QuoteService.generate_pdf(user, quote_id)` — loads render context, delegates to
  `pdf_integration.render_quote_pdf()`, updates status, returns bytes
- `QuoteService.share_quote(user, quote_id)` — sets token + timestamps, returns document

**`QuoteServiceProtocol` additions:**
- `pdf_integration: PdfIntegrationProtocol`
- `PdfIntegrationProtocol.render(context: QuoteRenderContext) -> bytes`

### Frontend

**`quote.types.ts` additions:**
- `shared_at: string | null` and `share_token: string | null` on `Quote`

**`http.ts` addition:**
- `requestBlob(url, options): Promise<Blob>` — new export alongside `request()`.
  Same auth/CSRF/refresh logic, but returns `response.blob()` instead of parsing JSON.
  Required because `request()` calls `parsePayload()` which returns `null` for
  non-JSON content types — PDF bytes would be silently dropped without this.

**`quoteService.ts` additions:**
- `generatePdf(id: string): Promise<Blob>` — calls `requestBlob()` on
  `POST /api/quotes/:id/pdf`
- `shareQuote(id: string): Promise<Quote>` — calls `POST /api/quotes/:id/share`
  via standard `request()`

**`QuotePreview` screen** (implement `QuotePreviewPlaceholder` in `App.tsx`):
- Reads `:id` from URL params, fetches quote via `quoteService.getQuote(id)` on mount
- "Generate PDF" button — calls `generatePdf`, creates Blob URL, renders in `<iframe>`
- Loading state while PDF generates ("Generating PDF...")
- Error state if PDF call fails
- "Share" button (enabled after PDF generated OR if `quote.status === 'shared'`):
  - Calls `shareQuote(id)` → gets updated quote with `share_token`
  - Constructs URL: `${window.location.origin}/share/${share_token}`
  - `navigator.share({ url, title: \`Quote ${doc_number}\` })` if available
  - Clipboard copy fallback if share API unavailable
- "Back to Edit" link → `/quotes/review` (only if status is still `draft`)
- Optimistic local state: after `generatePdf` succeeds, set local status to `ready`
  without refetching

**`App.tsx`:**
- Replace `QuotePreviewPlaceholder` with real `QuotePreview` component

**MSW handlers:**
- `POST /api/quotes/:id/pdf` — returns mock PDF blob (or small placeholder bytes)
- `POST /api/quotes/:id/share` — returns updated `Quote` with `share_token` + `shared_at`
- `GET /share/:token` — out of scope for frontend tests (public endpoint, no auth layer)

---

## File Targets

| File | Action | Purpose |
|---|---|---|
| `backend/alembic/versions/xxxx_add_share_token_to_documents.py` | Create | Add `share_token` column |
| `backend/app/features/quotes/schemas.py` | Modify | Add `shared_at`, `share_token` to `QuoteResponse` |
| `backend/app/features/quotes/models.py` | Modify | Add `share_token` column |
| `backend/app/features/quotes/repository.py` | Modify | Add `get_render_context` joined query |
| `backend/app/features/quotes/service.py` | Modify | Add `generate_pdf`, `share_quote` methods |
| `backend/app/features/quotes/api.py` | Modify | Add `POST /:id/pdf`, `POST /:id/share` |
| `backend/app/main.py` | Modify | Mount `GET /share/{token}` router outside `/api/` prefix |
| `backend/app/integrations/pdf.py` | Implement | WeasyPrint render from `QuoteRenderContext` |
| `backend/app/templates/quote.html` | Implement | Professional PDF template |
| `backend/app/features/quotes/tests/test_pdf.py` | Create | PDF endpoint + share endpoint tests |
| `frontend/src/features/quotes/types/quote.types.ts` | Modify | Add `shared_at`, `share_token` to `Quote` |
| `frontend/src/shared/lib/http.ts` | Modify | Add `requestBlob()` export for binary responses |
| `frontend/src/features/quotes/services/quoteService.ts` | Modify | Add `generatePdf`, `shareQuote` |
| `frontend/src/features/quotes/components/QuotePreview.tsx` | Create | PDF preview + share screen |
| `frontend/src/features/quotes/tests/QuotePreview.test.tsx` | Create | Component tests |
| `frontend/src/features/quotes/tests/quoteService.integration.test.ts` | Modify | Add PDF + share service tests |
| `frontend/src/shared/tests/mocks/handlers.ts` | Modify | Add PDF + share MSW handlers |
| `frontend/src/App.tsx` | Modify | Wire `QuotePreview` into `/quotes/:id/preview` route |

---

## Acceptance Criteria

### Backend
- [ ] `POST /api/quotes/:id/pdf` returns `application/pdf` with correct `Content-Disposition` header
- [ ] `POST /api/quotes/:id/pdf` sets quote status to `ready`
- [ ] `POST /api/quotes/:id/share` sets `status = 'shared'`, `shared_at`, generates `share_token`
- [ ] `POST /api/quotes/:id/share` called while `draft`: auto-advances to `shared` (skips `ready`)
- [ ] Repeated `POST /share`: reuses existing `share_token`, updates `shared_at`
- [ ] `POST /pdf` on a `shared` quote: re-renders PDF but does not downgrade status to `ready`
- [ ] `POST /api/quotes/:id/share` returns full `QuoteResponse` with `share_token` and `shared_at`
- [ ] `GET /share/:token` returns PDF without auth; 404 on unknown token
- [ ] `GET /share/:token` includes `Cache-Control: no-store` and `X-Robots-Tag: noindex` headers
- [ ] PDF template renders business name, `first_name last_name`, customer details, line items, total
- [ ] No `owner_name` DB column added — template composes from existing `first_name` + `last_name`
- [ ] PDF template shows "Updated" date only when `updated_at` meaningfully differs from `created_at`
- [ ] Null prices render as blank cells, never `$0.00`
- [ ] Both endpoints enforce auth + CSRF; public share endpoint enforces neither
- [ ] WeasyPrint system dependencies verified working in local dev environment

### Frontend
- [ ] `QuotePreview` fetches quote on mount; renders loading state
- [ ] "Generate PDF" calls `POST /pdf`, renders PDF in iframe via Blob URL
- [ ] Loading state "Generating PDF..." renders during call
- [ ] Error state renders if PDF call fails
- [ ] "Share" button enabled after PDF generated or if status already `ready`/`shared`
- [ ] Share calls `POST /share`, constructs URL from `share_token`
- [ ] `navigator.share({ url })` called when available; clipboard/download fallback otherwise
- [ ] Optimistic status update to `ready` after successful PDF generation
- [ ] "Back to Edit" visible when status is `draft`
- [ ] All component tests pass (`vi.mock` layer)
- [ ] Integration tests pass (MSW layer)
- [ ] `make frontend-verify` passes

### DoD gate (Slice 0 complete)
- [ ] Full path works end-to-end: onboarding → customer → capture → review/edit →
      generate PDF → preview → share link → customer opens link → sees PDF

---

## Verification

```bash
make backend-verify
make frontend-verify
```

Fallback:
```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
