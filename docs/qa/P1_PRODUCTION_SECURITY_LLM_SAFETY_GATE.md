# P1 Production Security & LLM Safety Gate

Date: 2026-05-04  
Spec: #616 — P1 Spec 9: Production Security & LLM Safety Gate  
Scope: PR 1 only — inventory, classification, and follow-up task proposal  
Code reviewed: `4c2b8f5d58a5b670b73ebe6f3690679d5b707e6c` (`2026-05-04 4c2b8f5 P1 Spec 6: add in-app support contact flow (#690)`)  
Branch: `task-616-security-llm-safety-gate-pr1`

## Summary

Status: not ready to clear the P1 production safety gate yet.

P1 release blockers identified in this audit:
- Raw extraction transcript/tool payload logging can still be enabled in production.
- Production config does not fail closed on unsafe CORS origins.
- Production config does not fail closed on `COOKIE_HTTPONLY=false` for auth cookies.
- Audio/extraction failure paths still surface provider/internal error text to clients.
- Adversarial prompt-injection / unsafe-instruction smoke evidence is not yet present.

What already looks materially good:
- Auth uses cookie sessions with refresh rotation and CSRF double-submit.
- Repositories and many tests consistently scope authenticated document access by `user_id`.
- Public share routes are token-gated, revoked/expired links fail with generic `404`, and JSON/PDF responses are `no-store`.
- Backend and frontend Sentry init default to `send_default_pii=false`.

This PR makes no production code changes. It records the current state and the follow-up work required before pilot release.

## Environment / build reviewed

| Item | Value |
|---|---|
| Backend runtime | FastAPI + SQLAlchemy + Redis/ARQ + GCS + WeasyPrint |
| Frontend runtime | React 19 + Vite 8 |
| Backend dependency source | `backend/requirements.txt` |
| Frontend dependency source | `frontend/package.json` |
| Audit method | code-review-graph + targeted `rg`/`sed` inspection |
| Runtime verification | None required for this docs-only PR |

## Sensitive data inventory

| Data class | Where observed | Notes |
|---|---|---|
| Access/refresh/CSRF tokens | `backend/app/features/auth/api.py`, `backend/app/shared/dependencies.py`, `frontend/src/shared/lib/http.ts` | Access + refresh use cookies; CSRF cookie is intentionally JS-readable for the double-submit pattern. |
| Raw typed notes and raw transcripts | `backend/app/features/quotes/schemas.py`, `backend/app/features/quotes/extraction_service.py`, `backend/app/integrations/extraction.py` | Treated as product data and passed into extraction; highest logging/telemetry sensitivity surface. |
| Structured extraction payloads / model output | `backend/app/integrations/extraction.py` | Candidate payloads and final extraction results can include customer-entered scope, pricing, notes, and transcript-derived content. |
| Customer PII | `backend/app/features/customers/*`, `backend/app/features/quotes/api.py`, `backend/app/features/invoices/api.py` | Names, emails, phones, addresses appear in authenticated document detail and customer records. |
| Support contact messages | `backend/app/features/support/*` | User-entered sensitive support text; emailed to configured recipient; should not be persisted or logged by default. |
| Public share tokens | `backend/app/features/quotes/share/service.py`, `backend/app/features/invoices/share/service.py`, `backend/app/features/quotes/api.py` | Token-gated public access for landing pages, PDFs, and logos. |
| PDF artifacts and logo assets | `backend/app/worker/job_registry.py`, `backend/app/integrations/storage.py`, `backend/app/features/profile/service.py` | Stored in GCS; app proxies access rather than exposing raw storage URLs. |
| Pilot telemetry rows | `backend/app/shared/event_logger.py`, `backend/app/features/event_logs/models.py` | Persists internal IDs plus small metadata fields; raw notes/transcripts are not intentionally persisted there. |

## Logging and telemetry findings

