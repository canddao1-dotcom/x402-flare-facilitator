---
name: memory
description: "INTERNAL - Structured logging for transactions and decisions. Used by other skills for audit trails. Not user-callable."
internal: true
---

# Memory Skill

Structured memory management for tracking transactions, decisions, and audit trails.

## Purpose

**Zero mistakes** through:
- Automatic logging of all on-chain actions
- Structured event formats for easy search
- Audit trail for every decision
- Daily summaries and pattern recognition

## Commands

| Command | Description |
|---------|-------------|
| `/memory log <type> <details>` | Log an event |
| `/memory search <query>` | Search past events |
| `/memory today` | View today's log |
| `/memory summary [days]` | Summarize recent activity |

## Event Types

### Transaction Events
```
[TX] SEND | 100 BANK → 0x1234...abcd | tx: 0xabc... | gas: 0.05 FLR
[TX] SWAP | 1000 FLR → 45.2 BANK | via: Enosys V3 | tx: 0xdef...
[TX] APPROVE | BANK unlimited → SparkDex Router | tx: 0x123...
[TX] LP_ADD | 500 BANK + 10000 FLR | pool: BANK/WFLR V2 | tx: 0x456...
[TX] LP_REMOVE | Position #28509 | 100% | tx: 0x789...
```

### Decision Events
```
[DECISION] Rebalance stXRP/FXRP position - price near lower edge
[DECISION] Hold BANK - waiting for $0.025 target
[DECISION] Skip opportunity - APY too low (<50%)
```

### Alert Events
```
[ALERT] Position #28509 OUT OF RANGE - action needed
[ALERT] Gas spike detected - 150 gwei, delay non-urgent tx
[ALERT] Large BANK sell detected - monitor price
```

### Error Events
```
[ERROR] Swap failed - insufficient liquidity | attempted: 10000 FLR → BANK
[ERROR] TX reverted - 0xabc... | reason: slippage exceeded
```

## File Structure

```
memory/
├── YYYY-MM-DD.md      # Daily logs (raw events)
├── transactions.md     # All TX hashes with context
├── decisions.md        # Important decisions and rationale
└── errors.md          # Mistakes and lessons learned
```

## Usage in Scripts

All wallet/swap/LP scripts should call the memory logger:

```bash
# Log a transaction
node /home/node/clawd/skills/memory/scripts/log.js \
  --type TX \
  --action SEND \
  --details "100 BANK → 0x1234...abcd" \
  --tx "0xabc..."

# Search for past swaps
node /home/node/clawd/skills/memory/scripts/search.js --query "SWAP BANK"
```

## Auto-Logging Integration

The memory skill integrates with:
- `wallet/send-tx.js` → logs all sends
- `wallet/swap-*.js` → logs all swaps
- `fblpmanager/*` → logs LP operations
- All on-chain actions

## Pre-Action Checklist

Before ANY on-chain action:
1. ✅ Check memory for similar past actions
2. ✅ Verify address against known addresses
3. ✅ Confirm amount and token
4. ✅ Dry-run first if supported
5. ✅ Log the action after completion

## Post-Error Protocol

After ANY error:
1. Log to `memory/errors.md` with full context
2. Analyze what went wrong
3. Update procedures to prevent recurrence
4. Add to daily notes
