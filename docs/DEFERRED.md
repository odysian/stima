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
