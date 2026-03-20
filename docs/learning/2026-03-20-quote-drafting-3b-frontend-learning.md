---
TUTORING SESSION CONTEXT (do not modify)

I am a junior developer learning through code review. You are a
senior dev explaining this to me as your intern.

My stack: FastAPI, PostgreSQL + pgvector, SQLAlchemy async,
Next.js/TypeScript, Redis, ARQ, OpenAI embeddings, Anthropic API.
My projects: Quaero (RAG/document Q&A), Rostra (real-time chat),
FAROS (task manager/AWS).

How to explain: go block by block, 5-15 lines at a time. For each
block give me WHAT, WHY, TRADEOFF, and PATTERN. Stop after each
block and ask if I want to go deeper or move on. Do not proceed
until I respond.

If a concept connects to Rostra, FAROS, or another part of Quaero,
say so explicitly. If there is a security implication, flag it
with [SECURITY]. If I ask "why not X", give me a real answer.

Depth signals: "keep going" = next block, "go deeper" = expand
current block, "how would I explain this in an interview" = give
me a 2-sentence out-loud answer.
---

## What Was Built
- We implemented the full frontend quote drafting flow for Task 3B: capture freeform notes, convert notes into structured line items, persist draft state in `sessionStorage`, and review/edit before quote creation.
- The review step now enforces safer client-side validation that matches backend constraints, including sanitizing blank rows and blocking partially filled rows without a description.
- We also added robust component and integration tests for the capture/review flow, service calls, and row-level behavior regressions.

## Top 3 Decisions and Why
1. Keep draft state in a dedicated `useQuoteDraft` hook backed by `sessionStorage` - this isolates flow state from route components and survives refresh in the same tab without adding global state complexity.
2. Use stable client-generated row IDs for line-item rendering and accessibility IDs - this prevents React remount/focus loss while typing and avoids duplicate/invalid label-to-input associations.
3. Sanitize and validate line items before submit - this aligns frontend payload shape with backend `LineItemDraft.description` requirements and avoids avoidable 422 errors on create.

## Non-Obvious Patterns Used
- Stable identity map for transient rows: we maintain a parallel `lineItemRowIds` array so row identity is not tied to mutable content like `description`.
- Submit-time normalization pipeline: review data is normalized (`trim` + null normalization), filtered (blank rows removed), and then validated (partially filled rows require description) before API submission.
- Mixed testing strategy: component tests mock service/hooks for UI behavior, while MSW integration tests exercise transport + CSRF behavior for `quoteService`.

## Tradeoffs Evaluated
- We used index-based draft updates plus a parallel stable ID array instead of introducing new row-id fields into the persisted draft model. This keeps storage payloads simple, but requires careful synchronization when rows are added/removed.
- We chose to sanitize fully blank rows on submit (instead of hard-failing all blanks) to keep UX forgiving while still enforcing backend-compatible rules for non-blank rows.
- We kept validation in `ReviewScreen` rather than adding a separate form library to avoid introducing dependency and architectural overhead for this V0 flow.

## What I'm Uncertain About
- The row ID sequence resets on remount, which is fine for this draft-local UI, but if we later need deterministic IDs across tabs/sessions we may want IDs stored directly in draft state.
- We currently show row-level validation for missing descriptions only when a row is partially filled; if product wants stricter real-time validation, we may need touched/dirty field tracking.
- We still do not have route-level tests for direct `/quotes/review` access with a missing draft, and no full end-to-end test for capture -> review -> create using the real hook lifecycle.

## Relevant Code Pointers
- `frontend/src/features/quotes/hooks/useQuoteDraft.ts > 8`
- `frontend/src/features/quotes/services/quoteService.ts > 8`
- `frontend/src/features/quotes/components/CaptureScreen.tsx > 8`
- `frontend/src/features/quotes/components/ReviewScreen.tsx > 43`
- `frontend/src/features/quotes/components/LineItemRow.tsx > 3`
- `frontend/src/features/quotes/tests/CaptureScreen.test.tsx > 1`
- `frontend/src/features/quotes/tests/ReviewScreen.test.tsx > 242`
- `frontend/src/features/quotes/tests/LineItemRow.test.tsx > 7`
- `frontend/src/features/quotes/tests/quoteService.integration.test.ts > 12`
- `frontend/src/App.tsx > 73`
