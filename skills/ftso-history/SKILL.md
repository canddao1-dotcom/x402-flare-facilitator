---
name: ftso-history
description: "INTERNAL - FTSO price history daemon. Polls every 90s, stores for analysis. Query via skills/ftso-history/scripts/query.js."
internal: true
---

# FTSO History Skill

Polls FTSO v2 anchor feeds every 90 seconds and stores locally for technical analysis.

## Storage

- **Format:** JSONL (one JSON object per line, per day)
- **Location:** `data/YYYY-MM-DD.jsonl`
- **Zero dependencies** — uses Node.js built-ins only

## Daemon Control

```bash
# Start/stop/status
./skills/ftso-history/scripts/ctl.sh start
./skills/ftso-history/scripts/ctl.sh stop
./skills/ftso-history/scripts/ctl.sh status
./skills/ftso-history/scripts/ctl.sh logs

# Auto-start on heartbeat (already configured in HEARTBEAT.md)
./skills/ftso-history/scripts/ensure-daemon.sh
```

## Query Usage

```bash
# Query history
node skills/ftso-history/scripts/query.js FLR --hours 24
node skills/ftso-history/scripts/query.js BTC --days 7
node skills/ftso-history/scripts/query.js --all --hours 1 --stats

# Export to CSV
node skills/ftso-history/scripts/query.js FLR --days 7 --csv > flr_history.csv

# Single poll (manual)
node skills/ftso-history/scripts/poll.js
```

## Data Format

Each line in JSONL:
```json
{"t":1706544000,"r":1236413,"p":{"FLR":0.01042,"BTC":101234.56,"ETH":3234.12,...}}
```

- `t` = Unix timestamp
- `r` = Voting round ID  
- `p` = Prices (symbol → USD value)

## Feeds Tracked

Top 20 by default (configurable in config.json):
FLR, BTC, ETH, XRP, SOL, DOGE, ADA, AVAX, LINK, DOT, 
POL, UNI, ATOM, LTC, BCH, XLM, NEAR, SUI, PEPE, TON

## Disk Usage

~2KB per poll × 960 polls/day = ~2MB/day = ~60MB/month
