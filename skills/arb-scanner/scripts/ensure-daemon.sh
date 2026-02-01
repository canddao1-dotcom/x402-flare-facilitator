#!/bin/bash
# Ensure arb scanner daemon is running

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/../data/daemon.pid"
LOG_FILE="$SCRIPT_DIR/../data/daemon.log"

mkdir -p "$SCRIPT_DIR/../data"

# Check if already running
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "Daemon already running (PID $PID)"
        exit 0
    fi
fi

# Start daemon
echo "Starting arb scanner daemon..."
cd "$SCRIPT_DIR/.."
nohup node scripts/scanner.js daemon >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
echo "Started (PID $!)"
