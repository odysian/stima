# Stima V2 Roadmap

**Version:** 0.1 — March 2026
**Status:** Parked — features prioritized by pilot data, not pre-planned. This document captures ideas validated during V1 planning but is not an active build queue.
**Assumes:** V1 is complete and live with real users
**Reference:** `docs/PRODUCT.md` for strategic context

---

## Purpose

V2 makes the product faster for repeat work and smarter about the customers and jobs
a contractor already has. V1 closed the quoting loop. V2 reduces the effort of running
that loop over and over.

The two questions V1 pilot data should answer before V2 is locked:

1. Where are contractors losing the most time after V1?
2. What is causing quotes not to convert — the quality of the draft, the delivery, or
   something else?

V2 scope should be adjusted based on those answers. This document is a directional plan,
not a locked spec.

---

## V2 Goal

> A contractor quoting their fifth landscaping cleanup of the month should be able to
> generate a draft, review it, and send it in under 60 seconds — because Stima already
> knows their standard services, their pricing, and what they did for this customer last
> time.

---

## Scope Boundary

**V2 is:**
- Speed features for repeat quoting
- A persistent customer relationship layer
- Photo and job documentation
- Smarter extraction using the contractor's own history
- Optional pricing controls that match how real jobs are structured (discounts, deposits,
  simple tax where needed)

**V2 is not:**
- Subscription billing (V3)
- Team accounts (V3)
- Payment collection (post-V3 or never)
- A full CRM
- Accounting integrations beyond what a contractor can do with a CSV export

---

## Track 1: Estimating Speed

**Goal:** Repeat jobs become dramatically faster to quote. The contractor should rarely
have to type the same service twice.

### Features

**Saved line item templates**
A contractor can save any line item (description, details, default price) to their
personal service catalog. When creating a quote, they can insert templates directly
into the line item list rather than waiting for extraction or typing from scratch.

- Service catalog lives in Settings
- Templates can be added from Settings or promoted from any existing line item
- During quote review, a "from catalog" shortcut is available alongside the existing
  add line item action

**Quote duplication**
A contractor can duplicate any existing quote as the starting point for a new one.
Customer can be changed on the duplicate. Useful for recurring jobs (same property,
same scope, next season).

- Available from quote detail view
- Duplicate opens in draft state with all line items copied
- Doc number is a new sequential number, not a copy of the source

**Optional pricing controls (discounts, deposits, tax where needed)** — *Pulled into V1
Phase 3 (Milestone 7: Optional Pricing Controls).* See `docs/V1_ROADMAP.md` for scope.
No longer part of V2.

**PDF template note:** The V1 PDF template total section should be implemented as a
conditional block, not a hardcoded single-line total. M7 depends on that structure
being in place.

**Revision history**
A quote keeps a lightweight record of when it was edited and what the total was at each
save point. Not a full diff — just a timestamped snapshot of the total and line item
count. Useful for "what did I originally quote before they asked for changes."

---

## Track 2: Customer Memory

**Goal:** Returning customers are easier to serve. The app should know what was done for
them before and surface it without prompting.

### Customer Detail Rebuild

The customer detail screen gains a three-tab structure:

**Jobs tab (default)**
All quotes and invoices for this customer, newest first. Each row shows doc type, date,
total, and status. Tapping opens the document detail. This replaces the current flat
list.

**Gallery tab**
Photos attached to this customer's jobs, organized by date. Tapping a photo shows it
full-size with any attached note. Photos are added during or after quote/invoice creation.
Useful for documenting before/after, scope confirmation, and dispute reference.

**Notes tab**
A persistent freeform text field per customer. Always visible when working on a quote
for this customer. For things like:
- "Gate code 4521"
- "Dog in backyard, friendly"
- "Mrs. Johnson is particular about the boxwoods"
- "Prefers invoices sent by Friday"

Notes are internal only — never customer-facing.

### Persistent notes in the quote flow

When a contractor starts a new quote for a customer who has notes, those notes are
surfaced on the capture screen as a reference card. The contractor does not have to
navigate to the customer detail to remember the context.

