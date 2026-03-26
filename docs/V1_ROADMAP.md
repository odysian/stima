# Stima V1 Roadmap

**Version:** 1.0 — March 2026
**Status:** Active
**Assumes:** V0 is complete, deployed, and pilot-ready
**Reference:** `docs/PRODUCT.md` for strategic context

---

## Purpose

V1 closes the quoting loop. V0 proved that the extraction pipeline works and a contractor
can produce a professional quote fast. V1 makes that quote mean something — the customer
sees it on a branded page, responds to it, and the contractor knows the outcome and can
act on it.

By the end of V1, a contractor can run their full quoting-to-invoice workflow inside
Stima without leaving the app or copy-pasting links.

---

## V1 Goal

> A contractor sends a quote from Stima. The customer receives it by email, views a
> branded landing page, and approves or declines. The contractor sees the response,
> follows up if needed, and converts the approved quote to an invoice in one action.

---

## Scope Boundary

**V1 is:**
- The quote delivery and response loop
- Email delivery from Stima to the customer
- A customer-facing branded quote page
- Quote status that reflects real outcomes
- Lightweight invoice generation from an approved quote
- Logo and branding on PDFs
- Operational visibility (error monitoring, basic analytics)

**V1 is not:**
- Payment collection or processing
- Full invoice management or accounts receivable
- Line item templates or service catalogs (V2)
- Photo documentation or customer notes (V2)
- Subscription billing (V3)

---

## Quote Status Contract Change

This is the first migration V1 requires. The current status lifecycle is:

```
draft → ready → shared
```

V1 expands this to:

```
draft → ready → shared → viewed → approved | declined | expired
```

All existing quotes with `shared` status are unaffected. New statuses only apply
to quotes sent through the V1 delivery flow. `expired` is set automatically when a
shared quote receives no response within a configurable window (default: 30 days).

This schema change is a prerequisite for Milestones 1, 2, and 3 below.

---

## Milestones

### Milestone 0: Branding Foundation

**Goal:** Every PDF a contractor sends looks like it came from their business.

**Scope:**
- Logo upload on the Settings screen (image upload, stored in cloud storage)
- Logo rendered in the PDF header alongside business name
- If no logo is uploaded, the PDF header uses business name only (existing behavior)

**Acceptance criteria:**
- User can upload a logo image from Settings
- Uploaded logo appears on all newly generated PDFs
- Previously generated PDFs are unaffected
- Logo upload is optional — no gate on quote flow if skipped
- Supported formats: JPEG, PNG. Max size: 2MB.

**Why first:** Every quote the contractor sends from this point forward carries their
brand. This is low-risk and high-visibility. It also unblocks the customer-facing
landing page (Milestone 2) which needs the same logo asset.

---

### Milestone 1: Quote Status Expansion

**Goal:** The quote status lifecycle reflects real-world outcomes, not just document state.

**Scope:**
- Database migration: add `viewed`, `approved`, `declined`, `expired` to the status
  check constraint
- Backend: status transition logic and validation
- Backend: `POST /api/quotes/:id/respond` endpoint for customer response actions
  (used by the public landing page in Milestone 2)
- Backend: expiry job or on-read expiry check for quotes older than 30 days with
  no response
- Frontend: updated status badges for new states
- Frontend: quote detail and list surfaces reflect new statuses

**Acceptance criteria:**
- All five new statuses are valid and enforced at the DB level
- A quote can only move forward through the lifecycle, not backward
- `expired` is applied to quotes in `shared` status with no response after 30 days
- New status badges render correctly in quote list and detail views
- Existing `draft`, `ready`, `shared` behavior is unchanged

---

### Milestone 2: Public Quote Landing Page

**Goal:** Replace the direct PDF stream with a branded customer-facing page where the
customer can view the quote and take action.

**Scope:**
- New public route: `/q/:token` (unauthenticated, token-gated)
- Page renders: contractor logo, business name, quote number, date, line items, total,
  optional notes
- Page is mobile-first and readable without an account
- Viewing the page transitions the quote from `shared` → `viewed`
- Customer action buttons: **Approve**, **Decline**, **Request Changes**
- Request Changes shows a short text field for the customer to leave a note
- Submitting any action calls `POST /api/quotes/:id/respond` and shows a confirmation
- Existing PDF share link (`/api/quotes/:id/pdf/:token`) remains available as a fallback

