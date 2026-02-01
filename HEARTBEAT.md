# HEARTBEAT.md

## Startup Tasks (run on every heartbeat)

1. **Ensure LP Monitor Daemon is running**
   ```bash
   /home/node/clawd/skills/fblpmanager/scripts/ensure-daemon.sh
   ```

2. **Ensure FTSO History Daemon is running**
   ```bash
   /home/node/clawd/skills/ftso-history/scripts/ensure-daemon.sh
   ```

3. **Ensure Arb Scanner Daemon is running**
   ```bash
   /home/node/clawd/skills/arb-scanner/scripts/ensure-daemon.sh
   ```

4. **Ensure Trading Data Collector is running**
   ```bash
   /home/node/clawd/skills/trading/scripts/ensure-daemon.sh
   ```

5. **Check for Arb Alerts** (IMPORTANT - execute if found!)
   ```bash
   cat /home/node/clawd/skills/arb-scanner/data/pending-alert.json 2>/dev/null
   cat /home/node/clawd/skills/arb-scanner/data/sflr-alert.json 2>/dev/null
   ```
   If files exist with `read: false` → execute the arb opportunity!

---

## CHECKPOINT LOOP (every 30 min or on trigger)

Context dies on restart. Memory files don't. **Checkpoint aggressively.**

### The Loop
1. **Context getting full?** → flush summary to `memory/YYYY-MM-DD.md`
2. **Learned something permanent?** → write to `MEMORY.md`
3. **New capability or workflow?** → save to `skills/` or `TOOLS.md`
4. **Before restart?** → dump anything important

### Triggers (don't just wait for timer)
- After major learning → write immediately
- After completing significant task → checkpoint
- Context getting full → forced flush
- Before any restart → emergency dump

### Why This Matters
- Long sessions get messy
- Context gets bloated
- Agent starts forgetting the good stuff
- Context resets anyway on restart

**The agent that checkpoints often remembers way more than the one that waits.**

### Checkpoint State
Track last checkpoint in `memory/checkpoint-state.json`:
```json
{
  "lastCheckpoint": "2026-01-31T19:00:00Z",
  "sessionStart": "2026-01-31T17:55:00Z",
  "majorEvents": []
}
```

---

## Heartbeat Timing
- Default interval: 30 min
- Adjust based on session activity
- Heartbeats aren't just status checks — the loops you run inside them are what compounds
