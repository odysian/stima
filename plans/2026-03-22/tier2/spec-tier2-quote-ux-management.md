# Spec: Tier 2 — Quote UX & management improvements

**Mode:** gated
**Type:** mixed (no-contract refactors + new features)

## Motivation

After V0 and the Tier 1 polish pass, several gaps remain in the quote workflow:

| Gap | Impact |
|---|---|
| QuotePreview shows only total + customer — no line items | Users must generate the PDF just to see what's in the quote |
| ReviewScreen hides the transcript | Users can't reference what was said/typed during extraction |
| Unstable React keys on ReviewScreen | Potential rendering bugs when editing line items |
| No way to edit a quote after creation | Users must delete and recreate to fix a typo |
| No way to delete a quote | Abandoned or test quotes accumulate forever |
| Zero event logging | No visibility into usage patterns or error frequency |

## Decision locks

1. **Edit-from-preview scope:** Edit button navigates to a dedicated edit screen (not inline editing on QuotePreview). Editing a `ready` quote reverts status to `draft` (forces PDF regeneration). Shared quotes are not editable in V1.
2. **Deletion model:** Hard delete (not soft delete). Only `draft` and `ready` quotes can be deleted. Shared quotes cannot be deleted in V1 (they have public URLs).
3. **Event logging approach:** Backend-only structured Python logging for key business events. No frontend analytics SDK in V1 — defer provider decision until there's a deployment target.

## Child tasks

- **Task A:** [Quote detail visibility](task-tier2-a-quote-detail-visibility.md) — Line items on QuotePreview, transcript on ReviewScreen, unstable keys fix (frontend-only)
- **Task B:** [Edit quote from preview](task-tier2-b-edit-from-preview.md) — Edit button + dedicated edit screen + status revert on PATCH (frontend + backend)
- **Task C:** [Quote deletion](task-tier2-c-quote-deletion.md) — DELETE endpoint + UI with confirmation (backend + frontend)
- **Task D:** [Event logging foundation](task-tier2-d-event-logging.md) — Structured backend logging for business events (backend infrastructure)

## Execution order

1. **Task A first** — pure frontend, no dependencies, low risk. Gets line items and transcript visible.
2. **Task B second** — depends on line items being visible on preview (Task A) so the user can see what they're about to edit.
3. **Task C third** — independent of B but logically follows (users need edit before delete to avoid "delete and recreate" as the only fix path).
4. **Task D last** — infrastructure, independent of A-C but benefits from having the full feature surface to instrument.

## Verification

```bash
make backend-verify
make frontend-verify
```
