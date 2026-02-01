# Order Flow Analysis

Analyze swap data to detect whale activity, accumulation/distribution patterns, and market direction.

---
name: orderflow
triggers:
  - /orderflow
  - order flow
  - whale activity
  - whale tracker
  - accumulation
  - distribution
---

## Commands

| Command | Description |
|---------|-------------|
| `/orderflow <pool>` | Full order flow analysis |
| `/orderflow whales <pool>` | Top whale activity |
| `/orderflow patterns <pool>` | Accumulation/distribution patterns |
| `/orderflow metrics <pool>` | Flow metrics only |
| `/orderflow list` | Pools with swap data |
| `/orderflow all` | Summary all pools |

## Pools Available

Run `/orderflow list` to see pools with data. Most active:
- `wflr-usdt0-sparkdex` (highest volume)
- `wflr-fxrp-sparkdex`
- `sflr-wflr-sparkdex`

## Examples

```bash
# Full analysis on a pool
/orderflow wflr-usdt0-sparkdex

# Check whale accumulation/distribution
/orderflow whales wflr-fxrp-sparkdex

# See all pools summary
/orderflow all
```

## Script

```bash
node /home/node/clawd/skills/trading/scripts/analysis/order-flow-cli.js [command] [pool]
```