### Job history in extraction context

When the AI generates a draft for a returning customer, it has access to the titles of
prior line items for that customer. It does not auto-fill pricing, but it can suggest
matching descriptions when the new transcript is similar to past jobs. This makes the
draft feel more personalized and reduces editing time on repeat work.

**V1 seam required:** The extraction path should be built in V1 so an optional
`customer_context` parameter can be added without rewriting every quote intake call site.
In the current codebase, that likely means extending `ExtractionService.convert_notes()`
and/or the underlying extraction integration contract rather than inventing a brand-new
entrypoint.

```python
async def convert_notes(
    transcript: str,
    customer_context: CustomerContext | None = None  # pass None always in V1
) -> QuoteDraft: ...
```

Where `CustomerContext` will eventually contain:
- `customer_id: UUID`
- `prior_line_item_descriptions: list[str]` — populated from prior quotes in V2

Building this seam in V1 costs nothing. Skipping it means every call site must be
updated when V2 adds context injection.

---

## Track 3: Search and Navigation

**Goal:** A contractor with 50+ quotes and 20+ customers should be able to find anything
in a few taps.

### Features

**Global search**
A single search bar (accessible from the home screen) that queries across:
- Customer names
- Quote and invoice numbers
- Line item descriptions

Results are grouped by type and show enough context to identify the right record without
opening it.

**Lightweight job tags**
A contractor can tag quotes and invoices with freeform labels (e.g., "mulch season",
"commercial", "warranty callback"). Tags are personal, not customer-facing. Useful for
filtering the quote list and for spotting patterns across jobs.

**Quote list filters**
The quote list gains basic filters: by status, by customer, by date range. Currently
the list is reverse-chronological with no filtering.

---

## Track 4: Quote and Invoice Quality

**Goal:** The documents Stima produces look and feel good enough that a contractor is
confident sending them to any customer, including commercial clients.

### Features

**Optional sections on quotes**
A contractor can add named sections to a quote (e.g., "Phase 1 — Site Prep",
"Phase 2 — Planting"). Line items are grouped under sections. Useful for larger or
multi-phase jobs.

**Add-ons and alternates**
A quote can include optional line items marked as "add-on" or "alternate." These are
shown on the customer-facing page and PDF with a clear visual separation from the base
scope. The customer can indicate which add-ons they want when approving.

**Notes block improvements**
The quote notes field gains basic formatting support (line breaks, bullet points). The
current single-text-block notes field is limiting for longer scope clarifications or
terms.

**Invoice payment terms**
Invoices gain a payment terms line (e.g., "Net 30", "Due on receipt", custom text).
Displayed in the invoice PDF and on the customer-facing page.

---

## V2 Success Criteria

V2 is considered successful if, after a pilot period:

- Contractors with 10+ quotes are using templates or duplication for at least 30% of
  new quotes
- Customer notes are being used by the majority of active users
- Gallery photos are being attached to at least 20% of jobs
- Median quote creation time drops measurably from the V1 baseline
- No regression in the V1 conversion loop (email delivery, approval rate)

---

## What V1 Pilot Data Should Inform

Before finalizing V2 scope, review:

- **Drop-off points in the quote creation flow** — if contractors are abandoning at
  extraction rather than editing, the speed improvements may matter less than prompt
  quality improvements
- **Repeat customer rate** — if most quotes are for new customers, the memory features
  are less urgent than the speed features
- **Most common manual edits** — if contractors are consistently retyping the same three
  services, templates are the highest-leverage V2 feature
- **Gallery usage intent** — if contractors are asking for photo documentation, build it;
  if not, it can slip to V3

---

## What V2 Deliberately Defers

- Subscription billing and paid tiers (V3)
- Team accounts and shared workspaces (V3)
- Payment collection and processing (V3 or later)
- App store packaging (V3, if warranted)
- Accounting integrations (V3)
- Push notifications for quote responses (could pull into V2 late if V1 reminder
  engagement is low)
