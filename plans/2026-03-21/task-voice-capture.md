# Task: Voice Capture (V0 Task 5)

## Goal

Add voice-first quote drafting on top of the existing typed-notes flow so a user can
record one or more clips, send them to the backend for normalization + transcription +
extraction, review the draft, and persist the final quote with the correct
`source_type`.

This is an integration task, not a greenfield quote task. The typed capture ->
review -> create -> PDF/share loop already exists and should stay intact.

## Parent Roadmap Reference

`docs/V0_ROADMAP.md` § Task 5 — Voice Capture

---

## Repo Snapshot (2026-03-21)

- `POST /api/quotes/convert-notes`, `POST /api/quotes`, quote review, PDF generation,
  and share already exist.
- `backend/app/integrations/audio.py` and
  `backend/app/integrations/transcription.py` are still stub modules.
- `frontend/src/features/quotes/hooks/useVoiceCapture.ts` is still a stub.
- `frontend/src/features/quotes/components/CaptureScreen.tsx` is text-only today.
- `documents.source_type` already exists in the DB model, but quote creation currently
  hardcodes `"text"` in `QuoteService.create_quote`.
- `Settings` exposes Anthropic extraction config but does not yet expose
  `OPENAI_API_KEY` / `TRANSCRIPTION_MODEL`.
- Docker/setup docs mention `ffmpeg`, but `README.md` does not currently document the
  local requirement.

---

## Locked Design Decisions

### 1. Keep orchestration in `QuoteService`

Add audio normalization and transcription dependencies to `QuoteService` rather than
creating a separate `AudioService`.

Why:
- the repo already uses `QuoteService` as the orchestration boundary for extraction,
  persistence, and PDF generation
- `capture-audio` is still part of quote drafting, not an independent domain
- one extra pair of integrations is acceptable at current service size

Revisit when:
- audio capture grows its own persistence, retries, async jobs, or reusable workflows

### 2. Normalize and stitch to WAV on the backend

`integrations/audio.py` should decode each uploaded clip with `pydub`, reject empty or
undecodable clips, stitch them with a short silence gap, and export combined WAV bytes.

Why WAV instead of MP3:
- the setup doc already shows WAV as the intended backend handoff format
- this is server-to-provider traffic after upload, so smaller lossy encoding is not the
  main bottleneck
- WAV keeps the pipeline simpler and avoids introducing an extra lossy transcode choice

### 3. `capture-audio` returns full `ExtractionResult`

`POST /api/quotes/capture-audio` should return the same response model as
`convert-notes`, including `confidence_notes`.

Contract:
- request: multipart form data with repeated `clips` files
- response: `ExtractionResult`
- no persistence happens here; this remains a draft-only endpoint

Why:
- the frontend review flow already expects the full extraction shape
- keeping both draft endpoints aligned avoids a parallel frontend type path

Route shape lock:
- FastAPI route accepts `clips: list[UploadFile] = File(...)`
- multipart field name is `clips`
- FastAPI `UploadFile` stays at the API boundary only
- API layer converts uploads into a small internal clip input object before calling
  `QuoteService`, preserving current project layering

### 4. Persist `source_type` explicitly through `POST /api/quotes`

Extend `QuoteCreateRequest` to include `source_type: "text" | "voice"` and stop
hardcoding `"text"` in the service.

Frontend implication:
- `useQuoteDraft` stores `sourceType`
- text capture sets `"text"`
- voice capture sets `"voice"`
- `ReviewScreen` passes that value into `quoteService.createQuote`

Why:
- `source_type` already exists and should reflect the actual draft origin
- explicit request data is cleaner than inferring from transient frontend state

### 5. Voice-first UI uses explicit mode tabs/segmented control

Use a visible `Voice` / `Text` mode switch with `Voice` selected by default.

Why not a hidden fallback link:
- the roadmap says voice is primary, but typed notes still needs to stay discoverable
- tabs/segmented control make the two capture modes obvious without implying separate
  pages
- this will test better and be easier to understand on mobile than a small link

### 6. `useVoiceCapture` owns recording state, not network upload

The hook should manage:
- `MediaRecorder` lifecycle
- elapsed timer
- clip accumulation
- clip deletion / reset
- recording error state

Upload should stay in `CaptureScreen` via `quoteService.captureAudio`.

Why:
- keeps the hook focused on browser media concerns
- avoids mixing recorder lifecycle with HTTP orchestration
- makes hook tests smaller and easier to reason about

### 7. Synchronous backend, estimated staged loading on the client

Keep the endpoint synchronous in V0, but show estimated voice-stage copy while the
request is in flight:
- `Uploading clips...`
- `Transcribing audio...`
- `Extracting line items...`

Important note:
- these labels are expectation-setting only; they are not backend-confirmed progress

### 8. Error contract is explicit and user-facing

Planned mapping:
- missing `clips` field: framework validation `422`
- empty clip list or zero-length decoded clip: `400`
- unsupported/undecodable audio: `400`
- transcription provider failure: `502`
- extraction failure after transcription: preserve existing handled extraction behavior
  (`422` via `QuoteServiceError`)

---

## Smallest Viable Plan

1. Implement backend audio + transcription integrations, settings, and dependency
   wiring.
2. Add `POST /api/quotes/capture-audio` with request validation and quote-service
   orchestration.
3. Extend draft/create contracts to carry `source_type` end-to-end.
4. Implement `useVoiceCapture` and upgrade `CaptureScreen` to voice-first mode with
   text fallback and staged loading copy.
5. Add focused backend/frontend tests and update docs for `ffmpeg` + contract changes.

