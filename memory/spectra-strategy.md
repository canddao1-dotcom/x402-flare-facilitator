# Spectra Strategy - Complete Analysis

**Date:** 2026-01-30
**Context:** FlareDrop ending, sFLR yields dropping from ~25% to ~7% APY

---

## Executive Summary

Two Spectra opportunities on Flare:

| Pool | Maturity | PT Discount | Implied APY | Risk |
|------|----------|-------------|-------------|------|
| **PT-stXRP** | 34 days (Mar 5) | 0.81% | 8.74% | LOW |
| **PT-sFLR** | 107 days (May 17) | 46.5% | 158% | MEDIUM |

**Recommended Allocation:** 30% PT-stXRP + 70% PT-sFLR

---

## Pool 1: PT-stXRP (Conservative)

### Current State
- **Maturity:** March 5, 2026 (34 days)
- **PT Price:** 0.9919 stXRP per PT
- **PT Discount:** 0.81%
- **Implied APY:** 8.74%
- **Pool Balance:** 188K stXRP + 894K PT (4.76x ratio)

### stXRP Fundamentals
- **What is stXRP?** Liquid staked XRP via Firelight protocol
- **Exchange Rate:** 1.000066 FXRP per stXRP (essentially 1:1)
- **Yield Sources:** FXRP staking rewards on Flare
- **rFLR:** ❌ Does NOT receive rFLR (that's for sFLR only)
- **FlareDrop Impact:** ❌ NONE - yields are independent

### Strategy Analysis
```
Buy PT-stXRP @ 0.9919 stXRP
Hold 34 days
Redeem 1 PT → 1 stXRP
Profit: 0.81% (8.74% APY)
```

**Why PT over YT?**
- Firelight historical yields: 5-8% APY
- PT implies 8.74% APY
- PT is slightly better value (locking in above-market rate)

### Risks
- ✅ Very low - short duration, no wrapper, stable yields
- ⚠️ Firelight protocol risk (but battle-tested)
- ⚠️ Small profit in absolute terms

---

## Pool 2: PT-sFLR (Aggressive)

### Current State
- **Maturity:** May 17, 2026 (107 days)
- **PT Price:** 0.5348 sw-sFLR per PT
- **PT Discount:** 46.5%
- **Implied APY:** 158%
- **Pool Balance:** 6.4M sw-sFLR + 53M PT (8.28x ratio)

### sw-sFLR Wrapper
- **What is sw-sFLR?** Spectra-wrapped sFLR (ERC4626 vault)
- **Exchange Rate:** 1 sw-sFLR = 1.7527 sFLR (accumulated yield)
- **Underlying:** sFLR → WFLR via Sceptre protocol

### The Mispricing

**Why is PT-sFLR so cheap?**
1. **FlareDrop panic** - market pricing in yield collapse
2. **Massive PT oversupply** - 8.28x more PT than sw-sFLR
3. **YT preference** - farmers dump PT, keep YT for immediate yield
4. **rFLR goes to YT** - PT holders miss the airdrop

**But the math doesn't lie:**
```
Starting: 1000 sFLR
Step 1: Deposit → 570.55 sw-sFLR (wrapper takes accumulated yield into account)
Step 2: Swap → ~1066.84 PT (at current 0.5348 rate)
Step 3: At maturity → 1066.84 sw-sFLR
Step 4: Withdraw → 1066.84 × future_sw-sFLR_rate sFLR
```

### Break-Even Analysis

| Scenario | Future sFLR Yield | sw-sFLR Rate at Maturity | Return |
|----------|-------------------|-------------------------|--------|
| Optimistic | 25% APY (current) | 1.8712 sFLR | **99.6%** |
| Realistic | 7% APY (post-drop) | 1.7878 sFLR | **90.7%** |
| Catastrophic | 0% APY | 1.7527 sFLR | **87.0%** |

**Even with ZERO future yield, you get 87% return in 107 days (297% APY)**

### Why This Opportunity Exists
1. Capital locked for 107 days (DeFi attention span is short)
2. Market overreacting to FlareDrop ending
3. Complex mechanics (wrapper + pool) deter casual users
4. Large trades would move price significantly (liquidity constraints)

### Risks
- ⚠️ Smart contract risk (Spectra + sw-sFLR wrapper)
- ⚠️ Slippage on large trades (pool heavily imbalanced)
- ⚠️ 107-day lock-up with no early exit
- ⚠️ sw-sFLR wrapper failure scenario
- ✅ sFLR itself is battle-tested (Sceptre)

---

## rFLR Considerations

### What is rFLR?
- Reward token from FlareDrop
- Vests to WFLR over 3 years
- Only for sFLR holders (FLR stakers)

### Who Gets rFLR?
| Position | rFLR? |
|----------|-------|
| Direct sFLR holder | ✅ YES |
| YT-sFLR holder | ✅ YES (via yield distribution) |
| PT-sFLR holder | ❌ NO |
| stXRP holder | ❌ NO (not FLR staking) |

### Strategy Implication
If you want rFLR exposure, hold sFLR directly.
PT buyers are sacrificing rFLR for the discount arbitrage.

---

## Execution Guide

### PT-stXRP Purchase
```
1. Have stXRP (or swap FXRP → stXRP on Firelight)
2. Go to Spectra UI or direct contract
3. Approve stXRP for pool: 0xa65a736bcf1f4af7a8f353027218f2d54b3048eb
4. Swap stXRP → PT-stXRP
5. Hold until Mar 5, 2026
6. Redeem PT → stXRP
7. Swap back to FXRP if desired
```

### PT-sFLR Purchase
```
1. Have sFLR (or wrap WFLR → sFLR on Sceptre)
2. Deposit sFLR into sw-sFLR wrapper: 0xB9003d5bEd06afD570139d21c64817298DD47eC1
3. Approve sw-sFLR for pool: 0x5d31ef52e2571294c91f01a3d12bf664d2951666
4. Swap sw-sFLR → PT-sFLR
5. Hold until May 17, 2026
6. Redeem PT → sw-sFLR
7. Withdraw sw-sFLR → sFLR
8. Unwrap sFLR → WFLR if desired
```

---

## Contract Addresses

### stXRP Spectra
| Contract | Address |
|----------|---------|
| stXRP (IBT) | `0x4C18Ff3C89632c3Dd62E796c0aFA5c07c4c1B2b3` |
| PT-stXRP | `0x097Dd93Bf92bf9018fF194195dDfCFB2c359335e` |
| YT-stXRP | `0x46f0C7b81128e031604eCb3e8A7E28dd3F8A50C9` |
| Pool | `0xa65a736bcf1f4af7a8f353027218f2d54b3048eb` |

### sFLR Spectra
| Contract | Address |
|----------|---------|
| sFLR | `0x12e605bc104e93B45e1aD99F9e555f659051c2BB` |
| sw-sFLR (IBT wrapper) | `0xB9003d5bEd06afD570139d21c64817298DD47eC1` |
| PT-sFLR | `0x14613BFc52F98af194F4e0b1D23fE538B54628f3` |
| Pool | `0x5d31ef52e2571294c91f01a3d12bf664d2951666` |

---

## Recommended Portfolio Allocation

### Conservative (Low Risk)
- 100% PT-stXRP
- 8.74% APY for 34 days
- Simple, predictable

### Balanced (Recommended)
- 30% PT-stXRP (quick return, hedge)
- 70% PT-sFLR (maximize opportunity)
- Blended APY: ~220%

### Aggressive (Maximum Return)
- 100% PT-sFLR
- 87-100% return in 107 days
- Higher protocol risk

---

## Monitoring Checklist

### Weekly Checks
- [ ] sw-sFLR exchange rate (should increase with sFLR yield)
- [ ] PT-sFLR discount (opportunity if widens further)
- [ ] Pool liquidity (watch for large exits)
- [ ] FlareDrop announcements (end date confirmation)

### Exit Triggers
- ❌ sw-sFLR wrapper exploit/hack
- ❌ Spectra protocol issues
- ❌ PT discount narrows significantly (arbitrage closing)

---

## Summary

**PT-stXRP:** Safe 8.74% APY for 34 days. No drama. Good for short-term parking.

**PT-sFLR:** 87% minimum return opportunity. Market mispricing FlareDrop impact. Lock-up required but math is compelling.

**Action:** Execute balanced allocation (30/70 split) within next 48 hours before discount narrows.

---

*Last Updated: 2026-01-30*
