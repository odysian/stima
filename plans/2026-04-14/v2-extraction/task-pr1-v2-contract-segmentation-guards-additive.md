# Task — PR 1: V2 extraction contract, prepared input, segmentation, guards (additive-only)

**Parent:** [`spec-v2-extraction.md`](./spec-v2-extraction.md).

**PR slot:** PR 1 — V2 extraction contract + backend validation/guards (**additive-only**: no API or persistence shape changes).

## GitHub labels (Task issue)

When filing this Task issue, apply (`docs/ISSUES_WORKFLOW.md`):

- `type:task`
- `area:quotes`
- `area:backend`
- `area:integrations`

---

## 1. Goal

Introduce the V2 extraction result model, structured capture input with provenance, deterministic segmentation, and updated validation / repair / semantic guards **internally** while keeping all external contracts (API responses, persistence, worker-visible shapes to consumers) on V1 until PR 2.

---

## 2. In scope

- **`ExtractionResultV2`** (or equivalent) with `pricing_hints`, `customer_notes_suggestion`, `unresolved_segments`, `pipeline_version`, and related nested types per parent spec contract section.
- **`PreparedCaptureInput`** replacing a flat string as the input to extraction integration: `transcript`, `source_type`, `raw_typed_notes`, `raw_transcript` — preserves typed vs transcript provenance for conflict rules later.
- **`CaptureSegment`** and **deterministic segmentation** rules (narrow/structural: blank lines, bullets, headings, trailing price patterns; safe normalization only).
- Model **prompt and tool schema** updates for V2 placement targets; narrowed **`confidence_notes`** semantics (sparse, operator-relevant) in prompt and sentinel/guard notes.
- **Validation**, **repair**, and **semantic/placement guard** updates for the V2 schema.
- **Typed / voice / mixed** input all flow through the same internal contract.
- **Worker payload backward compatibility:** ARQ job function accepts both legacy `transcript: str` kwargs and new structured `PreparedCaptureInput` (or equivalent serialized shape) for at least one deployment window; legacy string jobs must deserialize into `PreparedCaptureInput` without failing in-flight jobs.

---

## 3. Out of scope

- Changing API response shapes or replacing persisted `ExtractionResult` in DB/API.
- Frontend type or service changes.
- `extraction_review_metadata` column, direct seeding of notes/pricing, line-item DB flag columns (PR 2).
- Append behavior, Capture Details UI, sidecar mutation endpoint (PRs 3–4).

---

## 4. Dependencies / ordering

- **After** PR 0 optional (logging helps debugging).
- **Before** PR 2: internal V2 path must be stable enough to wire through API/persistence in the next PR.

---

## 5. Acceptance criteria

(from parent spec — PR 1)

- V2 `ExtractionResultV2` type validates correctly alongside V1.
- `PreparedCaptureInput` structured type replaces flat string input to the extraction integration (provenance preserved end-to-end through the pipeline to the model).
- Repair path still works for V2 schema.
- Semantic and placement guards behave correctly for V2 outputs.
- Typed / voice / mixed input all use the same contract internally.
- **V1 API responses and persistence remain unchanged.**
- Worker accepts legacy `transcript: str` and new structured payloads; constructs `PreparedCaptureInput` from legacy string when needed.

---

## 6. First test / assertion

Pick **one** of the following as the first automated lock (the rest can follow in the same PR or immediately after):

1. **Schema + repair:** a unit/integration test that feeds minimally invalid `ExtractionResultV2`-shaped tool output through validation and asserts the repair path returns a valid V2 payload (or raises a controlled error) without touching HTTP/DB.
2. **Worker compatibility:** a test that invokes the ARQ job handler (or the same deserialization helper it uses) with legacy kwargs `{"transcript": "<string>"}` and asserts the constructed `PreparedCaptureInput` matches the legacy single-string semantics (`raw_typed_notes` / `raw_transcript` null or as documented).
3. **Provenance:** a test that builds `PreparedCaptureInput` from mixed typed notes + transcript and asserts both branches are still visible to segmentation/prompt assembly (not flattened away before the model boundary).

---

## 7. Verification

Run from repo root (`docs/workflow/VERIFY.md`, `Makefile`).

**Tier 1 — targeted:**

```bash
cd backend && .venv/bin/ruff check . --cache-dir .ruff_cache && .venv/bin/ruff format --check .
cd backend && .venv/bin/pytest app/features/quotes/tests/test_extraction.py app/features/quotes/tests/test_extraction_service.py app/features/quotes/tests/test_quote_extraction.py -v -m "not live and not extraction_eval and not extraction_quality" -o cache_dir=.pytest_cache
```

**Tier 3 — final gate:**

```bash
make backend-verify
```

**Coverage intent (PR 1):** extend the above files (or add a focused module under `app/features/quotes/tests/`) for V2 schema validation, repair on invalid structured output, guard behavior, `PreparedCaptureInput` provenance, and narrowed `confidence_notes` semantics — see parent spec Verification plan.

---

## 8. Implementation notes

- PR 1 is the mitigation for **Risk 6** (V1→V2 migration): no intermediate broken frontend/backend contract.
- Internal `source_type` tri-state (`text` | `voice` | `voice+text`) is pipeline-internal; persisted `Document.source_type` stays binary per parent spec.
