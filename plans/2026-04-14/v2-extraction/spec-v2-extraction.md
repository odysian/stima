# Stima Extraction Pipeline V2 — Clean Implementation Spec

## GitHub labels (Spec issue)

When filing the parent Spec issue, apply (`docs/ISSUES_WORKFLOW.md`):

- `type:spec`
- `area:quotes`
- `area:database`
- `area:frontend`

### GitHub issue body (length)

This file is valid as the full Spec issue body after citation cleanup. For a shorter issue, link to this path on the default branch and inline only: **Locked decisions**, **Implementation split** (PR 0–5), **Acceptance criteria** (including PR-local bars), **Verification plan**, and **Risks / mitigations** — then paste child Task links when those issues exist.

## Title
Refactor Stima capture extraction into a segmented, draft-seeding pipeline that places line items, notes, and explicit pricing hints into the review draft reliably for typed notes, voice transcripts, and mixed capture input.

---

## Why this spec exists

The extraction flow is the core of Stima. Today, extraction is strong enough to find line items and some prices, but it still strands too much useful information inside transcript text and generic confidence notes instead of placing it into the actual reviewable draft. That makes the review screen feel more like a recovery surface than a polished draft seed.

The goal of V2 is not to make the product feel more AI-heavy. The goal is to make the operator workflow feel cleaner, faster, and more trustworthy.

The key architectural shift is:

> Stop treating extraction as “find line items in a blob of text.”  
> Start treating extraction as “classify and place captured content into the draft fields and supporting review surfaces that matter.”

At the same time, the operator-facing UI must stay simple. Richer extraction internals are acceptable only if the main review surface remains focused on:
- line items
- notes
- pricing

That product direction was a locked decision during refinement.

---

## Current implementation review

### Current strengths
- Capture already supports typed notes, recorded audio, or both.
- Audio is normalized, transcribed, and combined with typed notes into one transcript before extraction.
- Extraction already persists a draft rather than returning a purely temporary result.
- The extraction layer already has schema validation, repair prompting, fallback/degraded handling, and semantic guardrails.
- The review screen already expects editable line items, pricing fields, and notes.

### Current weaknesses
- The extraction contract is too narrow. It currently focuses on:
  - transcript
  - line items
  - total
  - confidence notes
  - degraded metadata
- The current model prompt is still aimed at “extract quote line items and totals from contractor notes” rather than “classify capture content into draft-ready buckets.”
- Confidence notes currently do too much work as a catch-all bucket.
- Drafts can miss useful notes and pricing settings even when the input clearly contains them.
- The current review surface does not clearly separate:
  - visible editable review work
  - secondary AI-derived supporting details

### Resulting product problem
The current pipeline is usable, but not yet reliable at placing information into the right review inputs. It saves some time, but not enough to consistently seed a polished draft.

---

## Product direction and simplicity cap

### Core product principle
The extraction pipeline may become more sophisticated internally **as long as the operator-facing UI stays simple**.

### Phase 1 target
Phase 1 should deliver:
- cleaner line-item output
- safer pricing seeding
- conservative notes placement
- append safety
- durable provenance/review state
- simplified review UI

Phase 1 is **not** trying to deliver:
- full extraction intelligence everywhere
- a review screen full of AI warnings
- a second AI workflow layered on top of the quote editor
- aggressive automatic correction of every ambiguous case

---

## Recommended approach

Use a **hybrid segmented extraction pipeline**:

1. deterministically normalize and segment the prepared capture input
2. run one structured model normalization pass over those segments
3. validate the structured output
4. run repair prompting if validation fails
5. apply deterministic semantic and placement guards
6. write safe seeded values directly into the real draft fields
7. persist review/provenance/hidden-detail metadata in a JSON sidecar
8. keep the main review UI simple and move auxiliary extraction output into a secondary `Capture Details` surface

This remains aligned with the current architecture:
- model returns structured tool output
- backend validates it
- repair pass corrects invalid output
- semantic guards adjust or degrade the result when needed
- one shared pipeline handles typed, voice, and mixed input 

---

## Locked decisions

### Canonical document model
- Keep one canonical persisted document model.
- Do not create a second AI-only review model.
- Safe seeded values are written directly into the real draft fields.
- Safety comes from persisted provenance/review metadata, not from shadow staging fields.

### Title
- Remove title extraction from V2 entirely for now.
- `title_suggestion` is out of scope.
- Title is not a core extraction target for the current workflow.

### Pipeline shape
- One shared extraction pipeline handles typed-only, voice-only, and mixed input.
- Typed notes win when they are clearly more explicit than transcript text.
- Only material typed-vs-transcript conflicts should surface as review notes.

### Apply thresholds
- Phase 1 uses rule-based apply thresholds, not numeric scoring.
- Pricing auto-seeding stays narrow and explicit.
- Notes placement stays conservative and interpretation-aware.

### Review and metadata
- Review state persists server-side.
- Sidecar payloads stay minimal and grouped.
- `confidence_notes` remains as a field name, but now means sparse, operator-relevant review notes only.

### UI simplification
- The main review surface should show:
  - line items
  - notes
  - pricing
- Auxiliary AI output should not clutter the main review screen.
- Hidden details live in a unified `Capture Details` modal/sheet.

---

## Non-goals

