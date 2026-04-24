# Stima — Product

**Version:** 1.0 — March 2026
**Status:** Active

---

## What Is Stima?

Stima is a mobile-first quoting and invoicing tool for solo tradespeople and small field
service operators. It turns rough field notes — spoken or typed — into professional quote
drafts the user can review, send, and track, without learning complex software or doing
repetitive manual data entry.

---

## Core Promise

> A solo tradesperson can quote a job from their phone, send it professionally, win the
> work, and invoice it — without typing line items from scratch or juggling text messages
> and a notes app.

---

## Who It's For

### Primary user

A solo owner-operator or small crew (1–5 people) in landscaping, handyman, pressure
washing, painting, cleaning, or a similar field service trade who:

- works primarily from a phone
- currently quotes from memory, handwritten notes, or text messages
- wants professional-looking output without the overhead of complex field service software
- is not looking for "AI" — they want less typing and fewer dropped details

### What they actually want

The product wins when a user thinks: *"That's basically right. I only had to tweak a couple
things."*

They are not asking for automation, dashboards, or workflows. They want:

- less typing
- cleaner customer-facing output
- fewer things forgotten between the job site and their truck
- to get paid

### Recommended first vertical

Landscaping. The job language is repeatable, materials and services are clear, and field
shorthand ("5 yards brown", "trim the boxes") is a natural fit for AI extraction. A second
trade can be added once the landscaping flow is proven reliable.

---

## Competitive Position

**vs. simple invoicing apps (Joist, Invoice Simple, WorkQuote):**
These are digital form-fillers. You manually type every line item, every time. Stima
lets you describe the job in your own words and structures it automatically. Same result,
faster input.

**vs. full field service platforms (Jobber, ServiceM8, QuoteIQ):**
Powerful but complex and expensive ($30–$400/month). Stima does less on purpose. It is
the tool for someone who does not want to learn a platform — they just want to send a
quote, track the response, and get paid.

**vs. free tools (Wave, generic PDF invoicers):**
General-purpose, not trades-aware. Stima's extraction understands field shorthand and
trade context. The AI knows what "haul debris" or "trim 8 shrubs" means and structures
it correctly without prompting.

---

## Version Structure

### V0 — Prove the Core Loop ✓ complete

Proved that voice or text notes → AI extraction → review/edit → professional PDF → share
is fast and reliable enough for a real user to prefer it over their current workflow.

Delivered: auth, onboarding, customer CRUD, voice + typed-notes extraction, review/edit
screen, PDF generation, public share link, quote history, pilot event logging.

---

### V1 — Close the Loop ✓ complete

**Goal:** A complete quoting workflow. Contractor sends a quote → customer sees it on a
branded landing page → contractor knows the outcome → converts to an invoice.

V0 ends at "quote shared via native share." V1 makes that moment mean something.
V1 is partially shipped: branding, quote status expansion, the read-only public quote
landing page, and operational visibility are already live. The remaining forward build path
is email delivery + always-visible Copy Link (M3), PDF refinement (M4), linked invoice
conversion (M5), and optional pricing controls (M7).

**Core scope:**

- Logo upload and branding on PDF (part of the core professional pitch, not a billing add-on)
- Public branded quote landing page — read-only customer view (replaces direct PDF stream)
- Quote status expansion: `viewed`, `approved`, `declined` — contractor-set outcomes after
  the customer communicates their decision; `expired` is deferred
- Email delivery from Stima — a professional direct-send channel alongside always-available
  copy-link sharing; both delivery paths are first-class in V1
- Quote → Invoice conversion (same line items, add due date — not full AR)
- Optional pricing controls on quotes and invoices (discounts first, with optional deposits
  and simple tax where needed; all optional and display-focused)
- Basic pilot analytics view (surface existing event_logs data in an admin route)
- Error monitoring (Sentry or equivalent — operational visibility before real users)

**What V1 is not:**

V1 is not payment collection. It is not email marketing. It closes the loop between
"quote sent" and "quote decided" and gives the contractor one clean path from approved
quote to invoice.

---

