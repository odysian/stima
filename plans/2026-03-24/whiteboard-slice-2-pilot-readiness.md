# Slice 2 Whiteboard: Pilot Readiness

## Goal

Turn the roadmap's unscoped Slice 2 items into a gated Spec plus PR-sized Task issues
that harden the quote flow for pilot use without expanding the product surface beyond
V0.

Parent reference:
- `docs/V0_ROADMAP.md` § Slice 2 — Pilot Readiness
- `docs/Stima_V0_Vertical_Slice_Spec.md` § Screen 6 and § Slice 2

---

## Current State Snapshot

The codebase is already partway into Slice 2:

- `CaptureScreen` already shows staged extraction copy:
  - `"Processing audio clips..."`
  - `"Extracting line items..."`
- `ReviewScreen` and `QuoteEditScreen` already show a basic null-pricing warning:
  - `"Some line items have no price — the quote will show \"TBD\" for those items."`
- `QuotePreview` already has load / PDF / share / delete error states.
- Backend event logging already exists, but it is structured stdout logging via
  `backend/app/shared/event_logger.py`, not the roadmap's `event_logs` table.

Because of that, Slice 2 should be treated as a hardening slice, not a greenfield one.

---

## Recommended Spec Shape

### Spec: Slice 2 Pilot Readiness

Why gated:
- The work spans multiple user-facing and backend-hardening threads
- The tasks are related under one pilot milestone but should still land in
  independently reviewable PRs
- Timezone accuracy and mobile QuotePreview fit the same pilot-readiness umbrella

Suggested labels:
- `type:spec`
- `area:quotes`
- `area:frontend`
- `area:backend`

---

## Recommended Task Split

### Task 8 — Error States + Long-Running Feedback

Why first:
- Highest pilot risk.
- Most visible quality gap.
- The roadmap explicitly calls this out as a before-pilot requirement.

Scope:
- Tighten staged loading copy for long-running extraction.
- Make failure states consistent across capture, draft extraction, PDF generation,
  and share/download paths.
- Keep this focused on UX and contract clarity, not new backend infrastructure.

Verification:
- `make frontend-verify`

Suggested labels:
- `type:task`
- `area:quotes`
- `area:frontend`

### Task 9 — Transcript Correction + Review Guardrails

Why second:
- Lives on the same review screen surface.
- Builds directly on the existing draft/edit flow.
- Pairs well with null-pricing and ambiguous-item guidance without introducing a
  new navigation surface.

Scope:
- Add an explicit transcript correction path on `ReviewScreen`.
- Allow the user to re-run extraction from edited transcript text on demand.
- Strengthen null-pricing / ambiguous-item callouts so the user understands what
  needs review before generating a quote.

Verification:
- `make frontend-verify`

Suggested labels:
- `type:task`
- `area:quotes`
- `area:frontend`

### Task 10 — Pilot Event Logging

Why third:
- Important for pilot learning, but not blocking the human-facing UX hardening.
- Safer to wire once the pilot-facing flows are stabilized.

Scope:
- Add the `event_logs` table.
- Persist the roadmap event set in the service layer.
- Keep writes fire-and-forget and non-blocking.
- Preserve current stdout logs if they remain useful for ops/debugging.

Verification:
- `make backend-verify`

Suggested labels:
- `type:task`
- `area:quotes`
- `area:backend`
- `area:database`

### Task 11 — Timezone-Accurate Quote Dates

Why here:
- This is a real quote-facing bug that already affects trust in generated documents
- It touches both frontend and PDF output but remains tightly scoped

Scope:
- Add business/user timezone to profile
- Default it from the browser and make it editable in Settings
- Use it for quote-facing dates in UI and PDF output

Verification:
- `make backend-verify`
- `make frontend-verify`

Suggested labels:
- `type:task`
- `area:quotes`
- `area:frontend`
- `area:backend`

### Task 12 — Mobile-First Quote Preview PDF Actions

Why here:
- The current QuotePreview hero is broken on the app's primary device class
- This is a pilot-blocking UX issue even though backend PDF generation already works