| Area | Finding | Severity | P1 blocker? | Owner issue/PR | Verification |
|---|---|---:|---|---|---|
| Logging and telemetry | Extraction tracing is now metadata-only; raw transcripts, raw tool payloads, prompts, model responses, and exception messages are excluded from structured logs. | High | Yes | `#616 PR2` + `#616 PR3` | `backend/app/shared/extraction_logger.py`; `backend/app/integrations/extraction.py`; `backend/app/shared/observability.py` |
| Logging and telemetry | Security/event logging is mostly structured and uses hashed token refs / client IPs, but worker paths still emit `exc_info=True` / `logger.exception(...)`, leaving room for traceback-based leakage if upstream/provider exceptions carry request-sensitive text. | Medium | No | `#616 PR2` | `backend/app/shared/observability.py`; `backend/app/worker/runtime.py`; `backend/app/worker/job_registry.py`; `rg -n "exc_info=True|logger.exception|logger.warning" backend/app/worker backend/app/shared` |
| Logging and telemetry | Support contact flow accepts arbitrary user-entered sensitive text, but the message body is emailed rather than persisted, service logs stay at category + success/failure metadata, and user-facing failures are generic. This should remain a privacy invariant for future changes after Spec 6 / #690. | Low | No | Current state / Spec 6 | `backend/app/features/support/*`; `backend/app/features/support/tests/test_support_api.py` |

## Production config findings

| Area | Finding | Severity | P1 blocker? | Owner issue/PR | Verification |
|---|---|---:|---|---|---|
| Production config | Production validation blocks insecure cookies and wildcard `ALLOWED_HOSTS`, but it does not reject wildcard or otherwise unsafe `ALLOWED_ORIGINS`; `CORSMiddleware` still trusts whatever origin list is provided. | High | Yes | `#616 PR3` | `backend/app/core/config.py`; `backend/app/main.py`; `backend/app/core/tests/test_config.py`; `rg -n "allowed_origins|CORSMiddleware" backend/app/core/config.py backend/app/main.py backend/app/core/tests/test_config.py` |
| Production config | Production can explicitly degrade to in-memory limiter/idempotency/queue-disabled mode with `ALLOW_REDIS_DEGRADED_MODE=true`. This is warned and exposed via `/health`, so it is not silent, but release policy should decide whether that flag is allowed for pilot prod at all. | Medium | No | `#616 PR3` | `backend/app/core/config.py`; `backend/app/shared/redis_runtime.py`; `backend/app/main.py`; `backend/app/core/tests/test_config.py`; `backend/app/core/tests/test_main.py` |
| Production config | Admin routes are only mounted when `ADMIN_API_KEY` is present, which is good, but there is no minimum-length/placeholder validation if the key is set. | Medium | No | `#616 PR3` | `backend/app/main.py`; `backend/app/core/config.py`; `backend/app/admin/router.py`; `rg -n "admin_api_key|include_router\\(|X-Admin-Key" backend/app/main.py backend/app/core/config.py backend/app/admin/router.py` |

## Auth/session/cookie findings

| Area | Finding | Severity | P1 blocker? | Owner issue/PR | Verification |
|---|---|---:|---|---|---|
| Auth/session/cookie | Access and refresh cookies use path scoping, secure-cookie validation, refresh rotation, and CSRF double-submit. This is a solid baseline. | Low | No | Current state | `backend/app/features/auth/api.py`; `backend/app/features/auth/service.py`; `backend/app/shared/dependencies.py`; `docs/adr/001-cookie-auth-csrf-double-submit.md` |
| Auth/session/cookie | `COOKIE_HTTPONLY` is runtime-configurable and `_set_auth_cookies()` applies it directly, but production validation never forces it to stay `true`. A bad prod env can make access/refresh cookies readable by JavaScript. | High | Yes | `#616 PR3` | `backend/app/core/config.py`; `backend/app/features/auth/api.py`; `rg -n "cookie_httponly|httponly=settings.cookie_httponly" backend/app/core/config.py backend/app/features/auth/api.py` |
| Auth/session/cookie | The CSRF cookie is intentionally JS-readable because the app uses the double-submit pattern. This is an accepted design tradeoff, not a defect, but it should stay explicitly documented. | Low | No | Accepted risk (ADR-001) | `docs/adr/001-cookie-auth-csrf-double-submit.md`; `frontend/src/shared/lib/http.ts`; `backend/app/shared/dependencies.py` |