**Acceptance criteria:**
- Public page loads without authentication using the existing share token
- Page is readable on mobile (primary) and desktop
- Viewing the page records a `quote_viewed` event and transitions status to `viewed`
- Approve/Decline/Request Changes each transition status correctly and record an event
- Customer response note is stored and visible to the contractor in quote detail
- Confirmation state is shown to the customer after any action
- If the quote is already approved, declined, or expired, the page shows an appropriate
  closed state rather than the action buttons

---

### Milestone 3: Email Delivery

**Goal:** The contractor can send the quote link to the customer by email directly from
Stima — no copy-pasting.

**Scope:**
- "Send by Email" action on the quote preview/share screen
- Sends a transactional email to the customer's email address with:
  - contractor name and business name in the from/subject line
  - quote number and total in the email body
  - a clear link to the public landing page
  - the PDF attached or linked as a secondary option
- Email is only available if the customer record has an email address
- If no customer email exists, prompt to add one or fall back to copy-link
- Sent email transitions quote status to `shared` (if not already)
- Delivery provider: SendGrid (or equivalent transactional email service)

**Acceptance criteria:**
- Contractor can send email to customer from the quote preview screen
- Email renders correctly on mobile email clients
- Email includes quote number, total, contractor name, and the landing page link
- Missing customer email is handled gracefully with a prompt, not a broken state
- A `quote_shared` event is recorded on send
- Rate limiting or send guards prevent accidental duplicate sends

**Open dependency:** Requires a transactional email provider to be configured in the
backend environment. This is a new infrastructure dependency.

---

### Milestone 4: Reminder Workflow

**Goal:** Contractors do not lose jobs because they forgot to follow up on an unanswered
quote.

**Scope:**
- Quotes in `shared` or `viewed` status for more than 3 days surface a reminder prompt
  in the quote detail view
- "Resend" action: re-sends the quote email with a short "just following up" wrapper
- "Mark as Lost" action: manually closes the quote without a customer response (sets
  status to `declined`)
- Reminder prompt is informational, not a push notification (V2 can add push)

**Acceptance criteria:**
- Quotes idle in `shared` or `viewed` for 3+ days show a reminder banner on detail view
- Resend sends the same email flow as Milestone 3 with a follow-up subject line
- Resend is rate-limited (maximum once per 24 hours per quote)
- Mark as Lost transitions status to `declined` with an internal `closed_by_contractor`
  note, not a customer-visible action
- Reminder banner disappears once the quote receives a response or is manually closed

---

### Milestone 5: Quote to Invoice Conversion

**Goal:** A contractor who wins a job can convert the approved quote to an invoice in one
action, without re-entering any line items.

**Scope:**
- "Convert to Invoice" action on approved quotes
- Creates a new document record with `doc_type: "invoice"` seeded from the quote's
  line items, total, and customer
- Invoice document gets its own sequential number in `I-001` format
- Invoice adds one new field: **Due Date** (required, date picker, defaults to 30 days
  out)
- Invoice PDF uses the same template as the quote PDF with "Invoice" in the header and
  the due date in the document metadata block
- Invoice can be sent by email using the same delivery flow as Milestone 3
- Invoice status lifecycle: `draft → ready → sent` (no approve/decline — invoices are
  not two-way)
- Invoices appear in the quote list alongside quotes, differentiated by doc type badge

**Acceptance criteria:**
- "Convert to Invoice" is available on quotes with `approved` status
- Invoice is pre-populated with all line items and total from the source quote
- Invoice number is sequential per user in `I-001` format
- Due date is required before the invoice can be sent
- Invoice PDF renders correctly with "Invoice" header and due date
- Invoice can be emailed directly to the customer
- The source quote and the invoice are linked (quote detail shows the resulting invoice)
- Converting a quote to an invoice does not change the quote's status or data

---

### Milestone 6: Operational Visibility

**Goal:** Have enough instrumentation and error monitoring in place before real users
depend on the app.

**Scope:**
- Error monitoring integration (Sentry or equivalent) on both backend and frontend
- Basic admin analytics route: `GET /api/admin/events` returning aggregated counts
  of pilot event names over a time window (authenticated, admin-only)
