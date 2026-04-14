# AGENTS.md — Stima

## Bootstrap (Mode-Routed Entrypoint)

Start here, then choose the path that matches the session's primary intent. Paths are not a lock: if the session changes (for example implementation -> planning), switch to that path's read list from that point.

Universal quality floor:
- Keep changes surgical and consistent with existing style.
- Do not change unrelated files.
- Do not modify applied migrations; add a new migration when needed.
- Preserve existing contracts unless task scope says otherwise.
- Use verification tiers from `docs/WORKFLOW.md` section **Verification Tiers**.
- Keep broad verify targets (`make backend-verify`, `make frontend-verify`, `make verify`) as PR/final gates unless scope requires earlier coverage.
- Load `backend/AGENTS.md` for backend scope (`area:backend`, `area:database`, or files under `backend/`).
- Load `frontend/AGENTS.md` for frontend scope (`area:frontend` or files under `frontend/`).

### A) Implement Existing Task
Read in order:
1. Task issue / Execution Brief / PR context
2. Relevant subtree `AGENTS.md`
3. `docs/template/KICKOFF.md` section 1
4. `docs/WORKFLOW.md` sections only as needed (for example: `Verification Tiers`, `Boundary And Dependency Rules`, `Stateful Cross-Layer Hardening Gate`)

### B) Review PR
Read in order:
1. PR / Task context
2. `docs/template/KICKOFF.md` section 3a and section 3b constraints
3. `.github/prompts/review-task.prompt.md` when full reviewer prompt body is needed without repo context (use either section 3b inline context or this prompt body; do not double-load)
4. Relevant subtree `AGENTS.md` only when touched scope requires it

### C) Plan / Create Issues / Choose Mode
Read:
1. `docs/ISSUES_WORKFLOW.md` (authoritative for control plane)
2. `docs/template/KICKOFF.md` section 2 for planning-only kickoff format
3. Additional planning docs only when needed by touched scope

### D) Docs / Architecture / Pattern Work
Read only touched docs:
- `docs/README.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/PATTERNS.md`, `docs/REVIEW_CHECKLIST.md`
- `docs/GREENFIELD_BLUEPRINT.md` only for greenfield/restructure tasks
- `skills/*` playbooks only when explicitly requested or clearly required by the task

### Escape Hatch (Any Path)

If control-plane rules, issue labels, execution mode, Spec/Task lifecycle, or branching requirements are unclear, read `docs/ISSUES_WORKFLOW.md` before changing process, creating/closing issues, or branching strategy.

## Nested AGENTS Discovery

Many tools auto-inject root `AGENTS.md` only. Route to subtree rules explicitly:
- If primary scope is backend or `area:backend`/`area:database`, read `backend/AGENTS.md` before implementation.
- If primary scope is frontend or `area:frontend`, read `frontend/AGENTS.md` before implementation.
- For cross-cutting/doc tasks, apply both subtree files only when their scopes are touched.

## Unit Of Work And Modes

- Default unit of work: GitHub Task issue.
- Default mode: `single` (`1 feature -> 1 Task -> 1 PR`).
- Use `gated` or `fast` only when explicitly requested.
- For issue-backed work, execute one ready Task issue at a time.
- PRs close Task issues (`Closes #123`), not Specs.
- Specs close when all child Tasks are done or explicitly deferred.

Canonical kickoff prompts:
- Planning kickoff: `Run kickoff for feature <feature-id> from <filename> mode=<single|gated|fast>, planning-only (no code changes, no PR).`
- Execution kickoff: `Run kickoff for existing Task #<task-id> mode=single.`
- Parallel local execution (only when explicitly requested): `Run kickoff for existing Task #<task-id> mode=single execution=parallel.`

## Execution Defaults

1. Restate goal/non-goals/acceptance criteria from the Task issue.
2. Create/switch to dedicated branch `task-<id>-<slug>` before edits.
3. Implement minimally and preserve existing contracts unless scope says otherwise.
4. Run verification by tier (`docs/WORKFLOW.md` Verification Tiers):
   - Tier 1 during implementation (smallest checks proving changed behavior)
   - Tier 2 after `ACTIONABLE` review patches (targeted reruns)
   - Tier 3 broad PR/final gate checks (`make backend-verify`, `make frontend-verify`, `make verify` as applicable)
5. Open PR with `Closes #<task-id>`.
6. Return the short reviewer kickoff from `docs/template/KICKOFF.md` section 3a.

## Parallel Local Execution (Optional)

Use only when the operator explicitly requests `execution=parallel`:
- one Task issue -> one branch -> one worktree -> one PR
- run `scripts/worktree-init.sh <task-id> [slug]` before code edits
- work only in returned `WORKTREE_READY` path
- confirm needed symlinks (`backend/.venv`, `frontend/node_modules`) before verification
- do not use `git worktree add --force`

## Reviewer And Completion Contract

- Default review follow-up is lean: verdict `APPROVED` or `ACTIONABLE`.
- If `ACTIONABLE`, patch listed findings only and rerun targeted verification unless scope expands.
- If `APPROVED`, finalize Task/Spec; do not generate a second tutoring handoff after approval is relayed.
- Lightweight tutoring handoff is generated once by the approving reviewer in the same `APPROVED` response.

## Agent Output Budget

Canonical norms live in `docs/WORKFLOW.md` under **Agent Output Budget**.

## Guardrails

- Keep changes surgical and consistent with existing style.
- Do not install dependencies without approval.
- Do not modify applied migrations; add a new migration when needed.
- Do not change unrelated files.
- Do not add AI/tool attribution trailers to commits or PR descriptions.
- Prefer normal shell commands; use manual `rtk` forms only when needed and supported.

## Verification Runtime Notes

- Do not run `make db-verify` from agent sessions.
- Do not run live/provider-backed checks from agent sessions (for example `make extraction-live`); ask the human operator to run and share output.
- Prefer canonical `make` targets for Tier 3 gates when the repo defines them.