## Tenant isolation findings

| Area | Finding | Severity | P1 blocker? | Owner issue/PR | Verification |
|---|---|---:|---|---|---|
| Tenant isolation | Core authenticated repositories and services consistently scope reads/mutations by `user_id`, and existing tests already cover many cross-user `404` paths for customers, quotes, invoices, and line-item catalog items. | Low | No | Current state | `backend/app/features/{quotes,invoices,customers,line_item_catalog,profile}/repository.py`; `rg -n "user_id" backend/app/features/{quotes,invoices,customers,line_item_catalog,profile}`; `rg -n "different_users|other_user|returns_404" backend/app/features/{quotes,invoices,customers,line_item_catalog,invoices}/tests` |
| Tenant isolation | Coverage is not yet a single deliberate sweep for the exact Spec 9 scope: share/revoke/send/convert/PDF/public artifact negative cases should still be consolidated and extended before clearing the full gate. | Medium | No | `#616 PR4` | `backend/app/features/quotes/tests/test_quote_email.py`; `backend/app/features/invoices/tests/test_invoice_api.py`; `backend/app/features/quotes/tests/test_pdf.py`; `backend/app/features/quotes/tests/test_quote_to_invoice.py` |

## Upload/audio processing findings

| Area | Finding | Severity | P1 blocker? | Owner issue/PR | Verification |
|---|---|---:|---|---|---|
| Upload/audio processing | Clip count, per-clip byte size, total byte size, empty uploads, MIME/extension inference, and max combined duration are all enforced. Audio normalization stays in-process through `pydub`; there is no shell interpolation path here. | Low | No | Current state | `backend/app/features/quotes/api.py`; `backend/app/integrations/audio.py`; `backend/app/shared/input_limits.py`; `rg -n "MAX_AUDIO|infer_audio_format|normalize_and_stitch|from_file" backend/app/features/quotes/api.py backend/app/integrations/audio.py backend/app/shared/input_limits.py` |
| Upload/audio processing | Client-facing transcription/extraction errors still include exception text (`"Transcription failed: {exc}"`, `"Extraction failed: {exc}"`), which can leak provider/internal details. | High | Yes | `#616 PR5` + `#616 PR6` | `backend/app/features/quotes/extraction_service.py`; `backend/app/features/quotes/tests/test_quote_extraction.py`; `rg -n "Transcription failed:|Extraction failed:" backend/app/features/quotes/extraction_service.py backend/app/features/quotes/tests/test_quote_extraction.py` |

## LLM extraction safety findings

| Area | Finding | Severity | P1 blocker? | Owner issue/PR | Verification |
|---|---|---:|---|---|---|
| LLM extraction safety | Current design keeps a meaningful safety boundary: extraction uses a separate system prompt + structured JSON request, validates tool output against schema, and customer-facing actions remain separate explicit endpoints per ADR-007. | Low | No | Current state | `backend/app/integrations/extraction.py`; `backend/app/features/quotes/schemas.py`; `docs/adr/007-human-review-boundary-for-ai-assisted-documents.md` |
| LLM extraction safety | There is still no adversarial prompt-injection / unsafe-instruction smoke evidence beyond malformed-payload coverage. Final gate evidence is incomplete for inputs like “ignore previous instructions”, fake system messages, JSON breakers, or “auto-send / skip review” text. | High | Yes | `#616 PR6` | `backend/app/features/quotes/tests/test_extraction.py`; `backend/app/features/quotes/tests/test_extraction_service.py`; `backend/app/features/quotes/tests/test_quote_extraction.py`; `rg -n "ignore previous instructions|prompt injection|system prompt|developer message|auto-send|skip review|malformed" backend/app/features/quotes/tests backend/app/integrations/tests` |

