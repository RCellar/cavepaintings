#!/usr/bin/env bash
# Start the Cavepaintings server and output connection info as JSON
# Usage: start-server.sh [--foreground]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

FOREGROUND="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --foreground|--no-daemon) FOREGROUND="true"; shift ;;
    *) shift ;;
  esac
done

# Auto-detect environments that need foreground mode
if [[ -n "${CODEX_CI:-}" && "$FOREGROUND" != "true" ]]; then
  FOREGROUND="true"
fi
case "${OSTYPE:-}" in
  msys*|cygwin*|mingw*) FOREGROUND="true" ;;
esac
if [[ -n "${MSYSTEM:-}" ]]; then FOREGROUND="true"; fi

# Kill existing session if running
STATE_FILE="$(node -e "const os=require('os'),p=require('path');console.log(p.join(os.tmpdir(),'cavepaintings','state.json'))")"
if [[ -f "$STATE_FILE" ]]; then
  OLD_PID="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$STATE_FILE','utf8')).pid)")"
  if kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID" 2>/dev/null
    sleep 0.5
  fi
  rm -f "$STATE_FILE"
fi

# Start server
if [[ "$FOREGROUND" == "true" ]]; then
  node "$PROJECT_ROOT/server.js" --no-open
else
  nohup node "$PROJECT_ROOT/server.js" --no-open > /dev/null 2>&1 &
  disown

  # Wait for state file (server writes it on successful listen)
  for i in $(seq 1 20); do
    if [[ -f "$STATE_FILE" ]]; then
      cat "$STATE_FILE"
      exit 0
    fi
    sleep 0.25
  done

  echo '{"error": "Server did not start within 5 seconds"}'
  exit 1
fi
