# Stima Extraction V2 — Locked Decisions Checkpoint (Batch 4)

This file captures the currently locked decisions from the extraction-pipeline refinement discussion.
It is intentionally separate from the main spec so progress does not get lost while the design is
still being grilled and reshaped.

---

## Product direction

- The extraction pipeline can become more sophisticated internally **as long as the operator-facing UI stays simple**.
- The goal is **cleaner placement with conservative review cues**, not an AI-heavy review screen.
- The main review surface should stay focused on:
  - line items
  - notes
  - pricing

---

## Contract / scope decisions

### 1) Remove title from V2
- **`title_suggestion` is cut from the V2 contract entirely for now.**
- Title is not a core extraction target for the current workflow.
- If title extraction ever becomes useful later, it can return in a future follow-up.

### 2) Keep one canonical persisted document model
- The document remains the source of truth.
- We are **not** building a second AI-only draft model.

### 3) Direct-write seeded values into real fields
- Notes/pricing that meet the phase-1 rules are written directly into the real document fields during extraction.
- We do **not** keep them in a metadata-only staging layer first.
- Safety comes from persisted review/provenance metadata, not from shadow draft fields.

### 4) Keep `confidence_notes`, but narrow it hard
- The field name stays the same for now.
- Its meaning is now **high-signal operator-facing review notes only**.
- It is no longer a generic spillover bucket.

### 5) Model returns the richer structured payload directly
- The model should return the expanded structured extraction payload directly.
- The backend remains the enforcement layer for:
  - validation
  - repair
  - semantic guards
  - placement/apply rules

### 6) Keep the top-level extraction result lean and product-facing
Top-level result should include:
- `transcript`
- `pipeline_version`
- `line_items`
- `pricing_hints`
- `customer_notes_suggestion`
- `unresolved_segments`
- `confidence_notes`
- `extraction_tier`
- `extraction_degraded_reason_code`

Do **not** put deep debug/provenance/process detail into the main extraction result.

---

## Pricing placement decisions

### 7) Pricing may auto-seed into real fields when explicit/confident
Phase 1 may auto-fill:
- deposit amount
- tax rate
- discount type/value
- explicit total

These fields remain visibly marked for review.

### 8) Deposit percentages are out for Phase 1
- **Only fixed-amount deposit extraction is allowed in Phase 1.**
- Do **not** auto-apply:
  - `50% deposit`
  - `half up front`
  - `50 percent down`

### 9) Explicit total is allowed, but conflict-aware
- Explicit total may be auto-filled when clearly stated.
- If it conflicts with extracted priced line items, it stays review-aware and is never silently trusted over the line items.

### 10) Pricing review state is grouped
- Pricing review is **one grouped review state**, not separate review state for every pricing subfield.
- Manual edits clear pricing review state.
- Explicit user acknowledgment can also clear it.

### 11) Rule-based apply thresholds, not numeric scoring
- Phase 1 uses explicit rule-based thresholds for auto-seeding.
- No numeric confidence scoring system in Phase 1.

### 12) `pricing_hints` stays narrow
```ts
interface PricingHints {
  explicit_total: number | null;
  deposit_amount: number | null;
  tax_rate: number | null;
  discount_type: "fixed" | "percent" | null;
  discount_value: number | null;
}
```

### 13) Explicit pricing rule table stays narrow
Allowed examples include:
- Deposit: `deposit 300`, `deposit requested 300`, `ask for 300 deposit`
- Tax: `8% tax`, `tax 8 percent`, `apply 8.25% tax`
- Discount: `discount 50`, `take off 50`, `10% discount`, `apply 10 percent discount`
- Total: `total 825`, `quote total 825`, `invoice total 825`

Fuzzy or ambiguous phrases remain suggestion-only or ignored.

---

## Notes placement decisions

### 14) Notes seeding stays conservative
Only seed notes when one of these is true:
- there is an explicit notes-style heading, or
- the content is clearly document-safe, note-like, and not a service line item, or
- it is clearly non-line-item operational/scope context

Ambiguous leftovers do **not** get shoved into notes.

### 15) Notes review state persists and clears on interaction
- Seeded notes are written into the real notes field.
- They get a visible review-pending state.
- Manual edits clear that state.
- Explicit acknowledgment can also clear it.

### 16) `customer_notes_suggestion` is one simple suggestion object
```ts
interface ExtractionSuggestion {
  value: string;
  confidence: "high" | "medium" | "low";
  source: "explicit_notes_section" | "derived" | "leftover_classification";
}
```

### 17) `customer_notes_suggestion.confidence` keeps `high / medium / low`
- Keep the simple enum for notes.
- Do not replace it with numeric scoring or collapse it to binary.

---

## Review-state / persistence decisions

### 18) Review state persists server-side
- Review-pending state is not client-only.
- It must survive refresh and future append behavior.

