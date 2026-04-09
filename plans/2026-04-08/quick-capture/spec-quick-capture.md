## Spec: Unified Quote Capture, Persisted Review, and Customer Assignment Flow

Build one unified quote-authoring flow that lets contractors capture notes quickly, extract a usable draft immediately, review and refine that draft on a persisted quote, and assign or change the customer from review before continuing to preview/output actions.

This replaces the current split between manual customer-first creation and quick-capture-style creation. The product should feel like one refined flow, not two adjacent ones.

---

## Problem framing

### Goal

Reduce time-to-first-draft while simplifying the quote creation model.

The intended default path is:

1. Open home
2. Tap `New Quote`
3. Record and/or type notes
4. Extract into a draft
5. Persist the draft immediately
6. Review and refine the persisted quote
7. Assign or confirm customer from review
8. Continue to preview/send later

### Non-goals

- keeping separate long-term "manual" and "quick capture" creation products
- building durable raw-audio persistence before extraction
- allowing PDF generation, sharing, email sending, or invoice conversion without a customer
- redesigning the quote preview experience
- introducing a separate long-lived intake-session domain model

### Constraints

- current capture flow assumes `customerId` exists before capture
- current review flow is session-draft-based rather than persisted-quote-based
- current persisted edit flow is separate from review and lacks transcript/customer editing
- current quote persistence and read models assume a real customer join
- mobile browser tabs cannot be trusted to retain in-memory audio capture after backgrounding or refresh
- the `documents` table is shared between quotes and invoices, so nullable `customer_id` must not weaken the invoice-side requirement
- extraction-triggered draft persistence must not depend on a second client round trip that a backgrounded/disconnected mobile tab might never complete

---

## Why this approach

### Chosen approach

Unify quote creation around one capture -> extract -> persisted review flow using the existing `documents` quote model, allow `customer_id = null` for internal drafts, and move customer assignment into review for every creation path.

### Rejected alternative

Keep two parallel flows:

- customer-first manual flow using session review
- separate quick-capture flow using persisted review

### Main tradeoff

Unifying the flow requires a more meaningful refactor of route ownership and persisted editing contracts, but it removes duplicated concepts, gives contractors one mental model, and avoids maintaining two review/edit experiences that drift apart.

### Assumptions/contracts that must hold

- extraction success is the durability checkpoint
- unassigned drafts are valid internal saved quote drafts
- review is the canonical place to assign or change the customer while the quote is still internal
- customer-dependent actions remain blocked until a real customer is assigned
- raw clips before extraction remain best-effort only

---

## Decision locks

### D1. Home exposes one primary quote-creation entry

- replace split-path home IA with one primary `New Quote` FAB
- the FAB should stay in the current bottom-right, thumb-friendly position
- because the unified flow supports both typed notes and voice capture, the FAB should communicate "new quote" rather than microphone-only semantics

### D2. Customer profile launches the same capture flow with a preselected customer

There is no separate customer-profile-specific quote creation workflow.

From a customer profile:

- `Create Quote` opens the same capture experience
- review shows the customer row preselected to that customer

### D3. Extraction success creates a real persisted draft quote

On extraction success:

- create a quote in the backend immediately
- assign a real database `id`
- assign a real `doc_number`
- allow `customer_id = null`
- navigate into persisted review for that quote

Quote-number gaps from abandoned drafts are acceptable.

### D4. One canonical persisted review/edit surface owns quote refinement

Use `/quotes/:id/review` as the canonical persisted quote editing surface for:

- post-extraction review after creation
- reopening draft quotes from the list
- `Edit Quote` from preview for editable quotes

This surface owns:

- title edits
- transcript edits
- line-item edits
- notes/pricing edits
- customer assignment/reassignment
- append voice notes
- explicit draft save

The existing persisted edit route should be folded into this surface as part of this spec, not as a future follow-up.

### D5. Review owns customer selection for every quote-creation path

Show the same tappable customer row on review regardless of how the quote was created:

- unified home `New Quote` path
- customer-profile preselected path
- reopened editable draft/review path
- editable persisted quotes opened from preview

Customer row behavior:

- `Customer: Unassigned` when no customer is attached
- current customer name when assigned
- `Needs customer` badge or equivalent explanatory affordance when customer assignment is still required

Tapping the row opens a mobile-friendly sheet with:

- customer search
- select existing customer
- create new customer

### D6. Customer assignment and reassignment rules are explicit

Allowed:

