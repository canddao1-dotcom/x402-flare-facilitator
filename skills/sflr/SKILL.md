---
name: sflr
description: sFLR liquid staking and arbitrage. Check Sceptre rates, stake/unstake, find arb opportunities, monitor zero-fee windows. Triggers on "/sflr", "sflr arb", "sceptre", "liquid staking", "stake flr".
---

# sFLR Arbitrage Skill

Monitor and execute sFLR arbitrage opportunities between Sceptre staking and DEX prices.

## Overview

sFLR is Sceptre Finance's liquid staking token on Flare. Arbitrage exists between:
- **Sceptre staking rate** (FLR → sFLR)
- **Sceptre redemption rate** (sFLR → FLR, 14.5 day wait)
- **DEX market prices** (SparkDex V3.1, Enosys V3, Blazeswap V2)

## ⚠️ CRITICAL: Staking Fee

Sceptre has a **~4.4% staking fee** (`buyInStakingFee`) that applies MOST of the time.

**HOWEVER:** There are **zero-fee staking windows** when admin sets the fee to 0!

### Fee Detection (ON-CHAIN)
```javascript
const sflr = new ethers.Contract(SFLR, [
  'function buyInStakingFee() view returns (uint256)'
], provider);

const fee = await sflr.buyInStakingFee();
// fee = 44000000000000000 → 4.4% (normal)
// fee = 0 → ZERO FEE WINDOW!
```

### Key State Variables
- `buyInStakingFee` - Current fee (0-1e18 for 0-100%)
- `pendingBuyInFees` - Accumulated fees not yet distributed
- `mintingPaused` - If true, staking is disabled

## Strategies

### 1. STAKE-SELL (Instant) - ONLY during zero-fee windows!
- Stake FLR on Sceptre → Sell sFLR on DEX
- Profitable when: DEX premium > gas costs AND fee = 0%
- Current DEX premium: ~0.3%

### 2. BUY-REDEEM (14.5 day wait)
- Buy sFLR on DEX → Redeem on Sceptre
- Profitable when: DEX discount > opportunity cost
- Need: >0.8% discount for ~20% APY

## Commands

```bash
# Check current rates and opportunities
node /home/node/clawd/skills/sflr/scripts/sflr.js status

# Detect if currently in zero-fee window
node /home/node/clawd/skills/sflr/scripts/sflr.js check-fee

# Execute stake-sell arb (only if fee = 0!)
node /home/node/clawd/skills/sflr/scripts/sflr.js stake-sell --amount 1000

# Execute buy-redeem arb
node /home/node/clawd/skills/sflr/scripts/sflr.js buy-redeem --amount 1000

# Monitor for zero-fee windows (daemon)
node /home/node/clawd/skills/sflr/scripts/sflr.js monitor
```

## Key Contracts

| Contract | Address |
|----------|---------|
| sFLR Token | `0x12e605bc104e93B45e1aD99F9e555f659051c2BB` |
| SparkDex V3.1 Pool (0.01%) | `0xc9baba3f36ccaa54675deecc327ec7eaa48cb97d` |
| SparkDex Router | `0x8a1E35F5c98C4E85B36B7B253222eE17773b2781` |
| Enosys V3 Pool (0.05%) | `0x25b4f3930934f0a3cbb885c624ecee75a2917144` |
| Blazeswap V2 Pair | `0x3F50F880041521738fa88C46cDF7e0d8Eeb11Aa2` |

## Staking Method

**Send FLR directly to sFLR contract** (NOT to any router):
```javascript
await wallet.sendTransaction({
  to: '0x12e605bc104e93B45e1aD99F9e555f659051c2BB',
  value: ethers.parseEther(amount.toString())
});
```

## Alert Conditions

1. **Zero-fee window detected** → STAKE-SELL profitable
2. **DEX discount > 4.5%** → BUY-REDEEM highly profitable
3. **DEX premium > 5%** → Consider selling existing sFLR

## Files

- `scripts/sflr.js` - Main CLI tool
- `data/fee-history.json` - Historical fee observations
- `data/alerts.json` - Pending opportunities