## PDF/public-share findings

| Area | Finding | Severity | P1 blocker? | Owner issue/PR | Verification |
|---|---|---:|---|---|---|
| PDF/public-share | Public JSON/PDF routes are token-gated, emit `Cache-Control: no-store` for document payloads/PDFs, add `X-Robots-Tag: noindex`, and log denied tokens by hashed reference rather than raw token. Expired/revoked links return generic `404`. | Low | No | Current state | `backend/app/features/quotes/api.py`; `backend/app/features/quotes/share/service.py`; `backend/app/features/invoices/share/service.py`; `backend/app/features/quotes/tests/test_pdf.py` |
| PDF/public-share | Share links default to 90-day expiry and public logo bytes are cacheable for 5 minutes. Both appear intentional and revocable, but they should be treated as consciously accepted pilot tradeoffs rather than “free” defaults. | Medium | No | `#616 PR7` or accepted pilot risk | `backend/app/core/config.py`; `backend/app/features/quotes/share/tokens.py`; `backend/app/features/quotes/api.py`; `rg -n "public_share_link_expire_days|max-age=300|Cache-Control" backend/app/core/config.py backend/app/features/quotes/share/tokens.py backend/app/features/quotes/api.py` |

## Dependency/container/secrets findings

| Area | Finding | Severity | P1 blocker? | Owner issue/PR | Verification |
|---|---|---:|---|---|---|
| Dependency/container/secrets | Dependency audit is partially wired already (`pip-audit`, `npm audit`), Bandit is in the verify path, env files are gitignored, and bucket privacy expectations are documented. | Low | No | Current state | `.github/workflows/dependency-audit.yml`; `Makefile`; `.gitignore`; `docs/runbooks/gcs-bucket-security.md`; `git ls-files backend/.env backend/backend.prod.env`; `git check-ignore -v backend/.env backend/backend.prod.env frontend/.env.local` |
| Dependency/container/secrets | The backend Docker image still runs as root, and the repo does not show automated secret scanning or container image scanning. | Medium | No | `#616 PR8` | `backend/Dockerfile`; `.github/workflows/dependency-audit.yml`; `rg -n "gitleaks|trivy|grype|USER " backend/Dockerfile .github/workflows docs` |

## Release-blocking fixes

These are the minimum child-task candidates required to clear the blockers above.

1. `#616 PR2 — Sensitive logging and telemetry redaction`
   - CURRENTLY IMPLEMENTING
   - Remove any production path that can emit raw transcripts, raw tool payloads, prompts, or model responses.
   - Add sentinel log-capture tests for extraction traces, worker failures, and security logs.

2. `#616 PR3 — Production config fail-closed checks`
   - DONE
   - Reject `COOKIE_HTTPONLY=false` in production.
   - Reject wildcard or unsafe `ALLOWED_ORIGINS` in production.
   - Keep extraction tracing metadata-only in all environments.
   - Decide whether `ALLOW_REDIS_DEGRADED_MODE=true` is allowed for pilot prod or must remain emergency-only.
   - Add validation for `ADMIN_API_KEY` strength if the route is enabled.

3. `#616 PR5 — Upload/audio processing hardening`
   - Replace provider/internal exception passthrough with generic client-safe error text plus internal reason codes.
   - Reduce traceback leakage from worker/audio/transcription paths or guarantee redacted logging.

4. `#616 PR6 — LLM extraction safety hardening`
   - Add adversarial fixtures for prompt injection, fake system/developer content, JSON-breaking notes, and “skip review / auto-send” attempts.
   - Prove extraction cannot trigger share/send/convert or bypass the human-review boundary.

Gate-required evidence before closing #616:
- `#616 PR4` — dedicated tenant-isolation sweep for share/revoke/send/convert/PDF/public artifact negative cases.