- creation with `customer_id = null`
- assignment while the quote is still internal (`status` in `{draft, ready}`)
- reassignment while the quote is still internal (`status` in `{draft, ready}`)

Blocked:

- clearing an already assigned customer back to `null`
- reassignment once `status` is in `{shared, viewed, approved, declined}`
- reassignment after an invoice is linked to the quote

`ready` is explicitly still reassignable. A user who generates a PDF preview but has not yet shared the quote should still be able to correct the customer. The lock fires at the moment the quote becomes customer-visible (share) or has a downstream invoice.

The UI should still show the same customer row when reassignment is blocked, but explain why it is locked instead of silently hiding the affordance.

### D7. Preview/output actions require a customer

Allowed without customer:

- capture
- extraction
- persisted draft creation
- reopening review
- title/transcript/line-item/note/pricing edits
- explicit draft save
- append voice notes

Blocked until customer is assigned:

- continue to preview from review
- PDF generation
- share/send actions
- invoice conversion

Route guard:

- if a user reaches `/quotes/:id/preview` for a quote that still requires customer assignment, the app should redirect them back to `/quotes/:id/review` with a brief explanatory message instead of rendering the normal preview surface

### D8. Quote list treats drafts as first-class resumable work

In the quote list:

- show a `Drafts` section above past/customer-facing quotes
- draft rows should be visually stronger than non-draft rows
- use a tinted glassy treatment that reuses the existing app chrome language rather than introducing a foreign card style
- prefer the same glass-family visual language used by app chrome such as bottom nav/footer surfaces, combined with a draft-specific tint or accent border
- unassigned drafts should also show `Needs customer`
- hide the `Drafts` section entirely when there are no draft quotes

Navigation rule:

- draft quotes open `/quotes/:id/review`
- non-draft quotes open `/quotes/:id/preview`

Implementation note (2026-04-09):
- Dark-mode readability takes priority for now. Draft rows should use the same dark-safe surface treatment as non-draft rows (with a warning accent) until a dedicated follow-up lands a fully polished glassy variant that is verified across light/dark themes.

### D9. Add voice note is a prominent review action, not a floating FAB

Use a prominent inline or sticky secondary action on review:

- visible near the top of review
- easy to reach on mobile
- available from the persisted review surface

Do not use a floating action button for append voice notes on review.

### D10. Persisted review uses explicit save in V1

After extraction:

- the initial persisted draft is created automatically
- subsequent review edits save through explicit draft-save/update actions
- unsaved changes should show a leave warning where practical

Autosave can be revisited later if pilot usage shows explicit save is too fragile.

### D11. Review navigation behavior is origin-aware

Use one review route, but keep exit behavior intuitive:

- when review is opened from preview via `Edit Quote`, back/cancel returns to preview
- when review is opened after extraction, back/exit should not try to return to transient capture state
- when review is opened from the draft list, back returns to the list
- successful `Save Draft` keeps the user on review
- `Continue to Preview` navigates to `/quotes/:id/preview`

### D12. Append voice notes are append-only and use a dedicated backend action

Append mode must:

- extract only from the new input
- preserve all existing line items unchanged
- append only new candidate line items
- recompute total from the full current line-item list
- preserve existing confidence notes and append any new confidence notes for newly added items only
- merge transcript into one flattened transcript with lightweight structure

This should use a dedicated append endpoint/action rather than a generic full-quote patch from the client.

### D13. Product naming should reflect the unified flow

In product/UI language, this should no longer be framed as a special "quick capture" path.

Preferred language:

- `New Quote`
- `Capture`
- `Review`
- `Preview`

The planning folder can retain the legacy `quick-capture` label for continuity, but the product should use unified quote-authoring language.

### D14. Extraction worker owns persisted draft creation

On successful extraction (async ARQ path or sync fallback path), the backend creates the persisted draft quote before marking the job terminal and before returning any extraction result to the client.

Required behavior:

- async path: the ARQ extraction worker inserts the `documents` row plus its `line_items` rows inside the same job run that performs provider extraction
- async path: `JobRecordResponse` for extraction jobs gains a `quote_id` field that is populated once the draft exists
- async path: `job_records.document_id` is populated with the created draft id
- sync fallback path: the handler creates the draft inline before returning `ExtractionResult`; the response shape additionally carries `quote_id`
- partial failure: if provider extraction succeeds but persistence fails, the job is marked terminal with a clear error and no extraction result is leaked to the client
- draft creation honors the preselected-customer flow by inserting with the supplied `customer_id`, or with `customer_id = null` for the unified home flow
- `draft_generated` pilot event emission shifts from the API handler to the worker/handler so the event only fires when the draft is actually persisted
- event metadata payloads tolerate `customer_id = null`