### 19) Persist minimal field-level provenance
The server-side extraction/review metadata tracks:
- which fields were AI-seeded
- which review groups are pending
- confidence/source tags for seeded values
- enough provenance to support append logic and future debugging

### 20) Use a JSON sidecar on the document in Phase 1
- Phase 1 stores extraction/review metadata in a **JSON sidecar on the document**.
- No separate extraction metadata table in Phase 1.

### 21) Sidecar payloads stay minimal
For unresolved leftovers and append suggestions, persist only product-facing metadata such as:
- raw text
- kind
- confidence
- short source tag
- optional segment/source index

Do **not** store full normalization/debug-heavy pipeline internals in the document sidecar.

### 22) Combined transcript stays persisted product data
- The combined transcript remains part of the product data model.
- It supports review, degraded inspection, and Capture Details.

### 23) Transcript is read-only in Phase 1
- Transcript is visible in Capture Details.
- It is not editable in Phase 1.

### 24) `pipeline_version` lives in both extraction result and sidecar
- Keep the version tag in both places.
- This helps migrations/debugging later.

### 25) Sidecar structure should be grouped, not flat
Recommended groups:
- `review_state`
- `seeded_fields`
- `hidden_details`

### 26) `review_state` only tracks visible grouped review states
```ts
review_state: {
  notes_pending: boolean;
  pricing_pending: boolean;
}
```

Do **not** add hidden-details pending booleans in Phase 1.

### 27) `seeded_fields` keeps:
- notes: `seeded`, `confidence`, `source`
- pricing: per-field `seeded`, `source`

Pricing does not need extra confidence payload in Phase 1.

---

## Continue / review-flow decisions

### 28) Continue warning is a soft interrupt
If visible review-pending items remain, Continue triggers a confirmation modal:
- **Review now**
- **Continue anyway**

This is **not** a hard gate.

### 29) Hidden auxiliary details do not drive the continue modal
After simplification, the continue warning should care about:
- visible notes review pending
- visible pricing review pending

It should **not** be triggered by hidden auxiliary AI details inside Capture Details.

### 30) Opening Capture Details does not clear review state
Only these actions clear visible review state:
- manual edit of the field/group
- explicit review acknowledgment

Opening the modal alone does nothing.

### 31) Hidden append suggestions do not re-flag visible field review state
- If a populated field remains unchanged and a new append suggestion is generated, the visible field stays unflagged.
- The new suggestion appears only in Capture Details.

---

## Line items / unresolved placement decisions

### 32) No general line-item review state in Phase 1
- We are **not** adding a new line-item review-pending system in Phase 1.
- Existing line-item `flagged` / `flag_reason` behavior remains the line-item review mechanism.

### 33) Deterministic segmentation stays narrow and structural
Rules only:
- split on structure
- detect safe headings/prices
- normalize very safe shorthand
- attach cheap hints

Rules do **not**:
- decide final placement
- derive titles
- resolve ambiguity aggressively

Boundary:
- **Rules** = chunk and hint
- **Model** = classify and place
- **Post-processing** = validate, guard, decide apply vs flag vs suppress

### 34) Phase 1 segmentation hints stay minimal
```ts
hints: {
  has_explicit_price: boolean;
  price_value: number | null;
  looks_like_heading: boolean;
  looks_like_notes_heading: boolean;
  looks_like_line_item: boolean;
}
```

### 35) `unresolved_segments` use minimal structured items
```ts
interface UnresolvedSegment {
  raw_text: string;
  confidence: "medium" | "low";
  source: "leftover_classification" | "typed_conflict" | "transcript_conflict";
}
```

### 36) Unresolved leftovers are read-only in Phase 1
- They are not editable in Phase 1.
- They are persisted and viewable, but not promoted into mini-editors.

### 37) Unresolved leftovers use a lightweight reviewed → dismiss lifecycle
- Operator can mark an item reviewed
- Once reviewed, it can be dismissed
- This lifecycle is lightweight and secondary, not a blocking workflow

### 38) If a dismissed item reappears from a genuinely new append, it can resurface
- Dedupe within the same extraction result.
- Allow resurfacing across later append events if the new input produces it again.

### 39) Unresolved leftovers do not auto-clear from destination field edits
- Only explicit reviewed/dismiss actions clear them in Phase 1.

---

## Append behavior decisions

### 40) Append capture never overwrites curated notes/pricing
Append rules:
- Initial extract may seed real fields
- Append may seed a field only if it is still empty
- If notes/pricing already contain curated content, append stores the new signal as a suggestion instead of overwriting

### 41) Populated means protected in Phase 1
- We do **not** distinguish between:
  - AI-seeded-but-unreviewed
  - user-curated
for overwrite behavior in Phase 1.
- If a field is populated, append does not overwrite it.

### 42) Append suggestions are separate from unresolved leftovers
- **Unresolved leftovers** = system could not confidently place this
- **Append suggestions** = system could place this, but did not apply it because curated content already exists

