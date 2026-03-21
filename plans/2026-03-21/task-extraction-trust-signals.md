# Task: Extraction Trust Signals

## Goal

Help contractors trust and verify extraction output by:

1. keeping the transcript prominently visible so Whisper mishears are easy to spot
2. adding per-line-item trust signals from Claude so suspicious items are highlighted before quote creation

This is a UX reliability task. It does not change the `POST /api/quotes` creation contract,
does not add DB columns, and does not require migrations.

---

## Current State

### What already exists

- `ReviewScreen.tsx` already renders the transcript in a visible, non-collapsible section.
- `ExtractionResult.confidence_notes` already exists and is rendered as a global amber callout.
- Both `POST /api/quotes/convert-notes` and `POST /api/quotes/capture-audio` return the same
  `ExtractionResult` shape.
- Draft state is persisted in `sessionStorage` via `useQuoteDraft`.

### What is missing

- `LineItemDraft` is currently reused for both extraction output and quote creation input, so there
  is nowhere to put extraction-only metadata.
- The Claude tool schema and system prompt do not support per-item flagging.
- `CaptureScreen.applyDraft` is already a mapping boundary — it converts `confidence_notes` →
  `confidenceNotes` and `line_items` → `lineItems` when building `QuoteDraft`. Any new flag fields
  on line items need to be mapped there too.
- `LineItemRow` has no inline treatment for suspicious items.
- There is no test coverage proving that extraction-only metadata survives draft persistence/editing
  but is stripped before `createQuote`.

---

## Design Decisions

### 1. Separate extraction type from creation type

`LineItemDraft` is currently used for both `ExtractionResult.line_items` and
`QuoteCreateRequest.line_items`. Per-item trust signals are review metadata: they belong in the
extraction response, but they should not pollute quote creation or persistence.

**Approach:** Introduce `LineItemExtracted(LineItemDraft)` on the backend and a matching
`LineItemExtracted` type on the frontend. `ExtractionResult` uses the extracted type.
`QuoteCreateRequest` keeps plain `LineItemDraft`.

**Alternative considered:** Add optional flag fields directly to `LineItemDraft` and rely on the
backend to ignore them at creation time.

**Why the split wins:** It keeps the create contract explicit and makes it clear in code that these
fields are review-only metadata.

### 2. Map flag fields to camelCase at the existing `applyDraft` boundary

`CaptureScreen.applyDraft` already converts API-shaped snake_case keys to camelCase draft keys
(`confidence_notes` → `confidenceNotes`). The existing `lineItems` properties (`description`,
`details`, `price`) are single words so the case was never visible — `flag_reason` is the first
two-word line item property and makes the convention explicit.

**Approach:**
- `ExtractionResult.line_items` (API type): use `flag_reason` — matches the JSON wire format.
- `QuoteDraft.lineItems` items (draft state): use `flagReason` — consistent with `confidenceNotes`
  and the rest of `QuoteDraft`.
- `applyDraft` in `CaptureScreen.tsx` maps `flag_reason → flagReason` when building the draft,
  the same way it already maps `confidence_notes → confidenceNotes`.

**Alternative considered:** Use `flag_reason` in both the API type and draft state to avoid any
mapping.

**Why the split wins:** `QuoteDraft.lineItems[n].flag_reason` (snake_case) alongside
`QuoteDraft.confidenceNotes` (camelCase) would be an inconsistency that accumulates as a maintenance
trap. The mapping cost is one line in `applyDraft`.

### 3. Claude flags generic contractor-domain plausibility with a middle-ground threshold

The extraction path only receives notes/transcript today. It does not receive `trade_type`.

**Approach:** Instruct Claude to flag items that look suspicious for any contractor quote, but only
when the signal is strong enough to be genuinely review-worthy: obvious audio mishears, clearly
implausible single-item prices, or critically ambiguous quantity/unit phrasing.

**Alternative considered:** Pass `trade_type` into extraction for trade-aware plausibility checks.

**Why this wins for now:** It improves trust signals without coupling extraction to profile lookup or
expanding request shape.

**Calibration goal:** Prefer a middle ground. The app should not flag every mildly uncertain item,
but it also should not stay silent when noisy audio produces obviously suspicious output.

