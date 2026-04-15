# Task — PR 3: Review UI simplification + Capture Details

**Parent:** [`spec-v2-extraction.md`](./spec-v2-extraction.md).

**PR slot:** PR 3 — Review UI simplification + unified **Capture Details** surface.

## GitHub labels (Task issue)

When filing this Task issue, apply (`docs/ISSUES_WORKFLOW.md`):

- `type:task`
- `area:quotes`
- `area:frontend`

---

## 1. Goal

Move review UX from client-side confidence-note banners to **server-driven** grouped review markers (`notes_pending`, `pricing_pending`) and a single **Capture Details** modal/sheet for secondary AI output, keeping the main review surface focused on line items, notes, and pricing.

---

## 2. In scope

- Replace inline **`AIConfidenceBanner`** usage with **grouped** visible review markers for notes and pricing pending state (from **`QuoteDetail.extraction_review_metadata`**).
- Remove **`confidenceNotes`** (or equivalent) prop from **`ReviewFormContent`** and **`DocumentEditScreenView`**; drive copy/state from sidecar-backed data instead.
- **Retire `reviewConfidenceNotes.ts`** localStorage module — no new writes from **`CaptureScreen`**`; **`ReviewScreen`** reads pending flags from API/sidecar, not localStorage.
- **Continue** confirm modal: soft interrupt when **visible** notes/pricing review-pending remain — **Review now** / **Continue anyway**; hidden Capture Details items **must not** gate Continue.
- **`Capture Details`** entry point: modal/sheet (not inline); **subtle alert icon** (not numeric badge); icon only when there are **current undismissed hidden actionable items**; transcript alone does not force the icon.
- **Order inside Capture Details:** (1) new suggestions from latest capture, (2) unresolved capture details, (3) AI review notes, (4) transcript (read-only product data).
- **High-severity allowlist** outside Capture Details stays very small per parent (e.g. degraded + no line items from substantial capture, explicit total vs line-item conflict, existing flagged line items).
- Hidden sections: append suggestions, unresolved leftovers, lower-severity notes — per parent visibility rules.

---

## 3. Out of scope

- **`PATCH .../extraction-review-metadata`** implementation and dismiss/review persistence (PR 4) — UI may be stubbed only if PR 3 strictly needs read-only display first; prefer implementing read paths + markers in PR 3 and wiring mutations in PR 4 per parent split.
- Append suggestion creation rules and “populated means protected” append logic (PR 4).
- Large layout polish follow-up (parent notes a small post-PR-3 polish pass — optional separate micro-task if needed).

---

## 4. Dependencies / ordering

- **Requires** PR 2 (sidecar on detail API, seeded fields, V2 types in frontend).

---

## 5. Acceptance criteria

(from parent spec — PR 3)

- Grouped visible review markers replace inline confidence notes for the main surface.
- `reviewConfidenceNotes.ts` superseded by API-driven sidecar reads.
- Continue modal keys only off visible review groups (`notes_pending`, `pricing_pending`).
- Capture Details opens as modal/sheet.
- Hidden details stay off the main review surface.
- High-severity allowlist respected.
- Alert icon only for undismissed hidden actionable items (not for transcript-only).

---

## 6. Verification

Run from repo root (`docs/workflow/VERIFY.md`, `Makefile`).

**Tier 1 — targeted:**

```bash
cd frontend && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint src/features/quotes && ./node_modules/.bin/vitest run src/features/quotes
```

**Tier 3 — final gate:**

```bash
make frontend-verify
```

**Coverage intent (PR 3):** extend or add tests under `frontend/src/features/quotes/tests/` for grouped review markers, sidecar-driven reads (no `reviewConfidenceNotes` localStorage), Continue modal gating on `notes_pending`/`pricing_pending` only, Capture Details ordering, alert icon rules, and transcript read-only display.

---

## 7. Implementation notes

- Top-level extraction **`confidence_notes`** vs sidecar hidden list: avoid competing sources of truth in UI; parent clarifies persistence/subset usage for Capture Details.
