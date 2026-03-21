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
- We added extraction-only per-line-item trust signals so quote extraction can mark suspicious items with `flagged` and `flag_reason` while keeping quote creation contracts clean.
- We wired those flags through the capture-to-review flow (including draft persistence and row editing), rendered inline warnings in review, and stripped metadata before quote creation submit.
- We also updated backend/frontend tests and architecture docs so the extraction contract and submit boundary behavior are explicitly locked.

## Top 3 Decisions and Why
1. Split extraction and creation line-item contracts (`LineItemExtracted` vs `LineItemDraft`) - This avoids polluting persisted quote payloads with review-only metadata and keeps API intent clear.
2. Keep snake_case on the API and camelCase in draft state (`flag_reason` -> `flagReason`) - This preserves wire-format consistency while matching frontend state conventions.
3. Preserve flag metadata through editing but strip only at submit - This keeps review context visible to users until the final create call, while guaranteeing no contract drift for `POST /quotes` or `PATCH /quotes/{id}` payloads.

## Non-Obvious Patterns Used
- Boundary-mapping pattern: `CaptureScreen.applyDraft` is treated as a contract translation point, not just a data pass-through, so API fields can evolve without leaking wire-shape into app state.
- Metadata lifecycle pattern: flags exist in extraction + draft + UI, then are explicitly removed at the quote write boundary.
- Compatibility-by-default pattern: extraction schema fields are optional and backend model defaults fill missing values, which keeps older/partial model outputs valid.

## Tradeoffs Evaluated
- We considered adding optional flag fields directly to `LineItemDraft`; we chose a separate extracted type to avoid accidental persistence and keep contracts explicit.
- We considered using snake_case inside draft state to avoid mapping; we kept camelCase in draft for consistency with existing frontend conventions.
- We initially set base MSW extraction fixtures to always flagged, then adjusted to unflagged baseline after review so default test paths reflect the common production case.

## What I'm Uncertain About
- Prompt calibration may still need tuning to avoid over-flagging noise or under-flagging obvious bad extractions in real contractor audio.
- `parseStoredDraft` still uses a permissive cast for line items; this is acceptable for session draft data but not strict runtime validation.
- We did not add a dedicated PATCH-focused test for flagged metadata stripping, although the same submit sanitization path is used and covered for create.

## Relevant Code Pointers
- backend/app/features/quotes/schemas.py > 20
- backend/app/integrations/extraction.py > 14
- backend/app/features/quotes/tests/test_extraction.py > 169
- backend/app/features/quotes/tests/test_quotes.py > 35
- frontend/src/features/quotes/types/quote.types.ts > 7
- frontend/src/features/quotes/components/CaptureScreen.tsx > 58
- frontend/src/features/quotes/hooks/useQuoteDraft.ts > 27
- frontend/src/features/quotes/components/LineItemRow.tsx > 24
- frontend/src/features/quotes/components/ReviewScreen.tsx > 85
- frontend/src/features/quotes/tests/ReviewScreen.test.tsx > 343
- docs/ARCHITECTURE.md > 141
