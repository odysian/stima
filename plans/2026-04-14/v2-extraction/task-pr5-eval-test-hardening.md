# Task — PR 5: Eval and test hardening

**Parent:** [`spec-v2-extraction.md`](./spec-v2-extraction.md).

**PR slot:** PR 5 — Backend/frontend tests + extraction eval fixtures for V2 pipeline and edge cases.

## GitHub labels (Task issue)

When filing this Task issue, apply (`docs/ISSUES_WORKFLOW.md`):

- `type:task`
- `area:quotes`
- `area:backend`
- `area:frontend`

---

## 1. Goal

Lock V2 extraction behavior, migration safety, UI flows, and append/sidecar lifecycle with automated tests and eval goldens so regressions are caught early and manual cleanup effort drops measurably on key scenarios.

---

## 2. In scope

PR 5 adds **matrix / golden / gap-fill** coverage (see §3 so suites stay thin at PR 1–4 boundaries). Individual PRs may already ship their minimal tests; this task completes the parent Verification + Eval lists where still missing.

**Backend tests** (representative list from parent §Verification plan)

- Expanded V2 schema validation and repair path.
- Line-item description/details normalization and duplicate flagging.
- Explicit pricing rule table parsing and guard interactions.
- Direct seeding of notes/pricing on initial extract; grouped review-state persistence.
- Append non-overwrite and append suggestion behavior.
- Hidden-item ID stability and lifecycle persistence.
- Degraded flows: minimal sidecar, sparse notes, surviving unresolved segments.
- Typed-vs-transcript conflict handling and `PreparedCaptureInput` provenance.
- V2 `confidence_notes` sparseness / operator-relevance where testable.

**Frontend tests**

- Grouped review markers, sidecar-driven reads (no localStorage for review confidence).
- Continue modal (visible-only gating).
- Capture Details ordering, alert icon rules, transcript read-only, degraded inspection.

**Eval / goldens** (parent §Eval list)

- Typed landscaping capture; spoken equivalent; mixed typed + voice.
- Patio/drainage invoice sample; messy shorthand; append-capture sample.
- Conflicting pricing sample; no-heading sample; typed-vs-transcript conflict.

**Practical signal**

- Document before/after spot checks for manual cleanup on golden cases (line-item edits, notes placement, pricing entry) as informal success metric.

---

## 3. Do NOT duplicate (`docs/ISSUES_WORKFLOW.md`)

PR 5 owns the **cross-cutting eval matrix** and **regression hardening** after PRs 1–4 land. Do **not** re-assert the full PR-local acceptance suites here as if PR 5 were the first time those behaviors were tested.

**Already owned by earlier tasks (keep PR-5 tests thin at those boundaries):**

| Area | Owned by |
|------|-----------|
| Additive-only V2 internals, worker legacy payload compatibility, V1 API unchanged | PR 1 |
| V1→V2 API switch, migrations, direct seeding, NULL sidecar defaults, line-item `flagged` columns, QuoteDetail rehydration | PR 2 |
| Grouped review markers, Capture Details UX, Continue gating, localStorage retirement for confidence notes | PR 3 |
| Append populated-field protection, append suggestions, `PATCH …/extraction-review-metadata`, quote PATCH clearing suggestions, deterministic hidden IDs | PR 4 |

**PR 5 should add:** scenario/eval coverage called out in the parent Verification + Eval sections that spans layers (typed/voice/mixed, degraded, append, conflicts), golden-case fixtures, and any **gap-filling** tests discovered during integration that do not naturally belong in PR 1–4’s narrower PRs.

---

## 4. Out of scope

- Changing product behavior beyond fixes required to satisfy tests (tests should follow locked spec).
- Live/provider-backed eval runs in restricted environments (follow repo `VERIFY.md` / `AGENTS.md` for agent constraints).

---

## 5. Dependencies / ordering

- **Requires** PRs **1–4** complete so tests target stable contracts and UI.

---

## 6. Acceptance criteria

(from parent spec — PR 5)

- Backend and frontend tests cover the new behaviors at appropriate depth.
- Eval fixtures cover: typed-only, voice-only, mixed, explicit pricing, degraded/no-line-item, append, typed-vs-transcript conflict.
- Manual review cleanup effort measurably reduced for key golden cases (team judgment / spot checks).

---

## 7. First test / assertion

Pick **one** of the following as the first automated lock for the eval track:

1. **Eval harness case:** add or extend a case in `app/features/quotes/tests/fixtures/extraction_eval_cases.py` (or adjacent eval data) plus an assertion in `app/features/quotes/tests/test_extraction_eval.py` that encodes one parent golden (for example typed-vs-transcript conflict or append-capture) and fails if output regresses on the harness’s invariant checks.
2. **Cross-layer smoke:** a single integration-style test that runs extract → GET detail → append → GET detail and asserts sidecar + draft fields match the parent append + hydration rules (only where not already fully covered by PR 4’s focused tests — use this for **matrix** coverage, not duplication).
3. **Degraded minimalism:** assert degraded extraction persists a minimal sidecar (no fabricated rich structures) while the main API still returns a usable quote detail payload.

---

## 8. Verification

Run from repo root (`docs/workflow/VERIFY.md`, `Makefile`).

**Tier 1 — targeted (eval harness; excluded from `backend-verify`):**

```bash
cd backend && .venv/bin/pytest -v -m extraction_eval -o cache_dir=.pytest_cache
```

(`make extraction-eval` runs the same command; see root `Makefile`.)

**Tier 3 — final gates:**

```bash
make backend-verify
make frontend-verify
```

**Optional operator-only (not CI gates by default):** `make extraction-quality` and live eval probes require provider keys — run manually per `README.md` / `Makefile` comments when changing prompts or models.

---

## 9. Implementation notes

- Prefer **fast, deterministic** tests over flaky full-model suites where parent allows fixtures/mocks.
- Keep eval dataset maintenance guidelines consistent with existing extraction eval docs in repo (if any).
