# Stima V1 Roadmap

**Version:** 1.0 — March 2026
**Status:** Active (foundations shipped; forward path is M3 -> M4 -> M5 -> M8 -> M7)
**Assumes:** V0 is complete, deployed, and pilot-ready
**Reference:** `docs/PRODUCT.md` for strategic context

---

## Purpose

V1 closes the quoting loop. V0 proved that the extraction pipeline works and a contractor
can produce a professional quote fast. V1 makes that quote mean something — the customer
sees it on a branded page, responds to it, and the contractor knows the outcome and can
act on it.

By the end of V1, a contractor has a complete quoting-to-invoice workflow inside Stima:
professional email delivery or fast manual link sharing, status tracking, and lightweight
invoice conversion from a won quote.

---

## V1 Goal

> A contractor sends a quote from Stima — by email or by sharing a link directly. The
> customer views a branded landing page. The contractor records the outcome (Won or Lost)
> after the customer responds, follows up if needed, and converts a won quote (`approved`
> status) to an invoice in one action.

---

## Scope Boundary

**V1 is:**
- The quote delivery and response loop
- Email delivery from Stima to the customer
- A customer-facing branded quote page
- Quote status that reflects real outcomes
- Lightweight invoice generation from a won quote (`approved` status)
- Logo and branding on PDFs
- Optional pricing controls on quotes and invoices (discounts, deposits, and simple tax where
  needed — all display-only and optional)
- Operational visibility (error monitoring, basic analytics)

**V1 is not:**
- Payment collection or processing
- Full invoice management or accounts receivable
- Per-line-item tax rates or automatic tax jurisdiction lookup
- Line item templates or service catalogs (V2)
- Photo documentation or customer notes (V2)
- Subscription billing (V3)

---

## Public Endpoint Security Model

V1 introduces one unauthenticated endpoint: the public document landing page. It
requires explicit security design because it is externally reachable without a
contractor account.

### Token-as-credential model

The share token is the authorization mechanism for the public document page. Possession
of the link is proof of authorization — the same model used by DocuSign, HelloSign, and
every major quoting tool. Customers do not create accounts or enter PINs.

This model is secure when:
- V0 already persists a server-generated `share_token` on `documents`; today the token
  is created on first share, not pre-generated at `ready`
- The current V0 token format is `uuid4()` (~122 bits of entropy). If V1 upgrades to
  `secrets.token_hex(32)` (256 bits), existing tokens must be preserved or explicitly
  migrated.
- If V1 hardens the token format or generation timing, treat that as explicit migration
  work rather than an already-shipped V0 contract
- Transport is HTTPS only (tokens travel in URLs and must not be logged or leaked)
- Status transitions are one-way and enforced server-side

### GET /doc/:token (view landing page)

- No authentication required
- No write side effects beyond event logging. Quote pages may transition status
  (`shared → viewed`); invoice pages do not transition status on view.
- Returns 404 for unknown tokens — do not distinguish "wrong token" from "not found"
  (enumeration resistance)

### Event logging on public actions

Public landing page activity must be logged in event_logs:
- `quote_viewed` — on GET /doc/:token when doc_type = quote
- `invoice_viewed` — on GET /doc/:token when doc_type = invoice

Log the document_id. Do NOT log the share_token or customer IP in event_logs metadata.

---

## Quote Status Contract Change

This is the first migration V1 requires. The current status lifecycle is:

```
draft → ready → shared
```

V1 expands this to:

```
draft → ready → shared → viewed → approved | declined
```

All existing quotes with `shared` status are unaffected. New statuses only apply
to quotes sent through the V1 delivery flow. `approved` and `declined` are
contractor-set outcomes — recorded after the customer confirms or rejects the job
over the phone or in person.

`expired` status is deferred. Expiry is list hygiene only and does not unlock any
downstream milestone. It can be added once pilot data shows it is needed.

This schema change is a prerequisite for Milestones 1, 2, and 3 below.

---

## Admin Access Model

V1 does not introduce a contractor-facing admin role or a new `is_admin` user contract.

Any V1 admin/support routes are internal operator tooling only:

- not part of the normal contractor UI
- not authorized through standard contractor sessions alone
- protected by an explicit internal-only access mechanism such as environment-gated
  route enablement plus infra auth, IP allowlisting, or a server-side admin secret

