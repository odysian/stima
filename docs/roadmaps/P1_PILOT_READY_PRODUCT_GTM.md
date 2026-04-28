# Spec: Stima P1 — Pilot-Ready Product & Founder GTM Program

Date: 2026-04-27  
Parent: follows GitHub Issue #549 — P0 Field-Resilient Capture Program  
Status: Revised draft after internal + agent review passes  
Mode: gated umbrella spec with small child tasks

---

## 0. Executive summary

P0 made Stima dependable in the field: local-first capture, durable notes/audio, safe retries, PWA shell, and degraded backend behavior.

P1 should **not** immediately expand Stima into a larger field-service platform. P1 should make Stima ready for real pilot users and founder-led validation.

**P1 product thesis:**

> Stima becomes a pilot-ready quoting assistant for solo landscapers: fast enough for repeat work, trustworthy enough for field use, polished enough to show customers, and instrumented enough for the founder to learn what users actually do.

P1 has three parallel tracks:

1. **Product/engineering track** — close P0/P1 documentation gaps, tighten telemetry, quote quality learning, delivery trust, reuse polish, support intake, and launch QA.
2. **Founder/GTM track** — define the first customer segment, create outreach/demo/support materials, and run founder-led pilot validation without relying on Reddit.
3. **Strategic learning track** — collect evidence that decides whether P2 should prioritize memory, clarification, options, margins, photos, or another differentiator.

---

## 1. Fresh review findings and planning constraints

These findings update the earlier P1 draft and should be treated as constraints for child tasks.

### Finding A — P0 implementation is closed; QA evidence must be reconciled/finalized

GitHub Issue #549 is closed as completed. P1 should not reopen P0 implementation unless a real blocking defect is discovered.

The P0 QA artifact path from Spec 8 is:

```text
docs/qa/P0_FIELD_RESILIENT_CAPTURE_QA.md
```

A review pass reported that this file exists on `main` but still needs operator-run real-device sections completed. Another repo check did not surface the file at that path. **Gate 0 must therefore verify the actual repo state first:**

- if the file exists, finalize/update the operator execution log and physical-device results;
- if the file is absent, create it using the Spec 8 QA evidence and document any limitations;
- do not claim P0 QA is complete without a committed artifact or explicit documented evidence location.

### Finding B — product docs still need active-direction cleanup

`docs/PRODUCT.md` and `docs/README.md` should be updated once P1 is accepted:

- P0 should be marked complete, not active.
- P1 should become the active roadmap/spec.
- The P0 roadmap should remain linked as completed historical/current context.
- V1 wording should not simultaneously say “complete” and “partially shipped.”

### Finding C — reuse/catalog work already exists

The repo already contains:

- line-item catalog backend routes/service/model/repository;
- line-item catalog frontend service/types/settings screen;
- line-item catalog insertion from the line-item sheet;
- quote reuse chooser;
- quote duplicate endpoint and frontend service;
- quote reuse-candidate endpoint with line-item previews.

Therefore P1 must **audit and polish existing reuse flows**, not create a second line-item catalog, second quote reuse flow, or standalone quote-template model.

### Finding D — telemetry has a known event persistence gap

`event_logger._PILOT_EVENT_NAMES` has known emitted-but-not-persisted pilot event gaps, and issue #327 already tracks that class of problem. P1 telemetry must start with an event vocabulary audit and persistence reconciliation before adding new events or new analytics surfaces.

### Finding E — support/feedback intake appears absent or underdeveloped

The Settings surface currently focuses on profile/logo/theme/catalog/account. P1 should add a lightweight support/feedback path, but should default to the smallest useful mechanism first.

No admin ticket dashboard or ticket management UI belongs in P1.

### Finding F — design adoption closeout is a pilot-readiness dependency