---

## Scope

### Backend

**Config / wiring**
- `backend/app/core/config.py`
  - add `openai_api_key`
  - add `transcription_model` defaulting to `whisper-1`
- `backend/app/shared/dependencies.py`
  - construct `TranscriptionIntegration`
  - construct/reuse `AudioIntegration`
  - pass both into `QuoteService`

**Integrations**
- `backend/app/integrations/audio.py`
  - decode each clip with `AudioSegment.from_file`
  - reject empty input / zero-duration segments
  - stitch with a short silence gap
  - normalize output to mono, `16kHz`, `16-bit PCM`
  - reject stitched segment exceeding `MAX_AUDIO_DURATION_SECONDS = 600` (10 minutes)
    to stay comfortably under Whisper's 25MB upload limit after WAV normalization
  - export WAV bytes
- `backend/app/integrations/transcription.py`
  - wrap `AsyncOpenAI`
  - send `audio.wav` bytes to the transcription endpoint
  - return plain transcript text

**Quote domain**
- `backend/app/features/quotes/schemas.py`
  - extend `QuoteCreateRequest` with `source_type`
- `backend/app/features/quotes/service.py`
  - add `capture_audio(...) -> ExtractionResult`
  - add protocol types for audio/transcription integrations
  - use request `source_type` during quote creation
- `backend/app/features/quotes/api.py`
  - add `POST /api/quotes/capture-audio`
  - keep CSRF + auth parity with other mutating quote endpoints

**Tests**
- add/extend quote API tests for:
  - single clip success
  - multi-clip stitching success
  - missing/empty clip rejection
  - unsupported audio rejection
  - transcription failure handled cleanly
  - quote creation persists `source_type="voice"` when supplied

### Frontend

**Draft / types / service**
- `frontend/src/features/quotes/types/quote.types.ts`
  - add `QuoteSourceType = "text" | "voice"`
  - extend `QuoteCreateRequest`
- `frontend/src/features/quotes/hooks/useQuoteDraft.ts`
  - persist `sourceType`
- `frontend/src/features/quotes/services/quoteService.ts`
  - add `captureAudio(clips: Blob[])`
  - send `FormData` with repeated `clips`

**Capture flow**
- `frontend/src/features/quotes/hooks/useVoiceCapture.ts`
  - implement recorder lifecycle + timer + clip list management
- `frontend/src/features/quotes/components/CaptureScreen.tsx`
  - add voice-first mode switch
  - record/stop UI
  - captured clip list with delete
  - start over action
  - voice submit path to `captureAudio`
  - keep typed notes path working as fallback
  - show estimated staged loading copy for voice submissions

**Review flow**
- `frontend/src/features/quotes/components/ReviewScreen.tsx`
  - send `source_type` when creating the quote

**Tests**
- hook tests for recording lifecycle state, clip accumulation, delete, reset
- capture screen tests for mode switch, voice CTA enablement, staged loading copy,
  and voice draft navigation
- service integration test for multipart upload to `/api/quotes/capture-audio`
- add MSW handler for `POST /api/quotes/capture-audio` in
  `src/shared/tests/mocks/handlers.ts` returning a stub `ExtractionResult`

### Docs

- `docs/ARCHITECTURE.md`
  - update `source_type` note from future-only to active `text | voice`
- `README.md`
  - document local `ffmpeg` requirement for voice capture

---

## Risks And Edge Cases

- **Browser format variance:** Chrome/Edge will usually produce WebM/Opus, Safari may
  produce MP4/AAC. This is the main reason backend normalization is mandatory.
- **Recorder support gaps:** `MediaRecorder` MIME support differs by browser. The hook
  should probe supported MIME types instead of hardcoding one.
- **Long synchronous request time:** voice capture will feel slower than typed notes.
  The UI needs honest loading copy and a clear retry path.
- **Provider split failure modes:** transcription and extraction fail for different
  reasons, so backend errors should not collapse into a generic 500.
- **No live/provider verification in agent flow:** automated verification should stay
  offline-safe; any manual live smoke should be called out separately if needed.

---

## Acceptance Criteria

- [ ] `POST /api/quotes/capture-audio` accepts one or more uploaded `clips` files and
      returns the validated `ExtractionResult` contract
- [ ] Backend rejects zero-length or undecodable clips with handled errors, not 500s
- [ ] Multiple uploaded clips are normalized and stitched server-side before
      transcription
- [ ] `QuoteCreateRequest` carries `source_type`, and persisted quotes reflect
      `"text"` vs `"voice"` correctly
- [ ] `CaptureScreen` defaults to voice mode and still offers typed notes as a visible
      fallback mode
- [ ] Users can record, stop, review clips, delete individual clips, and start over
- [ ] Voice `Generate Draft` stays disabled until at least one clip exists
- [ ] Voice submission shows staged loading copy while the synchronous request is in
      flight
- [ ] Existing typed-notes capture flow still works end-to-end
- [ ] Focused backend and frontend tests cover the new flow
- [ ] `README.md` documents the local `ffmpeg` requirement
- [ ] `docs/ARCHITECTURE.md` reflects active `source_type` semantics

---

## Verification

```bash
make backend-verify
make frontend-verify
```

Manual operator smoke after implementation:
- verify local `ffmpeg` is installed and reachable
- record at least one real browser clip and confirm review screen receives a draft

---

## Suggested GitHub Issue Command

```bash
gh issue create \
  --title "Task: Voice capture quote drafting" \
  --label "type:task,area:quotes,area:frontend,area:backend" \
  --body-file plans/2026-03-21/task-voice-capture.md
```
