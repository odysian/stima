# Plan: Audio Integration Test Fixtures

**Status:** Ready for issue
**Parent feature:** Task #27 voice capture (follow-up)
**Date:** 2026-03-21

---

## Problem

`AudioIntegration.normalize_and_stitch` and `_decode_clip` are tested entirely with fakes.
The real pydub + ffmpeg decode path is marked `# pragma: no cover` and is untested.
A format-inference regression or ffmpeg availability issue would pass CI silently.

---

## Scope

Offline audio integration tests only. No external API calls. No live transcription smoke test (deferred to a separate fast-mode task requiring a real speech fixture).

### Fixtures — conftest-generated, no binary blobs committed

Session-scoped fixtures in a new `conftest.py`:

- WAV: synthesized in-process via stdlib `wave` (440 Hz tone, 1 s)
- webm: WAV piped through `subprocess.run(["ffmpeg", ...])` at session start
- m4a: same

No `skipif` guard. If ffmpeg is absent the tests fail — that is the intended behavior and the whole point of these tests. `ubuntu-latest` CI runners ship ffmpeg pre-installed so no CI workflow changes are needed.

### Cases to cover

**Happy path:**
- Single WAV clip: output is valid WAV with channels=1, framerate=16000, sampwidth=2
- Single webm clip: same output contract assertions
- Single m4a clip: same output contract assertions
- Two-clip stitch (two WAVs): output duration ≥ clip1 + gap (300 ms) + clip2

**Error path:**
- Corrupted bytes (garbage content, valid `AudioClip` wrapper): raises `AudioError` — exercises the `except` block in `_decode_clip` currently marked `# pragma: no cover`

### Assertions

WAV output contract (all single-clip and stitch tests): parse returned bytes with stdlib `wave` and assert `nchannels == 1`, `framerate == 16000`, `sampwidth == 2`. Stitch test additionally asserts output duration ≥ clip1 + 300 ms gap + clip2 (within a small tolerance).

---

## Files changed

| File | Action |
|---|---|
| `backend/app/integrations/tests/conftest.py` | New — session-scoped `wav_bytes`, `webm_bytes`, `m4a_bytes` fixtures |
| `backend/app/integrations/tests/test_audio_integration.py` | New — 5 cases above |

`backend/app/integrations/tests/test_audio.py` and all production code — untouched.

---

## Acceptance criteria

- `make backend-verify` passes with the new tests included (no `-m` exclusions needed; these are not marked `live`)
- Single WAV, webm, and m4a tests each assert the normalization output contract (channels, frame rate, sample width)
- Two-clip stitch test asserts approximate combined duration is `clip1 + 300 ms gap + clip2`
- Corrupted-bytes test asserts `AudioError` is raised and `# pragma: no cover` can be removed from `_decode_clip`'s except block

## Verification

```bash
make backend-verify
```

---

## Out of scope

- Changing any production behavior (except removing `# pragma: no cover` on `_decode_clip`'s except block)
- Live transcription smoke test — deferred; requires a real speech recording and a separate task
- `make transcription-live` Makefile target — deferred with Layer 2
- Explicit `_infer_format` fixture-backed round-trip tests — implicit coverage via single-clip tests is sufficient
- Concurrent `startRecording` frontend edge case (low priority; guard already in place)
