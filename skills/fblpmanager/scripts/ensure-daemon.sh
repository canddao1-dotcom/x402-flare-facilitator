#!/bin/bash
# Ensure LP Monitor Daemon is running
# Called on startup and periodically to self-heal

SCRIPT_DIR="$(dirname "$0")"
DAEMON_SCRIPT="$SCRIPT_DIR/lp-monitor-daemon.js"
PID_FILE="/tmp/lp-monitor-daemon.pid"
LOG_FILE="/tmp/lp-monitor-daemon.log"

# Check if already running
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "Daemon already running (PID $PID)"
        exit 0
    else
        echo "Stale PID file, cleaning up"
        rm -f "$PID_FILE"
    fi
fi

# Start daemon
echo "Starting LP Monitor Daemon..."
nohup node "$DAEMON_SCRIPT" >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
echo "Daemon started (PID $(cat $PID_FILE))"