Why this design:

- the client can background, disconnect, or die between "extraction succeeded" and "draft created" — owning persistence in the worker closes that race window
- the "extraction is the durability checkpoint" contract from the problem framing only holds if the durable write happens inside the extraction run itself
- a user who taps extract and closes the app should find the draft waiting in the `Drafts` section on next open, regardless of whether they ever saw the success response

Frontend flow:

- the frontend polls `GET /jobs/{job_id}` and navigates to `/quotes/:id/review` as soon as `quote_id` is present
- sync fallback: the frontend reads `quote_id` from the sync response and navigates the same way
- the frontend does not call `POST /quotes` for extraction-initiated drafts

`POST /quotes` remains available for direct quote creation paths that may emerge later, but is not used by the unified capture flow in this spec. It may remain customer-required in V1.

### D15. Line-item editing uses an in-place modal/sheet, not a sublevel route

The current line-item edit sublevel routes and their dedicated screens are retired:

- `/quotes/review/line-items/:lineItemIndex/edit` is removed
- `/quotes/:id/edit/line-items/:lineItemIndex/edit` is removed
- the matching `EditLineItemScreen` and `EditLineItemForEditScreen` components are removed

Replacement:

- a single line-item edit sheet component lives on the canonical review surface
- it reuses the existing modal shell grammar from `ConfirmModal`: bottom-sheet on mobile (`items-end`), centered on desktop (`sm:items-center`)
- it is a form modal, not a confirm dialog, so it is a new component rather than a reuse of `ConfirmModal` itself
- the user stays anchored on review during line-item edits for orientation and flow

### D16. AI confidence banner is dismissible

The existing `AIConfidenceBanner` on review eats valuable top-of-screen space on mobile. Make it dismissible.

Required behavior:

- the banner exposes a close affordance
- dismissal hides the banner for the remainder of the current quote lifecycle (stored per quote id, not per user)
- dismissal does not permanently suppress future notes: if a subsequent append extraction adds new confidence notes tied to newly appended items, the banner re-appears with the new notes only
- dismissal state does not need to persist across devices or sessions beyond what is practical with local storage scoped by quote id

---

## UX flows

### Default unified flow

1. Home
2. Tap `New Quote`
3. Record one or more clips and/or type notes
4. Extract
5. Backend creates persisted draft quote with `customer_id = null`
6. Open `/quotes/:id/review`
7. User edits, assigns/confirms customer, saves, and continues to preview when ready

### Customer-profile preselected flow

1. Open customer profile
2. Tap `Create Quote`
3. Capture opens with that customer preselected for the eventual draft
4. Extract
5. Backend creates persisted draft quote with that `customer_id`
6. Open `/quotes/:id/review`
7. Review shows the same customer row, already filled

### Resume later flow

1. User extracts input
2. Draft is saved immediately
3. User leaves the app
4. User later reopens the draft from the `Drafts` section
5. Review resumes from the persisted quote, not from session-only state

### Preview transition flow

1. User opens persisted review
2. If customer is unassigned, `Continue to Preview` is blocked with clear guidance
3. After customer assignment, `Continue to Preview` becomes available
4. User proceeds to `/quotes/:id/preview`

### Append capture flow

1. User opens `/quotes/:id/review`
2. User taps `Add voice note`
3. App opens append capture for that quote
4. User records additional clips and/or types notes
5. App extracts new candidate items from only the new input
6. App appends new candidate items to the existing draft
7. App recomputes total from the full line-item list
8. App returns to review

---

## State model

### Transient capture state

Local-only state before extraction:

- clips
- typed notes
- unsaved-work warning

This state is not guaranteed to survive mobile backgrounding or refresh.

### Persisted quote draft state

Stored in `documents` and used after extraction:

- `status = draft | ready | shared | viewed | approved | declined`
- `customer_id = null | UUID`
- review/edit fields remain available through the canonical review surface

Recommended derived frontend flags:

- `requires_customer_assignment = customer_id === null`
- `isDraftSectionItem = status === "draft"`
- `canReassignCustomer = !hasBeenShared && !hasLinkedInvoice`

