# Tweet Templates

Analytical, data-heavy tweets covering DEX pools and agent actions.

## DEX Handles
- **Enosys:** @enosys_global (V3)
- **SparkDex:** @sparkdexai (V3 + V3.1)
- **FlareBank:** @FlareBank
- **Founder:** @Canddao

---

## 1. Daily Pool Stats

Tag DEXs for visibility. Pull data from DefiLlama/DEXScreener.

```
📊 Flare V3 Pool Report - [DATE]

@enosys_global top pools:
• WFLR/FXRP 0.3%: $[VOL]K vol | [APY]% APY
• sFLR/WFLR 0.05%: $[VOL]K vol | [APY]% APY
• WFLR/USDT0 0.3%: $[VOL]K vol | [APY]% APY

@sparkdexai V3.1:
• WFLR/USDC.e: $[VOL]K vol | [APY]% APY

Data: DefiLlama
```

---

## 2. Position Performance (Weekly)

```
📈 LP Performance - Week [N]

[X] V3 positions across @enosys_global & @sparkdexai

Total value: ~$[VALUE]
Fees earned: [AMOUNT] FLR (~$[USD])
Rebalances: [N]
Time in range: [X]%

[COMMENTARY]
```

---

## 3. Rebalance Execution

Post when rebalancing a position.

```
🔄 Rebalanced [PAIR] on @[DEX]

Position #[ID]
Old range: [PRICE_LOW]-[PRICE_HIGH] ([X]% from edge)
New range: [PRICE_LOW]-[PRICE_HIGH] (centered)

Collected: [TOKEN_A] + [TOKEN_B]
Gas: [X] FLR

Back to optimal. Next check in [X]h.
```

---

## 4. Volume Spike Alert

When 24h volume significantly exceeds 7-day average.

```
📊 Volume alert on @[DEX]

[PAIR_1] 24h: $[VOL]K (+[X]%)
[PAIR_2] 24h: $[VOL]K (+[X]%)

Above 7-day avg. LP fees compounding faster today.

Source: DefiLlama
```

---

## 5. DEX Comparison

Weekly comparison of both V3 DEXs.

```
📊 Flare V3 DEX Comparison - [DATE]

@enosys_global V3:
• 24h volume: $[VOL]K
• Top pool: [PAIR] ([APY]% APY)
• TVL: $[TVL]M

@sparkdexai V3.1:
• 24h volume: $[VOL]K
• Top pool: [PAIR] ([APY]% APY)
• TVL: $[TVL]M

[COMMENTARY/QUESTION]
```

---

## 6. New Position Deployment

When opening a new LP position.

```
🆕 New LP position on @[DEX]

Pool: [PAIR] ([FEE]%)
Position #[ID]
Range: [PRICE_LOW]-[PRICE_HIGH] (±[X]%)
Deployed: [TOKEN_A] + [TOKEN_B]

Strategy: [TIGHT/MODERATE] range, monitoring [X]x daily.
```

---

## 7. Position Status Report

Regular check-in on all positions.

```
📊 LP Position Check - [DATE]

@enosys_global:
[✅/⚠️/❌] [PAIR] #[ID]: [STATUS] ([X]%)
[✅/⚠️/❌] [PAIR] #[ID]: [STATUS] ([X]%)

@sparkdexai:
[✅/⚠️/❌] [PAIR] #[ID]: [STATUS] ([X]%)

[X] positions earning. [COMMENTARY]
```

**Status icons:**
- ✅ IN RANGE (>20% from edges)
- ⚠️ NEAR EDGE (<20% from edge)
- ❌ OUT OF RANGE

---

## 8. Fee Collection

When collecting accumulated fees.

```
💰 Fees collected from [X] positions

@enosys_global:
• [PAIR]: [AMOUNT_A] + [AMOUNT_B]
• [PAIR]: [AMOUNT_A] + [AMOUNT_B]

Total: ~$[USD] in fees
Reinvesting into positions.
```

---

## Style Guidelines

1. **Always cite data source** (DefiLlama, DEXScreener, on-chain)
2. **Tag DEXs** when mentioning their pools
3. **Include specific numbers** (volume, APY, %, position IDs)
4. **Keep it factual** - no hype, no financial advice
5. **Position IDs for transparency** - verifiable on-chain
6. **Max 280 chars** - be concise

## Posting Cadence

| Tweet Type | Frequency |
|------------|-----------|
| Pool Stats | 1x/day (when notable) |
| Position Status | 2x/week |
| Rebalance Alerts | As they happen |
| Volume Spikes | When >50% above avg |
| DEX Comparison | 1x/week |
| Fee Collection | When collected |

**Daily max: 2-3 tweets**
**Self-imposed limit in script: 5/day**
