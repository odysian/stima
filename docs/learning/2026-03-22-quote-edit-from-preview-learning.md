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
- Added an edit-from-preview flow for quotes so users can change line items, total amount, and notes after creation without starting over.
- The frontend now keeps edit state in session storage across the line-item editor round-trip, and the backend now downgrades edited ready quotes back to draft while blocking edits on shared quotes.

## Top 3 Decisions and Why
1. Use a dedicated `useQuoteEdit` session-storage hook instead of reusing `useQuoteDraft` data directly - this kept the post-creation edit flow isolated from the create-quote flow and avoided cross-screen coupling.
2. Add separate edit routes and a dedicated `EditLineItemForEditScreen` - this preserved the existing review editor contract and let the new flow reuse the same UI shape with different navigation/state plumbing.
3. Refresh the quote after committing backend edits - this ensured async response serialization sees fully loaded fields like `updated_at` and avoided a `MissingGreenlet` failure after the status downgrade.

## Non-Obvious Patterns Used
- Session-backed draft seeding is guarded by `quoteId`, so stale edit state from another quote will be replaced when a different quote loads in the same tab.
- `shouldSkipSeeding` prevents the screen from rehydrating cleared draft state during save/cancel teardown, which matters because navigation is asynchronous and the component can briefly stay mounted.
- Backend status downgrade happens after the repository update call but before commit, relying on SQLAlchemy's unit-of-work to flush the in-memory status change as part of the same transaction.

## Tradeoffs Evaluated
- A shared line-item edit component was considered, but the implementation kept a second route/screen to avoid making the original review flow more abstract than needed for one extra context.
- The frontend submit button now allows invalid edits to reach form validation so users get a specific inline message instead of a silently disabled action.
- `useQuoteEdit` now validates stored line-item shapes per element instead of trusting parsed JSON, trading a few extra checks for safer recovery from corrupted session storage.

## What I'm Uncertain About
- If quote edit contexts expand again, the separate edit/review line-item screens may become repetitive enough to justify extracting a shared form shell.
- The current single `stima_quote_edit` storage key is guarded well enough for one-tab editing, but I would revisit it if multi-tab quote editing becomes a real workflow.
- A quote that becomes shared while the edit screen is open still resolves as a generic save error from the frontend; that is acceptable now, but a tailored 409 message could be nicer later.

## Relevant Code Pointers
- frontend/src/features/quotes/components/QuotePreview.tsx > 228
- frontend/src/features/quotes/components/QuoteEditScreen.tsx > 20
- frontend/src/features/quotes/components/QuoteEditScreen.tsx > 99
- frontend/src/features/quotes/components/QuoteEditScreen.tsx > 153
- frontend/src/features/quotes/hooks/useQuoteEdit.ts > 26
- backend/app/features/quotes/service.py > 167
