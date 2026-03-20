# Task: PDF Share Hardening + Render Performance Follow-Ups (V0 Task 5)

## Goal

Harden the PDF/share flow after Task 4 by removing misleading UX on canceled share actions,
reducing per-request PDF integration overhead, and preparing PDF rendering for higher traffic
without changing API contracts.

## Parent Reference

- Prior implementation: Task #21 / PR #22
- Roadmap continuity: `docs/V0_ROADMAP.md` (post-Task 4 hardening follow-up)

---

## Non-Goals

- No schema changes
- No API contract changes (status codes, response body shapes, routes)
- No async job queue or background worker architecture shift in this task
- No broad E2E framework introduction

---

## Problem Framing

Post-review findings identified three low-severity improvements:

1. `navigator.share()` cancel path can surface a misleading error despite successful share-token generation.
2. `PdfIntegration()` currently builds Jinja environment per request.
3. WeasyPrint rendering is synchronous and can block the event loop under load.

Additionally, test coverage should expand for negative UI paths and template rendering behavior.

---

## Scope

### Frontend

- Keep share cancel (`AbortError`) as a no-op with no error banner.
- Add/extend `QuotePreview` tests for:
  - quote fetch failure
  - PDF generation failure
  - share request failure
  - share dialog cancel path remains non-error

### Backend

- Convert PDF integration dependency construction to a cached singleton dependency.
- Run WeasyPrint rendering via `asyncio.to_thread(...)` to avoid blocking the async loop.
- Add targeted tests validating:
  - PDF rendering still returns expected bytes/content type path
  - threading/offload path does not alter endpoint behavior
  - template-level behaviors:
    - null prices render blank
    - "Updated" date row appears only when timestamp delta exceeds threshold

### Documentation

- Add a short note in relevant docs/comments where needed about:
  - why `to_thread` is used
  - why shared integration instance is safe

---

## File Targets

| File | Action | Purpose |
|---|---|---|
| `backend/app/shared/dependencies.py` | Modify | Cache `PdfIntegration` provider |
| `backend/app/features/quotes/service.py` | Modify | Offload PDF render via `asyncio.to_thread` |
| `backend/app/integrations/pdf.py` | Modify | Keep render API thread-safe and documented |
| `backend/app/features/quotes/tests/test_pdf.py` | Modify | Cover threaded render path behavior |
| `backend/app/integrations/tests/test_pdf.py` (new if needed) | Create | Template rendering assertions |
| `frontend/src/features/quotes/components/QuotePreview.tsx` | Verify/minor | Preserve no-op cancel behavior |
| `frontend/src/features/quotes/tests/QuotePreview.test.tsx` | Modify | Add missing error-state coverage |

---

## Acceptance Criteria

- [ ] Canceling native share sheet does not show a user-facing error
- [ ] `PdfIntegration` is not rebuilt per request (cached dependency)
- [ ] PDF rendering runs off the event loop (`to_thread`) with unchanged API behavior
- [ ] `POST /api/quotes/:id/pdf` and public `/share/:token` behavior remain contract-identical
- [ ] QuotePreview has explicit tests for fetch/PDF/share failure states
- [ ] Template behavior is directly tested for conditional "Updated" row and null-price blanking
- [ ] `make backend-verify` passes
- [ ] `make frontend-verify` passes

---

## Verification

```bash
make backend-verify
make frontend-verify
```

