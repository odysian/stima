## Task: Combined Extract Endpoint — Voice + Text in One Request

**Type:** `type:task`
**Labels:** `area:backend`, `area:quotes`, `area:integrations`
**Blocks:** Quote Flow Screens task (CaptureScreen reskin depends on `quoteService.extract()` existing)

---

### Goal

Add a new `POST /api/quotes/extract` endpoint that accepts both audio clips and typed notes in a single request. The backend transcribes any clips, combines the transcript with any typed notes, and runs a single extraction pass on the combined text.

This enables the redesigned `CaptureScreen` UX where voice and text are shown simultaneously and submitted together — a contractor can record voice notes about the main work and also type a supplementary note (e.g. "add 10% travel surcharge") and have both inform the extraction result coherently.

The existing `POST /api/quotes/convert-notes` and `POST /api/quotes/capture-audio` endpoints are **kept as-is** — they are used in existing tests and should not be modified or removed.

### Non-Goals

- Do not modify or deprecate `convert-notes` or `capture-audio` endpoints
- Do not change the `ExtractionResult` schema shape
- Do not change quote creation or update endpoints
- Do not implement the `CaptureScreen` UI changes (that is the quote flow screens task)

---

### Background

The backend integration stack is already cleanly separated into three layers, which makes this straightforward to compose:

1. **`audio.py`** — `AudioIntegration.normalize_and_stitch(clips)` → WAV bytes
2. **`transcription.py`** — `TranscriptionIntegration.transcribe(wav_bytes)` → transcript string
3. **`extraction.py`** — `ExtractionIntegration.extract(notes: str)` → `ExtractionResult`

The existing `QuoteService.capture_audio()` in `service.py` already chains steps 1 → 2 → 3 (line 150 calls stitch + transcribe + `convert_notes(transcript)`). The new `extract_combined()` service method simply adds a step between transcription and extraction: append any typed notes to the audio transcript before passing to extraction.

---

### Implementation Plan

**Step 1 — New service method `QuoteService.extract_combined()`**

In `backend/app/features/quotes/service.py`, add a new method below `capture_audio`:

```python
async def extract_combined(
    self,
    clips: Sequence[CaptureAudioClip],
    notes: str,
) -> ExtractionResult:
    """Transcribe clips (if any), combine with typed notes, run one extraction pass."""
    combined_text = notes.strip()

    if clips:
        try:
            stitched_wav = await asyncio.to_thread(
                self._audio.normalize_and_stitch,
                [
                    AudioClip(
                        filename=clip.filename,
                        content_type=clip.content_type,
                        content=clip.content,
                    )
                    for clip in clips
                ],
            )
        except AudioError as exc:
            raise QuoteServiceError(detail=str(exc), status_code=400) from exc

        try:
            transcript = await self._transcription.transcribe(stitched_wav)
        except TranscriptionError as exc:
            raise QuoteServiceError(
                detail=f"Transcription failed: {exc}",
                status_code=502,
            ) from exc

        # Combine: voice transcript comes first, typed notes append after a blank line
        combined_text = f"{transcript}\n\n{notes.strip()}".strip() if notes.strip() else transcript

    if not combined_text:
        raise QuoteServiceError(
            detail="Provide at least one audio clip or typed notes.",
            status_code=400,
        )

    return await self.convert_notes(combined_text)
```

Key design decision: audio transcript comes first in the combined text. Typed notes follow after a blank line. This ordering gives the LLM context (the main job description from voice) before the supplementary additions (typed). The extraction system prompt is unchanged.

`source_type` is **not** part of `ExtractionResult` — it is determined client-side by the frontend based on whether clips were sent. `"voice"` if clips were included, `"text"` if text-only. This matches the existing pattern.

**Step 2 — New API endpoint `POST /api/quotes/extract`**

In `backend/app/features/quotes/api.py`, add the new endpoint. It accepts multipart form data (same pattern as `capture-audio` for clips, plus an optional `notes` form field):

```python
@router.post(
    "/extract",
    response_model=ExtractionResult,
    dependencies=[Depends(require_csrf)],
)
@limiter.limit("10/minute", key_func=get_ip_key)
async def extract_combined(
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    quote_service: Annotated[QuoteService, Depends(get_quote_service)],
    clips: Annotated[list[UploadFile], File(default=[])] = [],
    notes: Annotated[str, Form(default="")] = "",
) -> ExtractionResult:
    """Accept optional audio clips and optional typed notes; return extraction result."""
    del request
    del user

    clip_inputs: list[CaptureAudioClip] = []
    for clip in clips:
        try:
            if clip.size is not None and clip.size > MAX_AUDIO_CLIP_BYTES:
                raise HTTPException(status_code=400, detail="Clip too large")
            content = await clip.read()
            if len(content) > MAX_AUDIO_CLIP_BYTES:
                raise HTTPException(status_code=400, detail="Clip too large")
            clip_inputs.append(
                CaptureAudioClip(
                    filename=clip.filename,
                    content_type=clip.content_type,
                    content=content,
                )
            )
        finally:
            await clip.close()

    try:
        return await quote_service.extract_combined(clip_inputs, notes)
    except QuoteServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
```

