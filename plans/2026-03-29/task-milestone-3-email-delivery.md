## Summary
Milestone 3 adds transactional email delivery from the contractor quote preview/share screen. It also makes Copy Link always visible as a secondary action (text/manual sharing remains first-class alongside email delivery).

Email points to the public landing page (`/doc/:token`) and includes a secondary "Download PDF" link to the existing PDF share route (`/share/:token`).

Plan reference: `docs/V1_ROADMAP.md` — Milestone 3
Dependency: Milestone 2 public landing page must exist before email sends links.

---
## Goal
- Let contractors send quotes by email directly from the quote preview screen.
- Keep Copy Link always immediately accessible as a secondary action in share-eligible states (including `ready`), not hidden in a menu and not gated behind a narrow state transition.
- Ensure the email send flow records the quote as shared (if needed) and logs the `email_sent` pilot event on successful send.

---
## Non-Goals
- Invoice email templates or invoice delivery (Milestone 5).
- Push notifications, SMS, or any customer messaging beyond email.
- Email open/click tracking.
- Retry queue or background provider delivery (V2).
- Batch sending or mailing lists.
- Customer-side approve/decline actions from the email.

---
## Constraints / Contracts
- Contractor endpoint is authenticated and CSRF-protected.
- Must use the existing share token mechanism used for public pages.
- Must construct links correctly:
  - Landing page CTA must link to `/doc/:token` (public landing page)
  - Secondary "Download PDF" must link to `/share/:token` (existing public PDF route)
- Provider failure must be surfaced as a user-friendly 502 error (not a raw 500).
- Error semantics must match the expected UI behavior:
  - `409` when the quote is still `draft`
  - `422` when the customer email is missing or fails basic validation
  - `429` when a duplicate send guard triggers
  - `502` when the email provider fails
  - `503` when email delivery is not configured in the runtime environment
  - `404` when the quote is not found or not owned by the contractor
- Pilot event logging:
  - `quote_shared` is recorded as part of the share transition triggered by sending
  - `email_sent` is recorded on successful email send

---
## Decision Locks
### 1) Rate-limit / duplicate-send guard (5-minute window)
Option A (V1-friendly, no schema change): query the existing pilot `event_logs` for the most recent `email_sent` for the quote and reject if it is within 5 minutes.
Option B (schema change): add a `last_emailed_at` field to `documents` (or create a new delivery table).

Default recommendation: Option A, to avoid schema changes.

Known gap / explicit resolution: event persistence is fire-and-forget in `log_event()` (async DB write). Two near-simultaneous taps from the same client can race the "last email" lookup before the previous write commits. We accept this for pilot scale (UI disables the button during in-flight sends), and we will revisit if duplicate emails show up in real usage; a schema-based `last_emailed_at` (Option B) is the contingency.

### 2) Email provider integration style
- Use Resend for transactional delivery and keep the integration thin.

Default recommendation: use a thin Resend adapter over HTTP so provider-specific behavior stays isolated.

### 3) Resend semantics
Decide whether resend:
- re-triggers the share transition logic in a non-regressive way, and
- results in exactly-once or potentially repeated `quote_shared` event logging.

Default recommendation: treat resend as share + send in a single backend call, but ensure share transition never regresses status (already handled by share logic pattern).
On resend, `share_quote()` is a no-op for already-shared statuses, so `quote_shared` is not re-logged; this is correct for pilot analytics.

