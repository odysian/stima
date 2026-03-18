#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TOKEN_RE='\{\{[A-Z0-9_]+\}\}'

is_allowed_path() {
  local path="$1"
  case "$path" in
    AGENTS.md|WORKFLOW.md|ISSUES_WORKFLOW.md|GREENFIELD_BLUEPRINT.md) return 0 ;;
    docs/ARCHITECTURE.md|docs/PATTERNS.md|docs/REVIEW_CHECKLIST.md) return 0 ;;
    docs/template/*.md) return 0 ;;
    .github/PULL_REQUEST_TEMPLATE.md|.github/ISSUE_TEMPLATE/*.md) return 0 ;;
    *) return 1 ;;
  esac
}

disallowed=()
allowed_count=0

while IFS= read -r match; do
  [[ -z "$match" ]] && continue
  path="${match%%:*}"

  if is_allowed_path "$path"; then
    ((allowed_count += 1))
  else
    disallowed+=("$match")
  fi
done < <(rg -n --no-heading "$TOKEN_RE" \
  --glob "*.md" \
  --glob ".github/**" \
  --glob "skills/**/*.md" \
  --glob "docs/**/*.md" \
  --glob "AGENTS.md" \
  --glob "WORKFLOW.md" \
  --glob "ISSUES_WORKFLOW.md" \
  --glob "GREENFIELD_BLUEPRINT.md")

echo "Template-token check complete."
echo "Allowed unresolved token matches: $allowed_count"
echo "Disallowed unresolved token matches: ${#disallowed[@]}"

if ((${#disallowed[@]} > 0)); then
  echo
  echo "Disallowed unresolved tokens detected:"
  printf '%s\n' "${disallowed[@]}"
  exit 1
fi