If Stima later needs true in-product admin accounts, that should be scoped as a
separate authentication/authorization task rather than hidden inside Milestone 6.

---

## Milestones

### Milestone 0: Branding Foundation

**Status:** Shipped

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

**Storage design note:** The cloud storage integration introduced here must be built as
a general-purpose file storage utility, not a logo-specific one. V2 introduces photo
documentation — both logo and photo uploads need the same operations (upload, delete,
generate URL). The correct implementation is a `storage_service` that accepts a path
prefix and file bytes and returns a URL. M0 calls it with prefix `logos/{user_id}/`.
V2 calls it with `photos/{user_id}/{document_id}/`. One service, multiple consumers.

**Why first:** Every quote the contractor sends from this point forward carries their
brand. This is low-risk and high-visibility. It also unblocks the customer-facing
landing page (Milestone 2) which needs the same logo asset.

---

### Milestone 1: Quote Status Expansion

**Status:** Shipped

**Goal:** The quote status lifecycle reflects real-world outcomes, not just document state.

**Scope:**
- Database migration: add `viewed`, `approved`, `declined` to the status check constraint
- Backend: status transition logic and validation
- Backend: `POST /api/quotes/:id/mark-won` and `POST /api/quotes/:id/mark-lost`
  (authenticated contractor actions — no public endpoint)
- Database migration: add `source_document_id UUID NULL REFERENCES documents(id) ON
  DELETE SET NULL` to `documents` so quote→invoice linkage exists before later V1 work
- Frontend: updated status badges for new states
- Frontend: Mark as Won / Mark as Lost actions on the quote preview screen (visible
  only when status is `shared` or `viewed`)

**Acceptance criteria:**
- All three new statuses are valid and enforced at the DB level
- A quote can only move forward through the lifecycle, not backward
- Mark as Won transitions `shared`/`viewed` → `approved`; emits `quote_approved` event
- Mark as Lost transitions `shared`/`viewed` → `declined`; emits `quote_marked_lost`
  event (not `quote_declined` — that name is reserved for a future customer-facing action)
- Both actions return 409 if the quote is not yet shared or already has an outcome
- New status badges render correctly in quote list and detail views
- Existing `draft`, `ready`, `shared` behavior is unchanged

---

### Milestone 2: Public Quote Landing Page

**Status:** Shipped

**Goal:** Replace the direct PDF stream with a branded customer-facing page where the
customer can view the quote.

**Schema notes:**
- `share_token` column already exists on `documents` from V0 (migration
  `20260320_0005_add_share_token_to_documents`). In the shipped V0 implementation, the
  token is created on first share and then reused. If V1 changes token format or
  generation timing, that should be explicit migration work rather than an assumed
  existing contract.

**Route:** `/doc/:token` (unauthenticated, token-gated)

Milestone 2 is quote-first. It introduces the public document route for quote pages.
Milestone 5 extends the same route shape to invoices once invoice documents exist.

The landing page is **read-only**. Customers view the quote and download the PDF.
Approve/decline decisions are recorded by the contractor (via Mark as Won / Mark as Lost
from Milestone 1) after the customer communicates their decision over the phone or in
person. Customer-facing action buttons are not part of V1 scope.

Resolution logic for Milestone 2 quote pages:

1. Look up document by `share_token` column (exact match)
2. Not found → 404 page ("This link is not valid")
3. Found and terminal (`approved` or `declined`) → closed state appropriate to status
4. Otherwise → render the quote document page for `doc_type = "quote"`

**Status transition on page load:**
- If status = `shared` → transition to `viewed`
- Log a `quote_viewed` event on page load

**Scope:**
- Page renders: contractor logo, business name, quote number, title (if present), date,
  line items, total, optional notes
- Page is mobile-first and readable without an account
- No customer action buttons — page is read-only
- Existing public PDF route (`/share/:token`) remains available; landing page includes
  a "Download PDF" link that points to that route

**Acceptance criteria:**
- Public page loads without authentication using the existing share token
- Page is readable on mobile (primary) and desktop
- Viewing the page records a `quote_viewed` event and transitions status to `viewed`
- If the quote is already `approved` or `declined`, the page shows an appropriate
  closed state
