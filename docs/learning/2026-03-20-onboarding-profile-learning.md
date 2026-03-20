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
Task 12 implemented a complete onboarding + profile slice across backend and frontend. On the backend, we added business profile fields to `users`, exposed computed `is_onboarded` in auth responses, and implemented authenticated profile read/update endpoints with CSRF protection. On the frontend, we added an onboarding form, profile service/types, and route guards so authenticated users are redirected to `/onboarding` until profile completion.

## Top 3 Decisions and Why
1. Keep onboarding state as a computed property (`User.is_onboarded`) instead of a stored DB flag - this avoids drift bugs where a boolean can get out of sync with profile fields.
2. Reuse one endpoint (`PATCH /api/profile`) for both onboarding and later settings use - this keeps profile writes in one contract and prevents duplicating validation logic.
3. Add a dedicated `OnboardingRoute` alongside `ProtectedRoute` - this makes the redirect logic explicit and testable in both directions (not onboarded users to onboarding, onboarded users away from onboarding).

## Non-Obvious Patterns Used
- Service-layer commit ownership: the route does not call `commit()` directly; `ProfileService` owns orchestration and transactional intent, which keeps API handlers thin and consistent.
- Dependency injection boundary enforcement: `profile/api.py` resolves `ProfileService` via shared dependencies instead of importing the repository directly, preserving `api -> services -> repositories` layering.
- Auth context refresh after profile update: the onboarding form calls `refreshUser()` so frontend route guards immediately react to backend `is_onboarded` changes without requiring a full page reload.

## Tradeoffs Evaluated
- We considered storing a physical `is_onboarded` column, but chose computed logic for correctness and lower migration/maintenance cost.
- We considered creating a separate onboarding-only backend endpoint, but chose the shared profile update endpoint to avoid duplicate write contracts.
- We considered putting onboarding redirect logic directly in `AuthProvider`, but kept it in route guards to keep authentication bootstrap and routing policy separate.

## What I'm Uncertain About
- The current validation uses `min_length=1` on strings, which allows whitespace-only values; if product wants stricter validation, we should trim and reject blank-after-trim.
- We currently rely on frontend-driven navigation after successful submit; if onboarding grows multi-step, we may want backend-driven progress states.
- Trade types are hard-coded for V0; if this list starts changing often, we may want server-driven options to avoid dual-side edits.

## Relevant Code Pointers
- backend/alembic/versions/20260320_0002_add_business_fields_to_users.py > 22
- backend/app/features/auth/models.py > 49
- backend/app/features/auth/api.py > 140
- backend/app/features/profile/api.py > 17
- backend/app/features/profile/service.py > 51
- backend/app/features/profile/tests/test_profile.py > 38
- frontend/src/features/auth/hooks/useAuth.ts > 16
- frontend/src/App.tsx > 8
- frontend/src/features/profile/components/OnboardingForm.tsx > 24
- frontend/src/features/profile/tests/OnboardingForm.test.tsx > 75
