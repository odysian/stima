# Backend Modularity

This document defines Stima's backend modularity pattern for decomposing oversized feature services without changing public behavior.

Use it when:
- decomposing an oversized backend feature module
- creating a new backend behavior slice
- reviewing a refactor proposal for structural consistency
- deciding whether a helper, protocol, or submodule belongs inside a slice package

Do not use this document as a substitute for a task-level spec. It defines the durable pattern; task specs define scope, acceptance criteria, and verification for a specific refactor.

## Core Pattern

Backend modularity in Stima follows a thin public facade plus internal behavior-slice packages model:

- each feature keeps a stable public service/facade
- oversized service logic is decomposed into internal packages organized by behavior slice, not by generic abstraction category
- the public facade delegates into one internal slice coordinator per slice
- the refactor preserves public contracts while improving internal ownership and reviewability

## Architecture Rules

### 1. Keep The Public Facade Stable

For a modularity refactor, the feature's existing public service should remain the stable entrypoint unless a later spec explicitly authorizes a public architecture change.

Example:
- routes keep calling the existing service
- dependency providers keep constructing the existing service
- sibling services/workers do not import new internal slice modules directly in the first modularity pass

The facade should become thinner by delegating behavior to internal slice collaborators, not by pushing callers into a new dependency graph.

### 2. Organize Internals By Behavior Slice

Internal backend structure should be grouped by owned behavior, not by generic technical buckets.

Prefer:

```text
feature/
  service.py
  slice_a/
    __init__.py
    service.py
  slice_b/
    __init__.py
    service.py
```

Avoid starting with structures like:

```text
feature/
  policies/
  helpers/
  utils/
  use_cases/
```

Those categories are too generic for the first modularity pass and tend to blur ownership.

### 3. One Slice Package, One Slice Coordinator

Each behavior-slice package should expose one slice-level coordinator/service to the public facade.

The public facade should delegate to one internal slice collaborator, not coordinate multiple sub-services directly. Inside the slice package, helper modules are allowed where justified, but the package should have one clear entrypoint.

Example:

```text
quotes/
  service.py
  share/
    __init__.py
    service.py
    tokens.py
    public_access.py
```

In that example:
- `QuoteService` remains the public facade
- `QuoteShareService` is the single internal slice coordinator
- `tokens.py` and `public_access.py` stay behind it

### 4. Keep Package Roots Minimal

A slice package `__init__.py` should export only the coordinator/service that the parent facade needs.

Do not re-export:
- internal protocols
- helper functions
- token utilities
- constants
- future submodules

This prevents the package root from becoming a second public API surface.

### 5. Use Normalized Internal Inputs

The public facade preserves existing caller-facing signatures.

Internal slice coordinators should use narrower, normalized inputs aligned to the behavior they own, such as:
- `user_id`
- `document_id`
- `share_token`

Avoid pushing outer-layer models such as authenticated `User` objects deeper into slice internals when a normalized primitive is sufficient. The public facade should resolve outer-layer objects into the primitives the slice actually needs.

### 6. Use Narrow Slice-Specific Repository Protocols

A slice should depend on a slice-specific repository protocol, not on the full conceptual surface of the feature repository.

In the first modularity pass:
- the existing repository class can continue as the concrete implementation
- the slice defines a narrow protocol describing only the repository capabilities it needs
- creating a brand-new concrete repository class is out of scope unless a later spec explicitly requires it

To keep early phases lean, slice-specific protocols may live inside the slice `service.py` unless they become noisy enough to justify a separate file.

### 7. Preserve Existing Error Semantics

The first modularity pass should preserve the feature's existing outward error contract.

If the feature currently raises a domain-specific service error type, extracted slice coordinators should continue using that same error type for externally visible failures.

Do not introduce new outward-facing slice-specific exception hierarchies during the first pass unless a later spec explicitly requires it.

### 8. Let The Slice Own Its Transaction Timing

When a slice encapsulates behavior that currently performs writes, commits, refreshes, or rollback-sensitive state changes, the slice should own that transaction choreography.

