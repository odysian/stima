# Task: PDF Share Hardening Test Coverage Follow-Up (Post-Task 4)

## Goal

Harden the PDF/share flow after Task 4 by closing remaining test and coverage gaps
without changing API contracts.

## Parent Reference

- Prior implementation: Task #21 / PR #22
- Roadmap continuity: post-Task-4 hardening follow-up outside the numbered roadmap sequence

## Positioning

This is not the canonical roadmap `Task 5`. In `docs/V0_ROADMAP.md`, Task 5 remains
Voice Capture. This issue is a focused hardening follow-up created after Task 4
implementation surfaced additional testing value.

---

## Non-Goals

- No schema changes
- No API contract changes (status codes, response body shapes, routes)
- No async job queue or background worker architecture shift in this task
- No broad E2E framework introduction

---

## Problem Framing

The first performance/UX follow-ups are already implemented in Task #21 / PR #22:
- native share cancel (`AbortError`) now treated as no-op
- `PdfIntegration` now cached as singleton dependency
- PDF rendering now offloaded with `asyncio.to_thread(...)`

Remaining follow-up value is in broader negative-path and template rendering test coverage.

---

## Scope

### Frontend

- Add/extend `QuotePreview` tests for:
  - quote fetch failure
  - PDF generation failure
  - share request failure

### Backend

- Add targeted tests validating:
  - endpoint behavior remains unchanged with current threading/offload implementation
  - template-level behaviors:
    - null prices render blank
    - "Updated" date row appears only when timestamp delta exceeds threshold

### Documentation

- Add/adjust a short testing note if needed to reflect where template behavior is covered.

---

## File Targets

| File | Action | Purpose |
|---|---|---|
| `backend/app/features/quotes/tests/test_pdf.py` | Modify | Add assertions for existing render behavior contracts |
| `backend/app/integrations/tests/test_pdf.py` (new if needed) | Create | Template rendering assertions |
| `frontend/src/features/quotes/tests/QuotePreview.test.tsx` | Modify | Add missing error-state coverage |

---

## Acceptance Criteria

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