- Do not infer customer identity from capture notes.
- Do not redesign the persisted line item database shape in this phase, with the narrow exception of adding `flagged` and `flag_reason` columns to the `line_items` table to close the current persistence gap where extraction flags are lost after the initial response.
- Do not add a general line-item review-pending system in Phase 1.
- Do not make transcript editable in Phase 1.
- Do not add one-click apply actions for append suggestions in Phase 1.
- Do not introduce a separate extraction metadata table in Phase 1.
- Do not solve every trade and phrasing pattern at once.
- Do not let append capture overwrite populated notes or pricing fields. 

---

## Final V2 extraction result contract

The top-level extraction result should stay lean and product-facing. It should include only placement outputs and high-signal operator-facing review notes, not deep debug/process detail.

```ts
export type PlacementConfidence = "high" | "medium" | "low";

export interface ExtractionSuggestion {
  value: string;
  confidence: PlacementConfidence;
  source: "explicit_notes_section" | "derived" | "leftover_classification";
}

export interface PricingHints {
  explicit_total: number | null;   // document total, not subtotal
  deposit_amount: number | null;
  tax_rate: number | null;         // decimal format: 8% → 0.08, 8.25% → 0.0825
  discount_type: "fixed" | "percent" | null;
  discount_value: number | null;
}

export interface ExtractedLineItemV2 {
  raw_text: string;
  description: string;
  details: string | null;
  price: number | null;
  flagged: boolean;
  flag_reason: string | null;
  confidence: PlacementConfidence;
}

export interface UnresolvedSegment {
  raw_text: string;
  confidence: "medium" | "low";
  source: "leftover_classification" | "typed_conflict" | "transcript_conflict";
}

export interface ExtractionResultV2 {
  transcript: string;
  pipeline_version: "v2";
  line_items: ExtractedLineItemV2[];
  pricing_hints: PricingHints;
  customer_notes_suggestion: ExtractionSuggestion | null;
  unresolved_segments: UnresolvedSegment[];
  confidence_notes: string[]; // sparse, operator-relevant review notes only
  extraction_tier: "primary" | "degraded";
  extraction_degraded_reason_code: string | null;
}
```

### Important contract notes
- `title_suggestion` is removed.
- `confidence_notes` stays, but is now sparse and high-signal only.
- Unresolved segments are minimal structured items, not plain strings.
- Debug-rich metadata does **not** belong in this result. That belongs in logs or the sidecar.
- `confidence` on `ExtractedLineItemV2` is internal extraction metadata for Phase 1. It is not surfaced in the operator-facing review UI and does not drive any visible review behavior. Only `flagged`/`flag_reason` drives visible line-item review signals in Phase 1.
- `total` from V1 is replaced by `pricing_hints.explicit_total` in V2. The extraction result contract no longer carries a top-level `total` field.

### V1→V2 contract migration strategy
The current extraction contract is wired directly into backend schemas, sync/async extraction API responses, worker result persistence, and frontend extraction handling. The V2 contract changes are significant enough (removing `total`, adding `pricing_hints`, `customer_notes_suggestion`, `unresolved_segments`, `pipeline_version`) that they require a coordinated migration.

**PR 1 is additive-only.** It introduces the V2 types alongside the existing V1 types without changing any API responses or persistence shapes. The new V2 contract, `PreparedCaptureInput`, and segmentation logic are internal to the extraction pipeline. No frontend or API contract changes land in PR 1.

**PR 2 is the API/persistence migration point.** It replaces the V1 extraction result shape with V2 in API responses and persistence, adds the sidecar column, and updates the frontend extraction types and service layer. PR 2 must include the corresponding frontend type and service updates in the same PR (or same deployment window). The frontend `ExtractionResult` type in `quote.types.ts` and the extraction/append service methods in `quoteService.ts` both mirror the backend shape and must switch in lockstep.

During the transition:
- The V1 `total` field on `ExtractionResult` is removed and replaced by `pricing_hints.explicit_total` in V2.
- The V1 `confidence_notes: string[]` shape stays the same in V2, but its semantic meaning narrows to sparse, operator-relevant review notes only.
- The V2 `pipeline_version: "v2"` field is added to the extraction result and also persisted in the sidecar.

---

## Prepared input and segmentation

### Stage 0 — input preparation
Preserve the current high-level behavior:
- audio clips are normalized and stitched
- transcription returns transcript text
- typed notes are trimmed
- if both exist, a combined transcript artifact is produced

**Provenance preservation.** The current extraction pipeline flattens mixed capture (typed notes + voice transcript) into a single combined string before the model call. The extraction integration currently accepts only a single `notes: str` input. To support `typed_conflict`, `transcript_conflict`, and "typed notes win when more explicit" rules, the pipeline must preserve typed-notes vs transcript provenance upstream of the model call. This means refactoring `ExtractionService.prepare_combined_transcript()` and `ExtractionIntegration.extract()` to accept a structured `PreparedCaptureInput` instead of a plain string, and updating the model prompt to receive provenance-marked segments.

Recommended internal shape:

```ts
interface PreparedCaptureInput {
  transcript: string;
  source_type: "text" | "voice" | "voice+text";
  raw_typed_notes: string | null;
  raw_transcript: string | null;
}
```

**`source_type` values are pipeline-internal.** The three-way classification (`"text"`, `"voice"`, `"voice+text"`) drives extraction behavior internally but does not change the persisted `Document.source_type` column, which continues to store only `"text"` or `"voice"`. The current orchestration uses internal values like `"audio"`, `"notes"`, and `"audio+notes"` which are mapped to `"text"` or `"voice"` before persistence. V2 replaces those internal values with the `PreparedCaptureInput.source_type` enum, but the persisted document source type remains binary.

