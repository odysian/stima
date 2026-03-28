# Plan: Milestone 3 — Email Delivery

**Date:** 2026-03-27
**Roadmap ref:** `docs/V1_ROADMAP.md` — Milestone 3
**Mode:** single (one task, one PR)
**Depends on:** M2 (public landing page must exist before we email links to it)

---

## Goal

Contractors send quote links to customers by email directly from Stima — no copy-pasting.

---

## Non-Goals

- Email templates for invoices (M5 reuses the delivery flow, but the invoice email template is M5 scope)
- Push notifications or SMS (V2)
- Email open/click tracking (adds complexity and privacy concerns)
- Retry queue for failed sends (V2 — see risks section)
- Batch sending or mailing lists
- Customer-facing reply-to-email actions

---

## Pre-Work (Infrastructure — before code begins)

The roadmap explicitly calls out DNS and SendGrid setup as pre-work:

- [ ] Sending domain confirmed (e.g., `noreply@stima.dev` or `mail.stima.dev`)
- [ ] SendGrid account created and API key generated
- [ ] SPF record added to domain DNS
- [ ] DKIM record added to domain DNS
- [ ] DMARC record added
- [ ] Domain verification confirmed in SendGrid dashboard
- [ ] Test email sent and received successfully

**This must be done before implementation begins.** DNS propagation takes 24-48h.

---

## Current State Audit

### Email infrastructure
None. No email SDK, no email templates, no email configuration in `config.py`. This is entirely new.

### Share flow
`service.py:280-300` — `share_quote()` creates a share_token, sets `shared_at`, transitions to `SHARED`, and logs `quote_shared`. Email delivery should trigger this same flow (or augment it).

### Customer email
`customers` table has `email: String(320), nullable`. Frontend customer forms allow email entry but it's optional. If the customer has no email, the "Send by Email" action cannot proceed.

### Quote preview actions
`QuotePreviewActions.tsx` — current `ready` state shows "Share Quote" + "Open PDF". The `shared` state shows "Open PDF" + "Copy Share Link". Email send needs to integrate into both states.

### Landing page URL
After M2, the share URL points to `/doc/:token` on the frontend domain. Email must link to this URL.

---

## Schema Changes

None. All needed columns exist.

**Potential addition (flag for human review):** Should we track email delivery metadata? Options:

1. **No schema change** — log `email_sent` event with `metadata_json: { quote_id, customer_email_hash }` (hash, not raw email). Delivery status is not tracked.
2. **New `email_deliveries` table** — track `document_id`, `recipient_email` (encrypted?), `sent_at`, `status`, `provider_message_id`. Enables delivery status tracking and prevents duplicate sends.

**Recommendation:** Option 1 for V1. An event log entry is sufficient for pilot analytics. A dedicated table is warranted only when we need delivery status tracking or retry logic, which is V2 scope. The rate-limit guard (see below) prevents duplicates without a table.

---

## Backend Changes

### 1. Email integration: `backend/app/integrations/email.py`

New integration module following the same pattern as `storage.py` and `pdf.py`.

```python
class EmailService:
    def __init__(self, api_key: str, from_email: str, from_name: str):
        ...

    async def send(
        self,
        to_email: str,
        to_name: str | None,
        subject: str,
        html_body: str,
    ) -> None:
        """Send a transactional email via SendGrid. Raises EmailSendError on failure."""
```

**SDK:** `sendgrid` Python SDK or raw HTTP via `httpx` to the SendGrid v3 API.

**Decision for human review:** Use the official `sendgrid` SDK or raw `httpx`? The SDK adds a dependency but handles auth, serialization, and error parsing. Raw `httpx` is lighter but requires manual implementation. **Recommendation:** Official SDK — it's well-maintained and the integration is thin enough that the dependency cost is low.

### 2. Email template: `backend/app/templates/quote_email.html`

Jinja2 HTML email template. Email HTML must be table-based for client compatibility (Outlook, Gmail, Apple Mail).

**Content:**
- Subject: `"Quote for {title}"` if title exists, else `"Quote {doc_number} from {business_name}"`
- Body:
  - Contractor name and business name
  - Quote number and total amount
  - Optional title
  - Clear CTA button linking to the landing page (`/doc/:token`)
  - "Download PDF" secondary link (pointing to `/share/:token`)
  - Simple footer: "Sent via Stima"

**Design considerations:**
- Use inline CSS (email clients strip `<style>` blocks)
- Keep colors simple — primary green (`#004532`) for the CTA button, dark text
- Mobile-responsive (single column, max-width 600px)
- No images beyond the logo (images require hosting and often get blocked)

