#!/usr/bin/env bash
# Usage: scripts/worktree-init.sh <task-id> [slug]
#
# Creates a linked git worktree for a Task issue.
# If a slug is not supplied, it is derived from the GitHub issue title via `gh`.
#
# Output on success (parseable by agents):
#   WORKTREE_READY=<path>
#   BRANCH=<branch>
#   BASE=main
#
# Exits non-zero on any collision, missing input, or unresolvable slug.
set -euo pipefail

TASK_ID="${1:-}"
SLUG_OVERRIDE="${2:-}"

if [[ -z "${TASK_ID}" ]]; then
  echo "usage: scripts/worktree-init.sh <task-id> [slug]" >&2
  exit 1
fi

COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
REPO_ROOT="$(dirname "${COMMON_DIR}")"
REPO_NAME="$(basename "${REPO_ROOT}")"
PARENT_DIR="$(dirname "${REPO_ROOT}")"
WORKTREE_BASE="${PARENT_DIR}/${REPO_NAME}-wt"

derive_slug() {
  local raw="${1:-}"
  printf '%s' "${raw}" \
    | sed -E 's/^Task[[:space:]]+[0-9]+:[[:space:]]*//' \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g'
}

SLUG=""
if [[ -n "${SLUG_OVERRIDE}" ]]; then
  SLUG="$(derive_slug "${SLUG_OVERRIDE}")"
else
  if command -v gh >/dev/null 2>&1; then
    ISSUE_TITLE="$(gh issue view "${TASK_ID}" --json title --jq '.title' 2>/dev/null || true)"
    if [[ -n "${ISSUE_TITLE}" ]]; then
      SLUG="$(derive_slug "${ISSUE_TITLE}")"
    fi
  fi
fi

if [[ -z "${SLUG}" ]]; then
  echo "ERROR: could not derive slug for Task #${TASK_ID}." >&2
  echo "  Either gh is not available or the issue title could not be fetched." >&2
  echo "  Re-run with an explicit slug:" >&2
  echo "    scripts/worktree-init.sh ${TASK_ID} <short-slug>" >&2
  exit 1
fi

BRANCH="task-${TASK_ID}-${SLUG}"
WORKTREE_DIR="${WORKTREE_BASE}/${BRANCH}"

cd "${REPO_ROOT}"

git fetch origin
git switch main
git pull --ff-only

if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  echo "ERROR: local branch already exists: ${BRANCH}" >&2
  exit 1
fi

if git ls-remote --exit-code --heads origin "${BRANCH}" >/dev/null 2>&1; then
  echo "ERROR: remote branch already exists: ${BRANCH}" >&2
  exit 1
fi

if [[ -e "${WORKTREE_DIR}" ]]; then
  echo "ERROR: worktree path already exists: ${WORKTREE_DIR}" >&2
  exit 1
fi

mkdir -p "${WORKTREE_BASE}"
git worktree add -b "${BRANCH}" "${WORKTREE_DIR}" origin/main

echo "WORKTREE_READY=${WORKTREE_DIR}"
echo "BRANCH=${BRANCH}"
echo "BASE=main"