### Stage 1 — deterministic segmentation
Deterministic segmentation should stay **narrow and structural**. Rules should chunk and hint, not decide final placement.

Segment on:
- blank lines
- bullets / numbering
- explicit headings such as `notes:`
- obvious trailing price patterns

Normalize only safe shorthand:
- collapse repeated whitespace
- `+` → `and`
- `w/` → `with`

Recommended hint set:

```ts
interface CaptureSegment {
  index: number;
  raw_text: string;
  normalized_text: string;
  hints: {
    has_explicit_price: boolean;
    price_value: number | null;
    looks_like_heading: boolean;
    looks_like_notes_heading: boolean;
    looks_like_line_item: boolean;
  };
}
```

### Rules vs model boundary
- **Rules** = chunk and attach safe hints
- **Model** = classify and place
- **Post-processing** = validate, guard, and decide apply vs flag vs suppress

---

## Model normalization behavior

The model receives:
- the full combined transcript
- the pre-segmented chunk list
- explicit instructions about the placement targets

The model’s job is to:
- classify line-item candidates
- generate short customer-facing line-item descriptions
- move service remainder into `details`
- route clearly note-like content into `customer_notes_suggestion`
- route explicit pricing directives into `pricing_hints`
- leave ambiguous content in `unresolved_segments`
- emit sparse operator-relevant `confidence_notes` only when appropriate

The model should **not**:
- invent pricing
- force ambiguous text into notes or pricing
- emit title suggestions
- stuff everything uncertain into `confidence_notes`
- rely on “being clever” when uncertain. Prefer unresolved output over forced placement. 

---

## Placement rules

## Line items
### Description vs details
- `description` must be a short customer-facing service label, usually 2–6 words
- `details` contains remaining scope, quantity, materials, location, or method
- `details` must not merely restate the description
- no price tokens in `description`
- duplicate normalized line items should be flagged

This remains the most important normalization rule in the extraction system. The examples from the rough spec still apply conceptually, but V2 should keep the implementation grounded in validation and guard logic rather than trying to over-model every trade.

## Notes
### Conservative notes placement
Only seed notes when one of these is true:
- there is an explicit notes-style heading
- the content is clearly document-safe, note-like, and not a service line item
- it is clearly non-line-item operational/scope context

Notes are written directly into the real notes field when seeded and get a grouped review-pending state. Ambiguous leftovers do not get shoved into notes.

## Pricing
### Narrow explicit pricing support
`pricing_hints` should only support these Phase 1 cases:

- `explicit_total`
- `deposit_amount`
- `tax_rate`
- `discount_type`
- `discount_value`

Deposit percentages are out of scope for Phase 1. Only fixed-amount deposits are supported.

### Explicit pricing rule table
#### Auto-seed allowed
Deposit:
- `deposit 300`
- `deposit requested 300`
- `ask for 300 deposit`

Tax:
- `8% tax`
- `tax 8 percent`
- `apply 8.25% tax`

Discount:
- `discount 50`
- `take off 50`
- `10% discount`
- `apply 10 percent discount`

Explicit total:
- `total 825`
- `quote total 825`
- `invoice total 825`

#### Suggestion-only or ignore
- `probably ask for a deposit`
- `maybe charge tax`
- `might do a discount`
- `should come out to around 800`
- `about 825 total`

#### Explicit exclusions
- deposit percentages
- `half up front`
- vague rounded estimates
- ambiguous pricing phrases that may attach to job scope rather than document settings

### Total conflict rule
Explicit total may be auto-seeded when clearly stated, but if it conflicts with extracted priced line items it must remain review-aware and must never silently override the line-item math.

---

## Post-validation guard rules

After the model returns structured output:
- validate the payload
- run repair prompting if invalid
- revalidate
- apply semantic and placement guards

Required guard rules:
- no price tokens inside line-item descriptions
- `details` must not simply duplicate `description`
- explicit total without priced line items should produce a review note
- contradictory pricing hints should not auto-apply silently
- if no line items are extracted from a substantial transcript, degrade or flag
- duplicate normalized line items should be flagged
- material typed-vs-transcript conflicts may produce unresolved output or sparse review notes
- low-priority uncertainty should not inflate the operator UI 

---

## Direct seeding and sidecar persistence

### Real draft fields
When Phase 1 rules permit seeding, write directly into the real draft fields:
- `notes`
- `tax_rate`
- `discount_type`
- `discount_value`
- `deposit_amount`
- `total_amount`
- `line_items`

The combined transcript remains persisted product data.

**Direct seeding of notes and pricing is net-new behavior.** The current `create_extracted_draft` sets `notes=None`, `tax_rate=None`, `discount_type=None`, `discount_value=None`, and `deposit_amount=None` for all extractions. V2 adds conditional seeding of these fields from the extraction result based on apply rules. Similarly, the current append path only merges transcript text, appends line items, and recalculates `total_amount` — it does not touch notes or pricing fields at all. The "populated means protected" guard for notes and pricing during append is also net-new logic.

### JSON sidecar
Phase 1 should use a JSON sidecar on the document, not a separate extraction metadata table. The sidecar should stay grouped, minimal, and product-facing.

**Sidecar column:** A nullable JSONB column named `extraction_review_metadata` is added to the `documents` table. The default value is `NULL`. When `NULL`, the document is treated as having no V2 extraction metadata (see migration / backward compatibility above for null-handling rules). This column is added in PR 2 via an Alembic migration.