- Extend event logging with new V1 events:
  - `quote_viewed`
  - `quote_approved`
  - `quote_declined`
  - `quote_expired`
  - `invoice_created`
  - `email_sent`
- Structured error logging on the extraction pipeline (already partially in place)

**Acceptance criteria:**
- Unhandled exceptions in backend and frontend are captured in error monitoring
- Admin route returns event counts by name and day for a given date range
- All new V1 user actions are logged as events
- No PII (customer names, emails) stored in event metadata

---

## Pre-V1 Polish

Small, focused improvements to existing screens that should land before the V1 milestones
begin. These are not new features — they fix UX problems that will compound as V1 adds
more on top of them. New items can be added here as they surface during pilot use.

### Customer detail: condensed read view

The current customer detail screen shows an always-open form that consumes most of the
screen. Replace with a condensed read view: customer name prominent, address/phone/email
as a small metadata block below it, and a single edit button that opens the form. This
frees up the screen for the jobs list and the three-tab layout planned for V2.

**Acceptance criteria:**
- Customer info displays as read-only text by default
- Edit button opens an inline or separate edit form
- No loss of existing edit functionality
- Screen feels less form-heavy on first open

### Quote title field

An optional short title on quotes and invoices (e.g., "Spring Cleanup", "Back patio
rebuild") so contractors can scan a list of jobs by name rather than by number alone.

**Schema:** Add a nullable `title` column to `documents`. No migration to existing quotes
required — blank is fine.

**Display:**
- Quote list: show title as the primary label when present, doc number as secondary
  metadata alongside date and item count
- Quote detail: show title below the doc number
- Customer detail jobs tab (V2): title makes the job history readable at a glance

**Feeds into V1 milestones:**
- Customer-facing landing page (Milestone 2) uses title as the page heading when present
- Email subject line (Milestone 3) uses title: "Quote for Spring Cleanup" instead of
  "Quote Q-012"
- Invoice conversion (Milestone 5) inherits the title from the source quote

**Acceptance criteria:**
- Title field is optional on the quote review/edit screen
- Quotes without a title display and function exactly as before
- Title appears in the quote list, quote detail, and is passed through to PDF and email

---

## Suggested Build Order

1. Pre-V1 Polish — Customer detail layout + quote title field (cleans up the base before
   building on top of it)
2. Milestone 0 — Branding (low risk, high visibility, unblocks landing page)
3. Milestone 1 — Status expansion (schema foundation everything else depends on)
4. Milestone 2 — Public landing page (the core V1 experience)
5. Milestone 3 — Email delivery (makes the landing page reachable without copy-paste)
6. Milestone 6 — Operational visibility (run in parallel with 4–6, ship before real users)
7. Milestone 4 — Reminder workflow (builds on delivery + status)
8. Milestone 5 — Invoice conversion (completes the quoting-to-invoice loop)

---

## New Infrastructure Dependencies

| Dependency | Milestone | Notes |
|---|---|---|
| Cloud file storage (S3/GCS) | 0 | Logo upload requires persistent file storage |
| Transactional email provider (SendGrid) | 3 | New service, requires API key + domain setup |
| Error monitoring (Sentry) | 6 | New service, requires project setup on both frontend and backend |

These three infrastructure items should be provisioned before or during their respective
milestone, not after. They are not complex to set up but they are external dependencies
that can block progress if left too late.

---

## Contracts Locked After V1

Once V1 is complete, the following should be treated as stable:

- Quote status lifecycle: `draft → ready → shared → viewed → approved | declined | expired`
- Invoice status lifecycle: `draft → ready → sent`
- Public quote route: `/q/:token`
- Customer response endpoint: `POST /api/quotes/:id/respond`
- Invoice doc type and `I-001` numbering format
- Canonical event log names for all V1 user actions

---

## V1 Success Criteria

V1 is considered successful if, after a pilot period:

- At least 50% of shared quotes are sent via email (not just copy-link)
- At least 30% of quotes sent via email receive a customer response (approve/decline/
  request changes)
- At least one invoice is generated from an approved quote per active pilot user
- Error monitoring captures actionable errors before users report them
- No quote or invoice data is lost or corrupted through status transitions
