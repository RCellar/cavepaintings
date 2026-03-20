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

# Install dependencies if needed
if [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
  npm install --omit=dev --prefix "$PROJECT_ROOT" > /dev/null 2>&1
fi

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

# Log file for diagnosing crashes
STATE_DIR="$(dirname "$STATE_FILE")"
mkdir -p "$STATE_DIR"
SERVER_LOG="$STATE_DIR/server.log"

# Start server
if [[ "$FOREGROUND" == "true" ]]; then
  node "$PROJECT_ROOT/server.js" --no-open
else
  nohup node "$PROJECT_ROOT/server.js" --no-open > "$SERVER_LOG" 2>&1 &
  SERVER_PID=$!
  disown "$SERVER_PID" 2>/dev/null

  # Wait for state file and verify server stays alive
  for i in $(seq 1 20); do
    if [[ -f "$STATE_FILE" ]]; then
      # Verify server is still running (not a crash-after-start)
      if kill -0 "$SERVER_PID" 2>/dev/null; then
        cat "$STATE_FILE"
        exit 0
      else
        echo "{\"error\": \"Server started but crashed immediately. Check $SERVER_LOG\"}"
        exit 1
      fi
    fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      echo "{\"error\": \"Server process exited before starting. Check $SERVER_LOG\"}"
      exit 1
    fi
    sleep 0.25
  done

  echo "{\"error\": \"Server did not start within 5 seconds. Check $SERVER_LOG\"}"
  exit 1
fi