**`pipeline_version` home:** `pipeline_version` lives in the sidecar JSON only. It does not get a new dedicated column on the `Document` model. The API response includes it from the sidecar data. The existing `extraction_tier` and `extraction_degraded_reason_code` columns on `Document` remain unchanged.

Recommended shape:

```ts
interface AppendSuggestion {
  kind: "note" | "pricing";
  raw_text: string;
  confidence: "medium" | "low";
  source: "append_capture";
  pricing_field?: "explicit_total" | "deposit_amount" | "tax_rate" | "discount";
}

interface HiddenItemState {
  reviewed: boolean;
  dismissed: boolean;
}

interface ExtractionReviewMetadataV1 {
  pipeline_version: "v2";

  review_state: {
    notes_pending: boolean;
    pricing_pending: boolean;
  };

  seeded_fields: {
    notes: {
      seeded: boolean;
      confidence: "high" | "medium" | "low" | null;
      source: "explicit_notes_section" | "derived" | "leftover_classification" | null;
    };
    pricing: {
      explicit_total: { seeded: boolean; source: "explicit_pricing_phrase" | null };
      deposit_amount: { seeded: boolean; source: "explicit_pricing_phrase" | null };
      tax_rate: { seeded: boolean; source: "explicit_pricing_phrase" | null };
      discount: { seeded: boolean; source: "explicit_pricing_phrase" | null };
    };
  };

  hidden_details: {
    // hidden, current-only auxiliary details shown inside Capture Details
    unresolved_segments: Array<{
      id: string;
      raw_text: string;
      confidence: "medium" | "low";
      source: "leftover_classification" | "typed_conflict" | "transcript_conflict";
    }>;
    append_suggestions: Array<{
      id: string;
      kind: "note" | "pricing";
      raw_text: string;
      confidence: "medium" | "low";
      source: "append_capture";
      pricing_field?: "explicit_total" | "deposit_amount" | "tax_rate" | "discount";
    }>;
    confidence_notes: string[]; // sparse, operator-relevant review notes only
  };

  hidden_detail_state: Record<string, HiddenItemState>; // parallel lifecycle map keyed by deterministic hidden item id

  extraction_degraded_reason_code?: string | null;
}
```

### Sidecar notes
- `pipeline_version` lives in the sidecar JSON column only — no new dedicated column on `Document`
- `review_state` only tracks visible grouped review state:
  - `notes_pending`
  - `pricing_pending`
- do **not** add hidden-detail pending booleans in Phase 1
- sidecar payloads should not include full normalization/debug internals
- hidden item ids are generated by the backend from deterministic inputs (kind + normalized content + subtype) and included in API responses. The frontend receives these ids from the API and does not generate them.
- lifecycle state should live in a parallel state map, not inline on the extracted item payload itself

**Line-item flag persistence.** The current `LineItemExtracted` transfer schema includes `flagged` and `flag_reason` fields, but these are dropped during persistence because `LineItemDraft` (the persistence transfer type) does not include them, and the `LineItem` database model has no `flagged` or `flag_reason` columns. PR 2 resolves this by adding `flagged` (boolean, default `false`) and `flag_reason` (string, nullable) columns to the `line_items` table, and updating `LineItemDraft`/`LineItem` persistence paths to carry flags through. This is a narrow exception to the "do not redesign the line item database shape" non-goal.

### API response additions
The current `QuoteDetailResponse` has no extraction review metadata field. V2 adds the following to the quote detail API response:

```ts
interface QuoteDetail {
  // ... existing fields ...
  extraction_review_metadata: ExtractionReviewMetadataV1 | null;
}
```

- `extraction_review_metadata` is `null` for documents created before V2 or for manual drafts with no extraction metadata.
- Quote list responses do **not** include `extraction_review_metadata` — it is only available on the detail endpoint.
- The extract and append endpoints return `ExtractionResultV2` in their response. The sidecar-backed review state is populated from that extraction result and made available on subsequent detail fetches, not from the extract/append response directly.

### Sidecar mutation API contract
The UI needs to dismiss/review hidden items and clear review state. This requires server-side mutations that the current `QuoteUpdateRequest` does not support. Phase 1 adds a narrow endpoint for sidecar lifecycle operations:

```
PATCH /api/quotes/{id}/extraction-review-metadata
```

Accepted request body:
```ts
interface ExtractionReviewMetadataUpdate {
  dismiss_hidden_item?: string;       // hidden item id to mark dismissed
  review_hidden_item?: string;       // hidden item id to mark reviewed
  clear_review_state?: {             // clear review-pending state
    notes_pending?: boolean;         // set to false to acknowledge notes review
    pricing_pending?: boolean;       // set to false to acknowledge pricing review
  };
}
```

This endpoint only mutates the `extraction_review_metadata` JSONB column and does not touch document fields. Normal `PATCH /api/quotes/{id}` continues to handle field edits and should also clear related append suggestions and review state on actual value changes (server-side, as a side effect of detecting field mutations).

### Explicit total mapping
In Phase 1, `pricing_hints.explicit_total` maps to persisted `total_amount` as the **document total**, not a pre-tax/pre-discount subtotal input. When an explicit total is auto-seeded, it is written directly into `total_amount` and flagged with `pricing_pending` review state. The existing pricing breakdown logic in the review flow continues to treat `total_amount` as the document total. If the explicit total conflicts with the sum of priced line items plus tax/discount adjustments, the conflict is surfaced through the pricing review-pending state and review notes, not by silently recomputing the total.

