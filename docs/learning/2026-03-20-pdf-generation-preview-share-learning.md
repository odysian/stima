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
- We implemented the full quote PDF and sharing flow across backend and frontend for Task #21. This includes generating PDF bytes from quote data, previewing those bytes in-app, creating persistent share links, and serving public PDF views by token with no auth.
- We also finalized review-driven hardening in the same PR: canceled native share dialogs no longer surface false errors, PDF rendering is offloaded from the async event loop, and the PDF integration instance is now cached instead of rebuilt per request.

## Top 3 Decisions and Why
1. Use `POST /api/quotes/{id}/pdf` + Blob URL preview instead of direct iframe URL - This keeps auth/CSRF/session handling in the existing fetch layer and gives clear loading/error states.
2. Keep sharing as link-based (`/share/{token}`) instead of file attachment - It reduces customer friction and keeps delivery simple without introducing storage systems in V0.
3. Apply performance hardening in the same task (`asyncio.to_thread`, cached integration) - Review severity flagged request-starvation/overhead risks, and both fixes were small, localized, and low regression risk.

## Non-Obvious Patterns Used
- Service-level error translation pattern: integration exceptions (like PDF render failure) are caught and converted into `QuoteServiceError` with explicit HTTP semantics, keeping API handlers thin and consistent.
- Render-context boundary pattern: repository returns a dedicated `QuoteRenderContext` dataclass so PDF integration doesn’t depend on ORM models directly.
- Public/private route split pattern: authenticated quote routes stay under `/api`, while token-based public PDF route is mounted outside `/api` to make security intent explicit.

## Tradeoffs Evaluated
- We kept synchronous WeasyPrint rendering for simplicity early on, then moved execution to `asyncio.to_thread` as a minimal hardening step instead of introducing queues/workers.
- We chose a cached singleton `PdfIntegration` for low overhead and straightforward dependency wiring, rather than per-request construction that repeatedly rebuilds templating internals.
- We prioritized completing feature contracts and core behavior tests first; deeper template-specific rendering assertions were split into follow-up scope.

## What I'm Uncertain About
- The follow-up test scope could still grow depending on how strict we want template regression detection (snapshot style vs semantic assertions).
- We currently rely on mocked integration behavior for many endpoint tests; a small number of true render-path tests may still be valuable for confidence.
- We did not add full end-to-end browser coverage for the entire onboarding-to-share journey yet, which may matter as UX complexity grows.

## Relevant Code Pointers
- backend/app/features/quotes/api.py > 106
- backend/app/features/quotes/service.py > 186
- backend/app/shared/dependencies.py > 32
- backend/app/integrations/pdf.py > 21
- frontend/src/features/quotes/components/QuotePreview.tsx > 110
- frontend/src/shared/lib/http.ts > 192
- frontend/src/features/quotes/tests/QuotePreview.test.tsx > 162
