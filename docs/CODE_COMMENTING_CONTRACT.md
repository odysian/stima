# Code Commenting Contract — Stima

Use this contract to keep in-code comments/docstrings consistent, useful, and reviewable.

## Intent

- Improve readability and onboarding for complex code paths.
- Make comment quality enforceable in PR review and CI.
- Keep comments high-signal and low-noise.

## Scope

Applies to changed code in:

- backend (`.py`)
- frontend (`.ts`, `.tsx`, `.js`, `.jsx`)
- infra (`.tf`)
- scripts (`.sh`)

## Contract Rules (v1)

### 1) Module Context For Complex Files

When a touched file is complex, it needs a short module header comment/docstring.

Complex means any of:

- file LOC is `>300` (default threshold)
- multi-stage orchestration with side effects
- transaction, concurrency, retry, or stream/protocol flow

Header content should be 3-6 lines and cover:

- file responsibility
- non-obvious boundaries/dependencies
- major side effects or contracts

### 2) Function Docs For Public Side-Effecting Behavior

Touched exported/public functions, hooks, commands, and service entrypoints need concise docstrings/JSDoc when they:

- write to DB/storage/cache
- call network/external services
- enqueue jobs or emit events
- mutate shared state
- define non-obvious failure/return semantics

Function docs should be 1-3 lines and focus on contract and side effects.

### 3) Inline Rationale For Non-Obvious Logic

Inline comments are required for touched logic involving:

- transaction boundaries and rollback intent
- concurrency, cancellation, or ordering invariants
- retry/backoff decisions
- security assumptions and invariants
- external protocol contracts (stream ordering/payload assumptions)

### 4) Noise Is Prohibited

Do not:

- narrate obvious line-by-line behavior
- duplicate function names in prose
- leave stale TODO/FIXME comments without ownership context

### 5) Style

- Keep comments short and direct.
- Prefer "why/contract" over "what".
- Use terminology consistent with `docs/ARCHITECTURE.md` and `docs/PATTERNS.md`.

### 6) Drift Prevention

If behavior changes, update nearby comments/docstrings in the same PR.

## Enforcement Model

### PR Author Checks (Required)

- confirm changed complex files satisfy module context rule
- confirm touched public side-effecting behavior has concise docs
- confirm non-obvious logic has rationale comments where needed
- confirm no stale/misleading comments were introduced

### Reviewer Checks (Required Pass/Fail Dimension)

Reviewers explicitly evaluate "documentation adequacy" as pass/fail, not optional polish.

### CI Gate (Recommended)

Use a lightweight changed-files-only gate (warn or fail) with the following behavior:

- analyze only changed in-scope files
- ignore generated/vendor/build output
- fail or warn when required module/function docs are missing
- produce actionable output (`path:line | rule | required fix`)

Suggested script path: `scripts/check_comment_contract.py`.

## Repo Knobs (Set Per Repository)

Keep these values explicit in each repo:

- `COMMENT_CONTRACT_COMPLEX_LOC=300`
- `COMMENT_CONTRACT_SCOPE=changed-files-only`
- `COMMENT_CONTRACT_MODE=warn|error` (default `error` after rollout)
- `COMMENT_CONTRACT_EXCLUDE_PATHS` (generated/vendor/build artifacts)
- `COMMENT_CONTRACT_FILE_EXTENSIONS=.py,.ts,.tsx,.js,.jsx,.tf,.sh`

## Rollout

1. Add this contract + checklist/template references.
2. Enforce on all new/modified code immediately.
3. Backfill legacy hotspots in small issue-scoped tasks.
4. Switch CI mode from `warn` to `error` once false positives are stable.

## Definition Of Done Addendum

A task is not done unless changed code complies with this contract and reviewer feedback confirms documentation adequacy.