The public facade should delegate. It should not re-implement slice-level commit/refresh sequencing after the logic has been extracted.

This keeps the facade thin and preserves parity more reliably.

### 9. Move Only Clearly Slice-Owned Helpers

Helpers and constants should move according to ownership, not proximity.

Move a helper into a slice package only when it is clearly owned by that slice.

Do not create generic dumping-ground modules such as:
- `common.py`
- `helpers.py`
- `utils.py`

Neutral or cross-slice feature helpers may stay in their current location until a later phase gives them a clearly named home.

### 10. Create Only The Files A Phase Needs

When a new slice package is introduced, create the real architectural home immediately, but only create the files justified by the active phase.

Do not scaffold speculative future files just to mirror the full roadmap in advance.

Example:
- if Phase 1 only needs `service.py` and `tokens.py`, create only those files
- if a later phase genuinely needs `public_access.py`, add it then

This keeps the package honest instead of ceremonial.

## Execution Rules

### Phase Dense Behavior

When a behavior slice is broad, keep one parent architectural slice but split execution into gated child tasks.

Good split:
- one child task for owner-facing lifecycle behavior
- one child task for public-access lifecycle behavior

Bad split:
- tiny helper-by-helper microtasks with no meaningful owned behavior

The point is to keep review units small without losing architectural coherence.

### Treat First Phases As No-Contract Refactors

Unless a task spec explicitly says otherwise, backend modularity work should be treated as a no-contract refactor.

That means no changes to:
- route contracts
- response shapes
- status codes
- event names
- logging semantics
- dependency-provider shape
- sibling-feature architecture

The goal is structural cleanup with preserved outward behavior.

### Verify Behavior First

Verification for a modularity task should prove parity for the behavior being moved.

Preferred verification model:
1. targeted API/integration behavior checks for the moved slice
2. feature-level or repo-level verification (`make backend-verify` or equivalent)

New internal unit tests are allowed if they help explain the refactor, but they do not replace API-level parity proof.

At the parent-pattern level, define verification by behavior group. Exact pytest selectors or commands should be supplied in the child task at execution time so the pattern document stays valid even if tests are reorganized later.

### Use A Fixed Child Task Shape

Every executable modularity child task should follow the same structure:
1. Goal
2. In scope
3. Out of scope
4. Behavior Matrix
5. Do NOT change
6. Implementation constraints
7. Verification
8. Done when

This keeps agent execution consistent and makes review more objective.

### Reevaluate Later Phases

If a parent modularity effort has multiple phases, later phases should not automatically become executable just because the earlier phase merged.

Instead, perform a short checkpoint after the earlier phase lands and ask:
- did the facade actually get thinner?
- did the slice feel like a real owned boundary?
- did reviewability improve?
- did the phase stay inside scope?
- should the next phase boundary or file plan be adjusted?

This keeps the modularity effort adaptive without losing structure.

## Completed Phase Checklist

Use this when judging whether a modularity phase was successful:

- Does the public facade remain the stable entrypoint?
- Is the facade materially thinner, not just differently crowded?
- Does the new slice package own a clear behavior boundary?
- Does the slice expose one clear coordinator/service?
- Did helper movement follow ownership rather than proximity?
- Did the phase avoid generic dumping-ground modules?
- Did the phase stay within its stated scope?
- Is behavior parity clearly demonstrated?
- Does the resulting structure make the next planned phase cleaner?

## Proven Example

The quote share thin-facade refactor established this pattern:

```text
backend/app/features/quotes/
  service.py
  share/
    __init__.py
    service.py
    tokens.py
    public_access.py
```

The key decisions were:
- `QuoteService` remained the public facade
- internal organization used a nested behavior-slice package
- owner-facing share lifecycle and public-access lifecycle were split into gated child tasks
- repository dependency went through a slice-specific protocol implemented by the existing repository
- public contracts stayed unchanged

Future backend modularity work should use the same pattern unless a later architecture decision explicitly replaces it.
