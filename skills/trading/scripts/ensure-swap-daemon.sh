#!/bin/bash
# Ensure swap collector daemon is running (hourly collection)

DAEMON_NAME="trading-swap-collector"
SCRIPT_DIR="$(dirname "$0")"
LOG_FILE="/tmp/${DAEMON_NAME}.log"
PID_FILE="/tmp/${DAEMON_NAME}.pid"

# Check if already running
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "Daemon already running (PID $PID)"
        exit 0
    fi
fi

# Start swap collector daemon (hourly)
echo "Starting $DAEMON_NAME..."

COLLECTOR="$SCRIPT_DIR/collectors/swap-collector.py"

nohup python3 "$COLLECTOR" daemon --interval 3600 >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

echo "Daemon started (PID $(cat $PID_FILE))"
echo "Collecting swaps every hour"
echo "Log: $LOG_FILE"