---
## Scope
### Backend
- Add `POST /api/quotes/{id}/send-email`:
  - Authenticated contractor action (`require_csrf`)
  - No request body (sends to the customer's email on file)
  - Enforces draft guard (`409`)
  - Enforces customer email presence and basic validity (`422`)
  - Applies duplicate-send guard (`429` on < 5 minutes)
  - Calls the email provider and returns `502` on provider failure
  - Returns `404` when the quote does not exist or is not owned by the contractor
  - Returns `503` when email delivery is not configured in the runtime environment
  - Ensures the quote is shared (share transition) and logs events (`quote_shared` as part of share transition, `email_sent` on success)
- Create an email delivery module (target module, not `service.py`):
  - `backend/app/features/quotes/email_delivery_service.py`
  - This module owns the `send_quote_email()` orchestration to keep `backend/app/features/quotes/service.py` (already > 350 LOC) from growing further.
- Create an email provider integration module:
  - `backend/app/integrations/email.py` with an `EmailService` adapter and provider-specific errors (ex: `EmailSendError`)
- Create a table-based transactional email template:
  - `backend/app/templates/quote_email.html`
  - Inline CSS for email client compatibility
  - Include CTA link to `/doc/:token`
  - Include secondary link to `/share/:token`
  - Include contact line with contractor phone number and optional contractor email footer
- Add runtime configuration for provider:
  - Resend API key and From address/name
  - Frontend base URL used to build absolute links

### Frontend
- Extend `quoteService` with:
  - `sendQuoteEmail(id)` calling `POST /api/quotes/${id}/send-email`
- Update `QuotePreviewActions` and quote preview logic to match Milestone 3 action hierarchy:
  - Primary action is "Send by Email" when customer email exists
  - Copy Link is always visible as a secondary action when the quote is share-eligible (including `ready`)
  - "Open PDF" remains as the utility action
- Handle button disabled states and error messages:
  - Disable "Send by Email" when no `customer_email` and show help prompt
  - Map HTTP errors to user-friendly inline messages for:
    - `404` (quote not found / not owned)
    - `409` (quote is draft / not shared yet)
    - `422` (missing or invalid customer email)
    - `429` (already sent recently)
    - `502` (email provider failure)
    - `503` (email delivery not configured)
- Update/extend frontend tests:
  - Rendering per state and disabled states
  - Error message mapping for 404/409/422/429/502/503

### Docs
- Update `docs/ARCHITECTURE.md` to document the new `POST /api/quotes/{id}/send-email` endpoint, response codes, and error format.

---
## Acceptance Criteria
- [ ] Contractor can send a quote email from the quote preview screen.
- [ ] Copy Link is always visible as a secondary action when the quote is share-eligible (including `ready`), and is not hidden in overflow.
- [ ] Email CTA links to the public landing page route: `/doc/:token`.
- [ ] Email includes secondary "Download PDF" link to `/share/:token`.
- [ ] Email includes:
  - business name and contractor name
  - quote number and total
  - optional quote title (if present)
  - contact line "Questions? Call or text [contractor phone number]."
  - contractor email footer if present
- [ ] If customer has no email, "Send by Email" is disabled with a help prompt; Copy Link remains functional.
- [ ] If customer email is invalid, send returns 422 with a user-friendly message (no provider call).
- [ ] If quote is `draft`, send returns 409.
- [ ] If email was sent < 5 minutes ago, send returns 429.
- [ ] If the email provider fails, send returns 502 with a user-friendly message.
- [ ] If quote is missing or not owned, send returns 404 with a user-friendly message.
- [ ] If email delivery is not configured (missing provider config), send returns 503 with a user-friendly message.
- [ ] UI shows user-friendly messages for 404/409/422/429/502/503 responses.
- [ ] Successful send triggers a transition to `shared` (if not already) and logs:
  - `quote_shared` (via share transition)
  - `email_sent` (explicit email success log)
- [ ] UI renders correct buttons per quote state:
  - `ready`: Send by Email (when email exists), Copy Link, Open PDF
  - `shared`/`viewed`: Resend Email, Copy Link, Open PDF
  - `approved`/`declined`: Copy Link, Open PDF
- [ ] `docs/ARCHITECTURE.md` is updated with the new endpoint.
- [ ] Copy Link on `ready` triggers the share transition before copying the URL (same behavior as the old "Share Quote" flow).

---
## Verification
Automated:
```bash
make backend-verify
make frontend-verify
```

Manual sanity checks:
1. Create a customer with email, create a quote, share-ready it, then press "Send by Email".
2. Confirm customer inbox includes CTA to the landing page and the "Download PDF" link.
3. Confirm quote status becomes `shared` (or stays shared if already shared).
4. Confirm `email_sent` appears in event logs after successful send.
5. Attempt resend immediately and confirm UI shows the duplicate-send / rate-limit message.
6. Create a ready quote with a customer email, tap Copy Link, and confirm:
   - a `share_token` is created
   - quote transitions to `shared`
   - copied URL is a valid `/doc/:token` link
7. Create a customer without email and confirm:
   - "Send by Email" is disabled with help prompt
   - Copy Link still works and produces a valid `/doc/:token` link.

## DoR Preconditions (blocking before PR)
Milestone 3 has explicit infrastructure pre-work; PR should not be opened unless all are confirmed:
1. `RESEND_API_KEY` is set (non-empty) in the backend runtime environment.
2. Sending domain has completed DNS verification in the provider dashboard:
   - SPF record added
   - DKIM record added
   - DMARC record added
   - domain verification completed
3. A manual test email was sent and received successfully before implementation begins.

---
## Residual Risk / Known Limitations (for reviewers)
1. Partial-success on `502`: share transition to `shared` happens before the provider call; if the provider fails, the quote is already shared but `email_sent` is not logged (no rollback; no retry queue in V1 scope).
2. Async event persistence race: duplicate-send guard relies on pilot `event_logs` persistence which is fire-and-forget; two near-simultaneous taps can potentially both pass the guard. Pilot-scale impact is accepted; schema-based `last_emailed_at` is the contingency.
3. `FRONTEND_BASE_URL` misconfiguration risk: incorrect base URL would cause email links to point to the wrong domain. Implementation should guard/validate in config.
4. Email HTML client coverage is manual-only in this milestone: `make backend-verify` can’t validate Outlook/Gmail/Apple Mail quirks; we accept this in exchange for pilot speed.
