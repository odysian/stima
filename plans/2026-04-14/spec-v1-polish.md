# Spec: V1 polish pass — document trust, auth friction, and brand shell

> **GitHub:** Spec [#385](https://github.com/odysian/stima/issues/385) · Task 01 [#386](https://github.com/odysian/stima/issues/386) · Task 02 [#387](https://github.com/odysian/stima/issues/387) · Task 03 [#390](https://github.com/odysian/stima/issues/390)  
> Labels (see `docs/ISSUES_WORKFLOW.md`): **`type:spec`** + up to three **`area:`** labels (`area:quotes`, `area:frontend`, `area:auth` on the spec issue). Child Tasks use narrower `area:` sets per phase.  
> Task plans: `plans/2026-04-14/v1-polish/task-01-customer-document-trust.md` · `plans/2026-04-14/v1-polish/task-02-auth-friction.md` · `plans/2026-04-14/v1-polish/task-03-brand-shell.md`

## Summary
The core V1 document flow is already shipped. This spec is a focused polish pass over the highest-visibility surfaces that shape first impression for interview review, pilot usage, and customer-facing trust.

The work stays intentionally narrow:
- strengthen customer-facing quote presentation on the public page and PDF
- remove obvious auth friction on login/register
- improve app shell presentation with lightweight brand chrome

This is **not** a new workflow spec. It does not change extraction behavior, document lifecycle contracts, share-token behavior, or core quote/invoice architecture.

## Value / User Impact
- Customers see a quote that feels more deliberate, branded, and trustworthy.
- Contractors get a cleaner public/share experience without changing how sharing works.
- First-use auth feels more complete and less error-prone.
- The app feels more productized in the browser tab, loading state, and general shell presentation.

## Scope
**In scope:**
- **Phase 1 — Customer-facing document trust pass**
  - Increase PDF logo size safely without breaking long business-name/header layouts.
  - Preserve multiline customer address formatting on PDFs (e.g. `white-space: pre-wrap` on the customer address block, or controlled newline handling — avoid changing global `.value` styling unrelated to address).
  - Add a small **Prepared By** block on PDFs (see Acceptance criteria for composition).
  - Add a **quote-only** acceptance/signature area near the bottom of the PDF (`Accepted By`, `Date`) — presentational blank lines or light rules; keep vertical footprint modest; acceptable if WeasyPrint flows the block to a second page when content is long.
  - Reorder the **public shared document page** (`PublicQuotePage` — serves **both** quotes and invoices from the same route) so line items render before the subtotal / discount / tax / total breakdown for both doc types unless explicitly scoped narrower in the Task.
  - Tighten public document hero/logo thumbnail presentation so the brand mark reads cleanly on mobile and desktop.
- **Phase 2 — Auth friction pass**
  - Add confirm-password input on register (client-side guardrail only; no new server-side confirm field or API contract).
  - Add password visibility toggles on register and login (`type="button"`, accessible name / `aria-pressed` or equivalent, keyboard operable).
  - Add inline mismatch validation for register before submit.
  - **Out of scope for Phase 2 unless explicitly pulled into a follow-up:** forgot-password and reset-password screens (parity toggles deferred by default).
- **Phase 3 — Brand shell pass**
  - Add favicon / app icon assets under **`frontend/public/`** (Vite public root — files served at site root; no new `public/static` convention required).
  - Tighten basic browser-shell presentation (`index.html` head metadata / icon links only as needed for the favicon work; optional `apple-touch-icon` only if it stays within “no PWA manifest” guardrails).
  - Polish the full-screen loading spinner so it feels intentional rather than default.

**Out of scope:**
- Extraction robustness work, messy-input guidance, eval corpus expansion, or prompt changes.
- Any new capture-flow rules for typing/speaking.
- Extraction timeout/provider behavior changes.
- Quote/invoice lifecycle or share-token contract changes.
- Customer-facing approve/decline actions.
- Invoice public-route behavior changes (payload, auth, or status semantics).
- Quote/invoice schema changes or new API endpoints.
- Broader design-system refactors, PWA/offline work, app manifest, service worker, or app-shell redesign.
- A larger quote/invoice parity pass beyond the specific visual polish items listed above.
- Password visibility toggles on forgot/reset flows (unless a Task explicitly adds them).
- Authenticated app surfaces (e.g. contractor quote preview, list, or settings) except where a later Task explicitly scopes them — Phase 1 is **public shared document + PDF only**.

## How it works (expected behavior)
1. **Phase 1 ships first** because it improves the exact artifacts a reviewer or customer would judge fastest: the public shared document page and the generated PDF.
2. The public document page remains **read-only** and token-gated. The data contract stays the same; only scan order and presentation improve.
3. **PDF rendering:** `PdfIntegration` always loads `quote.html`; **quotes and invoices share one template**. `QuoteRenderContext` carries **`doc_label`** (`"Quote"` vs `"Invoice"`) built from quotes and invoices repositories — there is **no `doc_type` field on the context today**. **Render the bottom acceptance block only when** `doc_label == "Quote"`; invoice PDFs use `doc_label="Invoice"` and must omit that block. Lock this with paired template tests (see Tests and Phase 1 acceptance).
4. The PDF keeps the same underlying document data, but the visual hierarchy becomes more trustworthy:
   - larger but bounded logo
   - correctly formatted address block
   - clearer authorship
   - quote-only acceptance area for customer signoff
5. **Phase 2** tightens first-use auth without touching backend auth contracts. Register becomes safer against accidental mismatches and both auth screens get low-friction visibility toggles.
6. **Phase 3** finishes the shell-level first impression so the app looks more like a deployed product in the tab and during initial loading.

## Backend plan (if applicable)
- **API changes:** none
- **Schema changes:** none
- **Events / realtime changes:** none
- **Guardrails (authz, rate limits, compat, pagination):**
  - Public document page stays read-only.
  - Existing share token lookup, status transitions, and download behavior stay unchanged.
  - Quote acceptance/signature area is presentational only; it must not introduce any new persisted approval state.
  - Quote-only PDF acceptance/footer treatment must not appear on invoice PDFs (same template; conditional on `doc_label` as above).
  - Multiline address handling must use the existing stored customer address field; do not split address into new columns in this spec.
  - Logo enlargement must keep hard max bounds so tall/wide uploads do not break header layout.
- **Repository / context:** Prepared By should use fields already on `QuoteRenderContext` (`business_name`, `first_name` / `last_name`, `phone_number`, `contractor_email`). **Do not** extend `QuoteRenderContext` or invoice/quote repositories unless a field is genuinely missing for that block (unlikely).

## Frontend plan
- **State model:**
  - No new persisted document state.
  - Public document page continues to consume the existing public document payload.
  - Auth polish introduces only local UI state for password visibility and register password confirmation.
- **UI components touched:**
  - `PublicQuotePage` and presentational modules under `frontend/src/features/public/` that it imports (no authenticated quotes UI in Phase 1 unless a future Task explicitly adds it).
  - Register and login form components.
  - Shared loading screen component.
  - `index.html` head/icon links and static assets required for favicon support.
- **Edge cases:**
  - No logo uploaded.
  - Long/wide logo uploaded.
  - Missing address / single-line address / multiline address.
  - Quote vs invoice PDF branching for signature area (`doc_label`).
  - Public document with pricing breakdown vs simple total.
  - Register password mismatch.
  - Password toggle must not break autofill or keyboard flow.
  - Favicon assets should not break local/dev or production build paths.

## Files expected
- **Backend:**
  - `backend/app/templates/quote.html`
  - `backend/app/features/quotes/tests/test_pdf_template.py`
  - `backend/app/integrations/pdf.py` only if required for render safety or context-handling adjustments
- **Frontend:**
  - `frontend/src/features/public/components/PublicQuotePage.tsx`
  - `frontend/src/features/public/tests/PublicQuotePage.test.tsx`
  - `frontend/src/features/auth/components/RegisterForm.tsx`
  - `frontend/src/features/auth/components/LoginForm.tsx`
  - `frontend/src/features/auth/tests/RegisterForm.test.tsx`
  - `frontend/src/features/auth/tests/LoginForm.test.tsx` (extend when login visibility toggles ship)
  - `frontend/src/shared/components/LoadingScreen.tsx`
  - `frontend/index.html`
  - Branded icon files under **`frontend/public/`** (e.g. `favicon.ico`, `favicon.svg`, `apple-touch-icon.png` as needed for Phase 3)
- **Docs:**
  - this spec file
  - optional roadmap/readme touch-up only if the implementation exposes clearly stale wording during the pass; do not expand scope for docs-only cleanup

## Tests
- **Backend:**
  - Add/extend PDF template tests in `test_pdf_template.py` (same style as existing HTML-capture tests), including a **paired regression check**: rendered quote HTML **includes** the acceptance-area markers (e.g. literal `Accepted By` / `Date` labels in the template so tests can substring-match without layout brittleness), and rendered invoice HTML with `doc_label="Invoice"` **does not**. Add alongside:
    - larger logo rendering within safe bounds
    - multiline customer address rendering
- **Frontend:**
  - Public document page test coverage for line-items-before-totals render order and any logo/hero branching that is easy to assert.
  - Register tests for confirm-password mismatch behavior.
  - Login/register tests for password visibility toggles when implemented.
  - Loading screen test only if the implementation meaningfully changes logic; visual-only class cleanup does not require over-testing.
- **Regression:**
  - Public document remains read-only.
  - Existing Download PDF path still works.
  - Existing share / email / manual copy workflows are unaffected.
  - Sparse quote/invoice cases continue to render without placeholder junk.

## Decision locks (must be Locked before implementation for backend-coupled work)
- [ ] Locked: This is a polish-only spec — no schema migration, no new route, and no document-status contract change.
- [ ] Locked: Public document behavior remains read-only and token-gated; this spec does not introduce customer approve/decline actions.
- [ ] Locked: PDF acceptance/signature treatment is **quote-only** and presentational; invoices do not gain a signature block from this pass.
- [ ] Locked: Auth friction work is frontend-only UX polish; backend auth contracts and payloads remain unchanged.
- [ ] Locked: Brand shell work is limited to favicon/basic shell presentation/loading polish; no PWA/offline/app-manifest expansion in this spec.

## ADR links (if lasting architecture/security/perf decision)
- ADR: none expected

## Acceptance criteria
- [ ] **Phase 1 — Public document trust**
- [ ] Public document page continues to load from the existing token-gated route without auth changes.
- [ ] Public document page keeps the top customer/summary section near the top but renders **line items before** subtotal / discount / tax / total breakdown (same component serves **shared** quotes and invoices).
- [ ] Public document hero/logo treatment is visually cleaner on mobile and desktop.
- [ ] Long/wide logos remain bounded and do not break the public-page header layout.
- [ ] PDF logo is visibly larger than the current baseline while still respecting safe bounds.
- [ ] PDF customer address preserves intended line breaks when multiline address content exists.
- [ ] PDF includes a small **Prepared By** block: show **business name if set**, else **owner full name** from `first_name` / `last_name`; then non-empty lines from **phone** and/or **contractor email** (omit empty parts; compact spacing).
- [ ] Quote PDFs (`doc_label` quote path) include a bottom acceptance area with `Accepted By` and `Date`.
- [ ] Invoice PDFs (`doc_label` invoice path) do **not** include the quote acceptance area.
- [ ] **Regression tests:** `test_pdf_template.py` includes a paired assertion that quote render output contains the acceptance-area copy and invoice render output does not (same fixture style as existing template tests).
- [ ] Existing public-page read-only behavior and Download PDF behavior remain unchanged.

- [ ] **Phase 2 — Auth friction**
- [ ] Register includes confirm-password input.
- [ ] Register blocks submit when password and confirm-password do not match, with clear inline feedback.
- [ ] Login and register both include password visibility toggles.
- [ ] Password visibility toggles do not break current submit, autofill, or keyboard behavior.
- [ ] No backend auth/API changes are introduced by this phase.

- [ ] **Phase 3 — Brand shell**
- [ ] Browser tab/favicon shows branded icon assets instead of the current missing/default state.
- [ ] `frontend/index.html` includes only the minimal shell changes needed to support the favicon/icon work cleanly.
- [ ] Loading screen spinner feels intentionally styled and remains lightweight.
- [ ] Shell polish does not introduce new startup regressions or asset path issues.

- [ ] **Overall**
- [ ] `make backend-verify` passes for touched backend scope.
- [ ] `make frontend-verify` passes for touched frontend scope.
- [ ] No extraction/capture logic changed in this spec.

## Verification
```bash
cd backend && .venv/bin/pytest app/features/quotes/tests/test_pdf_template.py
cd frontend && npx vitest run src/features/public/tests/PublicQuotePage.test.tsx src/features/auth/tests/RegisterForm.test.tsx src/features/auth/tests/LoginForm.test.tsx
make backend-verify
make frontend-verify
```

## Notes
### Recommended execution split
- **Task 01 — Customer-facing document trust pass**
  - Areas: `area:quotes`, `area:frontend`, `area:backend`
  - Includes all PDF + public document work
- **Task 02 — Auth friction pass** ([#387](https://github.com/odysian/stima/issues/387))
  - Areas: `area:auth`, `area:frontend`
  - Includes confirm-password + visibility toggles
- **Task 03 — Brand shell pass** ([#390](https://github.com/odysian/stima/issues/390))
  - Areas: `area:frontend`
  - Includes favicon + loading spinner polish

### Recommended order
1. Task 01 — Customer-facing document trust pass
2. Task 02 — Auth friction pass
3. Task 03 — Brand shell pass

### Review focus for the follow-up reviewer
- Does Phase 1 stay presentational, or did it quietly mutate document/public-route behavior?
- Are quote vs invoice PDF acceptance blocks explicit, correctly conditional on `doc_label`, and covered by paired template tests?
- Did auth polish avoid backend contract creep?
- Did favicon/shell work stay lightweight rather than turning into a PWA/settings rabbit hole?

### Explicit non-goals for reviewer
Reviewer should reject scope creep into:
- extraction/eval changes
- invoice workflow redesign
- capture-flow guidance rules
- timeout/provider retries
- broader design-system refactors