**Decision for human review:** Should the email include the contractor's logo? Pro: brand consistency with the landing page. Con: requires hosting the logo at a publicly accessible URL (currently logos are behind auth). The public logo proxy from M2 (`/api/public/doc/{share_token}/logo`) could work, but email clients may not render images from unfamiliar domains. **Recommendation:** Include the logo using the public proxy URL. Email clients that block images degrade gracefully — the business name is always present as text.

### 3. Config additions (`config.py`)

```python
SENDGRID_API_KEY: str | None = None
EMAIL_FROM_ADDRESS: str = "noreply@stima.dev"
EMAIL_FROM_NAME: str = "Stima"
```

### 4. Service: `send_quote_email()` method

New method in `service.py` (or a new `email_delivery_service.py` if service.py is at its LOC budget):

```python
async def send_quote_email(
    user: User,
    quote_id: UUID,
) -> Document:
```

**Logic:**

1. Load quote by `(quote_id, user_id)` — 404 if not found
2. If status is `DRAFT` → 409 "Quote is still a draft"
3. Load customer by `quote.customer_id` — need email address
4. If customer email is `None` or empty → 422 "Customer has no email address"
5. If status is `READY` → call `share_quote()` first to generate token and transition to `SHARED`
6. Build email context (business name, contractor name, doc_number, title, total, landing page URL, PDF URL)
7. Render email template
8. Call `email_service.send()`
9. Log `email_sent` event with metadata `{ quote_id, customer_id }`
10. If status was already `SHARED`/`VIEWED` → do not regress status (M1's `share_quote` guard handles this)
11. Return updated document

**Rate limiting guard:** Add a `last_emailed_at` check. Options:

- (a) Query `event_logs` for the most recent `email_sent` event for this quote. If < 5 minutes ago, reject with 429.
- (b) Add a `last_emailed_at` column to `documents`.

**Recommendation:** Option (a) for V1. Avoids a schema change. The query is simple and pilot scale is tiny. The 5-minute window prevents accidental double-taps without being so long that it blocks intentional resends.

### 5. API route: `POST /api/quotes/{id}/send-email`

Authenticated, CSRF-protected. No request body (sends to the customer's email on file).

**Responses:**
- `200` with updated quote on success
- `404` if quote not found or not owned
- `409` if quote is still a draft
- `422` if customer has no email
- `429` if email was sent too recently (< 5 min)
- `502` if SendGrid fails (surface as a user-friendly error, not a raw 500)

### 6. Event logger

`email_sent` should already be in `_PILOT_EVENT_NAMES` after M6 pre-registers it. If M3 ships before M6, add it here.

---

## Frontend Changes

### 1. Quote service addition

```typescript
export async function sendQuoteEmail(id: string): Promise<QuoteDetail> {
  return request(`/api/quotes/${id}/send-email`, { method: "POST" });
}
```

### 2. QuotePreviewActions updates

The "Send by Email" button integrates into the existing action panel:

| State | Current Actions | New Actions |
|---|---|---|
| `draft` | Generate PDF | Generate PDF (unchanged) |
| `ready` | Share Quote + Open PDF | Share Quote + **Send by Email** + Open PDF |
| `shared` | Open PDF + Copy Share Link | Open PDF + Copy Share Link + **Resend Email** |
| `viewed` | Open PDF + Copy Share Link + Mark as Won/Lost | Open PDF + Copy Share Link + **Resend Email** + Mark as Won/Lost |
| `approved` | Open PDF only | Open PDF only (unchanged) |
| `declined` | Open PDF only | Open PDF only (unchanged) |

**"Send by Email" button (on `ready`):**
- Uses `forest-gradient` styling if it's the primary action, OR secondary styling if "Share Quote" remains primary
- **Decision for human review:** Should "Send by Email" replace "Share Quote" as the primary CTA, or sit alongside it? The roadmap wants email to be the primary delivery method. **Recommendation:** Make "Send by Email" the primary action (forest-gradient). "Share Quote" (which just generates the link for manual copy) becomes a secondary/ghost action.

**"Resend Email" button (on `shared`/`viewed`):**
- Secondary styling (not primary — the quote is already shared)
- Shows "Email sent" success feedback briefly after send

**Missing email guard:**
- If the customer has no email, the "Send by Email" button should either be disabled with a tooltip ("Add customer email first") or show the email as a ghost action that, when clicked, prompts the user to add an email
- **Decision for human review:** Disable with tooltip vs. click-to-prompt? **Recommendation:** Disable with a small help text below the button: "Add a customer email to send by email". This avoids a dead-end click.

### 3. Error handling

- `422` (no customer email): Show inline message "Customer has no email address. Add one in customer details."
- `429` (too recent): Show "Email was already sent recently. Try again in a few minutes."
- `502` (SendGrid failure): Show "Email could not be sent. Try again or share the link manually."

### 4. Share flow update

Currently, pressing "Share Quote" calls `shareQuote()` which creates the token and transitions to `shared`. "Send by Email" should do both — share + email — in one backend call (the `send_quote_email` service method handles the share step internally if needed).

The frontend should not call `shareQuote()` then `sendQuoteEmail()` sequentially. The backend handles the full flow atomically.

---

## Key Risks and Edge Cases

| Risk | Mitigation |
|---|---|
| SendGrid API key not set in production | Guard in `send_quote_email`: if `SENDGRID_API_KEY` is None, raise 503 "Email delivery not configured" |
| Email delivery fails silently | `email_service.send()` raises `EmailSendError`. API returns 502. Frontend shows actionable error |
| Duplicate sends on double-tap | Event-log-based rate limit (5 min window). Frontend disables button during send |
| Customer email is invalid format | SendGrid will reject. Surface as 502 with friendly message. Client-side validation on customer email field is a bonus |
| Email lands in spam | SPF/DKIM/DMARC pre-work mitigates this. Warm-up sending reputation during pilot |
| `service.py` exceeds LOC budget after adding `send_quote_email` | `service.py` is at ~346 LOC. Adding send logic may push it past 350. Consider extracting email delivery to `email_delivery_service.py` |
| Re-share via email doesn't regress `viewed` status | M1's `share_quote` guard already prevents regression. `send_quote_email` calls `share_quote` which is a no-op for `viewed`+ |

---

## Implementation Order

1. Backend: add `SENDGRID_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` to `config.py`
2. Backend: create `backend/app/integrations/email.py` (EmailService + EmailSendError)
3. Backend: create `backend/app/templates/quote_email.html` (Jinja2 email template)
4. Backend: add `send_quote_email()` to service (or new `email_delivery_service.py`)
5. Backend: add `POST /api/quotes/{id}/send-email` route
6. Backend: ensure `email_sent` is in `_PILOT_EVENT_NAMES` (may already be there from M6)
7. Backend tests: send email (happy path, no customer email, draft guard, rate limit, SendGrid failure)
8. Frontend: add `sendQuoteEmail()` to `quoteService.ts`
9. Frontend: update `QuotePreviewActions` — add "Send by Email" / "Resend Email" buttons
10. Frontend: add missing-email guard (disabled state + help text)
11. Frontend: add error handling for 422/429/502 responses
12. Frontend tests: button rendering per state, missing email disabled state, error messages
13. Update `docs/ARCHITECTURE.md`: add `/quotes/{id}/send-email` endpoint

---

## Acceptance Criteria

- [ ] Contractor can send a quote email from the preview screen
- [ ] Email includes: business name, contractor name, quote number, title (if present), total, landing page link
- [ ] Email renders correctly on mobile email clients (single-column, inline CSS)
- [ ] Email CTA links to `/doc/:token` (the landing page, not the raw PDF)
- [ ] If customer has no email, button is disabled with help text
- [ ] If quote is `draft`, send returns 409
- [ ] If email was sent < 5 minutes ago, send returns 429 with user-friendly message
- [ ] If SendGrid fails, send returns 502 with user-friendly message
- [ ] Sending email on a `ready` quote transitions it to `shared` automatically
- [ ] Re-sending email on a `viewed` quote does not regress the status
- [ ] `email_sent` event is logged on successful send
- [ ] "Send by Email" / "Resend Email" button renders in correct states
- [ ] `docs/ARCHITECTURE.md` updated with new endpoint

---

## Verification

```bash
make backend-verify
make frontend-verify
```

Manual:
1. Create a customer with an email → create and generate PDF for a quote → press "Send by Email" → check customer inbox
2. Check `event_logs` for `email_sent` row
3. Try sending email again immediately → confirm rate limit message
4. Create a customer without email → confirm "Send by Email" is disabled
5. Try sending email on a draft quote → confirm 409 error
6. Open email on mobile → confirm responsive layout
7. Click CTA link in email → confirm it opens the landing page
