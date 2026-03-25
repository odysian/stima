# Task: Slice 2 Transcript Correction + Review Guardrails

Parent Spec: #90

## Goal

Strengthen the review screen so users can correct misunderstood input more directly
before generating a quote. This adds an explicit transcript correction path and
sharper guardrails around null pricing / ambiguous extracted items.

Parent references:
- `docs/V0_ROADMAP.md` § Slice 2 — Transcript visibility improvements / null pricing guardrails
- `docs/Stima_V0_Vertical_Slice_Spec.md` § Screen 6

---

## Problem Framing

### Goal

Make the review screen better at answering:
- "What did the system hear?"
- "What looks uncertain?"
- "What should I fix before generating this quote?"

### Non-goals

- No new quote status
- No autosave
- No live extraction while typing
- No reordering UI
- No new persisted draft model on the backend

### Constraints

- Reuse the existing draft/session-storage flow in `useQuoteDraft`
- Preserve manual line-item editing as the primary control surface
- Keep this primarily frontend-only by reusing the existing extraction endpoint(s)

---

## Locked Design Decisions

### Transcript editing is explicit, not always-on

Do not replace the current transcript card with a permanently open textarea.
Instead:
- keep the current transcript summary/card presentation
- add an `Edit Transcript Notes` action
- reveal an editable textarea only when the user opts in

This keeps the default review screen focused and avoids making the main screen feel
heavier for users who do not need transcript correction.

### Re-extraction happens only when the user asks for it

Transcript edits do not auto-sync into line items. The user explicitly chooses when
to regenerate the draft from the edited transcript. Use the existing notes extraction
path for this call.

Expected behavior:
- edited transcript remains local draft state until action
- `Regenerate From Transcript` replaces:
  - transcript
  - line items
  - total
  - confidence notes
- customer selection and customer-facing notes stay intact

### Regeneration uses a destructive-action confirmation when line items exist

If the current draft has one or more line items, tapping `Regenerate From Transcript`
must show a `ConfirmModal` before replacing the current draft.

Modal intent:
- title: `Replace current draft?`
- body: explain that regeneration will replace current line items, total, and AI
  review notes

If there are no current line items, regeneration may proceed immediately without the
modal.

### Null pricing remains allowed, but warning becomes more actionable

Do not block quote generation when prices are `null`. That would conflict with the
spec and current behavior. Instead, improve the warning so it is more obvious and
specific about what will render as `TBD`.

### Ambiguous extracted items should be surfaced as a review task

Flagged items / confidence notes should be presented as "review required" guidance,
not buried as passive metadata.

---

## Risks And Edge Cases

- Regenerating from edited transcript can wipe manual line-item edits; the UI should
  make that consequence explicit before replacing the current draft
- The edited transcript may produce fewer or more line items than before
- Null prices and flagged items can overlap; warnings should not duplicate or compete
- Regeneration failures must preserve the user's edited transcript text

---

## Scope

### Frontend

**`frontend/src/features/quotes/components/ReviewScreen.tsx`**
- Add `Edit Transcript Notes` action
- Support toggling between read-only transcript view and editable transcript textarea
- Add `Regenerate From Transcript` action using existing quote extraction service
- Preserve current draft state when regeneration fails
- Improve null-pricing guardrail copy / placement
- Strengthen review-required messaging for flagged / ambiguous line items

**`frontend/src/features/quotes/hooks/useQuoteDraft.ts`**
- Extend local draft updates only if needed to support editable transcript state
- Keep storage behavior explicit and minimal

**`frontend/src/features/quotes/services/quoteService.ts`**
- Reuse `convertNotes(...)` for transcript regeneration
- Do not add a new backend route unless a blocker is found

### Tests

**`frontend/src/features/quotes/tests/ReviewScreen.test.tsx`**
- Transcript edit affordance renders
- Edited transcript text appears in textarea
- Regeneration calls extraction service with edited transcript
- When line items exist, regeneration shows a `ConfirmModal` before replacing the draft
- Successful regeneration replaces transcript / line items / total / confidence notes
- Failed regeneration preserves edited transcript and current draft state
- Null-pricing warning remains non-blocking
- Review-required messaging is visible when items are flagged

### Docs

**`docs/ARCHITECTURE.md`** (if behavior contract is changed materially)
- Note that transcript correction is a frontend review-path re-extraction flow using
  the existing extraction contract

---

## Acceptance Criteria

- [ ] `ReviewScreen` exposes an explicit `Edit Transcript Notes` action
- [ ] Users can edit the transcript text locally before quote creation
- [ ] Users can trigger explicit regeneration from the edited transcript
- [ ] When line items exist, regeneration requires an explicit confirmation modal
- [ ] Regeneration uses the existing extraction path rather than a new custom route
- [ ] Successful regeneration updates transcript, line items, total, and confidence notes
- [ ] Failed regeneration preserves the user's edited transcript text and current draft
- [ ] Null pricing remains allowed and quote generation stays enabled
- [ ] Null-pricing warning is clearer and explicitly explains `TBD` output
- [ ] Flagged / ambiguous items render visible review guidance
- [ ] `make frontend-verify` passes

## DoD Gate

A user who spots a bad transcript or uncertain extracted item can correct the draft
without leaving the review screen or guessing how the app will behave.

---

## Verification

```bash
make frontend-verify
```

Fallback:

```bash
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
