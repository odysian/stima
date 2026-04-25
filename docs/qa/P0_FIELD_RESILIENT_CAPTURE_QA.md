# P0 Field-Resilient Capture QA Pass (Task #579)

Date: 2026-04-25  
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
| Android Chrome (web) | Operator | Physical device | Planned |
| Android installed PWA | Operator | Physical device | Planned |
| iOS Safari (web) | Operator | Physical device | Planned |
| iOS installed PWA | Operator | Physical device | Planned |
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

## Acceptance criteria tracking

| Acceptance criterion | Evidence owner | Evidence method | Status | Notes |
|---|---|---|---|---|
| Cold offline app open recovers local captures for last verified user | Operator + Agent | Scenario D + auth snapshot tests | Partial | Agent tests cover offline snapshot restore path; installed PWA cold boot still pending on device |
| Notes and audio survive refresh/reopen | Operator | Scenarios A/B | Pending | Audio persistence must be on physical device |
| Outbox retry creates exactly one server quote/draft | Operator + Agent | Scenario C + outbox tests | Partial | Agent tests cover retryable outbox transitions; exact single draft check still pending real run |
| Pending capture UI updates without reload | Agent + Operator | QuoteList outbox success tests + Scenario C | Partial | Automated test confirms quote list refetches on `outbox_succeeded`; mobile run pending |
| Auth expiry does not delete local work | Operator + Agent | Scenario E + auth tests | Partial | Auth tests cover explicit auth failure/offline restore behavior; mobile reauth flow pending |
| Delete is confirmed | Operator | Scenario F | Pending | |
| PWA update prompt does not block core mobile controls | Agent + Operator | prompt test + Scenario G | Partial | Prompt placement token verified in test; device viewport overlap check pending |
| Service worker does not cache authenticated API responses | Agent | Vite PWA config inspection | Pass | `runtimeCaching: []` in `frontend/vite.config.ts` |
| QA doc records pass/fail + device/browser notes | Agent + Operator | This artifact + operator updates | In progress | |
| `make frontend-verify` passes | Agent | command output | Pass | Completed on 2026-04-25 |
| Known limitations documented before closing #549 | Agent + Operator | section below | In progress | |

## Agent execution log (2026-04-25)

- Branch: `task-579-mobile-qa-pass`
- Command: `cd frontend && npx vitest run src/features/auth/tests/useAuth.test.tsx src/features/quotes/tests/QuoteList.test.tsx src/shared/components/PwaUpdatePrompt.test.tsx`
  - Result: pass (`3` files, `40` tests)
- Command: `make frontend-verify`
  - Result: pass
- Additional inspection: `frontend/vite.config.ts`
  - Result: `workbox.runtimeCaching` is empty and API route fallback is denied (`/^\\/api\\//`)
- Notes: test run emitted known non-blocking warnings in stderr (Radix `DialogContent` description warnings and IndexedDB-unavailable warnings in jsdom context); command exited successfully.

## Operator execution log template (fill during device pass)

### Device run 1
- Device: iPhone (fill exact model)
- OS: iOS (fill version)
- Browser/install mode: Safari web + installed PWA
- Scenario(s): A, B, D, G, H
- Result: Pending
- Notes: verify keyboard overlap, update prompt overlap, and cold offline reopen from home-screen icon

### Device run 2
- Device: Android phone (fill exact model)
- OS: Android (fill version)
- Browser/install mode: Chrome web + installed PWA
- Scenario(s): A, C, D, E, F
- Result: Pending
- Notes: include idempotency evidence (one resulting draft) and delete confirmation behavior

## Known limitations / open items

- Real-device findings pending operator pass.
- If physical coverage is limited to one platform, record exact limitation and compensating checks before Task close.
- Agent cannot provide physical mobile hardware validation; operator-run scenarios remain required for completion.
