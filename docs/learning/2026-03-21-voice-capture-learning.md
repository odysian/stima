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
- We added a full voice-first quote drafting flow on top of the existing text flow. Users can now record one or more clips in the browser, submit them to a new backend endpoint, and receive the same extraction contract used by text notes.
- We also made quote creation persist explicit source origin (`text` or `voice`) end-to-end so saved quotes reflect how the draft was captured.

## Top 3 Decisions and Why
1. Keep orchestration in `QuoteService` - It already owns extraction and quote orchestration, so adding audio normalization + transcription there kept layering consistent and avoided a premature new domain service.
2. Normalize/stitch audio on the backend before transcription - Browser recording formats vary by client; normalizing to one WAV pipeline gives deterministic provider input and better error handling.
3. Keep frontend recorder state in a dedicated hook and HTTP calls in screen/service - This separation makes media lifecycle logic testable without coupling it to network concerns.

## Non-Obvious Patterns Used
- API-boundary conversion pattern: FastAPI `UploadFile` stays in the API layer, then gets converted into a small internal clip DTO before reaching the service. This prevents framework types from leaking into business orchestration.
- Staged loading copy pattern: the UI cycles through estimated phases (`Uploading`, `Transcribing`, `Extracting`) even though backend progress is synchronous; this improves perceived responsiveness without claiming true server progress events.
- Backward-compatible draft persistence pattern: `useQuoteDraft` defaults missing `sourceType` to `text` so older session payloads still hydrate safely.

## Tradeoffs Evaluated
- Considered creating a standalone audio service module. Rejected for now because the workflow is still quote-drafting-specific and introducing another orchestration boundary would add complexity without clear reuse yet.
- Considered client-side transcription before upload. Rejected because provider credentials and consistent normalization/error mapping belong server-side.
- Considered strict multipart parsing assertions in integration tests. Kept assertions at the transport contract level and added focused service-formdata unit coverage to avoid brittle cross-runtime test behavior.

## What I'm Uncertain About
- The audio format hint mapping currently treats `audio/mpeg` as `mpeg`; ffmpeg accepts it, but `mp3` could be a clearer intent mapping.
- We rely on synchronous request handling for voice capture in V0. If clips become longer or usage spikes, this endpoint may need async job orchestration.
- We did not add upload-size policy beyond defaults in this task; if large clips become common, explicit size limits and user-facing guidance should be added.

## Relevant Code Pointers
- backend/app/features/quotes/api.py > 63
- backend/app/features/quotes/service.py > 150
- backend/app/integrations/audio.py > 31
- backend/app/integrations/transcription.py > 28
- frontend/src/features/quotes/components/CaptureScreen.tsx > 106
- frontend/src/features/quotes/hooks/useVoiceCapture.ts > 126
- frontend/src/features/quotes/components/ReviewScreen.tsx > 146
- frontend/src/features/quotes/tests/CaptureScreen.test.tsx > 144
- backend/app/features/quotes/tests/test_quotes.py > 207