Recommended parallel/non-blocking follow-ups for later remediation PR sequencing:
- `#616 PR7` — explicit review of share-token TTL, public logo cache policy, and public payload minimization.
- `#616 PR8` — non-root container, secret scanning, and image-scan checklist.

Suggested remediation order:
1. `#616 PR3` — production config fail-closed checks
2. `#616 PR2` — sensitive logging / telemetry redaction
3. `#616 PR5` — client-safe upload/audio/transcription/extraction errors
4. `#616 PR6` — LLM extraction safety smoke tests
5. `#616 PR4` — tenant-isolation evidence sweep
6. `#616 PR7` / `#616 PR8` — public-share and dependency/container checklist work as needed

## Accepted/deferred risks

| Area | Finding | Severity | P1 blocker? | Owner issue/PR | Verification |
|---|---|---:|---|---|---|
| Accepted/deferred risks | Raw notes/transcripts remain stored as product data in quote records because the workflow requires review/edit of captured content. Retention/minimization beyond logging is not solved by this PR and should be revisited before broader than founder-led pilot usage. | Medium | No | Deferred beyond PR1; future policy task | `backend/app/features/quotes/schemas.py`; `backend/app/features/quotes/api.py`; `backend/app/integrations/extraction.py` |
| Accepted/deferred risks | Public-share defaults (90-day expiry, short logo cache) are acceptable for a limited founder-led pilot only if revocation remains operator-visible and users understand share is explicit. | Medium | No | `#616 PR7` or explicit pilot sign-off | `backend/app/core/config.py`; `backend/app/features/quotes/share/tokens.py`; `backend/app/features/quotes/api.py` |
| Accepted/deferred risks | Container hardening and automated secret/image scanning are real hygiene gaps, but they are lower priority than the direct data-leak and error-surface blockers above. | Medium | No | `#616 PR8` | `backend/Dockerfile`; `.github/workflows/dependency-audit.yml` |

## Verification results

Docs-only verification performed for this PR:
- Readback required after file creation.
- No backend/frontend test targets run because this PR changes docs only.

Audit commands used:

```bash
rtk git rev-parse HEAD
rtk git log -1 --format='%cs %h %s'
rtk rg --files backend/app frontend/src docs | rtk rg 'auth|extraction|public|invoice|quote|customer|catalog|config|security|observability|event_logger|worker|audio|upload|pdf|share|storage|telemetry|sentry|http|profile|logo|Docker|docker|compose|requirements|package|Makefile|env|README'
rtk rg -n "raw_transcript|raw_tool_payload|log_extraction_trace|logger\\.|logging\\.|captureException|sentry|log_event\\(|log_security_event\\(" backend/app frontend/src
rtk rg -n "UploadFile|multipart|ffmpeg|subprocess|NamedTemporaryFile|TemporaryDirectory|tempfile|mkstemp|audio|transcript|transcription|mime|content_type|max.*size|MAX_" backend/app frontend/src
rtk rg -n "share token|share_token|public/doc|/share/|public share|public_.*token|token" backend/app/features frontend/src/features/public docs/analogs
rtk rg -n "user_id|current_user|owner|tenant|list_by_user|get_by_id\\(|WHERE .*user_id|filter.*user_id" backend/app/features/{quotes,invoices,customers,line_item_catalog,profile}
rtk rg -n "Dockerfile|FROM |USER |secret|\\.env|npm audit|pip-audit|safety|bandit|trivy|grype|gitleaks|semgrep" -g 'Dockerfile*' -g '*.yml' -g '*.yaml' -g '*.md' -g 'Makefile' .
rtk git ls-files backend/.env backend/backend.prod.env frontend/.env.local .env .env.local
rtk git check-ignore -v backend/.env backend/backend.prod.env frontend/.env.local
```

Readback command for this artifact:

```bash
sed -n '1,260p' docs/qa/P1_PRODUCTION_SECURITY_LLM_SAFETY_GATE.md
```