`pricing_hints.tax_rate` uses the same decimal representation as the persisted field: 8% is stored as `0.08`, 8.25% as `0.0825`. Model parsing and guard code must convert percentage-form input ("8%", "8.25%") to decimal form before seeding.

---

## Append behavior

### Core append rule
Append behavior must stay conservative.

- Initial extract may seed real fields
- Append may seed a field only if it is still empty
- If notes/pricing already contain curated or populated content, append must not overwrite it
- Instead, append stores a suggestion in hidden details

In Phase 1, **populated means protected**. Do not distinguish between AI-seeded-but-unreviewed vs user-curated for overwrite behavior. If a field is populated, append does not overwrite it.

### total_amount recomputation and append
`total_amount` is both a pricing field and a line-item subtotal target. In Phase 1:

- **Append line-item recomputation is preserved.** The current behavior where appending new line items triggers a total recalculation from priced line items stays in place. This is not an "overwrite of a populated pricing field" — it is the existing line-item merge + subtotal derivation logic.
- **`pricing_hints.explicit_total` from append is protected.** If `total_amount` is already populated (by initial extract seeding or manual entry), an appended `explicit_total` hint does not overwrite it. Instead, it becomes an append suggestion.
- **When `total_amount` is null/empty on append, the append may seed it** from a derived line-item subtotal or from an explicit total hint, following the same seeding rules as initial extract.

This means populated `total_amount` is protected from pricing-hint overwrite, but line-item-driven subtotal recomputation continues to work as it does today.

### Append suggestions
Append suggestions are distinct from unresolved leftovers:
- **unresolved leftovers** = system could not confidently place this
- **append suggestions** = system could place this, but did not apply it because populated content already exists

Append suggestions:
- are grouped in one shared hidden section
- are read-only in Phase 1
- may be viewed and dismissed
- do not get one-click apply actions in Phase 1
- should show only current relevant suggestions, not historical scraps

### Clearing behavior
- actual manual value change in notes clears related append note suggestions
- actual manual value change in pricing clears related append pricing suggestions
- opening `Capture Details` alone does nothing
- dismissed append suggestions do not need extra lifecycle on manual edit

---

## Hidden details lifecycle

### Current-only hidden items
The UI should show only:
- current unresolved leftovers
- latest append suggestions
- current operator-relevant hidden review notes

Do not show a running history of old hidden scraps in the operator UI. History belongs in logs/metadata, not the review surface.

### Unresolved leftovers
- read-only in Phase 1
- not editable
- not auto-cleared from destination field edits
- operator may mark reviewed, then dismiss
- if a dismissed item reappears from a genuinely new append event, it can resurface
- dedupe within the same extraction result

### Hidden review notes
- sparse and high-signal only
- do not auto-clear from field edits
- remain until superseded by a new extraction result or explicitly dismissed if supported

### Hidden lifecycle state
Dismissed/reviewed hidden item state must be persisted explicitly. Do not rely on simple absence from the list.

---

## Review UI behavior

## Review-state architecture migration
The current review state for confidence notes is entirely client-side. `reviewConfidenceNotes.ts` reads and writes confidence notes to `localStorage` using keys like `stima_review_confidence_notes:{quoteId}`. `CaptureScreen.tsx` writes extraction confidence notes to localStorage after extraction completes, and `ReviewScreen.tsx` reads them from localStorage to render `AIConfidenceBanner` components inline.

V2 moves review state to the server-side sidecar. This means:
- `reviewConfidenceNotes.ts` is superseded by API-driven review-state reads from the sidecar data on `QuoteDetail`.
- `CaptureScreen.tsx` no longer writes confidence notes to `localStorage`; they come from the extraction result and are persisted by the backend.
- `ReviewScreen.tsx` reads `notes_pending` and `pricing_pending` from the sidecar to show grouped review markers, not from `localStorage`.
- The `AIConfidenceBanner` inline rendering in `ReviewFormContent.tsx` is replaced by grouped review markers on the main surface and a `Capture Details` modal for hidden details.
- The `confidence_notes` prop on `ReviewFormContent` and `DocumentEditScreenView` is removed in favor of sidecar-driven review state.

## Main review surface
Keep the main review surface focused on:
- line items
- notes
- pricing

Visible review markers exist only for:
- grouped notes review state
- grouped pricing review state

There is no general line-item review state in Phase 1 beyond existing line-item flags.

## Continue behavior
Continue should be a soft interrupt:
- if visible notes/pricing review-pending items remain, show:
  - `Review now`
  - `Continue anyway`

Hidden AI details must **not** drive the continue modal.

## Capture Details
Use one unified `Capture Details` entry point.
- open it in a modal/sheet, not inline
- use a subtle alert icon, not a numeric counter
- show the icon only when there are current undismissed hidden actionable items
- transcript existing by itself should not trigger the icon

### Order inside Capture Details
1. New suggestions from latest capture
2. Unresolved capture details
3. AI review notes
4. Transcript

### Transcript
- persisted product data
- read-only in the modal
- visible even for degraded results

### What stays hidden inside Capture Details
- append suggestions
- unresolved leftovers
- low-priority confidence/review notes
- hidden operator-relevant notes that are not high-severity enough for the main surface

### What surfaces outside Capture Details
Keep the high-severity allowlist very small:
- degraded extraction with no line items from substantial capture
- explicit total conflicts with extracted priced line items
- existing flagged line items via current UI

Everything else stays hidden.

---

## Degraded behavior

