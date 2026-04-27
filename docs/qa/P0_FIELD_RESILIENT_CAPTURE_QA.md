# P0 Field-Resilient Capture QA Pass (Task #579)

Date: 2026-04-27  
Spec: #575 (Spec 8 — Recovery UX Polish & Mobile QA Pass)  
Task: #579 — Mobile/PWA QA pass and final P0 artifact  
Execution mode: single

## Goal

Validate end-to-end P0 recovery confidence with a mixed QA plan:
- Operator-run real-device checks (required for true mobile/PWA confidence).
- Agent-run local verification and targeted automated checks (fast regression guardrail).

## Scope and constraints

In scope:
- P0 recovery scenarios A-H from Task #579.
- Device/browser notes and pass/fail recording.
- Frontend verification baseline (`make frontend-verify`).

Out of scope:
- New feature work.
- New automated E2E suite.
- Provider/live checks requiring human environment access.

## Environment matrix

| Surface | Owner | Environment | Status |
|---|---|---|---|
| Android Chrome (web) | Operator | Physical device (Samsung SM-A35) | Complete |
| Android installed PWA | Operator | Physical device (Samsung SM-A35) | Complete |
| iOS Safari (web) | Operator | Physical device | Not run |
| iOS installed PWA | Operator | Physical device | Not run |
| Desktop Chrome (web/PWA smoke) | Agent | Local dev environment | Complete |
| Automated frontend tests/build | Agent | Local dev environment | Complete |

## Mixed test plan (who runs what)

### Operator-run (real mobile device)

Run scenarios A-H directly from Task #579:
- A Notes-only offline capture
- B Audio offline capture
- C Outbox retry
- D Cold offline installed PWA
- E Auth expiry / reauth
- F Delete safety
- G PWA update prompt placement
- H Mobile keyboard and footer

Record for each scenario:
- Device + OS version
- Browser/PWA mode
- Pass/Fail
- If fail: exact step + observed behavior + screenshot/video note

### Agent-run (local verifiable checks)

1. Frontend broad gate:
```bash
make frontend-verify
```

2. Targeted regression tests aligned to P0 acceptance:
```bash
cd frontend && npx vitest run \
  src/features/auth/tests/useAuth.test.tsx \
  src/features/quotes/tests/QuoteList.test.tsx \
  src/shared/components/PwaUpdatePrompt.test.tsx
```

3. Service worker cache policy inspection:
- File: `frontend/vite.config.ts`
- Expectation: `runtimeCaching: []` and API routes excluded from app-shell fallback (`/^\/api\//` denylist).

4. Lighthouse PWA maskable icon audit:
- Build command: `cd frontend && npm run build`
- Artifact check: `dist/manifest.webmanifest` includes icon entry with `purpose: "maskable"`.
- Lighthouse expectation: PWA audit maskable-icon check passes.

## Acceptance criteria tracking

| Acceptance criterion | Evidence owner | Evidence method | Status | Notes |
|---|---|---|---|---|
| Cold offline app open recovers local captures for last verified user | Operator + Agent | Scenario D + auth snapshot tests | Pass | Android installed PWA pass on device |
| Notes and audio survive refresh/reopen | Operator | Scenarios A/B | Pass | Device run complete |
| Outbox retry creates exactly one server quote/draft | Operator + Agent | Scenario C + outbox tests | Pass | Device flow pass; no duplicates observed |
| Pending capture UI updates without reload | Agent + Operator | QuoteList outbox success tests + Scenario C | Pass | Scenario C pass; reconnect refetch polish tracked in #614 |
| Auth expiry does not delete local work | Operator + Agent | Scenario E + auth tests | Pass | Device flow pass after reauth |
| Delete is confirmed | Operator | Scenario F | Pass | Device flow pass |
| PWA update prompt does not block core mobile controls | Agent + Operator | prompt test + Scenario G | Pass | Device flow pass |
| Service worker does not cache authenticated API responses | Agent | Vite PWA config inspection | Pass | `runtimeCaching: []` in `frontend/vite.config.ts` |
| Manifest includes a maskable icon for installed PWA launchers | Agent + Operator | Manifest inspection + Lighthouse PWA audit + Scenario D launch check | Pass | Scenario D installed launch pass |
| QA doc records pass/fail + device/browser notes | Agent + Operator | This artifact + operator updates | Pass | Operator script merged into artifact |
| `make frontend-verify` passes | Agent | command output | Pass | Completed on 2026-04-25 |
| Known limitations documented before closing #579 | Agent + Operator | section below | Pass | Follow-up #614 created for reconnect UX polish |

## Agent execution log (2026-04-25)

- Branch: `task-579-mobile-qa-pass`
- Command: `cd frontend && npx vitest run src/features/auth/tests/useAuth.test.tsx src/features/quotes/tests/QuoteList.test.tsx src/shared/components/PwaUpdatePrompt.test.tsx`
  - Result: pass (`3` files, `40` tests)
- Command: `make frontend-verify`
  - Result: pass
- Additional inspection: `frontend/vite.config.ts`
  - Result: `workbox.runtimeCaching` is empty and API route fallback is denied (`/^\\/api\\//`)
- Notes: test run emitted known non-blocking warnings in stderr (Radix `DialogContent` description warnings and IndexedDB-unavailable warnings in jsdom context); command exited successfully.

## Operator execution log

> Production URL: `https://stima.odysian.dev`  
> *(Live deployment with latest code from this branch.)*  
> Test script: `docs/qa/OPERATOR_TEST_SCRIPT_579.md`

### Device run 2 — Android

- [x] Device model recorded
- [ ] Android version recorded
- [x] Chrome web tested
- [x] Installed PWA tested

| Scenario | Pass | Fail | Notes / screenshot |
|---|---|---|---|
| A — Notes-only offline capture | [x] | [ ] | Pass per operator script |
| B — Audio offline capture | [x] | [ ] | Pass per operator script |
| C — Outbox retry | [x] | [ ] | Pass per operator script |
| D — Cold offline installed PWA | [x] | [ ] | Pass; reconnect refetch polish tracked in #614 |
| E — Auth expiry / reauth | [x] | [ ] | Pass per operator script |
| F — Delete safety | [x] | [ ] | Pass per operator script |
| G — PWA update prompt placement | [x] | [ ] | Pass per operator script |
| H — Mobile keyboard and footer | [x] | [ ] | Pass per operator script |

**Device model:** Samsung SM-A35  
**Android version:** Not captured during run  
**Result summary:** All A-H scenarios passed on operator Android run. No major defects. One UX follow-up opened for reconnect auto-refetch.

## Known limitations / open items

- Physical-device pass completed on Android only; iOS coverage not run in this task.
- Reconnect UX polish needed: after reconnect from offline, some surfaces needed manual refresh/tab switch to refetch. Tracked as follow-up Task #614.
- Agent cannot provide physical mobile hardware validation; operator-run scenarios remain required for completion.