**Revisit trigger:** If pilot feedback shows too much warning noise or too many missed bad items,
adjust prompt wording first; add trade context later only if prompt tuning is not enough.

### 4. Flags are non-blocking review hints

Flagged items should not block quote creation. The contractor can edit or ignore the warning.

### 5. Transcript prominence is already solved

The transcript is already visible. This task should not redesign that section.
A small copy tweak such as changing the heading to `What the app heard` is acceptable only if it
meaningfully improves clarity during implementation review.

---

## Scope

### Backend

**`backend/app/features/quotes/schemas.py`**

- Add `LineItemExtracted(LineItemDraft)` with:
  - `flagged: bool = False`
  - `flag_reason: str | None = None`
- Change `ExtractionResult.line_items` from `list[LineItemDraft]` to
  `list[LineItemExtracted]`
- Keep `QuoteCreateRequest.line_items` as `list[LineItemDraft]`

**`backend/app/integrations/extraction.py`**

- Extend `EXTRACTION_TOOL_SCHEMA` line-item objects to allow:
  - `flagged`
  - `flag_reason`
- Keep both fields optional in the JSON schema so older or partial payloads still validate through
  model defaults
- Update `EXTRACTION_SYSTEM_PROMPT` to tell Claude when to set per-item flags, with examples of:
  - likely audio mishears
  - implausible prices
  - critically ambiguous quantities or units

**Backend behavior**

- No route changes are needed in quote API handlers if they already return `ExtractionResult`
  directly from service/integration flow.
- No DB, migration, or quote persistence changes are in scope.

### Frontend

**`frontend/src/features/quotes/types/quote.types.ts`**

- Add:

```ts
// API response type — snake_case matches wire format
export interface LineItemExtracted extends LineItemDraft {
  flagged?: boolean;
  flag_reason?: string | null;
}

// Draft state type — camelCase matches QuoteDraft conventions
export interface LineItemDraftWithFlags extends LineItemDraft {
  flagged?: boolean;
  flagReason?: string | null;
}
```

- Change `ExtractionResult.line_items` to `LineItemExtracted[]`
- Keep `QuoteCreateRequest.line_items` as `LineItemDraft[]`

**`frontend/src/features/quotes/hooks/useQuoteDraft.ts`**

- Change `QuoteDraft.lineItems` to `LineItemDraftWithFlags[]`
- Update the `parseStoredDraft` function (line 27) — the current cast `lineItems as LineItemDraft[]`
  passes through without validating individual item fields. Update the cast to
  `LineItemDraftWithFlags[]` and confirm that absent `flagged` / `flagReason` fields on stored items
  fall back to `undefined` without nulling out or rejecting the item. Old drafts without these fields
  must still rehydrate cleanly.

**`frontend/src/features/quotes/components/LineItemRow.tsx`**

- Widen `item` from `LineItemDraft` to `LineItemDraftWithFlags`
- Render a minimal but clearly visible inline amber warning when `item.flagged === true`
- Show `item.flagReason` when present, otherwise fall back to a generic message such as
  `This item may need review`
- Keep edit/delete behavior unchanged
- Do not spend extra scope on visual polish beyond making the warning easy to notice

**`frontend/src/features/quotes/components/ReviewScreen.tsx`**

- Update helpers and local types so review rows operate on `LineItemDraftWithFlags`
- Preserve `flagged` and `flagReason` through draft edits and validation logic
- Strip flag fields only at the submit boundary before calling `quoteService.createQuote`
- Keep the transcript section layout as-is unless a small heading copy tweak is explicitly chosen

Suggested submit boundary shape:

```ts
const lineItemsForSubmit = normalizedLineItems
  .filter((item) => item.description.length > 0)
  .map(({ flagged: _flagged, flagReason: _flagReason, ...rest }) => rest);
```

**`frontend/src/features/quotes/components/CaptureScreen.tsx`**

- No UI redesign needed
- Update `applyDraft` to map `flag_reason → flagReason` per line item when building the draft,
  alongside the existing `confidence_notes → confidenceNotes` mapping

**`frontend/src/shared/tests/mocks/handlers.ts`**

- Update `convert-notes` and `capture-audio` mock responses to include at least one flagged line item
  so the default test fixtures reflect the expanded extraction contract

### No changes required

- DB schema
- Alembic migrations
- `POST /api/quotes` endpoint contract
- Quote persistence model
- Audio transcription flow

