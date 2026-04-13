# Deferred Items

Actionable items intentionally deferred during implementation. Each entry includes context so any agent or contributor can pick it up without archaeology.

---

## Anthropic Client Connection Pooling

**Source:** PR #19 review (Task #17 — Quote Drafting 3A Backend)
**Where:** `backend/app/shared/dependencies.py` → `get_quote_service`

`get_quote_service` creates a new `ExtractionIntegration` (and thus a new `AsyncAnthropic` client) per request. Each `POST /api/quotes/convert-notes` call instantiates a fresh HTTP client, wasting connections and adding TLS handshake latency at scale.

**Fix:** Introduce a singleton or app-lifespan-scoped Anthropic client (e.g., via FastAPI lifespan dependency or module-level cached instance). The `ExtractionIntegration` can accept an existing client via its `client` param — the plumbing already exists.

**Priority:** Low — fine for current v0 volume. Address before extraction traffic scales.

---

## Ruff Lint Rule Expansion + Import Sorting

**Source:** PR #19 review (Task #17)
**Where:** `pyproject.toml` → `[tool.ruff]`

Ruff currently runs with defaults only (`E` + `F`). No import sorting, no formatting enforcement, no bugbear checks. This allows style drift across contributors and agents.

**Priority:** Low — standalone cleanup task, no behavior change.

---

## Customer-Scoped Invoice Filtering Parity

**Source:** Spec #137 close-out review; follow-up Task #146
**Where:** customer-context contractor surfaces using document history, starting from `frontend/src/features/customers/components/CustomerDetailScreen.tsx`

Milestone 8 shipped `GET /api/invoices?customer_id=<id>` plus frontend service support, but the app still only exposes customer-scoped history for quotes. That leaves invoice filtering parity available in the transport contract without a first-class contractor surface using it.

**Fix:** Reuse the existing invoice list contract on the customer-scoped history surface so direct and quote-derived invoices can be viewed in customer context without creating a new invoice dashboard.

**Priority:** Medium — useful parity follow-up after M8 close-out, but not a blocker for the shipped milestone baseline.

---

## Frontend Document-Action Parity Hardening

**Source:** 2026-04-11 hardening spec review
**Where:** quote/invoice document action surfaces, starting from `frontend/src/features/quotes/components/QuotePreviewActions.tsx`, `frontend/src/features/quotes/hooks/useQuoteDocumentActions.ts`, `frontend/src/features/invoices/components/InvoiceDetailScreen.tsx`, `frontend/src/features/invoices/hooks/useInvoiceDetailActions.ts`, and `frontend/src/shared/components/DocumentActionSurface.tsx`

Quote and invoice detail flows both expose generate/open PDF, copy/share link, send/resend email, revoke/share state, busy-state locking, manual-copy fallback, and inline feedback. The repo already has `DocumentActionSurface` and `docs/analogs/stateful-action-matrix.md`, so this should not become a generic document-action framework by default.

**Fix:** When the next quote/invoice action change or concrete drift finding appears, compare the quote and invoice action matrices and extract only the shared state/helper pieces that reduce real drift risk. Preserve quote/invoice-specific status and copy differences explicitly.

**Priority:** Low — defer until a concrete frontend action change or drift finding creates a real payoff.

---

## Async Job Policy Inspectability

**Source:** 2026-04-11 hardening spec review
**Where:** extraction/PDF/email job policy and worker glue, starting from `backend/app/worker/runtime.py`, `backend/app/worker/job_registry.py`, `backend/app/features/jobs/repository.py`, quote/invoice PDF job entrypoints, and email delivery worker paths

Extraction, PDF, and email jobs carry important retry, terminal-failure, stale-revision, enqueue-failure, degraded-extraction, and artifact-cleanup semantics. The current repo already centralizes generic job lifecycle policy in worker runtime/repository code, so broad "async policy extraction" would be premature without a specific hotspot.

**Fix:** When the next change touches extraction/PDF/email worker semantics, stale artifact handling, retry/terminal behavior, or service decomposition around job logic, isolate one named policy slice only if it improves reviewability. Avoid broad worker architecture rewrites.

**Priority:** Low — revisit only when a concrete async/job change makes the current structure hard to inspect safely.

---

## Backend LOC Hard-Fail Enforcement

**Source:** 2026-04-12 quote modularity planning review
**Where:** `scripts/check_file_sizes.sh`, `Makefile`, `docs/WORKFLOW.md`, and `docs/PATTERNS.md`

Backend file-size checks currently warn for route/service/repository modules over the target budget. The eventual hard-fail threshold should remain `>350` LOC because it matches the documented split/follow-up threshold in the workflow docs.

Do not turn this on while the current backend baseline would fail immediately, especially while `backend/app/features/quotes/service.py` remains a known hotspot. Enforcing it too early would make `make backend-verify` red by design and add friction without improving reviewability.

**Fix:** After the quote-service modularity work gets the major hotspot clean or after an explicit baseline/allowlist task accepts temporary exceptions, update the file-size script so backend modules warn above the target budget and fail above the split threshold. Keep docs and CI aligned in the same task.

**Priority:** Medium — valuable guardrail, but only after the backend is clean enough that the gate enforces future drift instead of punishing existing debt.

---

## Toolchain Contract Drift Automation

**Source:** 2026-04-12 quote modularity planning review
**Where:** `.python-version`, `pyproject.toml`, `.github/workflows/*`, `frontend/package.json`, and canonical verification targets

The repo already expects runtime/toolchain contracts to stay explicit. A lightweight check could catch drift between pinned Python, Ruff target version, CI Python, Node engine, and CI Node setup.

**Fix:** Add a deterministic script that reports actionable mismatches and wire it into an appropriate verification target or CI step. Keep it small; do not introduce a large config system for version metadata.

**Priority:** Low — useful workflow hardening, but not part of the quote thin-facade refactor.

---

## Reviewer Risk-Focus Block

**Source:** 2026-04-12 quote modularity planning review
**Where:** `docs/template/KICKOFF.md`, PR template conventions, or implementation-agent PR summaries

Higher-risk tasks can be easier to review when the implementation output names the highest-risk files, invariants that must hold, areas intentionally not changed, and recommended review order. The current reviewer kickoff already carries much of this intent, so another required block could become workflow noise if added too broadly.

**Fix:** Revisit after one or two more high-risk refactors. If review handoffs still feel under-oriented, add a compact optional risk-focus convention in one canonical place.

**Priority:** Low — defer until there is concrete evidence the current kickoff/reviewer handoff is not enough.

---

## Quote Behavior Test-Suite Decomposition

**Source:** 2026-04-12 quote modularity planning review
**Where:** `backend/app/features/quotes/tests/test_quotes.py`

`test_quotes.py` is a broad behavior hub. Splitting it by behavior group could improve reviewability and CI failure triage, but doing it before the quote share refactor risks mixing test-file movement with behavior-slice implementation.

**Fix:** After the quote share modularity phases settle, plan a test-only task that moves existing tests into behavior-focused modules while preserving assertions and coverage intent. Include a "Do NOT duplicate" section because this is a test-focused task.

**Priority:** Low to Medium — useful after the service decomposition, not a blocker for Phase 1A or 1B.