- No action buttons are rendered — the page is read-only for the customer

**Forward-compatibility note:** Milestone 5 reuses `/doc/:token` for invoice documents.
Invoice pages also render read-only.

---

### Milestone 3: Email Delivery and Copy Link Visibility

**Goal:** The contractor can send the quote by email directly from Stima. Copy Link is
always immediately accessible as a secondary action — not hidden in a menu or restricted
to a narrow state transition. Both email and manual link-sharing are first-class delivery
paths in V1.

**Scope:**
- "Send by Email" primary action on the quote preview/share screen
- "Copy Link" always-visible secondary action — accessible whenever a share link exists,
  not gated on a specific status transition
- Sends a transactional email to the customer's email address with:
  - contractor name and business name in the from/subject line
  - quote number, optional title, and total in the email body
  - a clear link to the public landing page
  - the PDF attached or linked as a secondary option
  - conditional contact copy based on available contractor details:
    - "Questions? Call or text [contractor phone number]." when phone exists
    - "Questions? Reply to this email." when phone is missing and contractor email exists
    - neutral fallback copy when both phone and contractor email are missing
  - contractor email address if present (optional footer field)
- Email is only available if the customer record has an email address
- If no customer email exists, Copy Link / manual sharing remains fully functional;
  the "Send by Email" action is disabled with a help prompt to add customer email
- Sent email transitions quote status to `shared` (if not already)
- Re-sharing a quote already at `viewed` or later does not regress the status
- Delivery provider: Resend

**Action hierarchy on the quote preview screen:**
1. Primary: Send by Email (when customer email is available)
2. Always-visible secondary: Copy Link (whenever a share link exists)
3. Utility: Open PDF

Both delivery paths are first-class. Email provides a professional, branded, permanent
delivery record. Copy Link supports the text-forward workflow that remains the most
common sharing behavior for many contractors in the field.

**Acceptance criteria:**
- Contractor can send email to customer from the quote preview screen
- Copy Link is always visible as a secondary action when a share link exists
- Email renders correctly on mobile email clients
- Email includes: quote number, total, contractor name, business name, the landing page
  link, a contact line with contractor phone number, and contractor email if present
- Missing customer email is handled gracefully: Copy Link remains available, "Send by
  Email" is disabled with a help prompt
- A `quote_shared` event is recorded on send
- Rate limiting or send guards prevent accidental duplicate sends

**Pre-work required before Milestone 3 build begins:**
- [ ] Sending domain confirmed (e.g., `noreply@stima.dev` or `mail.stima.dev`)
- [ ] Resend account created and API key generated
- [ ] SPF record added to domain DNS
- [ ] DKIM record added to domain DNS
- [ ] DMARC record added (prevents spoofing of the sending domain)
- [ ] Domain verification confirmed in the Resend dashboard
- [ ] Test email sent and received successfully before writing any application code

Note: DNS propagation can take 24–48 hours. Start this before reaching Milestone 3 in
the build sequence, not on the day Milestone 3 begins.

---


### Milestone 4: Quote PDF Presentation Refinement

**Goal:** Make the quote PDF professional and trustworthy enough to send to a new customer
without apology. Tighten visual hierarchy, typography, and layout so the document reflects the
quality the contractor intended.

**Why this milestone exists:** The landing page (M2) and email delivery (M3) put the PDF
directly in front of customers. If the document looks like a generic printout, it undercuts
the contractor's professionalism regardless of how fast they produced it. PDF quality is also
a one-way street — once a contractor has sent real quotes to real customers, the baseline is
set. Reminder automation (the original M4) is a V2 candidate; this improvement is not.

**Scope:**
- Typography: upgrade font stack (embed Inter or prefer Noto Sans / Ubuntu over bare Arial)
- Header: increase logo size; add contractor phone (and email if present) to the identity block
- Title: render as a standalone document headline above the meta grid, not a labeled meta field
- Line items: collapse to 2-column layout (Description+Details | Price); items without details
  use the full cell width; null prices render as `—`
- Total section: visually separated from the line-items table, stronger typographic weight
- Notes: accent-bar left border treatment (no bordered box)
- Page setup: explicit `@page` margin and A4 size
- Empty field safety: guard owner name when both first and last name are null
- `QuoteRenderContext` extension: add contractor phone and email from the users table