When extraction degrades:
- keep the main review surface simple
- keep `Capture Details` available
- persist only minimal useful sidecar metadata
- keep sparse operator-relevant notes if they exist
- keep surviving unresolved segments if they exist
- do not fabricate rich seeded/provenance structures that were never safely produced

This preserves inspectability without turning the main screen into an error console.

---

## Logging child task

Extraction trace logging should be a child task / Phase 0 instrumentation stream, not part of the main operator workflow. The logging task draft remains directionally correct: use a dedicated extraction logger, stage-based traces, and metadata-only defaults. 

### Logging requirements
- structured `stima.extraction` logger — additive with the existing `stima.events` and `stima.security` loggers, using the same structured JSON + stdout pattern and the existing `current_correlation_id()` context var
- metadata-only by default
- raw transcript/tool payload content behind explicit opt-in config
- correlation ids
- primary / repair / result stages
- no product UI dependency on raw debug logs

### Separation of concerns
- **transcript** = product data
- **sidecar** = product behavior metadata
- **logs** = debug/trace instrumentation

---

## Implementation split

This work should land as **6 PRs** to keep context windows tight and reviewable.

### PR 0 — Extraction trace logging
- dedicated extraction logger
- metadata-only structured traces
- primary/repair/result stages
- correlation ids
- no product behavior changes

### PR 1 — V2 extraction contract + backend validation/guards (additive-only)
This PR introduces V2 types alongside the existing V1 types. **No API responses or persistence shapes change in this PR.** The new contract, segmentation, and guards are internal to the extraction pipeline.
- `ExtractionResultV2` type with `pricing_hints`, `customer_notes_suggestion`, `unresolved_segments`, `pipeline_version`
- `PreparedCaptureInput` structured type refactoring (replaces flat string input to the extraction integration, preserving typed-notes vs transcript provenance)
- `CaptureSegment` type and deterministic segmentation rules
- narrowed `confidence_notes` semantics in model prompt and sentinel guard notes
- validation / repair / semantic guard updates for V2 schema
- model prompt and tool schema updates for V2 placement targets
- existing V1 `ExtractionResult` and API responses remain unchanged
- no persistence/UI/contract-external changes yet

**Worker payload backward compatibility.** The async extraction queue currently serializes `transcript` as a plain string in job kwargs. PR 1 must keep the ARQ job function signature backward-compatible: the worker must accept both legacy `transcript: str` jobs and new structured `PreparedCaptureInput` jobs for at least one deployment window. The worker should detect the payload shape and construct a `PreparedCaptureInput` from a legacy string transcript when needed. This prevents terminally failing in-flight extraction jobs during deploy.

### PR 2 — V2 API migration + initial extract seeding + sidecar persistence
This is the API/persistence migration point. Backend API responses switch from V1 to V2 shape. Frontend types and service layer must update in the same PR or same deployment window.
- add `extraction_review_metadata` JSONB column to `documents` table (nullable, default `NULL`)
- replace V1 `ExtractionResult` with V2 `ExtractionResultV2` in API responses
- update frontend `ExtractionResult` type in `quote.types.ts` and extraction/append service methods
- direct-write notes/pricing into real fields when seeding rules permit (net-new behavior — current creation sets these to `None`)
- JSON sidecar persistence with grouped review state and seeded field provenance
- resolve line-item flag persistence gap — add `flagged` and `flag_reason` columns to the `line_items` table (see Line-item flag persistence section below)
- transcript persistence stays as product data
- backward compatibility: documents with `NULL` sidecar are treated as having no V2 metadata (`review_state` defaults to all-pending-false, empty hidden details)
- no append behavior yet
- **minimal draft hydration change**: after a V2 persisted extract (sync or async), the frontend must fetch `QuoteDetail` and reseed the review draft from the persisted document (including V2 notes/pricing/review state) rather than from the extraction response alone. The extract/append endpoints return `ExtractionResultV2` only; sidecar-backed review state comes from the subsequent `QuoteDetail` fetch. The current `CaptureScreen.tsx` seeds `total` from `extraction.total` and leaves `taxRate`/`discountType`/`discountValue`/`depositAmount`/`notes` blank. V2 changes this data flow: after persist, fetch `QuoteDetail`, then reseed draft from persisted fields and sidecar data. This is a data-flow change, not a UI change — the review form rendering stays the same in PR 2.

### PR 3 — Review UI simplification + Capture Details
- replace inline `AIConfidenceBanner` rendering with grouped `notes_pending`/`pricing_pending` review markers
- remove `confidenceNotes` prop from `ReviewFormContent` and `DocumentEditScreenView`
- retire `reviewConfidenceNotes.ts` localStorage module — review state is now API-driven from sidecar
- continue confirm modal (gated on visible review state only, not hidden details)
- `Capture Details` modal/sheet
- transcript display (read-only)
- hidden details rendering
- sparse high-severity allowlist
- alert icon for undismissed hidden actionable items

### PR 4 — Append behavior + hidden-item lifecycle
- populated means protected (net-new logic for notes/pricing — current append only touches line items and total)
- line-item total recomputation preserved on append; pricing hints on populated total_amount become append suggestions instead
- append suggestions instead of overwrite for populated fields
- backend-owned deterministic hidden-item ids
- hidden lifecycle state map
- reviewed/dismissed persistence via `PATCH /api/quotes/{id}/extraction-review-metadata`
- resurfacing rules for genuinely new append output
- manual field edits clear related append suggestions (server-side side effect on quote PATCH) (server-side)

