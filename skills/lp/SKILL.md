---
name: lp
description: LP position management for Flare V3 DEXs. Check position health, view pending fees, collect/remove liquidity, mint new positions, rebalance out-of-range positions, and get deployment recommendations. Triggers on "/lp", "lp check", "lp positions", "check my lp", "rebalance position".
---

# LP Management Skill

Unified interface for V3 liquidity position management on Flare DEXs (Enosys, SparkDex).

## Quick Command

```bash
node /home/node/clawd/skills/lp/scripts/lp.js <command> [options]
```

## Subcommands

| Command | Description |
|---------|-------------|
| `check` | Quick position health check (in/out of range) |
| `report` | Full LP report with opportunities and suggestions |
| `positions` | View all V3 positions with pending fees |
| `collect <id>` | Collect fees from position NFT |
| `remove <id> [%]` | Remove liquidity (default 100%) |
| `mint` | Mint new V3 position |
| `rebalance <id>` | Close position and redeploy at new range |
| `deploy` | Deployment guide with recommended price ranges |

## Usage Examples

```bash
# Quick health check - are positions in range?
/lp check

# Full report with APY, volumes, deployment suggestions
/lp report

# View all positions with pending fees
/lp positions

# Collect fees from position #34935
/lp collect 34935

# Remove 50% liquidity from position
/lp remove 34935 50

# Mint new position
/lp mint --pool 0x... --lower -1000 --upper 1000 --amount0 100 --amount1 50

# Get deployment suggestions (best pools, ranges)
/lp deploy

# Simulate rebalance for out-of-range position
/lp rebalance 34935 moderate
```

## Position Health Status

| Status | Emoji | Meaning |
|--------|-------|---------|
| HEALTHY | 🟢 | Position >10% and <90% from bounds |
| NEAR EDGE | 🟡 | Position <10% or >90% from bounds |
| OUT OF RANGE | 🔴 | Current tick outside position range |

## Monitored Positions

| Position | Pool | DEX | Owner |
|----------|------|-----|-------|
| #28509 | stXRP/FXRP | Enosys | DAO |
| #34935 | sFLR/WFLR | Enosys | Agent |
| #34936 | CDP/USDT0 | Enosys | Agent |
| #34937 | WFLR/FXRP | Enosys | Agent |
| #34938 | WFLR/USDT0 | Enosys | Agent |
| #34964 | WFLR/FXRP | Enosys | Agent |
| #34965 | sFLR/WFLR | Enosys | Agent |

## DEX Contracts

| Contract | Enosys | SparkDex |
|----------|--------|----------|
| Position Manager | `0xd9770b1c7a6ccd33c75b5bcb1c0078f46be46657` | `0xf60e11cd753a0e5989d237e87d559e1b0f9ab5b5` |
| Factory | `0x17aa157ac8c54034381b840cb8f6bf7fc355f0de` | - |
| SwapRouter | `0x5FD34090E9b195d8482Ad3CC63dB078534F1b113` | `0x7a57DF6665B5b4B9f8C555e19502333D0B89aD59` |

## Report Output Format

When running `/lp report`, output includes:

1. **Position Health** - Each position with price, range, status, holdings
2. **Top Opportunities** - Best pools by APY with volume/TVL
3. **DEX Volume** - 24h volume comparison
4. **Deployment Suggestions** - Top 3 pools with recommended price ranges

## Data Sources

- **DefiLlama** - APY data (base + reward yields)
- **DEXScreener** - Live volume, price changes, TVL
- **GeckoTerminal** - 30-day historical OHLCV for volatility
- **Flare RPC** - On-chain prices, position data, current ticks

## Automated Monitoring

A daemon runs in background checking positions every 15 minutes:
- Alerts when OUT OF RANGE or NEAR EDGE
- 1-hour cooldown between alerts
- See `fblpmanager/scripts/lp-monitor-daemon.js`

## Keystore

Default: `/home/node/clawd/skills/fblpmanager/data/clawd-wallet.json`
Agent wallet: `0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A`
