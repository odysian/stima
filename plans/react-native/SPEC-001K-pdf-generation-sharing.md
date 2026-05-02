# SPEC-001K — PDF Generation & Sharing

**Parent umbrella:** `plans/react-native/SPEC-001-rn-expo-rewrite.md`
**Phase:** 4 Native Integrations
**Effort:** 1–2 days

## Goal

Port the PDF artifact flow to native sharing.

## References

- `frontend/src/features/quotes/hooks/useQuoteDocumentActions.ts` — `onGeneratePdf` starts job, polls via `jobService.getJobStatus`, refetches quote for `pdf_artifact`.
- `frontend/src/features/quotes/components/QuotePreview.tsx` — `openPdfUrl` from `quote.pdf_artifact.download_url`.
- `backend/app/features/quotes/service.py` — `start_pdf_generation`, `get_pdf_artifact`.
- Backend PDF generation (`WeasyPrint + Jinja2`) — already produces PDFs; mobile consumes them.

## Acceptance Criteria

- [ ] Start PDF generation with existing `POST /api/quotes/{id}/pdf` job endpoint.
- [ ] Poll/resume the job via `jobService.getJobStatus` (same as web).
- [ ] Refetch quote detail to get updated `pdf_artifact` state.
- [ ] GET the PDF artifact from `pdf_artifact.download_url`.
- [ ] Save to `expo-file-system` cache directory.
- [ ] Open share dialog via `expo-sharing` with PDF MIME type.
- [ ] Option to print via `expo-print`.

## Contract Notes

- Lifecycle is fixed: POST job -> poll `/api/jobs/{job_id}` -> refetch quote -> GET artifact.
- This spec consumes the existing backend flow; it must not introduce a parallel PDF lifecycle.
