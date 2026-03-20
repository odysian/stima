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
Implemented Task 17 backend quote drafting end-to-end: a Claude-powered `convert-notes` extraction flow plus quote create/list/detail/update APIs. Added new `documents` and `line_items` persistence (migration + SQLAlchemy models), wired quote service/dependencies/router, and updated architecture docs for the new contracts. Added extraction fixtures/tests and API behavior tests for happy path, CSRF/auth requirements, ownership scoping, and line-item replacement semantics.

## Top 3 Decisions and Why
1. Use a flat `ExtractionResult` response contract (not enveloped) - It matches existing API style and keeps frontend consumption simple.
2. Use full line-item replacement on `PATCH /api/quotes/{id}` - The review screen holds complete state, so replace-all avoids partial-update complexity.
3. Persist `doc_sequence` + generated `doc_number` with unique `(user_id, doc_sequence)` - It keeps numbering deterministic per user and easy to query/render.

## Non-Obvious Patterns Used
- Service-level ownership guard before create (`customer_exists_for_user`) enforces tenant boundaries before write paths.
- Sequence generation + uniqueness retry is split across repository/service: repository computes next sequence; service handles rare uniqueness collision policy.
- Repository refresh after line-item replacement ensures response serialization reflects current DB state in the same request.
- Extraction integration validates structured tool output with Pydantic and converts malformed provider payloads into typed domain errors (`422`), not opaque `500`s.

## Tradeoffs Evaluated
- `Decimal` vs `float` in API schemas: DB remains `NUMERIC`, but API schemas use numeric wire types (`float`) for frontend ergonomics and contract clarity.
- Catch-all integrity handling vs narrow retry handling: final implementation retries only doc-sequence collisions and lets unrelated integrity failures surface instead of masking root causes.
- Running DB verification from agent flow: we documented a no-run rule for `make db-verify` in agent sessions due environment hang risk, favoring reliable backend/frontend verify targets.

## What I'm Uncertain About
- The extraction prompt/tool schema is intentionally minimal for V0; we may need tighter guardrails as real transcript variability grows.
- Sequence collision retry is implemented, but true contention behavior would benefit from stress/concurrency tests.
- We did not include provider-level live integration tests (intentionally mocked); production observability and fallback behavior may need hardening once real traffic starts.

## Relevant Code Pointers
- backend/app/features/quotes/api.py > 24
- backend/app/features/quotes/service.py > 97
- backend/app/features/quotes/repository.py > 55
- backend/app/integrations/extraction.py > 52
- backend/alembic/versions/20260320_0004_add_quote_documents_and_line_items.py > 33
- backend/app/features/quotes/tests/test_quotes.py > 61
- docs/ARCHITECTURE.md > 85
