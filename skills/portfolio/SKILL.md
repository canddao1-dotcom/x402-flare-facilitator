---
name: portfolio
description: Unified DeFi portfolio dashboard for Flare. Aggregates token balances, V3 LP positions, stability pool deposits, yield vault positions, and staking. Track performance over time, compare historical snapshots. Triggers on "/portfolio", "my portfolio", "all positions", "total holdings", "portfolio track", "portfolio compare".
---

# Portfolio Skill

Unified view of all DeFi positions across Flare protocols.

## Quick Command

```bash
node /home/node/clawd/skills/portfolio/scripts/portfolio-cli.js [command] [options]
```

## Subcommands

| Command | Description |
|---------|-------------|
| (default) | Full portfolio dashboard |
| `track [addr]` | Save performance snapshot |
| `history [addr]` | Show recent snapshots (14 days) |
| `compare <period> [addr]` | Compare to N days ago (e.g., 7d, 30d) |
| `analyze [addr]` | Deep DeFi position analysis |

## Options

| Flag | Description |
|------|-------------|
| `--json` | Output raw JSON |
| `--no-prices` | Skip USD valuations |

## What It Pulls

| Category | Protocol | Data |
|----------|----------|------|
| **Tokens** | Wallet | FLR, WFLR, sFLR, FXRP, BANK, USD₮0, USDC.e, CDP, rFLR |
| **V3 LPs** | Enosys, SparkDex | Position value, fees, in/out of range |
| **Stability Pools** | Enosys CDP | Deposited CDP, pending yield, collateral gains |
| **Yield Vaults** | Upshift | earnXRP balance → underlying FXRP value |
| **Yield Trading** | Spectra | PT/YT balances, maturity status |
| **Staking** | Sceptre, APS | sFLR balance, APS staked |

## Usage

```bash
# My full portfolio
/portfolio

# Specific address
/portfolio 0xaa68bc4bab9a63958466f49f5a58c54a412d4906

# DAO treasury
/portfolio dao
```

## Performance Tracking

Lightweight snapshots stored in JSONL (~200 bytes each).

```bash
# Save snapshot now
node /home/node/clawd/skills/portfolio/scripts/tracker.js track [address|dao]

# Show history (last 14 days)
node /home/node/clawd/skills/portfolio/scripts/tracker.js history [address|dao]

# Compare to N days ago
node /home/node/clawd/skills/portfolio/scripts/tracker.js compare 7d [address|dao]
```

**Tracked Metrics:**
- Total USD value
- Token balances (FLR, WFLR, sFLR, FXRP, BANK, CDP, earnXRP)
- Stability pool rewards (CDP yield + collateral gains)
- LP fees pending
- rFLR vested

**Storage:** `skills/portfolio/data/snapshots-{addr}.jsonl`

## Output Format

```
📊 PORTFOLIO: 0x0DFa...93cC
═══════════════════════════════════════

💰 TOKENS
├─ FLR:     1,234.56 ($24.69)
├─ WFLR:      500.00 ($10.00)
├─ sFLR:      200.00 ($4.20)
├─ BANK:    5,000.00 ($150.00)
└─ FXRP:      100.00 ($220.00)

🌊 LP POSITIONS
├─ #34935 sFLR/WFLR (Enosys)
│  ├─ Value: $500.00
│  ├─ Fees:  $12.50
│  └─ Status: ✅ IN RANGE
└─ #34937 WFLR/FXRP (Enosys)
   ├─ Value: $800.00
   ├─ Fees:  $8.20
   └─ Status: ⚠️ NEAR EDGE

🏦 STABILITY POOLS
├─ FXRP Pool
│  ├─ Deposited: 1,000 CDP ($1,000)
│  ├─ Yield:     50 CDP ($50)
│  └─ Collateral: 10 FXRP ($22)
└─ WFLR Pool: (empty)

📈 YIELD VAULTS
└─ Upshift FXRP
   ├─ earnXRP: 500.00
   └─ Value:   505 FXRP ($1,111)

═══════════════════════════════════════
TOTAL VALUE: $3,912.59
```
