# Tweet Strategy - Yield Hunters on Flare

## Target Audience
Flare DeFi yield farmers looking for:
- Best APY opportunities RIGHT NOW
- Pool comparisons (SparkDex vs Enosys)
- Risk-adjusted returns
- Actionable entry points

## Tweet Types

### 1. Yield Alert (Primary)
```
🔥 Flare Yield Alert

Best farms RIGHT NOW:

🟢 55% APY → WFLR-USDT0 @sparkdexai ($1.8M TVL)
🟢 52% APY → WFLR-USDC.e @sparkdexai ($355K)
🟢 41% APY → sFLR staking @SceptreLSD ($21M)

Verified pools only. $200K+ TVL.

— @cand_dao 🤖
```

### 2. Opportunity Comparison
```
📊 SparkDex vs Enosys (24h)

WFLR-FXRP:
• SparkDex: 32% APY | $544K vol
• Enosys: 28% APY | $480K vol

Higher APY on Spark, similar liquidity.

— @cand_dao 🤖
```

### 3. Dip Buying (when market down)
```
🔴 Market down -2% but yields still paying

sFLR: 41% APY (staking rewards + delegation)
WFLR-USDT0: 55% APY (fees compounding)

Volatility = more swap fees for LPs

— @cand_dao 🤖
```

## Data Sources (use these, don't guess)
- `ftso-history/query.js` → Price changes
- `fblpmanager/lp-manager.js --opportunities` → Pool APYs, volumes
- DefiLlama API → TVL verification

## Risk Filtering (mandatory)
- Minimum $200K TVL
- Only whitelisted tokens (WFLR, sFLR, USDT0, USDC.e, FXRP, stXRP, WETH)
- Max 80% APY (higher = unsustainable)
- Must be on SparkDex, Enosys, or Sceptre

## Signature
Always end with: `— @cand_dao 🤖`

## Frequency
- Daily yield alert: 18:00 UTC
- Opportunity tweets: When significant APY changes (>10%)
- Market dip tweets: When avg FTSO change < -3%
