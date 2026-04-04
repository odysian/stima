#!/usr/bin/env bash
# Open this repo in Cursor and start the same dev terminals as start-vscode-dev-terminals.sh
# (via .vscode/tasks.json default build task "dev:stack").
#
# Cursor's CLI does not expose --command like some VS Code builds, so we rely on xdotool
# (Linux/X11) when available, or you can press Ctrl+Shift+B after the window opens.
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
VSCODE_DIR="$ROOT_DIR/.vscode"
TASKS_FILE="$VSCODE_DIR/tasks.json"

warn_manual() {
  echo "Workspace opened in Cursor."
  echo "Run build task manually: Ctrl+Shift+B (default task: dev:stack)."
}

# Keep in sync with start-vscode-dev-terminals.sh (shared task definitions).
ensure_dev_stack_task() {
  mkdir -p "$VSCODE_DIR"
  cat >"$TASKS_FILE" <<'EOF'
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "dev:db",
      "type": "shell",
      "command": "docker compose up -d postgres redis",
      "options": {
        "cwd": "${workspaceFolder}"
      },
      "presentation": {
        "reveal": "always",
        "panel": "new"
      },
      "problemMatcher": []
    },
    {
      "label": "dev:backend",
      "type": "shell",
      "command": "bash -lc 'test -x .venv/bin/python || { echo \"Missing backend/.venv. Run: cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt\"; exit 1; }; for i in {1..60}; do (echo >/dev/tcp/127.0.0.1/5432) >/dev/null 2>&1 && break; sleep 1; done; for i in {1..60}; do (echo >/dev/tcp/127.0.0.1/6379) >/dev/null 2>&1 && break; sleep 1; done; exec .venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000'",
      "options": {
        "cwd": "${workspaceFolder}/backend"
      },
      "presentation": {
        "reveal": "always",
        "panel": "new"
      },
      "problemMatcher": []
    },
    {
      "label": "dev:frontend",
      "type": "shell",
      "command": "bash -lc 'test -d node_modules || { echo \"Missing frontend dependencies. Run: cd frontend && npm install\"; exit 1; }; PIDS=\"$(pgrep -f \"$PWD/node_modules/.bin/vite\" || true)\"; if [[ -n \"$PIDS\" ]]; then echo \"Stopping existing Vite dev process(es): $PIDS\"; kill $PIDS || true; sleep 1; fi; exec npm run dev'",
      "options": {
        "cwd": "${workspaceFolder}/frontend"
      },
      "presentation": {
        "reveal": "always",
        "panel": "new"
      },
      "problemMatcher": []
    },
    {
      "label": "dev:db-shell",
      "type": "shell",
      "command": "bash -lc 'docker compose up -d postgres redis >/dev/null; for i in {1..60}; do docker compose exec -T postgres pg_isready -U stima >/dev/null 2>&1 && break; sleep 1; done; docker compose exec -T postgres pg_isready -U stima >/dev/null 2>&1 || { echo \"Database did not become ready in time.\"; exit 1; }; exec docker compose exec postgres psql -U stima -d stima'",
      "options": {
        "cwd": "${workspaceFolder}"
      },
      "presentation": {
        "reveal": "always",
        "panel": "new"
      },
      "problemMatcher": []
    },
    {
      "label": "dev:stack",
      "dependsOn": [
        "dev:db",
        "dev:backend",
        "dev:frontend",
        "dev:db-shell"
      ],
      "dependsOrder": "parallel",
      "group": {
        "kind": "build",
        "isDefault": true
      },
      "problemMatcher": []
    }
  ]
}
EOF
}

trigger_build_with_xdotool() {
  if ! command -v xdotool >/dev/null 2>&1; then
    return 1
  fi
  if [[ -z "${DISPLAY:-}" ]]; then
    return 1
  fi

  sleep 2

  local win_id=""
  # Cursor on Linux/X11: WM_CLASS instance is usually "cursor" (see: xprop on the window).
  win_id="$(xdotool search --onlyvisible --class "cursor" 2>/dev/null | tail -n 1 || true)"
  if [[ -z "$win_id" ]]; then
    win_id="$(xdotool search --name "Cursor" 2>/dev/null | tail -n 1 || true)"
  fi
  if [[ -z "$win_id" ]]; then
    return 1
  fi

  xdotool windowactivate --sync "$win_id"
  xdotool key --clearmodifiers ctrl+shift+b
  sleep 0.3
  xdotool key --clearmodifiers Return
  return 0
}

if ! command -v cursor >/dev/null 2>&1; then
  echo "Cursor CLI ('cursor') is not available in PATH."
  echo "Install shell command from Cursor: Command Palette → \"Shell Command: Install 'cursor' command in PATH\"."
  exit 1
fi

ensure_dev_stack_task

if ! cursor --reuse-window "$ROOT_DIR"; then
  echo "Failed to open workspace in Cursor."
  exit 1
fi

if trigger_build_with_xdotool; then
  echo "Triggered build task via xdotool (dev:stack)."
  exit 0
fi

warn_manual
exit 0
