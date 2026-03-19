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
Implemented the frontend auth foundation for Task #4: credentialed HTTP transport, CSRF handling, auth context/session bootstrap, route protection, login/register forms, and focused component/unit tests. The follow-up patch fixed backend contract mismatches by separating register from login and by hydrating CSRF state from cookie on reload/refresh paths. We also tightened user typing and added missing tests for route redirects and auth state transitions.

## Top 3 Decisions and Why
1. Keep register and login as separate service calls - backend `POST /api/auth/register` does not mint auth cookies or CSRF token, so chaining `register -> login -> me` in context is the safest way to keep UI behavior correct.
2. Hydrate CSRF token from cookie in three guard points - bootstrap, refresh, and lazy mutating requests - to survive reloads and prevent silent 403s when in-memory token state is empty.
3. Keep AuthProvider as the single loading gate - removing `isLoading` checks from route guards avoids dead conditions and keeps auth flow easier to reason about.

## Non-Obvious Patterns Used
- Single-flight refresh guard in `http.ts`: concurrent 401 responses share one refresh promise instead of issuing multiple refresh calls. This reduces race risk and keeps auth retries deterministic.
- Layered CSRF hydration: even if one entrypoint is skipped, other entrypoints backstop token recovery. This is a practical defense-in-depth pattern for browser auth state.
- Context-level orchestration over service-level coupling: the service stays transport-focused, while `useAuth` owns user-state workflow decisions like register-then-login.

## Tradeoffs Evaluated
- Alternative: auto-login logic inside `authService.register`. Chosen approach kept this in `useAuth` to avoid surprising side effects in the service layer and preserve clearer boundaries.
- Alternative: hydrate CSRF only once during app bootstrap. Chosen approach hydrates in bootstrap plus request/refresh paths for resilience if bootstrap is bypassed or future call sites evolve.
- Alternative: keep route-level `isLoading` checks for safety. Chosen approach removed them because they were unreachable with provider-level loading gate and added cognitive overhead.

## What I'm Uncertain About
- Register-then-login partial failure UX is still rough: if register succeeds and login fails, the account exists but user sees a generic login error.
- CSRF rotation synchronization is covered behaviorally but not deeply tested for edge races where cookie and in-memory values diverge across rapid concurrent requests.
- FastAPI 422 array-style validation errors still collapse to a generic message in forms; this was out of scope for Task #4 but should be revisited before richer form UX.

## Relevant Code Pointers
- frontend/src/features/auth/services/authService.ts > 18
- frontend/src/features/auth/hooks/useAuth.ts > 33
- frontend/src/features/auth/hooks/useAuth.ts > 64
- frontend/src/shared/lib/http.ts > 34
- frontend/src/shared/lib/http.ts > 115
- frontend/src/shared/lib/http.ts > 138
- frontend/src/App.tsx > 7
- frontend/src/features/auth/types/auth.types.ts > 1
- frontend/src/shared/lib/http.test.ts > 32
- frontend/src/features/auth/tests/useAuth.test.tsx > 57
- frontend/src/features/auth/tests/App.routes.test.tsx > 34
