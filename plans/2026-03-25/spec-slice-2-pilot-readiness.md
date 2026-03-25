# Spec: Slice 2 Pilot Readiness

## Summary

Slice 0 and Slice 1 established the core quote flow, voice capture, history, sharing,
and settings. Before running a real pilot, the app needs a focused hardening pass
across five areas:

1. error states and long-running loading feedback
2. transcript correction and review guardrails
3. timezone-accurate quote dates
4. mobile-first QuotePreview PDF actions
5. pilot event logging

This is a gated Spec: one Spec issue with five child Task issues. Each child Task is
still a `single`-PR unit.

## Issue Mode

`gated` — 1 Spec issue + 5 Task issues.

| Issue | Type | Labels |
|---|---|---|
| Spec: Slice 2 pilot readiness (`#90`) | `type:spec` | `area:quotes`, `area:frontend`, `area:backend` |
| Task 8: Error states + loading feedback (`#94`) | `type:task` | `area:quotes`, `area:frontend` |
| Task 9: Transcript correction + review guardrails (`#91`) | `type:task` | `area:quotes`, `area:frontend` |
| Task 10: Pilot event logging (`#92`) | `type:task` | `area:quotes`, `area:backend`, `area:database` |
| Task 11: Timezone-accurate quote dates (`#95`) | `type:task` | `area:quotes`, `area:frontend`, `area:backend` |
| Task 12: Mobile-first QuotePreview PDF actions (`#93`) | `type:task` | `area:quotes`, `area:frontend` |

## Motivation

### Why this Spec exists

The current app is feature-complete enough to create and share quotes, but several
pilot-blocking issues remain:

- long-running extraction states are under-specified and not fully locked by tests
- ReviewScreen lacks a correction path for bad transcript extraction
- quote issue dates are wrong near UTC day boundaries
- QuotePreview is built around a PDF iframe that renders blank on mobile
- pilot instrumentation does not yet persist product-validation events

None of these warrant a single monolithic PR. Together, they define the real
"pilot readiness" milestone for Slice 2.

## Decision Locks

1. **Keep Slice 2 as a gated Spec, not one large Task.** The work crosses frontend,
   backend, and database concerns, but each unit is still reviewable on its own.
2. **Timezone and mobile QuotePreview fixes belong inside Slice 2.** They are pilot-
   facing correctness/usability issues, not unrelated follow-ups.
3. **Event logging lands after the user-facing hardening tasks by recommended order.**
   Instrumentation should not stabilize around flows that are still actively shifting.
4. **Do not pre-scope "speed improvements" into this Spec.** The roadmap mentions
   speed, but no concrete contract exists yet. Revisit after instrumentation and UX
   hardening make the bottlenecks visible.

## Child Tasks

- [ ] Task 8 — Error states + loading feedback (`#94`)
- [ ] Task 9 — Transcript correction + review guardrails (`#91`)
- [ ] Task 11 — Timezone-accurate quote dates (`#95`)
- [ ] Task 12 — Mobile-first QuotePreview PDF actions (`#93`)
- [ ] Task 10 — Pilot event logging (`#92`)

### Recommended Execution Order

1. Task 8 — Error states + loading feedback
2. Task 9 — Transcript correction + review guardrails
3. Task 11 — Timezone-accurate quote dates
4. Task 12 — Mobile-first QuotePreview PDF actions
5. Task 10 — Pilot event logging

### Dependency Notes

- Task 8 and Task 9 both touch quote capture/review surfaces, but can proceed as
  separate PRs if scoped carefully.
- Task 11 is independent of Tasks 8 and 9.
- Task 12 is independent of Tasks 8, 9, and 11.
- Task 10 is technically independent, but is recommended last so the event model is
  instrumenting the stabilized pilot experience.

## Out of Scope for This Spec

- Async job infrastructure or realtime progress streaming
- Customer-specific timezone behavior
- A public quote landing page in front of the PDF share URL
- Performance/speed work without a concrete contract
- New quote statuses or backend share/PDF contract changes

## Verification

```bash
make backend-verify
make frontend-verify
```

Fallback:

```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest
cd ../frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```
