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
Task 14 delivered the customer select/create flow end-to-end across backend and frontend. On the backend, we added a `customers` table migration and implemented user-scoped customer CRUD endpoints with CSRF on mutating routes and 404 ownership behavior. On the frontend, we added the customer service/types, a single-screen search + inline create UI, route wiring to `/quotes/new` and `/quotes/capture/:customerId`, and test coverage for both API behavior and UI interaction.

## Top 3 Decisions and Why
1. Enforce ownership using `id + user_id` lookup and return 404 for non-owned records - this avoids leaking resource existence across users and keeps error semantics consistent for auth boundaries.
2. Keep search and create in one component (`CustomerSelectScreen`) for V0 - this matches the scoped UX and minimizes routing/state complexity while remaining under the file-size budget.
3. Use client-side filtering of the loaded customer list - expected list sizes are small in V0, so this avoids adding extra backend search contracts and debounce complexity too early.

## Non-Obvious Patterns Used
- [SECURITY] Mutating customer endpoints (`POST`, `PATCH`) depend on `require_csrf`, while read endpoints do not. This mirrors the double-submit CSRF contract already used in auth/profile and prevents cross-site write attempts.
- The service layer raises domain-specific `CustomerServiceError` and the API layer translates it to `HTTPException`. That keeps transport concerns out of repository/service code and preserves `api -> service -> repository` boundaries.
- After repository `flush()`, we call `refresh(customer)` before serializing; this avoids async lazy-load edge cases when returning server-managed fields like `updated_at`.
- Update schema validation now rejects explicit `{"name": null}` on PATCH but still allows omitted `name`, preserving partial update behavior without allowing invalid nullable writes to a non-null DB column.

## Tradeoffs Evaluated
- We could have added server-side search (`/api/customers?query=`), but chose local filtering for faster delivery and fewer API contracts in V0.
- We could have split select/create into separate routes or extracted a custom hook, but chose a single screen and local state for simpler flow control at current scope.
- We could have allowed nulls in update payload and filtered them in service code, but chose schema-level rejection so invalid input fails at the API boundary with a clean 422 response.

## What I'm Uncertain About
- `make db-verify` could not be completed in this environment because of DB connectivity/timeouts, so migration correctness here is based on code review plus passing backend tests, not a successful live migration run.
- Customer search is currently name-only and case-insensitive; if users rely on phone/email lookups, we may need to widen the filter contract.
- Create-form fields are not reset when toggling between create/search modes; this is acceptable for now, but product may want explicit reset behavior.
- If customer lists grow large, client-side filtering will become less ideal and should be replaced with server-side search plus pagination.

## Relevant Code Pointers
- backend/alembic/versions/20260320_0003_add_customers_table.py > 23
- backend/app/features/customers/models.py > 14
- backend/app/features/customers/schemas.py > 20
- backend/app/features/customers/repository.py > 28
- backend/app/features/customers/service.py > 54
- backend/app/features/customers/api.py > 22
- backend/app/features/customers/tests/test_customers.py > 101
- backend/app/shared/dependencies.py > 35
- backend/app/main.py > 30
- frontend/src/features/customers/services/customerService.ts > 8
- frontend/src/features/customers/components/CustomerSelectScreen.tsx > 14
- frontend/src/features/customers/tests/CustomerSelectScreen.test.tsx > 72
- frontend/src/features/customers/tests/customerService.integration.test.ts > 8
- frontend/src/App.tsx > 47
