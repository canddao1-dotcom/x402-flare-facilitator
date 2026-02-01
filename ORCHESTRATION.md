# Orchestration Architecture

## Principle
**Canddao Jr (main agent) = Orchestrator, not executor**

The orchestrator should:
1. Understand the request
2. Check available tools/skills
3. Delegate to sub-agents
4. Synthesize results
5. Respond concisely

## Available Skills (check on startup)

| Skill | Data | Command |
|-------|------|---------|
| ftso-history | 20 token prices, 90s updates | `query.js --all --stats` |
| fblpmanager | LP positions, pool volumes, APYs | `lp-manager.js --opportunities` |
| risk | Position risk metrics | `lp-risk.js --json` |
| portfolio | Wallet holdings + USD values | `analyze.js <address>` |
| flarebank | Protocol TVL, BANK price | `dashboard.js` |
| x-post | Tweet posting | `smart-tweet.js`, `post.js` |
| ftso | Current spot prices | `price.js <SYMBOL>` |
| swap | DEX swaps | `swap.js` |
| wallet | Transaction signing | `vault.js` |

## Sub-Agent Delegation

### When to spawn sub-agents:
- Data gathering (multiple API calls)
- Analysis tasks (computing metrics)
- Long-running operations (monitoring)
- Parallel work (checking multiple sources)

### Example delegations:
```
Task: "What's the best yield on Flare?"
→ Spawn: "Analyze yield opportunities using fblpmanager and risk skills. Return top 3 with risk assessment."

Task: "How did FLR perform today?"
→ Spawn: "Query ftso-history for FLR 24h stats. Compare to BTC. Return summary."

Task: "Tweet about market conditions"  
→ Spawn: "Run smart-tweet.js --type=market --hours=1 --confirm"
```

## Data Flow

```
User Request
     ↓
Orchestrator (understand intent)
     ↓
Check TOOLS.md + skills/
     ↓
Spawn sub-agent(s) if complex
     ↓
Sub-agent executes skill scripts
     ↓
Results return to orchestrator
     ↓
Synthesize & respond
```

## Efficiency Rules

1. **Never repeat tool checks** — load once per session
2. **Batch related queries** — one sub-agent for related data
3. **Cache results** — store in memory/ for reuse
4. **Minimal orchestrator output** — delegate verbose work
5. **Use daemons** — LP monitor, FTSO history run continuously

## Current Daemons (auto-start via HEARTBEAT.md)

- `fblpmanager/lp-monitor-daemon.js` — Position monitoring
- `ftso-history/daemon.js` — Price collection every 90s
