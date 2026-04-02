# Public Share Surface

Use this analog when a task touches share-token behavior, public document access, customer-facing document routes, or email/share CTAs that depend on those routes.

Related: send/resend orchestration, share-before-send ordering, and duplicate-send guards are covered in [transactional-email-flow.md](./transactional-email-flow.md). This analog focuses on **which routes and URLs** customers see.

## When To Use

- Adding or changing a public document surface
- Changing `/doc/{share_token}` or `/share/{share_token}` behavior
- Updating email CTA targets for shared documents
- Changing how share tokens are created, reused, or exposed
- Adding a new document type that needs customer-facing share behavior
- Refactoring share/copy/open-PDF behavior across frontend and backend

## Canonical Examples

- `frontend/src/features/public/components/PublicQuotePage.tsx`
- `frontend/src/features/public/services/publicService.ts`
- `frontend/src/App.tsx`
- `frontend/src/features/quotes/components/QuotePreview.tsx`
- `frontend/src/features/quotes/components/quotePreview.helpers.ts`
- `frontend/src/features/invoices/components/InvoiceDetailScreen.tsx`
- `backend/app/features/quotes/api.py` — public GET `/share/{share_token}` and `/api/public/doc/{share_token}` (PDF endpoint serves quote and sent-invoice tokens)
- `backend/app/features/invoices/api.py` — authenticated `POST /invoices/{id}/share` and send-email only; no public doc router here
- `backend/app/features/quotes/email_delivery_service.py`
- `backend/app/features/invoices/email_delivery_service.py`
- `docs/ARCHITECTURE.md`

## Invariants

- Share-token behavior must be explicit and documented per document type.
- Do not rotate an existing share token on resend or repeat share unless the contract explicitly changes.
- Public route choice is part of the external contract, not just an implementation detail.
- Email CTA targets, copy-link behavior, and open-PDF behavior must align with the actual public surface.
- The same path (e.g. `/share/...`) can be built with different bases (`window.location.origin`, `VITE_API_URL` when set, or backend-configured frontend URL in emails); split API/app deploys must keep every published link reachable for customers.
- Public-surface assumptions must stay aligned across backend behavior, frontend behavior, tests, and `docs/ARCHITECTURE.md`.
- A document type should not be routed to `/doc/{share_token}` unless the public landing page actually supports that document type.
- Raw PDF routes and landing-page routes are not interchangeable; they produce different customer experiences and different implementation constraints.

## Current Repo Shape

### Quotes

- Public landing page route: `/doc/:token`
- Public JSON fetch: `/api/public/doc/{share_token}`
- PDF route: `/share/{share_token}`
- Quote share/copy uses `window.location.origin` + `/doc/{share_token}`; in-app open-PDF uses API base + `/share/{share_token}`; quote email CTAs use configured frontend base + `/doc/...` and + `/share/...` — see invariant on URL bases above

### Invoices

- Invoice detail copy/open uses API base + `/share/{share_token}`; invoice email CTAs use configured frontend base + `/share/{share_token}` (both paths are `/share/...`, hosts may differ from copy-link in split setups)
- Invoice email delivery uses the raw PDF route rather than a public landing page
- Do not assume invoices can safely use `/doc/{share_token}` unless the public landing page is explicitly extended to support sent invoices

## Allowed Deltas

- A document type may use a different public route than another document type if the docs, tests, and UI stay aligned
- A task may introduce a new landing page only if backend contract, frontend route handling, CTA targets, and architecture docs are all updated together
- Share/copy/open-PDF wording may differ by surface as long as the actual route semantics stay intentional and documented
- A raw PDF-only surface can later evolve into a landing-page surface, but that should be a deliberate contract change, not an assumption carried in from another feature

## What Not To Assume

- Do not assume all shared documents should use `/doc/{share_token}`
- Do not assume all shared documents should use `/share/{share_token}` as the primary CTA
- Do not assume email CTA, copy-link target, and open-PDF target are always the same route
- Do not assume public landing page support exists just because a share token exists
- Do not assume quote behavior is automatically the right analog for invoices or future document types
- Do not assume a public route change is frontend-only; it is a cross-layer contract change

## Minimal Checklist

- Identify which public route(s) the document type actually supports today
- Confirm whether the customer-facing CTA should be a landing page or a raw PDF
- Confirm share-token creation and reuse semantics
- Verify frontend copy-link and open-PDF behavior against the real public surface
- Verify email CTA targets match the intended public route and that origin/base matches copy-link and deployment (API vs app host)
- Update `docs/ARCHITECTURE.md` if externally visible share behavior changes
- Add or update tests covering route target behavior and surface assumptions

## Verification Guidance

- `make frontend-verify`
- `make backend-verify` when route semantics, share-token behavior, or email delivery contracts change
- For quote public-surface behavior, start with:
  - `frontend/src/features/public/components/PublicQuotePage.tsx`
  - `frontend/src/features/public/services/publicService.ts`
  - `frontend/src/features/quotes/components/QuotePreview.tsx`
- For invoice public/share behavior, start with:
  - `frontend/src/features/invoices/components/InvoiceDetailScreen.tsx`
  - `backend/app/features/invoices/email_delivery_service.py`
  - `backend/app/features/quotes/api.py` for anonymous GET `/share/{token}` (invoice PDFs use this handler too)
- Always cross-check `docs/ARCHITECTURE.md` when the customer-facing share surface changes
