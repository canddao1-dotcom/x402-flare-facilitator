#!/bin/bash
# Clawdbot Maintenance Script
# Run periodically via cron or manually

set -e

CLAWDBOT_DIR="/home/node/.clawdbot"
BACKUP_DIR="/home/node/clawd/backups"
DATE=$(date +%Y%m%d)

echo "=== Clawdbot Maintenance $(date) ==="

# 1. Backup cron jobs (keep last 7)
mkdir -p "$BACKUP_DIR/cron"
if [ -f "$CLAWDBOT_DIR/cron/jobs.json" ]; then
    cp "$CLAWDBOT_DIR/cron/jobs.json" "$BACKUP_DIR/cron/jobs.json.$DATE"
    echo "✅ Cron backup: jobs.json.$DATE"
    # Keep only last 7 backups
    ls -t "$BACKUP_DIR/cron/jobs.json."* 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null || true
fi

# 2. Clean stale session locks (>30 min, exclude gateway locks)
STALE=$(find "$CLAWDBOT_DIR/agents" -name "*.lock" -mmin +30 -type f 2>/dev/null)
if [ -n "$STALE" ]; then
    echo "🧹 Cleaning stale session locks:"
    echo "$STALE"
    echo "$STALE" | xargs rm -f
else
    echo "✅ No stale session locks"
fi

# 3. Report disk usage
echo ""
echo "📊 Disk usage:"
du -sh "$CLAWDBOT_DIR" 2>/dev/null || echo "  Could not check"
du -sh "/home/node/clawd" 2>/dev/null || echo "  Could not check"

echo ""
echo "=== Done ==="
