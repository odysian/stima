# SPEC-001H — Quote List, Preview & Share

**Parent umbrella:** `plans/react-native/SPEC-001-rn-expo-rewrite.md`
**Phase:** 3 Core Features
**Effort:** 4–5 days

## Goal

Port the quote list dashboard, quote preview screen, and sharing flows.

## References

- `frontend/src/features/quotes/components/QuoteList.tsx` — Quote list with status filtering, empty state, FAB.
- `frontend/src/features/quotes/components/QuoteList.helpers.ts` — Filtering and grouping logic.
- `frontend/src/features/quotes/components/QuotePreview.tsx` — Read-only preview with header actions.
- `frontend/src/features/quotes/components/QuotePreviewActions.tsx` — Share, email, download actions.
- `frontend/src/features/quotes/components/QuotePreviewHeaderActions.tsx` — Overflow menu for edit/convert/delete.
- `frontend/src/features/quotes/components/QuotePreviewDialogs.tsx` — Confirm delete, confirm convert dialogs.
- `frontend/src/features/public/components/PublicQuotePage.tsx` — Public share page (may remain web-only; mobile shares link).
- `frontend/src/ui/EmptyState.tsx` — Empty state illustration + copy.

## Acceptance Criteria

- [ ] Quote list with tabs: All, Draft, Sent, Approved, Invoiced.
- [ ] Pull-to-refresh and infinite scroll (if paginated).
- [ ] FAB to initiate capture.
- [ ] Quote preview: full document render (header, line items, totals, notes, customer).
- [ ] Share action: generate public link using configured public web origin (`EXPO_PUBLIC_WEB_ORIGIN`), copy to clipboard, native share sheet (`expo-sharing`). Do not use `window.location.origin`.
- [ ] Email action uses the existing backend email endpoint (parity with PWA). `mailto` may be considered only as a fallback or deferred enhancement.
- [ ] PDF download: request artifact via `pdf_artifact.download_url`, save to device via `expo-file-system` + `expo-sharing`.

## Scope Notes

- Public document rendering can remain web-owned. Native responsibility is creating and sharing the correct link, not duplicating the public viewer unless later scope says otherwise.
