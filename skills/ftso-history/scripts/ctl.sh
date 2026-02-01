#!/bin/bash
# FTSO Daemon Control Script

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$SKILL_DIR/daemon.pid"
LOG_FILE="$SKILL_DIR/daemon.log"
DAEMON="$SCRIPT_DIR/daemon.js"

case "$1" in
  start)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "Daemon already running (PID: $(cat "$PID_FILE"))"
      exit 1
    fi
    echo "Starting FTSO daemon..."
    nohup node "$DAEMON" >> "$LOG_FILE" 2>&1 &
    sleep 1
    if [ -f "$PID_FILE" ]; then
      echo "Started (PID: $(cat "$PID_FILE"))"
    else
      echo "Failed to start"
      exit 1
    fi
    ;;
  
  stop)
    if [ ! -f "$PID_FILE" ]; then
      echo "Daemon not running"
      exit 1
    fi
    PID=$(cat "$PID_FILE")
    echo "Stopping FTSO daemon (PID: $PID)..."
    kill "$PID" 2>/dev/null
    rm -f "$PID_FILE"
    echo "Stopped"
    ;;
  
  status)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      PID=$(cat "$PID_FILE")
      echo "Running (PID: $PID)"
      # Count today's records
      TODAY=$(date +%Y-%m-%d)
      if [ -f "$SKILL_DIR/data/$TODAY.jsonl" ]; then
        RECORDS=$(wc -l < "$SKILL_DIR/data/$TODAY.jsonl")
        echo "Today's records: $RECORDS"
      fi
    else
      echo "Not running"
      [ -f "$PID_FILE" ] && rm -f "$PID_FILE"
    fi
    ;;
  
  restart)
    $0 stop 2>/dev/null
    sleep 1
    $0 start
    ;;
  
  logs)
    if [ -f "$LOG_FILE" ]; then
      tail -50 "$LOG_FILE"
    else
      echo "No logs yet"
    fi
    ;;
  
  *)
    echo "Usage: $0 {start|stop|status|restart|logs}"
    exit 1
    ;;
esac
