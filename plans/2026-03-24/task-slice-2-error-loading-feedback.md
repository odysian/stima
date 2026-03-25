# Task: Slice 2 Error States + Loading Feedback

Parent Spec: #90

## Goal

Harden the quote flow's long-running and failure states so pilot users always know
what the app is doing, what failed, and what they can do next. This task focuses on
user-facing feedback, not new backend infrastructure.

Parent references:
- `docs/V0_ROADMAP.md` § Slice 2 — Error states and loading feedback
- `docs/Stima_V0_Vertical_Slice_Spec.md` § Screen 6 and § Slice 2

---

## Problem Framing

### Goal

Improve the user experience around the slow and failure-prone parts of the flow:
- extraction from typed notes
- extraction from audio
- PDF generation
- share / download preparation

### Non-goals

- No async job queue
- No websocket / SSE progress streaming
- No provider or retry orchestration changes
- No analytics framework

### Constraints

- Preserve current API contracts unless a specific UX gap requires a small error
  message refinement.
- Stay within existing quote screens and shared feedback components.
- Long-running extraction remains synchronous in V0.

---

## Locked Design Decisions

### Stage copy is heuristic UI copy, not real backend progress

The current extraction pipeline is synchronous. Do not imply true backend progress
events. Stage text should be user-friendly and honest, for example:
- `Uploading audio...`
- `Transcribing audio...`
- `Extracting line items...`

The UI may advance stages by timer / request shape heuristics, but it must not claim
the server has emitted progress.

### Screen-level errors stay inline and actionable

Use `FeedbackMessage` close to the failing action. Do not introduce toast stacks,
browser alerts, or silent failures.

### Errors should preserve the user's in-progress work

If extraction fails, keep the typed notes and recorded clips on `CaptureScreen`.
If PDF generation fails, keep the quote detail and preview screen visible.
If share fails, keep the generated PDF / share link state intact when possible.

### One task, mostly frontend

Prefer frontend-only hardening. Backend work is allowed only if current server error
messages are too vague to support a clean user-facing state.

---

## Risks And Edge Cases

- Extraction can fail at multiple stages with different semantics:
  audio parse, transcription, extraction validation, empty input
- PDF generation errors should not leave the screen looking "stuck"
- Share cancellation via native share sheet should not surface as an error
- Audio-only, notes-only, and mixed input should all show sensible staged copy
- Loaders must clear correctly on both success and failure

---

## Scope

### Frontend

**`frontend/src/features/quotes/components/CaptureScreen.tsx`**
- Refine staged loading copy for:
  - notes-only extraction
  - audio-only extraction
  - mixed audio + notes extraction
- Ensure failure states for audio upload / extraction remain inline and preserve
  draft inputs
- Add any missing explanatory helper copy around long-running extract actions

**`frontend/src/features/quotes/components/QuotePreview.tsx`**
- Review PDF generation and share error states for consistency and recoverability
- Ensure loading, success, and error states do not fight each other
- Keep canceling native share as a non-error path

**Shared UI reuse**
- Reuse `FeedbackMessage`, `Button.isLoading`, and current tokenized design patterns
- Do not invent a second feedback system

### Tests

**`frontend/src/features/quotes/tests/CaptureScreen.test.tsx`**
- Lock staged loading copy behavior for notes-only and audio extraction flows
- Lock extraction failure behavior without clearing inputs
- Add an explicit audio-path staged copy test using recorded clips
- Add an explicit failure-preserves-inputs test that asserts:
  - typed notes remain in the textarea after rejection
  - recorded clips remain visible after rejection

**`frontend/src/features/quotes/tests/QuotePreview.test.tsx`**
- Lock PDF generation failure state
- Lock share failure state
- Lock non-error share cancel behavior if not already covered

### Optional backend touch only if needed

If a specific route returns an unusably generic `detail`, refine that message in the
existing service/API path. No contract expansion beyond clearer messages.

---

## Acceptance Criteria

- [ ] Notes-only extraction shows explicit in-flight feedback
- [ ] Audio extraction shows explicit staged in-flight feedback
- [ ] Mixed audio + notes extraction shows sensible staged in-flight feedback
- [ ] Extraction failures render inline and do not clear notes or recorded clips
- [ ] Tests explicitly cover the audio staged-copy path
- [ ] Tests explicitly cover notes/clips persistence after extraction failure
- [ ] PDF generation failures render inline on `QuotePreview`
- [ ] Share failures render inline on `QuotePreview`
- [ ] Native share cancel does not render as an error
- [ ] Loading states clear correctly on success and on failure
- [ ] No new feedback mechanism is introduced outside existing shared patterns
- [ ] `make frontend-verify` passes

## DoD Gate

A pilot user can wait through extraction, recover from a failed extract/PDF/share
attempt, and always understand the next action without losing in-progress work.

---

## Verification

```bash
make frontend-verify
```

Fallback:

```bash
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
