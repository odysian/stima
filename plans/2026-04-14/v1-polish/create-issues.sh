#!/usr/bin/env bash
# Create GitHub issues for V1 polish spec + Task 01 (one-time bootstrap).
# Re-running creates duplicate issues — use only if bootstrap failed.
# Requires: gh auth login -h github.com (valid token)
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$REPO_ROOT"

SPEC_BODY="$REPO_ROOT/plans/2026-04-14/spec-v1-polish.md"
TASK_BODY="$REPO_ROOT/plans/2026-04-14/v1-polish/task-01-customer-document-trust.md"

if ! gh auth status -h github.com >/dev/null 2>&1; then
  echo "error: gh is not authenticated. Run: gh auth login -h github.com" >&2
  exit 1
fi

SPEC_URL="$(gh issue create \
  --repo odysian/stima \
  --title "Spec: V1 polish — document trust, auth friction, brand shell" \
  --label "type:spec" \
  --label "area:quotes" \
  --label "area:frontend" \
  --label "area:auth" \
  --body-file "$SPEC_BODY")"

SPEC_NUM="${SPEC_URL##*/}"
echo "Created spec issue: $SPEC_URL"

TASK_TMP="$(mktemp)"
sed "s/#SPEC_NUMBER/#${SPEC_NUM}/g" "$TASK_BODY" >"$TASK_TMP"

TASK_URL="$(gh issue create \
  --repo odysian/stima \
  --title "Task: V1 polish — customer-facing document trust (Phase 1)" \
  --label "type:task" \
  --label "area:quotes" \
  --label "area:frontend" \
  --label "area:backend" \
  --body-file "$TASK_TMP")"

rm -f "$TASK_TMP"
TASK_NUM="${TASK_URL##*/}"
echo "Created task issue: $TASK_URL"

gh issue comment "$SPEC_NUM" --repo odysian/stima --body "Child task: #${TASK_NUM}"

echo "Done. Spec #${SPEC_NUM} / Task #${TASK_NUM}"
echo "Optional: edit Task title/body on GitHub if you want tighter wording."
