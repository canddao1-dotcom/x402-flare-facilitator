#!/bin/bash
# Ensure trading data collector daemon is running
# Uses ai-miguel UniV3 utilities for proper TVL/price data

DAEMON_NAME="trading-data-collector"
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

# Start miguel collector (uses ai-miguel UniV3 utilities)
echo "Starting $DAEMON_NAME (ai-miguel UniV3)..."

COLLECTOR="$SCRIPT_DIR/collectors/miguel-collector.py"
if [ ! -f "$COLLECTOR" ]; then
    # Fallback to multi-collector
    COLLECTOR="$SCRIPT_DIR/collectors/multi-collector.py"
fi

nohup python3 "$COLLECTOR" daemon --interval 300 >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

echo "Daemon started (PID $(cat $PID_FILE))"
echo "Using: $(basename $COLLECTOR)"
echo "Collecting all enabled pools every 5 minutes"
echo "Log: $LOG_FILE"
