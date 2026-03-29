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
- We unified the Quotes and Customers tab screens onto the shared fixed `ScreenHeader` so they match the rest of the app's glassmorphic top chrome.
- We moved the summary counts into the header, added top spacing so the fixed bar does not overlap the content, and made sure those counts stay hidden during the initial loading and error states.
- After review, we also tightened one missing error-path assertion, removed one redundant customer test assertion, and applied a small requested cleanup so `approved` badges no longer render a checkmark icon.

## Top 3 Decisions and Why
1. Reuse `ScreenHeader` instead of creating tab-specific header markup - this keeps the visual system consistent and prevents the tab screens from drifting away from the other screens.
2. Gate the header subtitle behind `!isLoading && !loadError` - this avoids misleading zero-count summaries before real list data has loaded or when the request failed.
3. Keep the list cards, FABs, and bottom nav untouched - that delivered the task goal with a surgical change and reduced the chance of unrelated visual regressions.

## Non-Obvious Patterns Used
- The subtitle is computed from live state but only exposed to the UI after the initial fetch settles successfully. That is a useful pattern when a derived value would otherwise look valid even though it is based on placeholder state.
- The fixed header spacing is handled in the screen container with `pt-20` instead of modifying the header component. That keeps the shared header generic and lets each screen own its own scroll/layout offset.
- Route tests were updated to assert the redirected destination screen by its current heading text. This keeps higher-level navigation coverage aligned with user-visible UI rather than stale implementation wording.

## Tradeoffs Evaluated
- We could have preserved the old quote title text (`Stima Quotes`) inside the new shared header, but using `Quotes` matches the shared screen-header pattern and keeps the title shorter.
- We could have added separate booleans like `hasLoadedOnce` for subtitle gating, but the existing `isLoading` and `loadError` states were enough for the current one-shot fetch flow.
- The requested `StatusBadge` cleanup was outside the original task scope. We still landed it because it was tiny, well-specified, and had direct test coverage.

## What I'm Uncertain About
- The empty-success quote case still shows `0 active · 0 pending`, which matches the current logic, but we did not add an explicit test for that exact copy.
- If these list screens gain retry flows later, we may want a more explicit "initial load complete" state so subtitle visibility cannot flicker during retries.
- `ScreenHeader` now carries more traffic across the app, so any later typography/design change there will have wider visible impact than before.

## Relevant Code Pointers
- frontend/src/features/quotes/components/QuoteList.tsx > 80
- frontend/src/features/customers/components/CustomerListScreen.tsx > 65
- frontend/src/features/quotes/tests/QuoteList.test.tsx > 294
- frontend/src/features/customers/tests/CustomerListScreen.test.tsx > 69
- frontend/src/features/auth/tests/App.routes.test.tsx > 54
- frontend/src/shared/components/StatusBadge.tsx > 23
- frontend/src/shared/components/StatusBadge.test.tsx > 31
