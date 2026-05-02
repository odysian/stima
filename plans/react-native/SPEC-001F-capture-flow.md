# SPEC-001F — Capture Flow

**Parent umbrella:** `plans/react-native/SPEC-001-rn-expo-rewrite.md`
**Phase:** 3 Core Features
**Effort:** 7–10 days

## Goal

Port the capture screen: voice recording, text notes, extraction submission, and local session management.

## References

- `frontend/src/features/quotes/components/CaptureScreen.tsx` — Orchestrator: local session, voice clips, notes, extraction, error handling, auto-extract on load.
- `frontend/src/features/quotes/components/CaptureScreenBody.tsx` — Notes input, clip list, record button, start-blank button.
- `frontend/src/features/quotes/components/CaptureScreenFooter.tsx` — Extract button, status copy, extraction stage spinner.
- `frontend/src/features/quotes/hooks/useVoiceCapture.ts` — MediaRecorder lifecycle, clip persistence, timer, duration limit.
- `frontend/src/features/quotes/hooks/useVoiceCapture.helpers.ts` — Mime type resolution, clip persistence, storage soft cap.
- `frontend/src/features/quotes/components/captureScreenIdempotency.ts` — Idempotency key resolution for extraction requests.
- `frontend/src/features/quotes/components/captureScreenPolling.ts` — Poll extraction job until quote is ready.
- `frontend/src/features/quotes/components/captureScreenOutbox.ts` — Queue outbox retry jobs on failure.
- `frontend/src/features/quotes/components/captureScreenDraftHydration.ts` — Hydrate draft from newly created quote.

## Acceptance Criteria

- [ ] Voice recording uses `expo-audio`; target output is AAC/M4A, with exact platform recording options locked in Phase 0.
- [ ] Recording timer counts up; auto-stops at `MAX_VOICE_CLIP_DURATION_SECONDS`.
- [ ] Clips display as clip rows with play icon, clip number, and duration. Waveform visualization is an enhancement, not parity.
- [ ] Notes multiline text input with character count.
- [ ] Extract button validates: max clip count, total byte size.
- [ ] Online flow: submit clips+notes, show extraction stages, poll job, navigate to review.
- [ ] Offline flow: save to outbox, show "Ready to extract when online".
- [ ] Start blank: create manual draft via API, navigate to edit.
- [ ] Unsaved-work guard on back navigation (ConfirmModal equivalent).
- [ ] Auto-extract on deep-link resume (`autoExtract=1`).

## Key Risk

Native audio format. Backend already maps M4A/AAC to MP4 and normalizes to WAV via ffmpeg/pydub (`backend/app/integrations/audio.py`). The actual risk is whether `expo-audio` iOS/Android output produces filename/content-type metadata that `infer_audio_format()` can decode reliably.
