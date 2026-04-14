# KICKOFF_PROMPT.md — Operator Quick Reference

Single purpose: quick copy-paste shortcuts that point to canonical prompts.

Canonical source of truth:
- `docs/template/KICKOFF.md`

## Execution

Run kickoff for existing Task #<task-id> mode=single.

Reference <execution-brief-filepath>  # when present
Reference <analog-filepath>  # when relevant

## Review request

Use `docs/template/KICKOFF.md` section 3a.

## Full reviewer brief

Use `.github/prompts/review-task.prompt.md`.

## Post-review patch

Use `docs/template/KICKOFF.md` Delta-Only Patch Handoff.

## Planning-only kickoff

Run kickoff for feature <feature-id> from <plan-filepath> mode=<single|gated|fast>, planning-only (no code changes, no PR).
