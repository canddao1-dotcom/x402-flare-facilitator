#!/bin/bash
# Ensure FTSO daemon is running - call from HEARTBEAT.md
SKILL_DIR="$(dirname "$(dirname "$0")")"
PID_FILE="$SKILL_DIR/daemon.pid"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  exit 0  # Already running
fi

# Start daemon
"$SKILL_DIR/scripts/ctl.sh" start
