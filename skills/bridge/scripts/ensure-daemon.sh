#!/bin/bash
# Ensure bridge monitor daemon is running

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DAEMON_SCRIPT="$SCRIPT_DIR/bridge-monitor.js"
PID_FILE="/tmp/bridge-monitor.pid"
LOG_FILE="/tmp/bridge-monitor.log"

# Check if already running
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "Daemon already running (PID $PID)"
    exit 0
  else
    rm -f "$PID_FILE"
  fi
fi

# Start daemon
echo "Starting bridge-monitor daemon..."
cd "$SCRIPT_DIR/.."
nohup node "$DAEMON_SCRIPT" daemon > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

echo "Daemon started (PID $(cat $PID_FILE))"
echo "Log: $LOG_FILE"