No additional backend lifecycle enum is required for V1 if the UI can derive the needed state cleanly from quote fields plus helper response fields.

---

## Routing recommendation

Add or standardize:

- `/quotes/capture`
- `/quotes/capture/:customerId`
- `/quotes/:id/review`

Keep:

- `/quotes/:id/preview`

Retire:

- `/quotes/new` (old `CustomerSelectScreen` entry) — replaced by home FAB launching `/quotes/capture`; a temporary redirect to `/quotes/capture` is acceptable during migration
- `/quotes/review` (session-draft review) — replaced by persisted `/quotes/:id/review`
- `/quotes/:id/edit` — replaced by `/quotes/:id/review`; existing links redirect to the new route
- `/quotes/review/line-items/:lineItemIndex/edit` — replaced by the line-item edit modal/sheet on review per D15
- `/quotes/:id/edit/line-items/:lineItemIndex/edit` — replaced by the line-item edit modal/sheet on review per D15

Compatibility notes:

- home `New Quote` launches `/quotes/capture`
- customer profile `Create Quote` launches `/quotes/capture/:customerId`
- legacy deep links into `/quotes/:id/edit` bounce to `/quotes/:id/review` for editable quotes
- direct visits to retired line-item sublevel edit routes resolve to the standard not-found fallback

---

## Backend and API implications

### Data model

- allow `documents.customer_id` to be nullable
- add a DB-level guard that preserves the invoice-side requirement: the `documents` table holds both quotes and invoices, and invoices must still have a customer. Use a CHECK constraint equivalent to `doc_type <> 'invoice' OR customer_id IS NOT NULL`, or enforce the equivalent in the invoice service layer in addition to the schema change
- enforce application rules so internal quotes may be unassigned, but customer-required actions may not proceed without assignment
- do not create placeholder customer rows
- cascade behavior on `documents.customer_id` stays `ON DELETE CASCADE` for V1; see follow-up for the customer-delete warning UX

### Quote create/update contracts

Extraction-initiated draft creation (primary path for unified capture):

- owned by the extraction handler/worker per D14, not by `POST /quotes`
- supports `customer_id = null | UUID`
- assigns real `id` and `doc_number` at creation time
- inserts extracted line items as the initial `line_items` rows
- emits `draft_generated` event on successful persistence

`POST /quotes` (direct create endpoint):

- not used by the unified capture flow in this spec
- may remain customer-required in V1; revisit if a non-extraction creation path needs to accept `customer_id = null`

Patch:

- allow persisted review/edit updates to `customer_id`, `title`, `transcript`, `notes`, `line_items`, and pricing fields
- allow customer assignment from `null` while `status` is in `{draft, ready}`
- allow customer reassignment while `status` is in `{draft, ready}` and no invoice is linked
- reject attempts to clear assigned customer back to `null`
- reject reassignment when `status` is in `{shared, viewed, approved, declined}` or an invoice is linked
- keep existing pricing and line-item validation rules

### Extraction job response contract

`JobRecordResponse` for `job_type = "extraction"` gains:

- `quote_id: UUID | null` — populated once the extraction handler has created the persisted draft; `null` only while the job is still in `pending`/`running` states
- existing `extraction_result` field remains but is no longer the sole signal of success for unified capture; the frontend navigates on `quote_id`

Sync-fallback extraction responses gain `quote_id` in the same shape so both paths are symmetrical to the frontend.

### Read models

Quote list/detail responses must safely handle:

- `customer_id = null`
- `customer_name = null`
- `customer_email = null`
- `customer_phone = null`

Recommended helper fields:

- `requires_customer_assignment: boolean`
- `can_reassign_customer: boolean`
- `preview_redirect_reason: "customer_required" | null` only if a dedicated helper proves useful during migration

### Customer-dependent action guards

For quotes without a valid assigned customer, return a clear client-visible error on:

- continue-to-preview preconditions when enforced via API
- PDF generation
- share/send endpoints
- invoice conversion

Preferred API response:

- `409 Conflict`
- canonical detail: `Assign a customer before continuing.`

Preferred reassignment-lock response:

- `409 Conflict`
- canonical detail: `Customer cannot be changed after sharing or invoice conversion.`

### Append action

Add a dedicated quote-append action:

- `POST /api/quotes/:id/append-extraction`

The backend owns:

- extraction from the new input only
- append-only line-item merge
- transcript merge
- total recomputation
- unchanged behavior on append failure

Operational contract for the append endpoint:

