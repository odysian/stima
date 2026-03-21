# Task: Extraction Live Validation (V0 Task 4.5)

## Goal

Build a repeatable live validation instrument that runs the real `ExtractionIntegration`
against all six transcript fixtures using the actual Claude API. Gives concrete confidence
in prompt quality and null-semantics correctness before Task 5 (Voice Capture) adds
transcription noise on top of extraction.

All existing tests mock the Claude response — they verify integration mechanics but cannot
tell you whether the prompt actually works. This task closes that gap with an on-demand
run target (`make extraction-live`) that prints a human-readable report card per fixture.

Phase 2 (new fixture scenarios based on findings) is a separate follow-up task. This task
only ships the live test infrastructure and the six per-fixture assertions.

## Parent Spec / Roadmap Reference

`docs/V0_ROADMAP.md` § Task 4.5 (inserted between Task 4 and Task 5)

---

## Locked Design Decisions (Whiteboard 2026-03-20)

### Marker: `@pytest.mark.live`
Register a `live` marker in `pytest.ini`. Live tests carry this marker. Standard CI and
`make backend-verify` must explicitly run `pytest -m "not live"` so live tests are
excluded even when `ANTHROPIC_API_KEY` is present. `make extraction-live` passes
`-m live -s -v` explicitly.

### Auto-skip when API key absent
Module-level `pytestmark` uses `pytest.mark.skipif` against `get_settings().anthropic_api_key`.
If the key is empty, all live tests skip with a clear message rather than failing.
No `os.getenv` calls — `get_settings()` reads from `.env` via `pydantic-settings`.

### Settings source
`get_settings()` already exposes `anthropic_api_key` and `extraction_model`
(defaults to `claude-haiku-4-5-20251001` unless `EXTRACTION_MODEL` is overridden in
`.env`). Live tests use the configured model — no hard-coded model pin, no separate
env var.

### Co-located with existing extraction tests
`test_extraction_live.py` lives alongside `test_extraction.py` in
`backend/app/features/quotes/tests/`. No separate directory, no extra conftest.
The shared `conftest.py` runs (sets `SECRET_KEY`, creates DB engine object) but
the live tests do not use DB fixtures — the engine never connects.

### Per-fixture null-semantics assertions
Each live test asserts the null-semantics contract that applies to its fixture type,
not just "no exception raised":
- `clean_with_total` — total equals `435`, all item prices not None
- `clean_no_prices` — all item prices None, total None
- `total_only` — total equals `2100`, all item prices None
- `partial_ambiguous` — mixed prices, `confidence_notes` non-empty
- `noisy_with_hesitation` — captures the explicit mulch price signal (`120`) in at least
  one line item, total None (no total stated)
- `no_pricing_at_all` — all nulls, `confidence_notes` non-empty

### Report card output
Each test prints a structured report card so the developer can read what Claude
actually returned. Output visible via `-s` flag in `make extraction-live`.

Format:
```
[clean_with_total]
  items: Install floodlights ($180.00), Replace switch ($75.00)
  total: $435.00
  confidence: []
```

### `make extraction-live` target
New Makefile target, explicitly excluded from `make verify` and `make backend-verify`.
`backend-verify` adds `-m "not live"` to its pytest invocation. `extraction-live`
reuses the usual backend `.venv` preflight check, then runs:
`cd backend && .venv/bin/pytest -m live -s -v`
Documented in `make help` with a note that it requires `ANTHROPIC_API_KEY` in `.env`.

---

## Considerations / Follow-Ups

- **Phase 2 (new fixtures):** After running live, review report cards for gaps —
  currency variants (`$120` / `120 bucks` / `one-twenty`), compound quantities
  (`2 units at 50 each`), very terse input (`"weeding"`), multi-trade notes.
  Any gap becomes a new fixture in `transcripts.py` + a mocked test in
  `test_extraction.py`. Scoped to a separate follow-up task.

- **Prompt quality findings:** If the live run surfaces systemic issues (Claude
  inventing prices, ignoring `confidence_notes`, mishandling hesitation speech),
  fix `EXTRACTION_SYSTEM_PROMPT` or `EXTRACTION_TOOL_SCHEMA` in
  `backend/app/integrations/extraction.py` before starting Task 5.

- **Model in use:** Default is `claude-haiku-4-5-20251001` (from `Settings.extraction_model`).
  If a developer overrides `EXTRACTION_MODEL` in `.env`, live tests validate that
  model instead. No action needed — this is the correct behavior.

---

## Scope

### Backend only

**`backend/pytest.ini`:**
- Add `markers` entry: `live: Tests that call real external APIs (excluded from CI)`

**`backend/app/features/quotes/tests/test_extraction_live.py`** (new):
- Module-level `pytestmark` with `skipif` on `get_settings().anthropic_api_key`
- One async test per fixture (6 total), each marked `@pytest.mark.live`
- Each test instantiates `ExtractionIntegration` with real settings
- Each test calls `integration.extract(transcript)` and asserts null-semantics contract
- Each test prints a report card to stdout

**`Makefile`:**
- Update `backend-verify` pytest invocation to explicitly exclude live tests:
  ```makefile
  .venv/bin/pytest -v -m "not live" -o cache_dir=.pytest_cache
  ```
- Add `extraction-live` target:
  ```makefile
  extraction-live: ## Run live extraction tests against real Claude API (requires ANTHROPIC_API_KEY in .env)
  	@test -x backend/.venv/bin/pytest || (echo "Missing backend/.venv. Run: cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" && exit 1)
  	@cd backend && .venv/bin/pytest -m live -s -v
  ```

**`docs/V0_ROADMAP.md`:**
- Insert Task 4.5 section between Task 4 and Task 5

---

## File Targets

| File | Action | Purpose |
|---|---|---|
| `backend/app/features/quotes/tests/test_extraction_live.py` | Create | Six live tests + report card output |
| `backend/pytest.ini` | Modify | Register `live` marker |
| `Makefile` | Modify | Add `extraction-live` target |
| `docs/V0_ROADMAP.md` | Modify | Insert Task 4.5 |

---

## Acceptance Criteria

- [ ] `make extraction-live` runs 6 tests against real Claude and prints report cards
- [ ] Each test asserts null-semantics specific to its fixture (not generic "no crash")
- [ ] Tests auto-skip (not fail) when `ANTHROPIC_API_KEY` is absent or empty
- [ ] `make backend-verify` explicitly excludes live tests via `-m "not live"` and still passes
- [ ] `live` marker registered in `pytest.ini` (no unknown-marker warning)
- [ ] `make extraction-live` appears in `make help` output
- [ ] `docs/V0_ROADMAP.md` updated with Task 4.5 section

---

## Verification

```bash
# Standard suite — live tests must be excluded (no API calls, no failures)
make backend-verify

# Live run — requires ANTHROPIC_API_KEY in .env
make extraction-live
```
