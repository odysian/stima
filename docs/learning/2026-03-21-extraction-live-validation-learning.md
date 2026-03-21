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
- We added a live extraction validation layer that calls the real Claude-backed `ExtractionIntegration` against all six transcript fixtures.
- The new suite asserts fixture-specific null semantics and pricing behavior, and prints readable report cards so prompt quality can be evaluated quickly from test output.
- We also wired tooling so normal backend verification excludes live tests while a dedicated `make extraction-live` target runs them explicitly.

## Top 3 Decisions and Why
1. Mark live tests with `@pytest.mark.live` and exclude them from `make backend-verify` - keeps CI/local standard verification deterministic and offline-safe.
2. Auto-skip live tests when `ANTHROPIC_API_KEY` is missing via `get_settings()` - avoids noisy failures and preserves one runtime config source.
3. Assert contract semantics rather than brittle exact item segmentation in `clean_with_total` - tolerates valid model phrasing differences while still enforcing pricing correctness.

## Non-Obvious Patterns Used
- Module-level `pytestmark` combines async behavior and environment-based skip logic once, so each test stays focused on fixture assertions.
- Report-card output is intentionally part of the test run (`-s`) to convert a live integration test into a debugging instrument, not just a pass/fail gate.
- For live AI outputs, strong invariants (totals, null semantics, confidence notes presence) are more stable than strict structural equality of extracted line items.

## Tradeoffs Evaluated
- Strictly requiring every item in `clean_with_total` to have a price was simpler, but too brittle when Claude returns an extra unpriced task line while preserving a correct total.
- We chose summed priced-item validation plus total parity to preserve safety while reducing false failures.
- We kept live tests in the main test tree (not a separate suite directory) to reduce setup overhead, accepting that marker discipline is now important.

## What I'm Uncertain About
- The exact acceptable variability range for line-item decomposition could still evolve as prompts/models change.
- With more context, I might add optional soft assertions around expected descriptions to catch semantic drift earlier without making tests flaky.
- We did not yet add Phase 2 fixtures for edge cases like currency slang or compact phrasing; those remain follow-up work.

## Relevant Code Pointers
- backend/app/features/quotes/tests/test_extraction_live.py > 14
- backend/app/features/quotes/tests/test_extraction_live.py > 36
- backend/app/features/quotes/tests/test_extraction_live.py > 49
- backend/app/features/quotes/tests/test_extraction_live.py > 55
- backend/pytest.ini > 6
- Makefile > 16
- Makefile > 33
- docs/V0_ROADMAP.md > 261