- requires auth and CSRF like other mutating endpoints
- reuses the same user-keyed rate limit, per-user daily extraction quota, and per-user in-flight extraction concurrency guards as `/api/quotes/extract`
- uses the same async-with-sync-fallback pattern as `/api/quotes/extract`: returns `202 JobRecordResponse` when ARQ is available, otherwise a synchronous response
- creates a `job_records` row with `job_type = "extraction"`, `document_id` set to the target quote id, and a terminal error path for provider failures
- worker/handler performs extraction → computes append-only merge → writes updates inside the job run before marking the job terminal
- per D12, the target quote is not mutated if the append extraction fails

---

## Review behavior

### Customer row

Place the customer row near the title area.

When unassigned:

- show `Customer: Unassigned`
- show `Needs customer`
- show helper copy explaining that preview/output actions require assignment

When assigned:

- show the assigned customer name
- allow reassignment only when policy permits it

### Action placement

Near the top of review:

- prominent `Add voice note` secondary action

Sticky footer:

- when customer is unassigned:
  - primary `Save Draft`
  - disabled secondary `Continue to Preview`
- when customer is assigned:
  - primary `Continue to Preview`
  - secondary `Save Draft`

### Navigation behavior

- if review was opened from preview, `Cancel` or header back returns to preview
- if review was opened from draft list or immediately after extraction, back/exit returns to the list or home flow rather than reopening transient capture
- direct navigation to preview for an unassigned quote should bounce back to review with explanation

### Shared review UI contract

Use the same customer row and review structure for:

- unified home `New Quote`
- customer-profile preselected capture
- reopened draft quotes
- editable persisted quotes opened from preview

### Leave warning

- unsaved review edits trigger a leave warning on navigation away from `/quotes/:id/review` where practical (browser back, in-app back, route transitions)
- the warning uses the existing `ConfirmModal` grammar, not `window.confirm`
- the warning does not fire when navigating after a successful `Save Draft` or `Continue to Preview`

### Dismissible AI confidence banner

- per D16, the `AIConfidenceBanner` on review can be dismissed
- dismissal state is keyed by quote id (session/local storage is acceptable)
- new confidence notes from a subsequent append extraction re-surface the banner with only the new notes

---

## Risks and edge cases

- quote list, detail, preview, render, email, and invoice conversion currently assume customer joins and will need null-safe handling
- persisted review should replace the old split edit model cleanly rather than creating a third editing surface
- preselected-customer capture must still let users change the customer on review while the quote is internal
- draft list rows need enough visual distinction to be instantly recognizable as resumable work
- append extraction must not regress into full-draft regeneration
- extraction worker persistence (D14) must allocate `doc_sequence`/`doc_number` correctly under concurrent extractions for the same user; reuse the existing repository path that `POST /quotes` uses rather than duplicating the allocation logic
- extraction worker persistence must handle partial failure cleanly: if the provider call succeeds but the DB insert fails, the job should go terminal with a clear error and no half-saved draft should leak into the user's list
- the refactored `ReviewScreen` will grow with customer row + append action + preview guard + leave warning + banner dismissal; task 04 must budget subcomponent extraction (`ReviewCustomerRow`, `ReviewActionFooter`, etc.) to stay under the 450 LOC hard limit from `docs/PATTERNS.md`
- invoice-side CHECK constraint must be verified against the existing invoice create/patch/convert paths so no existing code accidentally violates it
- `ON DELETE CASCADE` on `documents.customer_id` stays in place; UX mitigation for accidental draft loss moves to the customer-delete warning follow-up rather than a schema change in this spec

---

## Child tasks

Execution order (each is one PR):