**Out of scope:** invoice template (M5's responsibility), M7 fields (tax/discount/deposit),
per-user color themes, custom font uploads, Letter vs. A4 preference, email template styling.

**Implementation note:** All changes are in `backend/app/templates/quote.html` and the
`QuoteRenderContext` dataclass / repository query. No frontend changes required. No new API
contracts. No schema migration.

**Acceptance criteria:**
- PDF renders correctly for quotes with and without a logo
- Sparse-quote case renders cleanly: no title, no logo, no customer contact, one item with no
  details, null total, null owner name — no blank gaps or phantom labels
- Line items with details show a two-line stack in one cell; items without details show
  description only
- Title (when present) appears as a headline above the meta grid; absent title leaves no gap
- Contractor phone appears in the header identity block when present on the user profile
- Total section is visually separated from line items
- Notes section renders with accent-bar treatment
- All existing PDF template tests pass; sparse-quote test case added
- `make backend-verify` passes

---

### Milestone 5: Won Quote -> Linked Invoice

**Goal:** Let a contractor convert a won quote (`approved` status) into a linked invoice
with minimal extra input, using the same delivery and public-document patterns already
introduced for quotes.

**Rationale:** Stima stays quote-first. Invoices are critical downstream artifacts, but V1
should not create a second mini-app for invoice management. The quote remains the parent
job record; the invoice is a child document derived from that quote.

**Scope:**
- Add a clear "Convert to Invoice" action on quote detail for won quotes (`approved`)
- Create an invoice (`doc_type = "invoice"`) seeded from source quote data:
  customer, title/context, line items, totals
- Generate invoice number (`I-001` format) and set `source_document_id` to preserve
  quote -> invoice linkage
- Capture **Due Date** as the primary invoice-specific field: prefilled sensibly
  (for example +30 days), editable, and lightweight
- Keep quote detail as the primary invoice entry/access point:
  - no linked invoice yet -> show compact invoice section/card with CTA
    "Convert to Invoice"
  - linked invoice exists -> show compact linked invoice summary card (invoice number,
    status, due date, total, created date)
  - do not render full invoice body inline under quote detail
- Provide a dedicated invoice detail page that reuses quote-detail structure and mental
  model where practical, while showing invoice-specific metadata (invoice number, due date)
- Make relationship visible in both directions:
  - quote detail shows invoice created from this quote
  - invoice detail shows source quote and links back
- Reuse existing delivery/public infrastructure:
  - invoice send/share follows Milestone 3 delivery patterns
  - public invoice page reuses the Milestone 2 `/doc/:token` document-view model
  - customer page remains read-only
- Invoice lifecycle remains lightweight: `draft -> ready -> sent`
- Keep main list quote-first/quote-only by default; invoices are surfaced from quote detail,
  not as peer records that pollute the primary list

**Out of scope:**
- Invoice dashboards or standalone invoice management layer
- Overdue/collections workflows or reminder cadences for AR
- Payment tracking, payment processing, or bookkeeping/accounting features
- Expanded invoice status systems beyond what V1 needs
- Full AR/back-office workflows
- Showing invoices as duplicate peer entries in the main quote list

**Schema note:** `source_document_id` is introduced in Milestone 1. Milestone 5 populates
it at conversion time and treats the link as immutable application history.

**Depends on:** Milestone 1 (`approved` status, `source_document_id`). Milestone 2
(`/doc/:token` public document pattern) and Milestone 3 (delivery model) are required
for fast follow only.

**Acceptance criteria (first cut):**
- Contractor can create an invoice directly from a won quote (`approved`) without
  re-entering core quote data
- Invoice inherits customer, title/context, line items, and totals from the source quote
- Invoice number is generated in sequential per-user `I-001` format
- Due date is lightweight and professional: prefilled + editable without adding workflow
  friction
- Quote detail is the primary place for invoice creation and access
- When invoice exists, quote detail shows a compact linked summary card (invoice number,
  status, due date, total, created date), not a full inline invoice document
- Invoice has its own dedicated detail page and reuses existing document UI mental model
- Quote and invoice link to each other clearly (parent/child relationship)
- Main quote list remains clean and quote-focused by default (no quote+invoice duplicate
  rows for the same job)
- Invoice can be shared by copy-link using the existing raw PDF endpoint (`/share/:token`)
  in first cut
- Converting to invoice does not mutate the source quote's status or core data
- No invoice-management sprawl is implied by milestone scope

**Acceptance criteria (fast follow):**
- Invoice email delivery reuses Milestone 3 delivery infrastructure (invoice-specific
  content, same delivery model)
- Public invoice page reuses Milestone 2 `/doc/:token` document-view model with read-only
  behavior

---

### Milestone 6: Operational Visibility

**Status:** Shipped

**Goal:** Have enough instrumentation and error monitoring in place before real users
depend on the app.

**Scope:**
- Error monitoring integration (Sentry or equivalent) on both backend and frontend
- Basic admin analytics route: `GET /api/admin/events` returning aggregated counts
  of pilot event names over a time window (internal-only operator route; see Admin
  Access Model above)
- Extend event logging with new V1 events:
  - `quote_viewed`
  - `invoice_viewed`
  - `quote_approved` (contractor marks Won — ships in M1)
  - `quote_marked_lost` (contractor marks Lost — ships in M1)
  - `invoice_created`
  - `email_sent`

Note: `quote_declined` is reserved for a potential future customer-facing decline
action and is not part of V1. `quote_changes_requested` and `quote_expired` have
been removed from V1 scope.
- Structured error logging on the extraction pipeline (already partially in place)

**Acceptance criteria:**
- Unhandled exceptions in backend and frontend are captured in error monitoring
- Admin route returns event counts by name and day for a given date range
- All new V1 user actions are logged as events
- No PII (customer names, emails) stored in event metadata

---

### Milestone 7: Optional Pricing Controls

**Goal:** Add lightweight, optional pricing controls so contractors can reflect real‑world
discounts, deposits, and simple tax on quotes and invoices without turning Stima into an
accounting system or cluttering straightforward jobs.

**Why this milestone exists:** Many contractors already adjust pricing in the field — repeat‑customer
discounts, bundled‑job deals, and occasional goodwill adjustments. A small subset also needs to
show a deposit or simple sales tax on paperwork. Stima should support these patterns in a way
that feels natural to solo operators who mostly think in terms of "what should I charge for this
job," not in terms of accounting workflows or tax engines.

**Pulled forward from V2:** This was originally scoped as V2 Track 1. It moved into V1 Phase 3
because basic pricing controls (especially discounts, with optional deposits and tax where needed)
help the product feel complete enough for some contractors to pay for it, without expanding into
full bookkeeping.

**Scope:**
- **Discounts first-class:** Optional per quote/invoice discount, fixed dollar or percentage.
  - Obvious fit for real behavior: repeat‑customer pricing, bundled work, negotiated adjustments,
    and goodwill discounts.
  - When unused, there is no discount field, label, or empty row on the UI, PDF, or public page.
- **Optional deposit:** Optional per quote/invoice deposit amount.
  - Display/communication only — shows what is due upfront; collection happens outside the app.
  - When unset, deposit does not appear at all (no placeholder line or label).
- **Simple tax (optional, low‑friction):**
  - Percentage‑based tax field that can be enabled per quote/invoice.
  - Reasonable default can live in Settings for contractors who need it; any given document can
    override or disable tax entirely.
  - Tax is treated as an advanced, optional control — never required for creating or sending
    a quote or invoice.
- **Conditional breakdown:** Total section on quote/invoice detail views, PDFs, and public landing
  pages renders a clean subtotal/discount/tax/deposit/total/balance‑due breakdown **only** for
  values that are present; the default case (no optional pricing controls) remains a single,
  simple total line.

**Out of scope:**
- Per‑line‑item tax rates
- Tax jurisdiction lookup or automatic tax calculation
- Deposit payment tracking or payment status
- Discount codes or promotional pricing
- Any payment processing or accounting‑style workflow

**Depends on:** Milestone 5 (invoices must exist before these pricing controls can apply to them).

**Acceptance criteria:**
- Discount (fixed or percentage) works as an optional pricing adjustment per quote/invoice and
  feels natural for repeat‑customer, bundled‑job, and goodwill scenarios.
- Deposit works as an optional amount/line that clearly communicates "due upfront" when set and
  is completely absent when not used.
- Tax, if configured, is a simple percentage field that can be enabled, edited, or disabled on
  any individual quote/invoice and is never required to send documents.
- Optional pricing fields (discount, deposit, tax) and any related labels/notes:
  - do not appear in the app UI, PDF, or public quote/invoice views when blank
  - do not introduce placeholder rows or "N/A" text
  - preserve the existing clean, single‑total layout when no pricing controls are used
- PDF and landing page total sections match the same conditional breakdown behavior and layout.
- Existing quotes/invoices without pricing controls are unaffected and render exactly as they did
  before this milestone.
- All pricing controls are optional — no gate on existing quoting or invoicing workflows.

---

### Milestone 8: Contractor-First Document Flow

**Goal:** Reset document behavior around a simpler contractor-first model: one shared builder,
late quote/invoice type choice, always-editable documents, and statuses used for internal
tracking rather than permission gates.

**Why this milestone exists:** The current flow assumes too much about how contractors work.
It uses status changes as hard locks, forces quote-first behavior even when the contractor
already wants an invoice, and creates “you have to start over” moments when a customer asks
for revisions. Stima should feel like a flexible document tool for the contractor, not like
a rigid customer-workflow engine.

**Contractor-first baseline:**
- one shared document builder for quotes and invoices
- type choice happens near the end of the builder flow
- quotes remain editable after share and after contractor-recorded outcomes
- invoices remain editable after `sent`
- shared/customer-facing document views reflect the latest version
- quote and invoice statuses remain as organizational labels, not edit locks
- quote -> invoice remains a clone-based convenience flow, not in-place type mutation

**Decision locks for M8:**
- Persisted quote statuses remain `draft -> ready -> shared -> viewed -> approved | declined`
  in the backend and database. M8 may use contractor-facing `Won` / `Lost` copy in the UI,
  but it does not rename persisted statuses.
- Persisted invoice statuses remain `draft -> ready -> sent`. `ready` remains an internal
  pre-share state; M8 does not remove it.
- Quote editing continues to use the existing quote patch fields: `title`, `line_items`,
  `total_amount`, and `notes`.
- Invoice editing expands beyond due date only. `PATCH /api/invoices/{id}` becomes the single
  invoice edit contract for `title`, `line_items`, `total_amount`, `notes`, and `due_date`
  in `draft`, `ready`, and `sent`.
- Editing a shared/viewed/approved/declined/sent document does not rotate `share_token`,
  does not clear the public link, and does not automatically reset status.
- Editing a `ready` quote or `ready` invoice does not demote it back to `draft`.
- Existing one-way share/view/outcome/send transitions remain intact. M8 removes edit locks;
  it does not make outcomes reversible.
- Hard delete remains limited to unshared draft/ready documents. Any customer-visible document
  (`shared`, `viewed`, `approved`, `declined`, `sent`) remains non-deletable in M8.
- Direct invoice creation is allowed without a source quote. Those invoices use
  `source_document_id = NULL` and get a server-assigned default due date before routing to
  invoice detail for further edits.
- Direct invoice creation uses `POST /api/invoices`; it does not create a hidden quote first and
  does not mutate a quote row into an invoice row.
- Direct invoices must support null source fields cleanly in detail/list contracts:
  `source_document_id = null`, `source_quote_number = null`.
- Quote -> invoice convenience remains the existing quote-first path: approved quotes only,
  one linked invoice per quote.
- `Approved` / `Declined` quotes may still copy link and resend email in M8; resend never
  regresses status or rotates the existing share token.
- Invoice discoverability lands as the smallest explicit surface: the existing main list adds
  a top-level type filter with `Quotes` as the default view and `Invoices` as the secondary
  view. No new bottom-nav tab or standalone invoice dashboard ships in M8.
- The existing `/` route remains the main list route. The primary CTA becomes `Create Document`
  and routes to the shared builder. Search behavior stays parallel in both modes: customer name,
  title, and document number.
- Optional `customer_id` filtering remains available in both list modes, and invoice discovery
  uses a stable `GET /api/invoices` list contract rather than overloading the quote list.
- M8 does not add invoice public landing pages under `/doc/:token`. Public invoice access
  remains the existing shared PDF path unless a later milestone scopes invoice landing pages
  explicitly.

**Scope:**
- Relax quote and invoice edit restrictions across backend and frontend
- Add shared builder handoff for `Quote` vs `Invoice`
- Support direct invoice creation without forcing a won-quote path first
- Keep quote -> invoice cloning as a lightweight convenience flow
- Add the smallest possible discoverability surface for invoice-first documents on the
  existing main list screen

**Out of scope:**
- Immutable customer-visible snapshots
- Version history or timeline UI
- Full invoice management / AR workflows
- Payment collection or reconciliation
- Invoice public landing pages on `/doc/:token`

**Depends on:** Milestone 5 (invoices exist). This milestone should land before Milestone 7 so
later document/pricing work builds on the contractor-first baseline instead of the stricter
locked-status model.

**Acceptance criteria:**
- Contractor can build one document and choose `Quote` or `Invoice` near the end
- Shared quotes remain editable after being shared
- `Approved` / `Declined` quotes remain editable, with optional `Won` / `Lost` UI copy
- Sent invoices remain editable after being sent
- Shared/customer-facing document views reflect the latest version of the document
- Statuses remain available for internal tracking but do not block editing
- Editing does not rotate share links or automatically reset document status
- Editing `ready` quotes/invoices does not demote them back to `draft`
- Shared/sent/outcome documents remain non-deletable in M8
- Contractor can create an invoice directly without first forcing a won-quote path
- Direct invoice creation uses a dedicated `POST /api/invoices` contract and supports
  `source_document_id = null`
- Contractor can create a separate invoice from an existing quote via cloning
- `Approved` / `Declined` quotes can still copy link and resend email without status/token
  regression
- Invoice-first documents are discoverable from the existing main list without a new invoice
  dashboard

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

## Build Order

V1 remains organized into shipping phases, but the foundation sequence is now complete.
From the current state forward, execution is focused on the remaining milestones only.

### Completed Foundations (already shipped)

1. Pre-V1 Polish — Customer detail layout + quote title field
2. Milestone 0 — Branding foundation
3. Milestone 1 — Quote status expansion
4. Milestone 6 — Operational visibility
5. Milestone 2 — Public landing page (read-only customer quote page)

### Active Forward Path

Ship in this order from current state:

1. Milestone 3 (revised) — Email delivery and always-visible Copy Link
2. Milestone 4 — Quote PDF presentation refinement
3. Milestone 5 — Invoice conversion from won quote
4. Milestone 8 — Contractor-first document flow baseline reset
5. Milestone 7 — Optional pricing controls

---

## New Infrastructure Dependencies

| Dependency | Milestone | Notes |
|---|---|---|
| Cloud file storage (S3/GCS) | 0 | Logo upload requires persistent file storage |
| Transactional email provider (Resend) | 3 | New service, requires API key + domain setup |
| Error monitoring (Sentry) | 6 | New service, requires project setup on both frontend and backend |

These three infrastructure items should be provisioned before or during their respective
milestone, not after. They are not complex to set up but they are external dependencies
that can block progress if left too late.

---

## Contracts Locked After V1

Once V1 is complete, the following should be treated as stable:

- Quote status lifecycle: `draft → ready → shared → viewed → approved | declined`
- Invoice status lifecycle: `draft → ready → sent`
- Public quote route: `/doc/:token` (quote landing page; read-only for customers)
- Public invoice sharing: existing shared PDF route remains the stable contract unless a later
  milestone explicitly adds invoice landing pages
- Contractor outcome endpoints: `POST /api/quotes/:id/mark-won` and `POST /api/quotes/:id/mark-lost`
- Invoice doc type and `I-001` numbering format
- `source_document_id` on `documents` as the quote→invoice link
- Optional tax, discount, and deposit fields on `documents` and their conditional
  PDF/landing page rendering (omitted entirely when unused)
- Canonical event log names for all V1 user actions

---

## V1 Success Criteria

V1 is considered successful if, after a pilot period:

- At least 30% of shared quotes are sent via the in-app email flow
- At least 30% of shared quotes are marked Won or Lost by the contractor
- At least one invoice is created in Stima per active pilot user, either directly or from an
  approved quote
- Error monitoring captures actionable errors before users report them
- No quote or invoice data is lost or corrupted through status transitions
