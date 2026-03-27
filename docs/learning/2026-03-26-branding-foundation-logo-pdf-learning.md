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
- We added private contractor logo support end-to-end for Task #109. Users can upload, preview, replace, and remove a logo from Settings, and newly generated quote PDFs now include that logo when one exists.
- The backend stores only a private object path in the database, proxies image bytes through authenticated endpoints, and fetches the logo during PDF rendering without exposing public storage URLs.
- Review hardening also tightened the implementation: production preview URLs now use `VITE_API_URL`, storage initialization is lazy and cached, and storage failure paths are normalized and covered by tests.

## Top 3 Decisions and Why
1. Keep logos in private GCS and proxy them through backend endpoints instead of returning bucket URLs - This keeps asset access behind existing auth/session rules and avoids leaking storage topology or accidentally making assets public.
2. Store only `logo_path` on the user record and derive `has_logo` as a property - This keeps persistence minimal while still giving the frontend a simple boolean contract for rendering.
3. Make the storage client lazy and cached - This avoids breaking non-logo routes in CI when ADC is absent, but still prevents repeated `storage.Client()` setup on every real storage operation.

## Non-Obvious Patterns Used
- Service-level error translation: storage and validation failures are converted into `ProfileServiceError` with explicit HTTP semantics so the API layer stays thin and predictable.
- Structural protocol pattern: profile and quotes depend on storage behavior through shared protocols instead of concrete classes, which keeps tests and layering cleaner.
- Graceful degradation for render-time assets: PDF generation treats missing or invalid logos as a warning and omits the image instead of failing the whole quote render.
- [SECURITY] Proxy-not-public pattern: the browser never gets a raw GCS URL, so auth rules remain centralized in FastAPI rather than split across app code and bucket policy.

## Tradeoffs Evaluated
- We chose backend proxying over signed URLs. Signed URLs would reduce backend bytes served, but they would complicate private asset policy and frontend contract handling for a small V1 feature.
- We chose overwrite-in-place with a fixed object name (`logos/<user-id>/logo`) instead of versioned filenames. That keeps replacement logic simple, but it means we are not preserving historical logo snapshots.
- We chose lazy cached storage initialization instead of eager dependency construction. Eager construction is simpler to reason about locally, but it forced unrelated profile routes to require cloud credentials.

## What I'm Uncertain About
- The delete flow still deletes in storage before clearing `logo_path` in the database. If the DB commit failed afterward, the app would temporarily point at a missing object; that degraded state is acceptable for now, but it is not fully transactional.
- We did not add an HTTP-layer upload size cap at the proxy or ASGI boundary, so the 2 MB rule is enforced after the request body is read into memory.
- If the team later wants logo history, cropping, resizing, or reuse outside PDFs, the current single-path storage model will likely need to evolve into a richer asset model.

## Relevant Code Pointers
- backend/app/features/profile/api.py > 56
- backend/app/features/profile/service.py > 102
- backend/app/integrations/storage.py > 16
- backend/app/features/quotes/service.py > 302
- backend/app/features/auth/models.py > 28
- backend/app/core/config.py > 91
- frontend/src/features/settings/components/SettingsScreen.tsx > 22
- frontend/src/features/settings/components/SettingsScreen.tsx > 198