1. `plans/2026-04-08/quick-capture/task-quick-capture-01-foundation-contract.md` — backend: nullable `customer_id`, invoice CHECK guard, null-safe reads, reassignment rules, customer-dependent action 409 guards, patch schema extensions
2. `plans/2026-04-08/quick-capture/task-quick-capture-02-extraction-worker-persists-draft.md` — backend: extraction worker and sync-fallback handler create the persisted draft, `JobRecordResponse.quote_id`, `draft_generated` event migration
3. `plans/2026-04-08/quick-capture/task-quick-capture-03-entry-and-draft-creation.md` — frontend: home FAB, `/quotes/capture` entry, customer-profile preselected entry, extraction-to-review navigation via `quote_id`, retire `CustomerSelectScreen`
4. `plans/2026-04-08/quick-capture/task-quick-capture-04-review-and-customer-assignment.md` — frontend: refactor `ReviewScreen` into the canonical `/quotes/:id/review`, port persisted load/save from `useQuoteEdit`, add customer row + assignment sheet, preview route guard, leave warning, dismissible AI banner, retire `QuoteEditScreen`
5. `plans/2026-04-08/quick-capture/task-quick-capture-05-draft-list-and-routing.md` — frontend: `Drafts` section on `QuoteList` with glassy treatment, `Needs customer` badge, row routing split (drafts → review, non-drafts → preview)
6. `plans/2026-04-08/quick-capture/task-quick-capture-06-line-item-edit-modal.md` — frontend: new `LineItemEditSheet` component, retire `EditLineItemScreen` + `EditLineItemForEditScreen` + both sublevel routes, wire modal into the new review surface
7. `plans/2026-04-08/quick-capture/task-quick-capture-07-append-voice-notes.md` — full stack: `POST /api/quotes/:id/append-extraction` (async with sync fallback), append capture UI from review, return-to-review navigation

Dependencies:

- 02 depends on 01
- 03 depends on 01 + 02
- 04 depends on 01 (and is unblocked by 02 for end-to-end testing)
- 05 depends on 04
- 06 depends on 04
- 07 depends on 04

Each task is PR-sized and should land one at a time. 05 and 06 can run in parallel once 04 is merged.

---

## Spec acceptance criteria

- Home exposes one primary `New Quote` FAB that starts the unified capture flow.
- Customer profile `Create Quote` launches the same capture flow with a preselected customer.
- Extraction success creates a persisted draft quote with a real `id` and `doc_number` inside the extraction job run, before the client is notified of success.
- Persisted drafts may exist with `customer_id = null`.
- Invoices still require a customer at the database and service layer; the nullable quote column does not weaken the invoice-side constraint.
- The app never uses a synthetic placeholder customer to represent unassigned drafts.
- `JobRecordResponse` for extraction jobs exposes `quote_id`, and the frontend navigates on `quote_id` rather than posting a second creation request.
- `/quotes/:id/review` is the canonical persisted quote review/edit surface.
- `Edit Quote` and legacy `/quotes/:id/edit` deep links route to the same persisted review surface.
- `ReviewScreen` is refactored as the base for the unified review; `QuoteEditScreen` is retired.
- Review shows the same customer row for unified/new, preselected, and reopened draft flows.
- Customer assignment is allowed while `status` is in `{draft, ready}` and no invoice is linked.
- Customer reassignment is blocked once `status` is in `{shared, viewed, approved, declined}` or an invoice is linked, with UI explanation.
- Quote list renders drafts in a dedicated top `Drafts` section with stronger visual treatment than past quotes.
- Draft quotes open review; non-draft quotes open preview.
- Preview/output actions remain blocked until customer assignment, enforced by both frontend route guard and backend `409` responses on PDF, share, email, and invoice-conversion endpoints.
- Line-item editing uses an in-place modal/sheet; the two sublevel edit routes and their components are retired.
- The AI confidence banner on review is dismissible per quote lifecycle and re-surfaces with new notes after append extraction.
- Review surfaces a leave warning for unsaved edits (via `ConfirmModal`, not `window.confirm`).
- Append voice note flow adds only new candidate line items and does not rewrite existing ones, and uses the same auth/CSRF/rate-limit/quota guards as `/api/quotes/extract`.
- Append voice note flow uses the same async-with-sync-fallback pattern as `/api/quotes/extract`.
- After extraction, the user can leave and later reopen the same draft from persisted state.
- `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, and `docs/PATTERNS.md` are updated where behavior, contracts, or UI patterns change.

---

## Follow-up polish ideas

Not part of the core execution slice unless explicitly pulled in later:

- record button reachability polish on smaller phones
- spinner/loading visual polish
- richer draft list density/filtering
- autosave evaluation after pilot usage
- **customer-delete warning modal**: when deleting a customer, show a confirmation dialog that lists counts of affected quotes (drafts, ready, shared, approved, declined) and invoices before executing the delete. This becomes more important once drafts are first-class resumable work and the cascade blast radius includes persisted drafts the user cares about.
- **reconsider `documents.customer_id` cascade behavior**: if pilot usage reveals accidental draft loss from customer deletion, evaluate switching to `ON DELETE SET NULL` for quote rows while keeping invoices customer-required via the CHECK constraint.