Scope:
- Replace the dead iframe-led layout with a status-and-actions-first mobile layout
- Promote `Open PDF` to a first-class action after PDF generation

Verification:
- `make frontend-verify`

Suggested labels:
- `type:task`
- `area:quotes`
- `area:frontend`

---

## Key Design Locks

### Transcript edits should re-run extraction only on explicit user action

Do not auto-regenerate line items while the user types. That would create jumpy UI,
destroy manual edits, and blur the source of truth.

Recommended interaction:
- Transcript is shown in a collapsed card as today.
- User taps `Edit Transcript Notes`.
- Transcript becomes editable.
- User can either:
  - save transcript edits without regenerating, or
  - tap `Regenerate From Transcript` to call the existing notes extraction path and
    replace the current draft line items / confidence notes / total.

This keeps the correction path powerful without making the screen unpredictable.

### Event logging should augment existing stdout logs, not replace them immediately

The repo already has `log_event(...)` and tests around structured stdout payloads.
The lowest-risk Slice 2 approach is to evolve that entrypoint into a small event sink
that:
- still emits structured logs for operators, and
- also writes pilot analytics rows to `event_logs`
- while swallowing persistence failures so the main quote flow never blocks

### "Speed improvements" should not be pre-scoped into a task yet

The spec mentions speed improvements in Slice 2, but the roadmap does not define a
contract for them. Treat speed work as a follow-up only after pilot instrumentation
and UX hardening make the real bottlenecks visible.

---

## Recommended Execution Order

1. Task 8 — Error States + Long-Running Feedback
2. Task 9 — Transcript Correction + Review Guardrails
3. Task 11 — Timezone-Accurate Quote Dates
4. Task 12 — Mobile-First Quote Preview PDF Actions
5. Task 10 — Pilot Event Logging

This keeps the first four Tasks focused on pilot-facing correctness and usability
before layering in DB-backed instrumentation.

---

## Issue Files

- `plans/2026-03-25/spec-slice-2-pilot-readiness.md`
- `plans/2026-03-24/task-slice-2-error-loading-feedback.md`
- `plans/2026-03-24/task-slice-2-transcript-guardrails.md`
- `plans/2026-03-24/task-slice-2-event-logging.md`
- `plans/2026-03-24/task-fix-timezone-accurate-quote-dates.md`
- `plans/2026-03-25/task-quote-preview-mobile-first-pdf-actions.md`

## Suggested `gh issue create` Commands

```bash
gh issue create --title "Spec: Slice 2 pilot readiness" --label "type:spec,area:quotes,area:frontend,area:backend" --body-file plans/2026-03-25/spec-slice-2-pilot-readiness.md
gh issue create --title "Task: Slice 2 error states and loading feedback" --label "type:task,area:quotes,area:frontend" --body-file plans/2026-03-24/task-slice-2-error-loading-feedback.md
gh issue create --title "Task: Slice 2 transcript correction and review guardrails" --label "type:task,area:quotes,area:frontend" --body-file plans/2026-03-24/task-slice-2-transcript-guardrails.md
gh issue create --title "Task: Slice 2 pilot event logging" --label "type:task,area:quotes,area:backend,area:database" --body-file plans/2026-03-24/task-slice-2-event-logging.md
gh issue create --title "Task: Slice 2 timezone-accurate quote dates" --label "type:task,area:quotes,area:frontend,area:backend" --body-file plans/2026-03-24/task-fix-timezone-accurate-quote-dates.md
gh issue create --title "Task: Slice 2 mobile-first quote preview PDF actions" --label "type:task,area:quotes,area:frontend" --body-file plans/2026-03-25/task-quote-preview-mobile-first-pdf-actions.md
```

## Created Issues

- Spec: Slice 2 pilot readiness (`#90`)
- Task 8: Slice 2 error states and loading feedback (`#94`)
- Task 9: Slice 2 transcript correction and review guardrails (`#91`)
- Task 10: Slice 2 pilot event logging (`#92`)
- Task 11: Slice 2 timezone-accurate quote dates (`#95`)
- Task 12: Slice 2 mobile-first quote preview PDF actions (`#93`)