Note: the endpoint must be declared before `/{quote_id}` pattern routes in the router to avoid routing ambiguity (FastAPI matches routes in declaration order). Read `api.py` to confirm placement.

**Step 3 — Frontend: add `extract()` to `quoteService.ts`**

In `frontend/src/features/quotes/services/quoteService.ts`, add a new function:

```ts
function extract(params: { clips?: Blob[]; notes?: string }): Promise<ExtractionResult> {
  const formData = new FormData();
  (params.clips ?? []).forEach((clip, index) => {
    const extension = resolveAudioExtensionFromMimeType(clip.type);
    formData.append("clips", clip, `clip-${index + 1}.${extension}`);
  });
  if (params.notes?.trim()) {
    formData.append("notes", params.notes.trim());
  }
  return request<ExtractionResult>("/api/quotes/extract", {
    method: "POST",
    body: formData,
  });
}
```

Export it from `quoteService`:
```ts
export const quoteService = {
  extract,          // new
  convertNotes,     // kept for backwards compat / existing tests
  captureAudio,     // kept for backwards compat / existing tests
  createQuote,
  listQuotes,
  getQuote,
  updateQuote,
  generatePdf,
  shareQuote,
};
```

**Step 4 — Add MSW handler for the new endpoint**

In `frontend/src/shared/tests/mocks/handlers.ts`, add a handler for `POST /api/quotes/extract` that returns a mock `ExtractionResult`. Use the existing `convert-notes` or `capture-audio` handler as the template for the response shape.

**Step 5 — Tests**

**Backend** — add tests in `backend/app/features/quotes/tests/test_quotes.py` (or a new `test_extract.py`):
- `POST /api/quotes/extract` with only typed notes → returns `ExtractionResult`
- `POST /api/quotes/extract` with only clips → returns `ExtractionResult`
- `POST /api/quotes/extract` with both clips and notes → returns `ExtractionResult` (mock transcription to return a known string, verify combined text was passed to extraction)
- `POST /api/quotes/extract` with neither clips nor notes → returns `400`
- `POST /api/quotes/extract` without CSRF → returns `403`
- `POST /api/quotes/extract` unauthenticated → returns `401`
- Rate limit enforcement (same as `capture-audio`)

**Frontend** — add `quoteService.extract` integration tests in a new file or extend `quoteService.integration.test.ts`:
- Sends multipart form with clips array and notes field
- When only `notes` provided, sends form with no clips
- When only `clips` provided, sends form with no notes field
- Uses MSW handler; asserts `ExtractionResult` shape returned

---

### Decision Lock — Text Ordering

**Chosen:** Audio transcript first, typed notes appended after blank line.

**Alternative considered:** Notes first, transcript appended. Rejected — contractors usually speak the bulk of the job description; typed additions are supplementary. LLM context reads top-to-bottom, so the primary content should lead.

**Revisit trigger:** If extraction quality suffers for jobs where typed notes contain the most precise pricing info, swap the order and A/B test.

---

### Decision Lock — `source_type` Handling

`source_type` (`"voice"` | `"text"`) is determined client-side based on whether clips were included in the request — this matches the existing pattern in `CaptureScreen.tsx` (`applyDraft("voice", ...)` / `applyDraft("text", ...)`). The `ExtractionResult` does not carry `source_type`. No backend change needed.

---

### Acceptance Criteria

- [ ] `POST /api/quotes/extract` accepts multipart form with optional `clips` files and optional `notes` string
- [ ] Clips-only path: transcribes clips and runs extraction on transcript
- [ ] Notes-only path: runs extraction on notes (equivalent to `convert-notes`)
- [ ] Both-present path: combines transcript + notes (transcript first) and runs one extraction pass
- [ ] Neither-present path: returns `400` with a clear detail message
- [ ] CSRF required; unauthenticated requests return `401`; rate limited at 10/minute per IP
- [ ] Existing `convert-notes` and `capture-audio` endpoints are unmodified and all their tests still pass
- [ ] `quoteService.extract()` exists in frontend service, is exported, and calls `POST /api/quotes/extract`
- [ ] MSW handler for `/api/quotes/extract` added to test mocks
- [ ] Backend tests cover all paths listed in Step 5
- [ ] Frontend integration tests cover `extract()` function
- [ ] `make backend-verify` and `make frontend-verify` both pass cleanly

---

### Files in Scope

Backend:
```
backend/app/features/quotes/service.py   (add extract_combined method)
backend/app/features/quotes/api.py       (add /extract endpoint)
```

Frontend:
```
frontend/src/features/quotes/services/quoteService.ts
frontend/src/shared/tests/mocks/handlers.ts
```

Tests to add:
```
backend/app/features/quotes/tests/test_quotes.py  (extend) or test_extract.py (new)
frontend/src/features/quotes/tests/quoteService.integration.test.ts  (extend)
```

---

### Files Explicitly Out of Scope

- `convert-notes` and `capture-audio` endpoints — do not touch
- `CaptureScreen.tsx` — UI changes are in the quote flow screens task
- All other feature areas

---

### Verification

```bash
make backend-verify
make frontend-verify
```

Raw fallback:
```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest
cd frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
