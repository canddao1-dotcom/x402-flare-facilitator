---
name: rysk
description: Rysk Finance covered calls on HyperEVM. Sell covered calls on fXRP to earn volatility premium. Triggers on "/rysk", "covered calls", "rysk finance", "sell calls fxrp", "fxrp yield hyperevm".
---

# Rysk Finance Skill

Sell covered calls on fXRP via Rysk Finance on HyperEVM to earn upfront volatility premium.

## What It Does

Rysk lets you deposit fXRP and sell covered call options:
- **Receive premium upfront** (paid immediately to wallet)
- **Choose strike price** (price you're willing to sell at)
- **At expiry**: Keep fXRP + premium if price < strike, or get strike in USDT0 if price > strike

## Commands

```bash
# Check status and available options
node skills/rysk/scripts/rysk.js status

# Get quotes for selling covered calls
node skills/rysk/scripts/rysk.js quote --amount 1000 --strike 2.5 --expiry 7d

# Deposit fXRP and sell covered call
node skills/rysk/scripts/rysk.js sell --keystore <path> --amount 1000 --strike 2.5 --expiry 7d

# Check positions
node skills/rysk/scripts/rysk.js positions

# Withdraw/settle expired positions
node skills/rysk/scripts/rysk.js settle --keystore <path>
```

## Parameters

| Parameter | Description |
|-----------|-------------|
| `--amount` | Amount of fXRP to deposit |
| `--strike` | Strike price in USD (price to sell XRP at) |
| `--expiry` | Expiry period (7d, 14d, 30d, etc.) |
| `--keystore` | Path to encrypted keystore file |

## Network Info

| Item | Value |
|------|-------|
| Network | HyperEVM (Chain 999) |
| RPC | https://rpc.hyperliquid.xyz/evm |
| fXRP | `0xd70659a6396285bf7214d7ea9673184e7c72e07e` |
| USDT0 | Settlement token |

## APR Range

- **Min APR**: 4%
- **Max APR**: ~90%
- APR depends on strike distance and expiry

## Strategy Tips

1. **OTM strikes** (above current price) = lower premium but keep your fXRP
2. **ATM strikes** (near current price) = higher premium but higher assignment risk
3. **Longer expiry** = higher premium but locked longer
4. **Best for**: Neutral/slightly bullish outlook, income generation

## Risks

- Capped upside if XRP pumps above strike
- fXRP locked until expiry
- HyperEVM chain risk