---

## Tests

### Backend

**`backend/app/features/quotes/tests/test_extraction.py`**

- Validate that `ExtractionResult` accepts a flagged line item with `flag_reason`
- Validate that omitted `flagged` / `flag_reason` still succeed via model defaults
- Assert that `EXTRACTION_TOOL_SCHEMA` line-item objects include `flagged` and `flag_reason`
  properties — tests the contract Claude receives, not prose wording

**`backend/app/features/quotes/tests/test_quotes.py`**

- Add or update a focused API test showing `convert-notes` can return flagged line items
- Add or update a focused API test showing `capture-audio` can return flagged line items
- Keep quote creation tests using plain `LineItemDraft` payloads so the no-contract-change claim is
  preserved and explicit

### Frontend

**`frontend/src/features/quotes/tests/useQuoteDraft.test.tsx`**

- Verify draft persistence and rehydration preserve `flagged` / `flagReason`
- Verify older drafts without these fields still rehydrate cleanly (no null-out, no rejection)

**`frontend/src/features/quotes/tests/CaptureScreen.test.tsx`**

- Verify text extraction preserves flagged line-item metadata when writing the draft
- Verify voice extraction preserves flagged line-item metadata when writing the draft

**`frontend/src/features/quotes/tests/LineItemRow.test.tsx`**

- Renders inline warning when `flagged === true` and `flagReason` is present
- Renders fallback warning when `flagged === true` and `flagReason` is null
- Renders no warning when `flagged` is false or absent

**`frontend/src/features/quotes/tests/ReviewScreen.test.tsx`**

- Flagged rows render the inline warning
- Editing a flagged row keeps its flag metadata (`flagged`, `flagReason`) intact until submit
- `createQuote` receives plain `LineItemDraft[]` with no `flagged` / `flagReason`

**`frontend/src/features/quotes/tests/quoteService.integration.test.ts`**

- Lock the expanded extraction response shape for both `convertNotes` and `captureAudio`

---

## Acceptance Criteria

- [ ] Backend and frontend define a separate `LineItemExtracted` type for extraction output
- [ ] `QuoteCreateRequest` remains plain `LineItemDraft[]` with no new persisted fields
- [ ] Claude extraction schema and prompt support per-item `flagged` / `flag_reason`
- [ ] Both extraction endpoints can return flagged line items in `ExtractionResult`
- [ ] Draft state preserves flag metadata through capture, review, session-storage persistence, and
      normal row editing
- [ ] `ReviewScreen` shows a visible inline warning for flagged items without adding broader UI scope
- [ ] `createQuote` strips extraction-only metadata before submit
- [ ] Existing quote creation behavior remains unchanged
- [ ] Focused backend and frontend tests cover the expanded extraction contract and submit stripping

---

## What This Does Not Fix

- Whisper mishears with no obvious semantic signal. Claude flagging is only a second-pass heuristic.
- Trade-specific plausibility checks that require business profile context.
- Confidence scoring or probabilistic ranking. This task adds review hints, not calibrated model scores.

---

## Risks and Edge Cases

- **Over-flagging noise**: if the prompt is too aggressive, the review screen becomes noisy and the
  extraction experience starts to feel untrustworthy or low-value.
- **Under-flagging misses**: if the prompt is too conservative, noisy or inconsistent audio can still
  produce bad line items with no review signal.
- **Naming split**: `flag_reason` (snake_case) in the API type and `flagReason` (camelCase) in draft
  state requires the mapping in `applyDraft` to stay in sync. If a new flag field is added later,
  both the API type and the draft type must be updated together.
- **Metadata loss during editing**: helper functions in `ReviewScreen` must preserve flag metadata
  until submit, or warnings will disappear as soon as a row is touched.
- **Metadata leakage into create**: stripping flags at submit is required so review metadata never
  becomes part of the quote creation payload.

---

## Verification

```bash
make backend-verify
make frontend-verify
```

Manual operator validation after implementation:

- Run `make extraction-live` manually if prompt calibration needs validation against the real Claude
  integration
- Smoke test one typed-notes flow and one voice flow with an obvious outlier phrase
- Confirm the flagged item warning appears on the review screen
- Confirm quote creation still succeeds and no flag metadata is persisted with saved line items
