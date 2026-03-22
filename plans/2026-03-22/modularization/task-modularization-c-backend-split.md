# Task C: Backend service split — extract ExtractionService, deduplicate clip validation

**Parent Spec:** Codebase modularization
**Mode:** gated child task
**Type:** no-contract refactor

## Summary

Extract the extraction pipeline (audio + transcription + Claude extraction) from `QuoteService` into a dedicated `ExtractionService`. The two concerns have zero dependency overlap — extraction never touches the repository, CRUD never touches integrations. Also deduplicate clip validation logic in `api.py`.

## Scope

### 1. Extract `ExtractionService` (service.py 359 -> ~210 LOC)

**New file:** `backend/app/features/quotes/extraction_service.py` (~110 LOC)

Move from `service.py`:
- `CaptureAudioClip` dataclass (lines 119-125)
- `ExtractionIntegrationProtocol` (lines 95-98)
- `AudioIntegrationProtocol` (lines 107-110)
- `TranscriptionIntegrationProtocol` (lines 113-116)
- `ExtractionService` class with methods:
  - `convert_notes(notes: str) -> ExtractionResult`
  - `capture_audio(clips: list[CaptureAudioClip]) -> ExtractionResult`
  - `extract_combined(clips: list[CaptureAudioClip] | None, notes: str | None) -> ExtractionResult`

**Remaining in `service.py`:** `QuoteService` with:
- `QuoteRepositoryProtocol`, `PdfIntegrationProtocol` (kept here — only CRUD/PDF uses them)
- CRUD: `create_quote`, `list_quotes`, `get_quote`, `get_quote_detail`, `update_quote`
- PDF/share: `generate_pdf`, `generate_shared_pdf`, `share_quote`
- Helpers: `_resolve_user_id`, `_is_doc_sequence_collision`, `_utcnow`

**Why this split is clean:**
- Extraction methods depend only on `_extraction`, `_audio`, `_transcription` integrations
- They never call `_repository` or `_pdf`
- CRUD/PDF methods never call `_extraction`, `_audio`, `_transcription`
- Zero circular dependency risk

### 2. Update `api.py` dependency injection

- Add `get_extraction_service()` dependency factory in `shared/dependencies.py` (same location as `get_quote_service`)
- Extraction endpoints (`convert_notes`, `capture_audio`, `extract_combined`) inject `ExtractionService`
- CRUD/PDF endpoints continue injecting `QuoteService`
- `QuoteService.__init__` no longer accepts extraction/audio/transcription integrations

### 3. Deduplicate clip validation in `api.py`

Extract the ~16-line clip validation block (duplicated in `capture_audio` and `extract_combined` endpoints) into:

```python
async def _parse_upload_clips(clips: list[UploadFile]) -> list[CaptureAudioClip]:
```

Private helper at module level. Both endpoints call it instead of duplicating the loop.

## Files touched

**New files:**
- `backend/app/features/quotes/extraction_service.py`

**Modified files:**
- `backend/app/features/quotes/service.py` (remove extraction methods + protocols)
- `backend/app/features/quotes/api.py` (update DI, extract clip helper)
- `backend/app/shared/dependencies.py` (add `get_extraction_service`)

**Test files — one required change in `test_quotes.py`.**

The current `autouse=True` fixture `_override_quote_service_dependency` builds a `QuoteService` with all integrations (extraction, audio, transcription, PDF). After the split, `QuoteService.__init__` no longer accepts extraction integrations, and extraction endpoints inject `ExtractionService` via `get_extraction_service`.

Split the single fixture into two `autouse=True` fixtures:

```python
@pytest.fixture(autouse=True)
def _override_quote_service_dependency() -> Iterator[None]:
    async def _override(db: Annotated[AsyncSession, Depends(get_db)]) -> QuoteService:
        return QuoteService(
            repository=QuoteRepository(db),
            pdf_integration=_MockPdfIntegration(),
        )
    app.dependency_overrides[get_quote_service] = _override
    yield
    app.dependency_overrides.pop(get_quote_service, None)

@pytest.fixture(autouse=True)
def _override_extraction_service_dependency() -> Iterator[None]:
    async def _override() -> ExtractionService:
        return ExtractionService(
            extraction_integration=_MockExtractionIntegration(),
            audio_integration=_MockAudioIntegration(),
            transcription_integration=_MockTranscriptionIntegration(),
        )
    app.dependency_overrides[get_extraction_service] = _override
    yield
    app.dependency_overrides.pop(get_extraction_service, None)
```

Both fixtures remain `autouse=True` — all tests get both overrides registered. No test bodies change. The four mock classes stay as-is. Add two new imports: `ExtractionService` from `app.features.quotes.extraction_service` and `get_extraction_service` from `app.shared.dependencies`.

## Acceptance criteria

- [ ] `extraction_service.py` exists with `ExtractionService` class (~110 LOC)
- [ ] `service.py` no longer contains extraction/audio/transcription methods or protocols (~210 LOC)
- [ ] `api.py` clip validation is not duplicated (`api.py` will be ~238 LOC post-refactor — warn tier only, no further split warranted until new endpoints are added)
- [ ] `test_quotes.py` fixture split as described above (two `autouse=True` fixtures, no test body changes)
- [ ] All 147 backend tests pass
- [ ] `ruff check`, `mypy`, `bandit` all pass
- [ ] No API contract changes (same endpoints, same request/response shapes)

## Parity lock

- Status code parity: all endpoints return same status codes
- Response schema parity: `ExtractionResult` shape unchanged
- Error semantics parity: same `QuoteServiceError` / `ExtractionError` / `AudioError` / `TranscriptionError` handling
- Side-effect parity: same integration calls in same order

## Verification

```bash
make backend-verify
```