### P0 — Field-Resilient Capture (active)

**Goal:** Make Stima dependable in the field — when signal is bad, the browser refreshes,
or AI extraction has to wait. The product wedge is local-first quote capture: capture now,
clean up later.

**Why before V2:** Field resilience is a prerequisite for real-world daily use. V2 "Speed
and Memory" features (templates, customer notes, context-aware extraction) require users
to trust that work does not vanish. That trust comes from P0.

**Core scope:**

- Performance baseline and instrumentation (Spec 0)
- IndexedDB local storage foundation (Spec 1)
- Offline capture workspace — notes-first local recovery (Spec 2)
- Audio blob lifecycle hardening — durable clips (Spec 3)
- Local draft persistence migration from sessionStorage to IndexedDB (Spec 4)
- Idempotent extraction submit — safe retries before outbox (Spec 5)
- Outbox sync engine — foreground retry when back online (Spec 6)
- PWA shell foundations — installable, cold offline fallback (Spec 7)
- Backend Redis degraded mode — Redis outage degrades gracefully (Infra Spec A)

Full spec: `docs/roadmaps/P0_FIELD_RESILIENT_CAPTURE.md`

---

### V2 — Speed and Memory (deferred — resumes after P0)

**Goal:** Make repeat quoting dramatically faster. Turn Stima into a business memory
layer — not just a generator for one-off quotes.

**Deferred pending P0 completion.** The V2 direction (templates, quote duplication,
customer detail rebuild, gallery/photos, context-aware extraction, revision history,
stronger search) remains the correct next build after P0 ships. Exact scope will be
adjusted based on P0 and pilot usage data.

Historical directional context: `docs/archive/roadmaps/V2.1_ROADMAP.md`

---

### V3 — Commercial Launch

**Goal:** Turn a tool people depend on into a product people pay for.

**Core scope:**

- Free tier: limited monthly quotes, Stima watermark on PDFs
- Pro tier: unlimited quotes and invoices, logo, full history, all features
- Grandfather policy for pre-launch users (see open section below)
- Team and crew accounts with basic role separation
- CSV export and lightweight accounting hooks
- PWA install prompt; app store packaging if warranted by usage data
- Full analytics dashboard (funnel from started → approved → invoiced)

---

## Key Strategic Bets

### Free-first launch

Stima launches free. No billing gate before there are real users depending on it. The
goal before V3 is adoption, validation, and demonstrated value — not early revenue.

### Grandfather original users

When billing launches in V3, users who adopted before the paid launch get Pro free for
life. The cohort is small, the cost is low, and the loyalty signal is worth more than the
revenue they would have generated.

### Invoice as a natural extension of quoting

Stima is not an accounting tool. But a contractor who wins a quote needs to invoice.
The path from won quote (`approved` status) to sent invoice should be one action, not a separate product.

### AI drafts, user approves

No quote or invoice is sent automatically. The human is always the last step before
anything reaches a customer. This is a trust boundary, not a technical limitation.

### Mobile-first means thumb-friendly and obvious

The product is used on a job site, between tasks, possibly one-handed. Every screen
should answer "what am I looking at and what do I do next" within one second.

---

## Non-Goals Through P0 and V2

These are deliberately out of scope unless strong pilot evidence changes the calculus:

- payment processing or collection (Stripe, Venmo, CashApp)
- scheduling or calendar integration
- accounting integrations beyond CSV export (V3 only)
- marketplace or lead generation
- real-time cross-device sync or collaborative editing (P0 outbox handles single-device field recovery, not multi-device replication)
- AI auto-pricing without user review and confirmation
- broad workflow automation beyond quoting, invoicing, and follow-up
- multi-trade AI optimization before the first trade is proven reliable

---

## Decision Heuristic

When evaluating a feature for V1 or V2, prefer it if it satisfies at least two of:

- directly improves quote win rate or customer response rate
- materially reduces time-to-send for new or repeat quotes
- increases the contractor's confidence in what is happening with their quotes
- is necessary for the product to feel complete to a paying user

If a feature moves none of those levers, it belongs in V3 or later.