### 43) Append suggestions are grouped in one shared section in Phase 1
- Phase 1 uses one grouped append-suggestions surface rather than inline suggestion UI everywhere

### 44) Append suggestions are read-only in Phase 1
- They may be viewed and optionally dismissed.
- They do not get one-click apply actions in Phase 1.

### 45) Append suggestion shape stays minimal
```ts
interface AppendSuggestion {
  kind: "note" | "pricing";
  raw_text: string;
  confidence: "medium" | "low";
  source: "append_capture";
  pricing_field?: "explicit_total" | "deposit_amount" | "tax_rate" | "discount";
}
```

### 46) Current-only hidden items in UI
- Show current unresolved leftovers
- Show latest append suggestions
- Show current operator-relevant review notes
- Do **not** show historical scraps as ongoing UI clutter

### 47) Manual field edit clears related append suggestions
- Actual manual value change in notes clears related hidden note suggestions
- Actual manual value change in pricing clears related hidden pricing suggestions
- Opening Capture Details alone does nothing

### 48) Dismissed append suggestions need no extra lifecycle on manual field edit
- If already dismissed, manual edit does not trigger additional state behavior.

---

## Simplified UI direction

### 49) Auxiliary extraction output should not clutter the main review screen
We explicitly simplified the UI direction because:
- confidence notes
- unresolved leftovers
- append suggestions

would otherwise make the screen too noisy.

### 50) Use one unified `Capture Details` entry point
- The unified label is **Capture Details**
- It is the home for:
  - append suggestions
  - unresolved leftovers
  - low-priority confidence notes
  - transcript

### 51) `Capture Details` opens in a modal/sheet, not inline
- Do **not** use an always-open or expandable inline dropdown in the main review page.
- Use a modal/sheet so the main workflow stays clean.

### 52) `Capture Details` uses a subtle alert icon, not a counter
- Phase 1 uses a simple attention indicator when hidden actionable items exist.
- No numeric badge count in Phase 1.

### 53) Order inside `Capture Details`
1. New suggestions from latest capture
2. Unresolved capture details
3. AI review notes
4. Transcript

### 54) AI review notes shown to operators stay sparse and high-signal only
Only truly operator-useful notes belong in UI.
Everything else belongs in:
- logging
- metadata
- eval/debugging

### 55) Capture Details remains available even on degraded extraction results
- Main review surface stays simple
- Capture Details still provides inspectability for transcript and sparse review context

### 56) Capture Details alert icon only appears for current undismissed hidden actionable items
The icon appears only when there are current:
- append suggestions
- unresolved leftovers
- hidden operator-relevant review notes

It does **not** appear for:
- transcript existing by itself
- dismissed items
- historical items
- visible field review pending already shown on the main screen

### 57) Hidden review notes do not auto-clear from field edits
- They remain until superseded by a new extraction result or explicitly dismissed if supported.

### 58) Dismissed/reviewed hidden item state should be persisted explicitly
- Do not rely on simple absence from the list.
- Persist lifecycle state so refresh/revisits behave predictably.

---

## Multi-source input decisions

### 59) One shared V2 pipeline for typed, voice, and mixed input
- Typed-only, voice-only, and mixed input all use the same extraction pipeline contract and downstream placement logic.

### 60) Typed notes win when they are clearer/more explicit than transcript
- Keep one unified pipeline.
- Typed notes outrank transcript only when they are clearly more explicit.
- Only **material** typed-vs-transcript conflicts surface as review notes.

### 61) Source enums should stay trimmed in Phase 1
Keep only the source enums that drive real behavior:
- Notes: `explicit_notes_section`, `derived`, `leftover_classification`
- Unresolved: `leftover_classification`, `typed_conflict`, `transcript_conflict`
- Pricing/appends: `explicit_pricing_phrase`, `append_capture`

---

## Logging child task direction

### 62) Extraction trace logging should be a child task / instrumentation stream
- Trace logging is valuable and should be folded into the broader extraction effort as a child task / phase-0 instrumentation stream.
- It should **not** turn the user-facing review flow into a debugging surface.
- Rich pipeline detail belongs in logs; minimal product-facing metadata belongs in the document sidecar.

### 63) Trace logging is metadata-only by default
- Raw transcript/tool payload content should be behind explicit opt-in config.
- Default logging should emit safe metadata only.

---

## Degraded behavior decisions

### 64) Degraded sidecar stays minimal
When extraction degrades:
- persist only minimal useful metadata
- keep sparse operator-relevant notes if they exist
- keep any surviving unresolved segments if they exist
- do not fabricate rich seeded/provenance structures that were never safely produced

---

## Phase-1 simplicity cap

The Phase 1 target is:

- cleaner line-item output
- safer pricing seeding
- conservative notes placement
- append safety
- durable provenance/review state
- simplified review UI

It is **not**:
- full extraction intelligence everywhere
- a review screen full of AI warnings
- a second AI workflow layered on top of the quote editor
