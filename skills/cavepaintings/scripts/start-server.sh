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
# Fallback: detect Windows via OS env var (always set on Windows, never on Linux/macOS)
if [[ "${OS:-}" == "Windows_NT" ]]; then FOREGROUND="true"; fi

# Install dependencies if needed
if [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
  if ! command -v npm &>/dev/null; then
    echo '{"error": "npm is not installed. Install Node.js (v18+) from https://nodejs.org"}'
    exit 1
  fi
  if ! npm install --omit=dev --prefix "$PROJECT_ROOT" 2>&1; then
    echo '{"error": "npm install failed. Check network connectivity and try again."}'
    exit 1
  fi
fi

if ! command -v node &>/dev/null; then
  echo '{"error": "node is not installed. Install Node.js (v18+) from https://nodejs.org"}'
  exit 1
fi

# Check for existing running session — reuse if alive
STATE_FILE="$(node -e "const os=require('os'),p=require('path');console.log(p.join(os.tmpdir(),'cavepaintings','state.json'))")"
if [[ -f "$STATE_FILE" ]]; then
  OLD_PID="$(STATE_FILE_PATH="$STATE_FILE" node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.STATE_FILE_PATH,'utf8')).pid)")"
  # Cross-platform PID liveness check
  _alive=false
  if [[ "${OS:-}" == "Windows_NT" ]] && ! grep -qi microsoft /proc/version 2>/dev/null; then
    tasklist //FI "PID eq $OLD_PID" 2>/dev/null | grep -qw "$OLD_PID" && _alive=true
  else
    kill -0 "$OLD_PID" 2>/dev/null && _alive=true
  fi
  if [[ "$_alive" == "true" ]]; then
    # Server is already running — return existing session info
    STATE_FILE_PATH="$STATE_FILE" node -e "
      const state = JSON.parse(require('fs').readFileSync(process.env.STATE_FILE_PATH,'utf8'));
      state.status = 'existing';
      console.log(JSON.stringify(state));
    "
    exit 0
  fi
  # Stale state file — clean up and start fresh
  rm -f "$STATE_FILE"
fi

# Log file for diagnosing crashes
STATE_DIR="$(dirname "$STATE_FILE")"
mkdir -p "$STATE_DIR"
SERVER_LOG="$STATE_DIR/server.log"

# Determine the owner PID for the lifecycle watchdog.
# In daemon mode the direct parent ($PPID) is often a transient shell spawned
# by a tool runner (e.g. Claude Code's Bash tool) that exits as soon as the
# command completes.  Walk up one level to the grandparent — typically the
# long-lived host process whose lifetime should govern the server.
if [[ "$FOREGROUND" == "true" ]]; then
  OWNER_PID="$PPID"
else
  OWNER_PID="$(ps -o ppid= -p $PPID 2>/dev/null | tr -d ' ')"
  # Fall back to $PPID if the grandparent lookup fails or returns init/systemd
  if [[ -z "$OWNER_PID" || "$OWNER_PID" -le 1 ]] 2>/dev/null; then
    OWNER_PID="$PPID"
  fi
fi

# Start server
if [[ "$FOREGROUND" == "true" ]]; then
  # Foreground mode: background the node process minimally (no nohup/disown)
  # so it remains a child of this script. This keeps Codex from reaping it
  # and avoids nohup issues on Windows (MSYS/Cygwin).
  CAVEPAINTINGS_PROJECT_DIR="${CAVEPAINTINGS_PROJECT_DIR:-}" node "$PROJECT_ROOT/server.js" --no-open --owner-pid "$OWNER_PID" > "$SERVER_LOG" 2>&1 &
  SERVER_PID=$!

  # Poll for state file (same as background path)
  for i in $(seq 1 20); do
    if [[ -f "$STATE_FILE" ]]; then
      if kill -0 "$SERVER_PID" 2>/dev/null; then
        cat "$STATE_FILE"
        # Keep script alive so node stays a child process (not orphaned).
        # The caller has already consumed stdout JSON above.
        wait "$SERVER_PID" 2>/dev/null
        exit $?
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
else
  CAVEPAINTINGS_PROJECT_DIR="${CAVEPAINTINGS_PROJECT_DIR:-}" nohup node "$PROJECT_ROOT/server.js" --no-open --owner-pid "$OWNER_PID" > "$SERVER_LOG" 2>&1 &
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