The open design adoption umbrella (#485) has remaining closeout/regression/doc tasks, including PR-S audit closeout (#544), PR-DOC UI system documentation (#519), and PR-G regression pass (#520). P1’s thesis requires Stima to be polished enough to show customers.

Design adoption may run in parallel with P1 Specs 1–6, but broad pilot outreach and Spec 8 Pilot QA should not start until:

- PR-S audit closeout is complete or explicitly scoped/closed;
- PR-G regression pass is complete or all blocking findings are resolved;
- PR-DOC is complete or explicitly deferred with a reason that does not affect pilot-facing polish.

### Finding G — P2 should be data-informed, not guessed

Differentiated-feature research suggests the biggest possible product bets are:

1. customer-memory repeat quotes;
2. missing-info clarification before draft creation;
3. interactive good/better/best option quotes;
4. margin guardrails with a cost-aware catalog;
5. photo-assisted scope capture.

P1 should collect pilot evidence for these bets without implementing all of them.

---

## 2. P1 complete definition

P1 is complete when:

1. Product docs clearly mark P0 complete and P1 active.
2. The P0 QA artifact is committed and honest about automated/manual/device coverage, or the repo clearly documents where final P0 QA evidence lives.
3. `docs/PRODUCT.md` has no contradictory version-status language for V1/P0/P1.
4. A new solo landscaping user can understand Stima’s value from the landing/onboarding flow without a founder demo.
5. The user can create a quote from rough notes, recover if interrupted, refine it quickly, and share/send it professionally.
6. Existing quote reuse and line-item catalog flows are verified, polished, and not duplicative.
7. The app records enough privacy-safe product events to show the founder the core pilot funnel:
   - capture/quote creation started;
   - draft generated;
   - draft edited/saved;
   - quote shared/sent;
   - quote viewed;
   - quote marked won/lost;
   - converted to invoice;
   - major extraction/recovery/delivery failures.
8. The app records enough privacy-safe product signals to evaluate the major P2 bets:
   - repeat/reuse attempts and accept/reject behavior;
   - heavy edit-after-generation patterns;
   - quote-quality feedback categories;
   - public quote engagement and option/upsell interest;
   - catalog usage and pricing/margin pain points;
   - photo/scope-description requests from users.
9. The user has an obvious way to report friction, bugs, or quote-quality issues.
10. The founder has a practical non-Reddit pilot plan: ICP, outreach scripts, demo flow, feedback questions, and success criteria.
11. Design adoption closeout/regression is complete enough that the app is visually coherent for pilot users.
12. P1 does not introduce scheduling, dispatch, payments, marketplace features, team accounts, native app work, customer notes/history beyond basic contact info, pipeline stages beyond won/lost, activity timelines, or full P2 feature builds.

---

## 3. Product positioning for P1

### Primary ICP

Solo landscaper / small landscaping crew owner in the 1–5 person range who:

- quotes from phone notes, texts, memory, or handwritten paper;
- repeats similar jobs often;
- wants professional output but does not want Jobber/ServiceM8-level complexity;
- values speed more than configurable estimating systems;
- is comfortable approving AI-assisted drafts but does not want AI to send anything automatically.

### P1 promise

> Speak or type messy job notes, recover them even with bad signal, quickly reuse past work, and send a professional quote from your phone.

### P1 wedge

**Pilot-ready field quoting for landscaping.**

Do not try to serve every trade equally in P1. Landscaping gives Stima the best first vertical because job language is repeatable and line items are clear enough for extraction and reuse.

### P1 relationship to P2

P1 should prove whether users actually need:

- better memory of prior work;
- smarter clarification before AI drafts;
- quote options/add-ons;
- margin/cost guardrails;
- photo-assisted scope capture.

P1 should not build all of these. It should collect enough evidence to decide which one becomes the first major P2 bet.

---

## 4. Strategic learning targets for P2

P1 should explicitly answer the following questions.

### Learning target A — customer-memory repeat quoting

**Question:** Do pilot users repeatedly quote similar jobs for the same customers or same job categories?

**Evidence to collect:**

- how often users use existing quote duplication;
- how often users use line-item catalog insertion;
- whether pilot interviews mention seasonal/repeat jobs;
- whether users ask for “same as last time” behavior;
- whether creating from existing quote reduces time-to-send.

**Promote to P2 if:** repeat jobs are common and users still spend significant time finding/copying/editing past quotes.

### Learning target B — missing-info clarification

**Question:** Do AI drafts fail because Stima guesses when it should ask for missing quantity/material/scope details?

**Evidence to collect:**

- post-generation edit counts or heavy edit sessions;
- user quote-quality feedback like “missing quantity,” “wrong material,” “too vague,” or “bad price”;
- repeated empty/low-confidence line-item fields;
- pilot interview answers about what users wish Stima asked before drafting.

**Promote to P2 if:** edit-after-generation and quality feedback consistently point to preventable missing information.

### Learning target C — interactive option quotes

**Question:** Would quote options improve win rate or average quote value for solo landscapers?

**Evidence to collect:**

- pilot interview answers about good/better/best packages;
- examples of users manually adding optional line items or alternate scopes;
- customer-facing feedback asking for options or changes;
- quote outcomes where the user says price/scope was the blocker.

**Promote to P2 if:** users regularly want to offer optional add-ons, tiered scopes, or customer-selectable packages.

### Learning target D — margin guardrails

**Question:** Are users worried about protecting profit, or are they still focused mainly on faster quote creation?

**Evidence to collect:**

- requests for cost fields, markups, or material tracking;
- catalog usage patterns;
- pilot interview answers about how they currently price jobs;
- won/lost reasons tied to price;
- manual edits that repeatedly adjust line-item prices after AI draft creation.

**Promote to P2 if:** users trust Stima enough to draft quotes but need help not undercharging.

### Learning target E — photo-assisted scope capture

**Question:** Do users naturally want to attach/annotate photos to describe scope, or is voice/text enough for the first vertical?

**Evidence to collect:**

- support/pilot feedback asking to add photos;
- user workarounds like sending screenshots or texting photos separately;
- job categories where visual context is repeatedly mentioned;
- founder notes from demos where users say “I’d need to show the yard/bed/damage.”

**Promote to P2 only after:** memory/clarification evidence is reviewed, because photo scope is higher complexity.

---

## 5. Decision locks

These decisions should not be reopened by child tasks without an explicit product decision and doc update.

1. **P1 is pilot-readiness, not broad V2/P2 expansion.** Feature work must improve pilot trust, pilot learning, time-to-send, or repeat quoting.
2. **Landscaping is the first vertical.** Other trades can remain supported generally, but GTM copy, examples, and validation should focus on landscaping first.
3. **No new standalone quote-template model in P1.** Existing-quote duplication and line-item catalog reuse are the reuse model unless pilot evidence proves they are insufficient.
4. **Do not rebuild shipped reuse/catalog flows.** Audit and polish existing quote reuse, duplicate, catalog insert, save-to-catalog, and catalog settings flows.
5. **Do not implement full smart customer memory in P1.** P1 may improve current reuse surfaces and measure usage; P2 owns memory-as-differentiator work.
6. **Do not implement a full clarification loop in P1.** P1 may collect quote-quality feedback and classify edit patterns; P2 owns clarification-flow changes.
7. **Do not implement interactive customer option selection in P1.** P1 may polish delivery/public quote trust; P2 owns option-quote modeling and public selection.
8. **Do not implement cost/margin fields in P1 unless promoted by an explicit decision.** P1 may ask about pricing pain; P2 owns margin guardrails.
9. **Do not implement photo-assisted AI scope in P1.** P1 may collect demand signals; P2 owns media/photo strategy.
10. **No raw notes/audio in telemetry or feedback by default.** Event payloads may include IDs, statuses, failure categories, timestamps, and coarse metadata, but not full user capture content.
11. **Human approval remains the trust boundary.** AI drafts never send automatically.
12. **Feedback must be non-blocking.** Users can ignore quote-quality feedback prompts and still save/send normally.
13. **Support intake starts simple.** A `mailto:` or minimal form is acceptable; do not build a large support platform in P1. No admin ticket dashboard or ticket management UI in P1; founder triage happens via email/docs/SQL.
14. **No billing/payments in P1.** Billing and pricing tiers remain V3/commercial-launch scope.
15. **No scheduling/dispatch/team/marketplace work in P1.** These would undermine the focused product angle.
16. **P0 local recovery remains single-device.** P1 must not imply real-time cross-device sync or collaborative editing.
17. **Founder GTM docs are deliverables.** The founder track is not optional polish; P1 is not complete without outreach/demo/interview/support process docs.
18. **Design adoption closeout gates broad pilot QA/outreach.** PR-S audit closeout and PR-G regression must complete before Spec 8 Pilot QA and broad external outreach. PR-DOC must complete or be explicitly deferred with no pilot-facing risk.
19. **No general-purpose client analytics SDK in P1.** Use existing backend events and/or the smallest authenticated pilot event endpoint only if a required signal cannot be observed server-side.
20. **Do not promise P2 features in pilot materials.** Demos and landing copy must describe what exists today, not future memory/options/margins/photos.
21. **Production safety is a P1 release gate.** Before real pilot users or broad outreach, Stima must pass a focused security/LLM-safety remediation pass covering sensitive logging, production configuration, auth/tenant isolation, upload/audio/PDF/public-share surfaces, and extraction prompt/output safety.
22. **Architecture-modularity findings are handled as a parallel maintainability/discoverability track under Spec 7.** They do not block P1 unless the audit identifies a concrete pilot-safety, data-leakage, release-blocking, or user-facing reliability issue.

---

## 6. Non-goals

P1 explicitly does **not** include:

- payment processing;
- scheduling/calendar/dispatch;
- team roles/crew management;
- marketplace/lead generation;
- full CRM pipeline;
- customer notes/history beyond basic contact info;
- pipeline stages beyond won/lost;
- activity timelines;
- multi-device real-time sync;
- collaborative editing;
- native app rewrite;
- app store packaging;
- offline AI transcription/extraction;
- offline AI draft generation / local LLM inference;
- standalone quote templates unless a later decision record documents strong pilot evidence;
- full smart customer memory;
- full AI clarification loop;
- customer-selectable quote options;
- margin/cost accounting system;
- photo-assisted AI estimating;
- broad multi-trade optimization before landscaping works;
- remote analytics SDK by default;
- admin ticket dashboard or ticket-management system;
- storing raw notes, audio content, or full transcripts in product event payloads.

---

## 7. P1 tracks and child specs

| # | Spec | Track | Purpose |
|---|---|---|---|
| Gate 0 | P0 Evidence & Product Docs Closeout | docs/QA | Finish the P0 paper trail and update active direction before pilot work |
| 1 | Product Telemetry & Pilot Funnel Events | backend/frontend/docs | Let founder see real funnel behavior and failure points |
| 2 | Quote Quality Feedback Loop | frontend/backend/support | Capture quote-quality signals without slowing the quote flow |
| 3 | Review & Delivery Trust Polish | frontend/backend/PDF | Make review, public quote, PDF, share/send, and invoice handoff pilot-ready |
| 3A | Structured Business & Customer Contact Info | backend/frontend/PDF | Add structured address/phone fields for professional PDF and settings output (child of Spec 3) |
| 4 | Repeat Quote Speed Audit & Reuse Polish | frontend/backend | Verify and polish existing quote reuse + line-item catalog flows |
| 5 | Founder GTM Pilot Kit | docs/frontend optional | ICP, outreach assets, landing/onboarding copy, demo script, feedback loop |
| 6 | Support & Feedback Intake | frontend/backend/docs | Give users a simple way to report issues/friction |
| 7 | Maintenance & Design Closeout Parallel Track | backend/frontend/docs | Close open reliability/design/test work without derailing product learning |
| 8 | P1 Pilot QA & Launch Readiness | QA/docs | End-to-end pilot release checklist and known-limitations doc |
| 9 | Production Security & LLM Safety Gate | backend/frontend/infra/docs | Final pre-pilot gate: prove Stima is safe enough for real pilot users and real customer/job data |
| 9A | Lightweight Production Observability & Security Alerting | backend/infra/docs | Production logging runbook, targeted Sentry alerts, suspicious-path detection (child of Spec 9) |

---

## 8. Recommended implementation order

1. **Gate 0 — P0 Evidence & Product Docs Closeout**
2. **Spec 1 — Product Telemetry & Pilot Funnel Events**
3. **Spec 9 PR 1 — Production Security & LLM Safety Inventory** should begin early so blocker classification informs later specs.
4. **Spec 5 — Founder GTM Pilot Kit** can start in parallel after Gate 0, because it is mostly docs.
5. **Spec 6 — Support & Feedback Intake** should land before or alongside any real pilot outreach.
6. **Spec 2 — Quote Quality Feedback Loop** should land after telemetry/event vocabulary is stable. Spec 6 may precede Spec 2 if the first quote-quality feedback path is a general support/feedback mechanism.
7. **Spec 3 — Review & Delivery Trust Polish** can be sliced into audit-first tasks while Spec 2 is underway. **Spec 3A** (structured contact info) can run as a child implementation task once the Spec 3 audit confirms the gap.
8. **Spec 4 — Repeat Quote Speed Audit & Reuse Polish** should begin with an audit task, because much of the infrastructure already exists.
9. **Spec 7 — Maintenance & Design Closeout Parallel Track** runs in parallel with strict scope limits, including architecture-discoverability planning.
10. **Spec 9 blocker fixes** complete before Spec 8 begins.
11. **Spec 9A — Production Observability & Security Alerting** runs in parallel after Spec 9 PR 1 (security inventory). Adds logging runbook, Sentry alerts, and suspicious-path detection.
12. **Spec 8 — P1 Pilot QA & Launch Readiness** closes the umbrella and depends on design closeout/regression gates and Spec 9 completion.

---

# Gate 0 — P0 Evidence & Product Docs Closeout

## Goal

Finish the P0 closure paper trail and make repo docs point to P1 as the active direction.

## Scope

- Verify whether `docs/qa/P0_FIELD_RESILIENT_CAPTURE_QA.md` exists on `main`.
  - If it exists, finalize/update the operator-run real-device sections and any known limitations.
  - If it is absent, create it from Spec 8 evidence and document what was/was not tested.
- Record the P0 tested state honestly:
  - automated coverage;
  - real-device checks completed;
  - desktop/emulator-only limitations;
  - known limitations before P1.
- Update `docs/PRODUCT.md`:
  - mark P0 complete;
  - add P1 as active;
  - keep V2 as later/deferred after pilot learning unless the P1 review chooses different wording;
  - clean up V1 wording so it does not simultaneously say V1 is complete and partially shipped.
- Update `docs/README.md`:
  - active direction should point to `PRODUCT.md` plus the new P1 umbrella/roadmap once created;
  - P0 roadmap should move to completed historical/current context, not active direction.
- Add the P1 umbrella spec to a stable repo path, recommended:

```text
docs/roadmaps/P1_PILOT_READY_PRODUCT_GTM.md
```

## Non-goals

- Reopening P0 implementation.
- Adding new offline/PWA features.
- Rewriting old archived roadmaps.

## Acceptance criteria

- `docs/qa/P0_FIELD_RESILIENT_CAPTURE_QA.md` exists and has completed or explicitly limited operator/device sections, or docs clearly link to the actual P0 QA evidence.
- `docs/PRODUCT.md` no longer describes P0 as active once P1 is accepted.
- `docs/PRODUCT.md` has no contradictory version status language for V1/P0/P1.
- `docs/README.md` points active direction to P1 once the P1 umbrella is committed.
- P0 known limitations are recorded honestly.
- No implementation code changes unless a real P0-blocking defect is discovered.

---

# Spec 1 — Product Telemetry & Pilot Funnel Events

## Goal

Give the founder enough privacy-safe visibility to evaluate whether Stima is actually useful in pilot use.

## Why first

A pilot without telemetry becomes anecdotal. P1 should not add many features before the app can answer:

- Are users creating/capturing quotes?
- Are drafts being generated?
- Are they editing heavily?
- Are they sending/share-linking?
- Are quotes being viewed/approved/lost?
- Where are failures happening?

## Scope

### PR 1 — Telemetry architecture decision and event vocabulary audit

Before adding new frontend-originated events, decide whether P1 telemetry uses:

1. existing backend `log_event` callsites only;
2. a minimal authenticated pilot-event endpoint;
3. admin SQL/query workflow only;
4. a later remote analytics tool.

Default: prefer existing backend events plus the smallest authenticated pilot event endpoint only if a needed P1 signal cannot be observed server-side.

Then:

- Audit all `log_event(...)` callsites and compare them against `_PILOT_EVENT_NAMES`.
- Resolve known persistence gaps, including issue #327 if still open.
- Produce a small event vocabulary table in docs or the PR body:
  - event name;
  - callsite;
  - persisted?;
  - payload fields;
  - PII/privacy risk;
  - pilot funnel stage.
- Do not rename existing events casually. If renaming or normalizing event names, include compatibility/testing notes.

### PR 2 — Minimum pilot funnel events

Ensure the persisted event set can answer the pilot funnel:

- quote/capture started or manual draft created;
- draft generated;
- draft generation failed;
- quote shared;
- email sent or email job accepted/failure;
- quote viewed;
- quote marked won/lost;
- invoice created / quote converted to invoice;
- invoice viewed if already part of the public/customer flow;
- important recovery/delivery failures if they can be logged without raw content.

Recovery events should be coarse and privacy-safe. Do not persist raw local notes, audio, transcript text, or customer message content.

### PR 3 — Founder visibility

Choose the smallest useful founder visibility path:

- existing admin events route/view if already present;
- a minimal internal/pilot-only route;
- or a documented SQL/query workflow if no UI is worth building yet.

Prioritize simple counts and recent failures over dashboards.

## Non-goals

- Remote analytics SDK unless explicitly chosen later.
- Behavioral ad tracking.
- Session replay.
- Storing raw capture notes, audio, transcripts, or full customer messages in events.
- Full analytics dashboard.

## Acceptance criteria

- Telemetry architecture decision is documented before new client-originated events are added.
- Event vocabulary audit exists and maps callsites to persisted events.
- Known pilot event persistence gaps are fixed or explicitly deferred with rationale.
- Funnel events are persisted for the main quote lifecycle.
- No raw capture notes/audio/transcripts are stored in event payloads.
- Founder can answer: started/generated/sent/shared/viewed/won/lost/invoiced.
- Recovery/delivery failure events are visible enough to debug pilot problems.
- `make backend-verify` passes.
- `make frontend-verify` passes if frontend code is touched.

## Candidate existing issue alignment

- Issue #327 — pilot event persistence gap. Include in Spec 1 unless already resolved.

---

# Spec 2 — Quote Quality Feedback Loop

## Goal

Turn user corrections into product learning without making the quote workflow heavier.

## Why P1

Stima’s value is not “AI exists”; it is “that draft is basically right.” The founder needs a way to learn where extraction fails in the real world.

## Scope

### PR 1 — Product decision and data shape

Before building UI, decide and document:

- whether feedback appears in review/edit, after draft generation, or via support intake first;
- whether feedback is persisted in-app or initially routed through support intake;
- what fields are stored;
- what is explicitly not stored.

Default first implementation may be support-routed feedback rather than persisted in-app feedback. Persisted quote-quality feedback requires an explicit decision that the added model/API/admin review path is worth the complexity before pilot launch.

Recommended data shape if persisted:

```ts
type QuoteQualityFeedbackRating = "good" | "needed_fixes";

type QuoteQualityFeedbackReason =
  | "missed_item"
  | "wrong_price"
  | "bad_grouping"
  | "wrong_details"
  | "customer_or_title_issue"
  | "other";
```

### PR 2 — Lightweight UI, if selected

- Add a small post-extraction feedback affordance in review/edit or after draft generation:
  - “Draft looked good”
  - “Needed fixes”
  - optional reason chips.
- Feedback must be dismissible/non-blocking.
- Do not show a permanent large section on every review screen.
- Do not block Save Draft, Continue, Share, or Send.

### PR 3 — Persistence / founder review, if selected

If implemented in-app:

- Persist structured feedback linked to user and quote/draft.
- Optional freeform comment only if intentionally entered.
- No audio upload.
- No automatic raw notes/transcript inclusion.
- Provide founder review path through admin route/query/docs.

## Non-goals

- Automatic prompt updates.
- Model retraining.
- Auto-correcting existing drafts from feedback.
- Requiring feedback before send/save.
- Storing raw notes/audio/transcripts.

## Acceptance criteria

- Product decision says whether P1 feedback is support-routed or persisted in-app.
- User can submit quick quote-quality feedback in under 10 seconds if UI is implemented.
- Feedback is associated with the relevant quote/draft if persisted.
- Feedback never blocks saving/sending.
- Founder can review feedback from pilot users or has a documented manual process.
- Tests cover submit success/failure and non-blocking behavior if code is added.
- Stored payload is intentionally limited and privacy-safe.

---

# Spec 3 — Review & Delivery Trust Polish

## Goal

Make the quote review, public quote, PDF, share/send, and invoice handoff feel professional enough for pilot users to send to real customers.

## Why P1

P0 made work resilient. P1 needs the output to feel safe to send.

## Scope

### PR 1 — Audit and task split

Start with an audit, not a giant polish PR. Review:

- Review/edit warning copy and Capture Details behavior.
- Preview CTA hierarchy.
- Share/copy/email failure paths.
- Public quote mobile presentation.
- PDF visual output.
- Quote-to-invoice handoff.

Produce child tasks for only the gaps that materially affect pilot trust.

Audit issue #478 as historical context only:

- Issue #478 — V2.1 follow-up around review warnings and Capture Details is closed.
- Treat it as historical context if the audit surfaces related gaps.
- Do not implement #478 blindly or treat it as active scope.

### Review/edit

- Ensure warnings are helpful but not noisy.
- Keep user in control: no auto-send, no hidden AI mutation.
- Do not expand Capture Details unless audit shows it materially improves pilot trust.

### Preview/share/send

- Audit Preview page CTA hierarchy:
  - edit remains obvious;
  - send/share/copy link are clear;
  - convert-to-invoice does not dominate before quote is won.
- Ensure Copy Link remains available when email fails.
- Confirm quote status changes are understandable.

### PDF

Run a narrow visual polish pass only if audit confirms value:

- logo sizing;
- business/customer address formatting;
- prepared-by/signature line only if product-reviewed;
- totals/line-item spacing;
- consistency between public quote, app preview, and PDF.

## Non-goals

- Large visual redesign.
- New quote/invoice business workflows.
- Payment collection.
- Replacing the existing PDF generation architecture.
- Changing extraction model behavior.

## Acceptance criteria

- Audit produces explicit child tasks or explicit “no change needed” notes.
- Closed issue #478 is referenced only as historical context.
- A pilot user can confidently send the generated quote without explanation.
- Preview/public/PDF share a consistent professional hierarchy.
- Copy Link remains available and obvious.
- Email failure does not strand the user.
- Changed PDF templates have appropriate rendering/snapshot/regression coverage.
- `make frontend-verify` passes.
- Relevant backend/PDF tests pass if backend/PDF code changes.

---

# Spec 4 — Repeat Quote Speed Audit & Reuse Polish

## Goal

Make repeat quoting noticeably faster without adding a second quote-builder workflow.

## Why P1

After a user trusts capture, the next strongest value lever is repeat work. Landscaping users quote recurring/near-recurring services constantly.

## Current repo-grounded state

The codebase already has significant reuse/catalog pieces:

- line-item catalog backend API/service/model/repository;
- line-item catalog frontend service/types/settings screen;
- catalog tab insertion in the line-item sheet;
- quote duplicate endpoint and frontend service;
- quote reuse-candidate endpoint with line-item previews;
- quote reuse chooser UI.

P1 should **verify, test, and polish** these flows. It should not create new template infrastructure.

## Scope

### PR 1 — Reuse inventory and behavior audit

List all existing reuse surfaces and verify behavior:

- Quote Create entry sheet;
- Quote Reuse chooser;
- duplicate quote endpoint/service;
- line-item catalog insert tab;
- save-to-catalog action;
- Settings → Line Item Catalog;
- customer-level create-document entry point.

Confirm actual behavior against desired semantics:

- duplicate keeps customer/title/line items/pricing;
- duplicate drops status/share/PDF/invoice/outcome/extraction metadata;
- catalog item inserts into local review draft, not immediate backend document save;
- no standalone template model exists or is introduced.

### PR 2 — Flow polish from audit

Only after the audit, fix high-value friction:

- empty states;
- loading/error copy;
- chooser context;
- mobile tap targets;
- duplicate failure copy;
- settings catalog discoverability;
- customer-scoped reuse behavior.

### PR 3 — Test coverage hardening

Add/strengthen tests for:

- duplicate quote semantics;
- reuse candidate line-item preview cap;
- quote reuse chooser search/customer scope;
- line-item catalog insert into local draft;
- save-to-catalog behavior;
- catalog settings CRUD/user scoping.

## Non-goals

- Standalone quote templates.
- Template management UI.
- New quote-builder workflow.
- Quantity/unit/rate estimating system.
- Catalog categories/tags/usage-ranking unless audit proves needed.
- N+1 detail fetching from the frontend.

## Acceptance criteria

- Audit documents shipped reuse/catalog surfaces and gaps.
- User can create from an existing quote from home and customer context.
- User can insert a saved catalog item into a draft with minimal taps.
- User can understand empty states without documentation.
- Duplicate quote semantics are covered by backend tests.
- Catalog insert/save behavior is covered by frontend tests.
- No standalone quote-template infrastructure is added.
- Reuse improves speed without adding clutter to the main review screen.

---

# Spec 5 — Founder GTM Pilot Kit

## Goal

Give the solo founder a concrete, repeatable way to recruit and onboard the first pilot users without Reddit.

## Why P1

A technically viable product still fails if nobody tries it. P1 should produce the assets and process for direct validation.

## Scope

Create:

```text
docs/founder/PILOT_GTM_PLAN.md
docs/founder/ICP_LANDSCAPING.md
docs/founder/OUTREACH_SCRIPTS.md
docs/founder/USER_INTERVIEW_SCRIPT.md
docs/founder/PILOT_SUCCESS_CRITERIA.md
```

### PR 1 — Founder docs

Recommended contents:

- ICP definition and disqualification criteria.
- Outreach channels:
  - personal/local landscaping contacts;
  - Google Maps local business list;
  - Facebook business pages/direct messages;
  - local chamber/small business groups;
  - supplier/nursery/lawn-care shop bulletin boards;
  - LinkedIn local owner search;
  - direct email/contact forms from company websites;
  - in-person conversations with known local contractors.
- No Reddit dependency.
- Outreach scripts:
  - short DM;
  - email;
  - follow-up;
  - in-person demo opener.
- Pilot offer:
  - free during pilot;
  - founder support;
  - no credit card;
  - grandfathered Pro later if adopted pre-launch.
- Interview script:
  - current quoting workflow;
  - recent quote example;
  - what they hate typing;
  - how they send quotes today;
  - what would make them stop using it;
  - willingness to use on next real quote.
- Success criteria:
  - 5–10 target conversations;
  - 3 activated users;
  - 10 real quotes generated;
  - 3 quotes actually sent to customers;
  - at least 1 repeat-use session;
  - qualitative “I would use this again” signal.

### PR 2 — Pilot landing/onboarding message audit

Audit landing page, onboarding, and first-run copy against the P1 promise.

Make sure a solo landscaper understands:

- what Stima does;
- that AI drafts require user approval;
- that quote capture works even when field conditions are messy;
- that Stima is lightweight and not a full field-service platform;
- how to start a first quote quickly.

Update copy only where it is currently misleading, generic, or missing the pilot promise.

Optional frontend:

- Add a simple “Request pilot access” CTA if useful.
- Do not build marketing automation.

### Founder demo do-not-promise list

Do not promise:

- automatic pricing accuracy;
- customer-selectable good/better/best options;
- photo-based estimating;
- profit/margin tracking;
- full CRM;
- scheduling/dispatch;
- payments;
- multi-device offline sync;
- app-store native app;
- AI sending quotes without review.

## Non-goals

- Paid ads.
- Reddit launch/dependence.
- Full marketing site rebuild.
- CRM automation.
- Waitlist platform integration unless manually justified.

## Acceptance criteria

- Founder can start outreach immediately using repo docs.
- ICP and disqualification criteria are explicit.
- Pilot offer is clear and simple.
- User interview questions are non-leading.
- No Reddit channel is used as the primary plan.
- Landing/onboarding copy communicates the pilot promise without overpromising P2 features.
- Docs include a do-not-promise list for founder demos.

---

# Spec 6 — Support & Feedback Intake

## Goal

Give pilot users a low-friction way to report friction, bugs, or quote-quality problems.

## Scope

### PR 1 — Support path decision

Choose the minimum useful support path:

- `mailto:` link with subject/body template;
- simple feedback form;
- or persisted in-app feedback if already justified by Spec 2.

Default recommendation for first pilot: **start with Settings support card + `mailto:`** unless there is a strong reason to persist support tickets in-app.

No admin ticket dashboard or ticket management UI in P1.

### PR 2 — In-app entry point

- Add “Need help?” or “Send feedback” entry point in Settings.
- Include app/version/context if available without exposing sensitive data.
- Keep copy simple and non-technical.
- Do not attach raw quote notes/audio/transcripts automatically.

### PR 3 — Support playbook

Create:

```text
docs/founder/SUPPORT_PLAYBOOK.md
```

Include:

- how to triage bugs;
- how to ask for reproduction steps;
- how to tag product feedback vs implementation bug;
- how to turn repeated feedback into GitHub issues;
- what not to ask users to send, such as raw audio unless explicitly needed;
- how to classify P2 learning signals.

Feedback categories should include:

- bug;
- confusing workflow;
- quote quality issue;
- missing feature request;
- repeat quote / memory request;
- pricing / margin concern;
- options / add-ons request;
- photo / scope capture request.

## Non-goals

- Heavy support platform integration.
- Automatic raw quote/note/audio attachment.
- User-to-user chat.
- Admin ticket dashboard.
- Ticket management workflow.

## Acceptance criteria

- Pilot user can report a problem from inside the app.
- Founder receives enough context to act.
- Feedback path does not leak sensitive quote content by default.
- No heavy support platform integration is required.
- No admin ticket dashboard or ticket management UI is added.
- Support playbook exists.
- Feedback categories capture P2 learning signals.
- Tests cover form validation if an in-app form is implemented.

---

# Spec 7 — Maintenance & Design Closeout Parallel Track

## Goal

Close known maintainability, visual polish, and reliability issues that improve pilot confidence without letting broad refactors derail product learning.

## Candidate tasks

- Issue #392 — migrate icon ligatures to Lucide SVGs to remove first-load icon text flash.
- Issue #325 — refactor document editor orchestration into focused hooks.
- Issue #327 — pilot event persistence gap, if not handled in Spec 1.
- Issue #368 — backend test-suite organization.
- Issue #485 — design adoption umbrella.
- Issue #544 — PR-S audit closeout sweep.
- Issue #519 — PR-DOC UI system documentation.
- Issue #520 — PR-G design adoption regression pass.
- Stale closed-spec docs, if any, that confuse active direction.

## Rules

- Run this track in parallel.
- Do not let broad refactors block learning-oriented P1 specs unless they affect pilot-facing polish or core pilot flows.
- Prefer small, behavior-preserving PRs.
- Each tech-debt task must name the user/founder risk it reduces.
- Do not mix tech-debt refactors with product-facing P1 feature work.
- A maintenance issue is P1-blocking only if it directly affects pilot use of:
  - capture;
  - review/edit;
  - share/send;
  - public quote;
  - invoice handoff;
  - support/feedback;
  - visual polish necessary for first external users.

## Design adoption dependency rule

Design adoption closeout is not required before Specs 1–6 begin.

However:

- PR-S audit closeout and PR-G regression pass must complete before Spec 8 Pilot QA begins.
- Broad pilot outreach must not begin until PR-S and PR-G are complete or all blocking findings are resolved.
- PR-DOC should complete before P1 close, or be explicitly deferred with a reason that does not affect pilot-facing consistency.

## Acceptance criteria

- No known open issue directly undermines pilot use of capture → review → send/share → public quote → invoice handoff → support/feedback.
- Design adoption audit/regression blockers are resolved before Spec 8 Pilot QA.
- Broad refactors are sliced into small PRs.
- Maintenance PRs preserve behavior and include targeted verification.
- Any deferrals are documented with reason and pilot risk.

---

# Spec 8 — P1 Pilot QA & Launch Readiness

## Goal

Prove P1 is ready to place in front of first external pilot users.

## Scope

Create:

```text
docs/qa/P1_PILOT_READINESS_QA.md
```

QA matrix:

- new user signup/onboarding;
- first quote from text notes;
- first quote from voice notes;
- offline/recovery smoke from P0;
- quote reuse from existing quote;
- line-item catalog insert;
- PDF/share/copy link/email path;
- public quote page mobile view;
- quote marked won/lost;
- convert to invoice;
- feedback/support submission;
- founder telemetry event visibility;
- design adoption regression blockers closed.

Pilot readiness checklist:

- demo account or seed data plan;
- known limitations;
- support contact;
- privacy/security notes;
- do-not-promise list for founder demos;
- rollback/fix process;
- pilot outreach readiness;
- evidence review for P2 bet selection.

## Dependencies

Do not begin Spec 8 until:

- Gate 0 is complete;
- Spec 1 founder visibility path is usable;
- Spec 6 support path is usable;
- PR-S design audit closeout is complete or all blockers are resolved;
- PR-G design regression pass is complete or all blockers are resolved.

## Non-goals

- Automated E2E suite unless separately scoped.
- Fixing every non-blocking cosmetic issue.
- Reopening P0 architecture.
- Starting broad outreach before support/telemetry/design gates are ready.

## Acceptance criteria

- QA doc exists and is linked from `docs/README.md` or relevant roadmap.
- Pilot flow passes on at least one mobile device and one desktop browser.
- Known limitations are documented honestly.
- Founder can demo Stima in under 5 minutes.
- Founder can onboard a pilot user without editing the database manually.
- Telemetry/founder visibility path is verified with at least one test event or seeded event.
- Support/feedback path is verified.
- Design adoption regression blockers are closed or explicitly documented as non-blocking.
- The team/founder has a written decision on which P2 bet is currently most supported by evidence, or a written decision to collect more pilot data before choosing.
- P1 umbrella can be closed with evidence, not just merged PRs.

---

## 9. Dependency gates

- Do not start broad pilot outreach until **Gate 0**, **Spec 1**, **Spec 6**, **Spec 9**, and required design adoption closeout/regression gates are complete enough to observe, support, and confidently show the app to users.
- Do not begin **Spec 8 Pilot QA** until PR-S audit closeout and PR-G regression pass are complete or all blockers are resolved.
- **Spec 9 must complete before Spec 8 can close and before real pilot users are invited, unless the founder explicitly documents accepted risk.**
- Do not close P1 while PR-DOC UI system documentation is unresolved unless it is explicitly deferred with no pilot-facing risk.
- Do not add new reuse models until **Spec 4 audit** proves existing quote reuse and catalog flows are insufficient.
- Do not implement billing/payment in P1.
- Do not add quote templates unless Spec 4 produces explicit evidence and a separate decision record.
- Do not treat feedback submission as permission to store raw notes/audio/transcripts automatically.
- Do not make large review/editor refactors in the same PR as delivery/public/PDF polish.
- Do not mix founder docs and product code in one PR unless the code change is a tiny landing/onboarding copy update.
- Do not close P1 without a QA/readiness artifact.
- Do not close P1 without the Production Security & LLM Safety Gate complete or any remaining risks explicitly documented and accepted before pilot outreach.

---

## 10. Suggested GitHub issue structure

Create one umbrella issue:

```text
Spec: Stima P1 Pilot-Ready Product & Founder GTM Program
```

Then create child issues:

```text
Task: P1 Gate 0 — P0 evidence and product docs closeout
Task: P1 Spec 1 — Product telemetry and pilot funnel events
Task: P1 Spec 2 — Quote quality feedback loop
Task: P1 Spec 3 — Review and delivery trust polish
Task: P1 Spec 3A — Structured business and customer contact info
Task: P1 Spec 4 — Repeat quote speed audit and reuse polish
Task: P1 Spec 5 — Founder GTM pilot kit
Task: P1 Spec 6 — Support and feedback intake
Task: P1 Spec 7 — Maintenance and design closeout parallel track
Task: P1 Spec 8 — Pilot QA and launch readiness
Task: P1 Spec 9 — Production security and LLM safety gate
Task: P1 Spec 9A — Lightweight production observability and security alerting
```

Use gated execution: PRs close child tasks, not the umbrella, unless the PR is an umbrella-doc-only PR.

---

## 11. Reviewer prompt

Use this when handing the umbrella spec to a reviewing agent:

```text
Review this P1 umbrella spec for Stima.

Focus on:
1. Whether P1 correctly follows the completed P0 field-resilient capture program without reopening P0 implementation work.
2. Whether Gate 0 correctly reconciles/finalizes the P0 QA artifact and updates docs that still mark P0 active.
3. Whether P1 aligns with Stima's positioning as a small, fast, focused mobile quoting tool for solo tradespeople.
4. Whether the child specs are scoped tightly enough for agent implementation.
5. Whether the founder/GTM track is realistic for a solo student founder and avoids Reddit dependence.
6. Whether telemetry/feedback work is privacy-safe and avoids storing raw notes/audio/transcripts unnecessarily.
7. Whether reuse work audits existing repo behavior instead of duplicating already-built catalog/reuse infrastructure.
8. Whether design adoption closeout is correctly gated before Spec 8 and broad pilot outreach.
9. Whether any currently open repo issues should be pulled into or excluded from P1.
10. Whether dependency gates and acceptance criteria are strong enough to prevent feature creep.
11. Whether the Production Security & LLM Safety Gate is correctly scoped as a pre-pilot blocker without turning P1 into an enterprise security program.
12. Whether architecture-modularity work is correctly treated as parallel planning under Spec 7 and does not block pilot outreach unless it uncovers a concrete P1 blocker.

Return APPROVED or ACTIONABLE with concrete changes.
```

---

## 12. Final recommendation

P1 should be **pilot-readiness**, not “V2 feature expansion.”

The next best product move is to get Stima in front of a small number of real landscaping users while the app is instrumented enough to learn from them. Build only what makes that pilot more trustworthy, faster, easier to support, easier to show, or easier to evaluate.
