#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WARNINGS=0
FAILURES=0
SCOPE="${SCOPE:-all}"

usage() {
  echo "Usage: check_file_sizes.sh [--scope frontend|backend|all]"
}

while (($# > 0)); do
  case "$1" in
    --scope)
      if (($# < 2)); then
        usage
        exit 2
      fi
      SCOPE="$2"
      shift 2
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

if [[ "${SCOPE}" != "frontend" && "${SCOPE}" != "backend" && "${SCOPE}" != "all" ]]; then
  usage
  exit 2
fi

check_frontend_file() {
  local file="$1"
  local label="$2"
  local warn_limit="$3"
  local fail_limit="$4"
  local line_count
  line_count="$(wc -l < "${file}")"
  line_count="${line_count//[[:space:]]/}"

  if (( line_count > fail_limit )); then
    echo "FAIL: ${label} exceeds split threshold (${line_count} > ${fail_limit}) in ${file#${ROOT_DIR}/}"
    FAILURES=$((FAILURES + 1))
    return
  fi

  if (( line_count > warn_limit )); then
    echo "WARN: ${label} exceeds target budget (${line_count} > ${warn_limit}) in ${file#${ROOT_DIR}/}"
    WARNINGS=$((WARNINGS + 1))
  fi
}

check_backend_file() {
  local file="$1"
  local line_count
  line_count="$(wc -l < "${file}")"
  line_count="${line_count//[[:space:]]/}"

  if (( line_count > 220 )); then
    echo "WARN: backend route/service/repository exceeds target budget (${line_count} > 220) in ${file#${ROOT_DIR}/}"
    WARNINGS=$((WARNINGS + 1))
  fi
}

run_frontend_checks() {
  while IFS= read -r file; do
    check_frontend_file "${file}" "frontend component" 250 450
  done < <(find "${ROOT_DIR}/frontend/src" -type f -path "*/components/*" \( -name "*.ts" -o -name "*.tsx" \) ! -name "*.test.ts" ! -name "*.test.tsx" | sort)

  while IFS= read -r file; do
    check_frontend_file "${file}" "frontend hook/service" 180 300
  done < <(find "${ROOT_DIR}/frontend/src" -type f \( -path "*/hooks/*" -o -path "*/services/*" \) \( -name "*.ts" -o -name "*.tsx" \) ! -name "*.test.ts" ! -name "*.test.tsx" | sort)
}

run_backend_checks() {
  while IFS= read -r file; do
    check_backend_file "${file}"
  done < <(find "${ROOT_DIR}/backend/app/features" -type f \( -name "api.py" -o -name "service.py" -o -name "repository.py" \) | sort)
}

if [[ "${SCOPE}" == "frontend" || "${SCOPE}" == "all" ]]; then
  run_frontend_checks
fi

if [[ "${SCOPE}" == "backend" || "${SCOPE}" == "all" ]]; then
  run_backend_checks
fi

if (( FAILURES > 0 )); then
  echo "File-size check (${SCOPE}) failed with ${FAILURES} blocking issue(s) and ${WARNINGS} warning(s)."
  exit 1
fi

echo "File-size check (${SCOPE}) complete with ${WARNINGS} warning(s) and no blocking issues."
