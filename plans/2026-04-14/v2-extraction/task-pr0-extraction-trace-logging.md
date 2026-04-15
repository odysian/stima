# Task — PR 0: Extraction trace logging

**Parent:** [`spec-v2-extraction.md`](./spec-v2-extraction.md) (Stima Extraction Pipeline V2 — Clean Implementation Spec).

**PR slot:** PR 0 — Extraction trace logging (instrumentation only).

## GitHub labels (Task issue)

When filing this Task issue, apply (`docs/ISSUES_WORKFLOW.md`):

- `type:task`
- `area:quotes`
- `area:backend`
- `area:tooling`

---

## 1. Goal

Add structured extraction trace logging so operators and engineers can debug extraction without changing product behavior. Logging is a Phase 0 / parallel instrumentation stream, not part of the main review workflow.

---

## 2. In scope

- Dedicated **`stima.extraction`** logger: additive alongside existing `stima.events` and `stima.security`, same structured JSON + stdout pattern and `current_correlation_id()` context.
- **Metadata-only by default**; raw transcript / tool payload content only behind explicit opt-in configuration.
- Correlation IDs on trace records.
- Stage-based traces aligned with the pipeline: **primary**, **repair**, **result** (and any other stages named consistently with existing extraction code).
- No dependency on product UI for raw debug logs.

---

## 3. Out of scope

- Any change to extraction results, API responses, persistence, or frontend.
- V2 contract types, segmentation, guards, sidecar, or review UI (PRs 1–5).

---

## 4. Dependencies / ordering

- **None** (can land first). Prefer landing before heavy PR 1 work so subsequent changes have traces available.

---

## 5. Acceptance criteria

(from parent spec §PR-local acceptance criteria — PR 0)

- Structured extraction trace records emit at the intended stages.
- Metadata-only by default; raw content requires explicit opt-in.
- No product behavior changes.

---

## 6. Verification

Run from repo root (`docs/workflow/VERIFY.md`, `Makefile`).

**Tier 1 — targeted (fast signal):**

```bash
cd backend && .venv/bin/ruff check . --cache-dir .ruff_cache && .venv/bin/ruff format --check .
cd backend && .venv/bin/pytest app/features/quotes/tests/test_extraction.py app/features/quotes/tests/test_extraction_service.py -v -m "not live and not extraction_eval and not extraction_quality" -o cache_dir=.pytest_cache
```

**Tier 3 — final gate (PR merge):**

```bash
make backend-verify
```

**Manual (logging-specific):** trigger one extract path locally and confirm trace lines appear at primary/repair/result boundaries; confirm default config does not log raw transcript or full tool payloads (opt-in only).

---

## 7. Separation of concerns (parent reminder)

- **Transcript** = product data.
- **Sidecar** = product behavior metadata (later PRs).
- **Logs** = debug/trace instrumentation (this task).