### PR 5 — Eval and test hardening
- backend tests
- frontend tests
- extraction fixtures
- degraded cases
- typed-vs-transcript conflict coverage
- before/after manual-edit-oriented checks

This split keeps PR 1 safely additive (no breaking changes) and concentrates the V1→V2 contract migration in PR 2, where the backend, API, and frontend all switch together.

---

## Acceptance criteria

## Global success bar
Global success means:
- initial extract seeds cleaner line items, safer pricing, and conservative notes
- append never overwrites populated notes/pricing
- review screen stays calm and focused
- hidden AI details live in Capture Details
- degraded flows stay inspectable
- tests/evals cover the new contract and edge cases

## PR-local acceptance criteria
Each PR should have its own tight acceptance criteria.

### PR 0 — Logging
- structured extraction trace records emit at the intended stages
- metadata-only by default
- raw content requires explicit opt-in
- no product behavior changes

### PR 1 — Backend contract and guards (additive-only)
- V2 `ExtractionResultV2` type validates correctly alongside V1
- `PreparedCaptureInput` structured type replaces flat string input
- repair path still works for V2 schema
- semantic and placement guards behave correctly
- typed / voice / mixed input all use the same contract
- V1 API responses and persistence remain unchanged
- worker payload backward compatibility: ARQ job function accepts both legacy `transcript: str` and new structured `PreparedCaptureInput` payloads

### PR 2 — API migration, seeding, and sidecar
- V2 extraction result replaces V1 in API responses
- frontend types and service layer updated in lockstep
- `extraction_review_metadata` JSONB column added to `documents`
- notes/pricing seed directly into real fields when allowed
- sidecar persists grouped review state and minimal provenance
- transcript persists as product data
- `flagged` and `flag_reason` columns added to `line_items` table; persisted flags survive reseed and are available in API responses
- existing documents with `NULL` sidecar load safely with defaults
- review draft is seeded from persisted document data (including V2 fields and sidecar), not from extraction response alone
- no append overwrite behavior introduced yet

### PR 3 — Review UI and Capture Details
- grouped visible review markers replace inline confidence notes
- `reviewConfidenceNotes.ts` localStorage module is superseded by API-driven sidecar reads
- continue modal only keys off visible review groups (`notes_pending`, `pricing_pending`)
- Capture Details opens as modal/sheet
- hidden details stay out of the main review surface
- high-severity allowlist is respected
- alert icon appears only for undismissed hidden actionable items

### PR 4 — Append and hidden lifecycle
- append never overwrites populated notes/pricing
- line-item total recomputation continues on append; populated total_amount is protected from pricing-hint overwrite
- append suggestions persist as hidden items
- manual field edits clear related append suggestions
- unresolved leftovers do not auto-clear
- reviewed/dismissed state persists correctly via sidecar mutation endpoint
- same-batch dedupe and later-append resurfacing behave correctly

### PR 5 — Eval and tests
- backend and frontend tests cover the new behaviors
- eval fixtures cover:
  - typed-only
  - voice-only
  - mixed input
  - explicit pricing
  - degraded/no-line-item cases
  - append behavior
  - typed-vs-transcript conflict cases
- manual review cleanup effort is measurably reduced for the key golden cases

---

## Verification plan

### Backend
Add tests for:
- expanded extraction schema validation
- repair path on invalid structured output
- line-item title/details normalization expectations
- explicit pricing rule parsing
- direct seeding of notes/pricing on initial extract
- grouped review-state persistence
- append non-overwrite behavior
- hidden-item id and lifecycle persistence
- degraded sidecar minimalism
- typed-vs-transcript conflict handling
- `PreparedCaptureInput` preserves typed/transcript provenance through the pipeline
- V2 sentinel confidence notes meet the narrowed "sparse, operator-relevant" definition

### Frontend
Add tests for:
- grouped notes/pricing review markers (replacing inline confidence notes)
- review state read from sidecar API data instead of localStorage
- continue warning modal behavior (gated on visible review state only)
- Capture Details modal/sheet rendering
- hidden items rendering order
- alert icon behavior
- append suggestion visibility/dismissal
- transcript read-only rendering
- degraded-case inspection behavior

### Eval
Add goldens for:
- typed landscaping capture
- spoken equivalent of the same job
- mixed typed + voice case
- patio / drainage invoice sample
- messy shorthand sample
- append-capture sample
- conflicting pricing sample
- no-heading sample
- typed-vs-transcript conflict case

### Practical success signal
A meaningful product success signal is reduced manual cleanup in:
- line-item edits
- notes placement edits
- pricing entry edits

This remains more important than abstract accuracy alone.

---

## Risks and mitigations

### Risk 1 — over-automation
If pricing or notes seeding is too aggressive, the user loses trust.

Mitigation:
- narrow explicit pricing rule table
- conservative notes placement
- grouped visible review markers
- no append overwrite of populated fields

### Risk 2 — UI noise
If the review surface fills with AI notes, leftovers, and suggestions, the app becomes intimidating.

Mitigation:
- only notes/pricing review markers stay visible
- Capture Details holds secondary AI output
- tiny high-severity allowlist
- no numeric badge count
- read-only hidden details in Phase 1

### Risk 3 — append becomes destructive
If append rewrites populated notes/pricing, the workflow becomes frustrating.

Mitigation:
- populated means protected
- append suggestions instead of overwrite
- manual field edits clear related suggestions

