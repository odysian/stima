# Transactional Email Flow

Use this analog when a user-triggered action validates a document, prepares a reusable public link, calls an email provider, and preserves resend/error contracts across backend and frontend.

## When To Use

- Adding a new document email-delivery path
- Changing send or resend rules for an existing document
- Updating provider error semantics, duplicate-send throttling, or share-token reuse
- Wiring a frontend action that confirms, sends, and reflects updated document state

## Canonical Examples

- `backend/app/features/quotes/email_delivery_service.py`
- `backend/app/features/quotes/api.py`
- `frontend/src/features/quotes/components/QuotePreview.tsx`
- `frontend/src/features/quotes/components/quotePreview.helpers.ts`
- `backend/app/features/invoices/email_delivery_service.py`
- `backend/app/features/invoices/service.py`
- `frontend/src/features/invoices/components/InvoiceDetailScreen.tsx`
- `docs/ARCHITECTURE.md`
- `backend/app/features/quotes/tests/test_quotes.py`
- `frontend/src/features/quotes/tests/QuotePreview.test.tsx`
- `frontend/src/features/invoices/tests/InvoiceDetailScreen.test.tsx`

## Invariants

- Validate ownership and load email context before any provider call.
- Reject draft documents before send.
- Validate customer email before send.
- Enforce duplicate-send throttling before the provider call.
- Share the document before the provider call so the returned document can include a reusable public token.
- Do not rotate an existing share token on resend.
- Provider failure does not roll back the newly shared state.
- Successful provider sends should record the `email_sent` event.
- If event persistence fails after a successful send, preserve throttle behavior with the fallback timestamp path instead of failing the user request.
- Frontend send actions require explicit confirmation before the API call.

## Current Repo Shape

Quotes:

- API entrypoint: `backend/app/features/quotes/api.py`
- Orchestration: `backend/app/features/quotes/email_delivery_service.py`
- Reused share contract: `backend/app/features/quotes/service.py`
- Frontend action surface: `frontend/src/features/quotes/components/QuotePreview.tsx`
- Frontend error mapping: `frontend/src/features/quotes/components/quotePreview.helpers.ts`
- Public CTA shape: landing page `/doc/{share_token}` plus PDF `/share/{share_token}`

Invoices:

- API entrypoint: `backend/app/features/invoices/api.py`
- Orchestration: `backend/app/features/invoices/email_delivery_service.py`
- Reused share contract: `backend/app/features/invoices/service.py`
- Frontend action surface: `frontend/src/features/invoices/components/InvoiceDetailScreen.tsx`
- Public CTA shape: PDF-only `/share/{share_token}`

## Allowed Deltas

- Email copy, subject, and template fields may vary by document type.
- CTA routes may differ when the public surface differs, as long as docs and tests stay aligned.
- Duplicate-send window or fallback behavior can change only if backend tests and `docs/ARCHITECTURE.md` are updated together.
- Frontend success and error copy can be tailored per surface, but backend status codes and externally visible semantics must stay intentional.

## What Not To Assume

- Do not assume all document types use the same public route. Quotes currently use `/doc/{share_token}` plus `/share/{share_token}`; invoices use `/share/{share_token}` only.
- Do not assume provider failure leaves the document unchanged. Share state may already be persisted.
- Do not assume resend should mint a new token.
- Do not assume a successful provider call guarantees event persistence.
- Do not assume frontend copy can drift from backend error semantics without a deliberate contract change.

## Minimal Checklist

- Add or update the backend API entrypoint and orchestration service.
- Confirm share-before-send ordering and resend token reuse.
- Verify duplicate-send, provider-failure, and missing-email paths.
- Wire the frontend action with confirmation, busy state, and user-facing success/error handling.
- Update `docs/ARCHITECTURE.md` if externally visible behavior changes.
- Add or update backend and frontend tests for happy path, resend, and failure paths.

## Verification Guidance

- `make backend-verify`
- `make frontend-verify`
- For targeted backend coverage, start with `backend/app/features/quotes/tests/test_quotes.py`
- For targeted quote UI coverage, start with `frontend/src/features/quotes/tests/QuotePreview.test.tsx`
- For targeted invoice UI coverage, start with `frontend/src/features/invoices/tests/InvoiceDetailScreen.test.tsx`