### Risk 4 — brittle rule explosion
If deterministic rules become too smart, the system becomes hard to reason about.

Mitigation:
- narrow structural segmentation only
- model classifies and places
- backend validates and guards
- keep explicit pricing rule table small

### Risk 5 — logging becomes a PII hazard
If raw transcript/tool payload logging is on by default, it creates avoidable risk.

Mitigation:
- metadata-only logs by default
- raw-content tracing only through explicit opt-in config

### Risk 6 — V1→V2 contract migration breaks the frontend
The extraction result shape is mirrored across backend schemas, API responses, worker persistence, and frontend types. Changing it in one place without updating all the others creates a runtime type mismatch.

Mitigation:
- PR 1 is additive-only — V2 types are internal, V1 API responses unchanged
- PR 2 switches V1→V2 in backend + frontend in the same deployment window
- no intermediate state where V1 frontend code receives V2 responses or vice versa

### Risk 7 — typed-vs-transcript provenance is lost before the model sees it
The current pipeline flattens mixed capture into a single combined string before extraction. If provenance is not preserved upstream, conflict-aware `UnresolvedSegment.source` values like `typed_conflict` and `transcript_conflict` cannot be produced.

Mitigation:
- PR 1 introduces `PreparedCaptureInput` as a structured type that carries both the combined text and the separate `raw_typed_notes`/`raw_transcript` fields
- the extraction integration and worker serialization are updated to carry the structured input
- the model prompt receives provenance-marked segments

---

## Final recommendation

Implement **Option C: staged hybrid extraction pipeline**, but in the simplified Phase 1 shape defined here:

- lean extraction contract
- direct-write initial seeding
- conservative notes and pricing placement
- minimal sidecar metadata
- append safety
- simple main review surface
- Capture Details for secondary AI output
- metadata-only logging by default
- 6 tightly scoped PRs

This keeps the extraction foundation durable without making the operator experience feel more complex. It is the right middle ground between smarter internals and a simple user-facing flow. 


---

## Final implementation clarifications

These are small but important clarifications to prevent implementation drift:

### Migration / backward compatibility
- Existing drafts/documents without V2 sidecar metadata must continue to load safely.
- Missing sidecar data should be treated as:
  - `review_state.notes_pending = false`
  - `review_state.pricing_pending = false`
  - empty hidden details
- The implementation should not require historical drafts to be rewritten before the feature ships.
- PR 2 adds the `extraction_review_metadata` JSONB column to `documents` as nullable with a default of `NULL`.

### Review-state clearing rule
- "Manual edit clears review state" means an **actual value change** to the related real field.
- Focus/blur alone does not count.
- Programmatic hydration from extraction does not count as a manual edit.

### Review-state architecture migration
- V2 review state is server-side (sidecar on the document). The current client-side `reviewConfidenceNotes.ts` module that reads/writes confidence notes to `localStorage` is superseded by API-driven sidecar reads.
- `CaptureScreen.tsx` no longer writes confidence notes to `localStorage`; they come from the extraction result and are persisted by the backend.
- `ReviewScreen.tsx` reads `notes_pending` and `pricing_pending` from the sidecar data on `QuoteDetail`, not from `localStorage`.
- Inline `AIConfidenceBanner` rendering in the review form is replaced by grouped review markers and a `Capture Details` modal.

### Hidden item id stability
- Hidden item ids are generated by the backend from deterministic inputs (kind + normalized content + subtype) and included in API responses.
- The frontend receives these ids from the API and does not generate them.
- The normalization must be stable enough for same-batch dedupe, but not so aggressive that distinct items collapse together.

### Hidden lifecycle cleanup
- When hidden items are no longer present in the current extraction output, stale lifecycle entries in `hidden_detail_state` may remain harmlessly for Phase 1 or be garbage-collected opportunistically.
- The UI must render from current hidden items, not from lifecycle state alone.

### Top-level vs sidecar confidence notes
- The top-level `confidence_notes` field remains the extraction contract output.
- The sidecar's hidden review-note list is the persisted current UI-facing subset used by `Capture Details`.
- Avoid treating them as separate competing sources of truth in the frontend.

### Append behavior is net-new for notes and pricing
- The current append logic (`extraction_append/service.py`) only merges transcript text, appends line items, and recalculates `total_amount`. It does not touch `notes`, `tax_rate`, `discount_type`, `discount_value`, or `deposit_amount`.
- The V2 "populated means protected" guard and append suggestions for notes/pricing are entirely new code, not modifications of existing append behavior.
- Similarly, initial extraction seeding of notes and pricing fields is net-new — the current `create_extracted_draft` sets `notes=None`, `tax_rate=None`, `discount_type=None`, `discount_value=None`, `deposit_amount=None` for all extractions.

### Line-item flag persistence
- The current `LineItemExtracted` transfer schema includes `flagged` and `flag_reason`, but `LineItemDraft` (the persistence type) strips them, and the `LineItem` database model has no `flagged` or `flag_reason` columns.
- PR 2 adds `flagged` (boolean, default `false`) and `flag_reason` (string, nullable) columns to the `line_items` table, and updates `LineItemDraft` and all persistence paths to carry flags through. This is a narrow exception to the "do not redesign the line item database shape" non-goal. Per-line-item flags are not stored in the sidecar — they live on the `line_items` table and are included in the `LineItem` API response.

### UI density follow-up
- A small follow-up polish pass on the review screen layout is expected after PR 3 so line items, notes, and pricing continue to feel compact once review markers and `Capture Details` are added.
