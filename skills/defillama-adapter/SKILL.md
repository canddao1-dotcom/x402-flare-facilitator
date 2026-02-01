---
name: defillama-adapter
description: DefiLlama adapter files for FlareBank protocol. Includes fees adapter for dimension-adapters and TVL adapter for DefiLlama-Adapters repos.
---

# DefiLlama Adapter Skill

Ready-to-submit adapters for FlareBank on DefiLlama.

## Files

| File | Repo | Purpose |
|------|------|---------|
| `flarebank-fees.ts` | dimension-adapters/fees/ | Fees & Revenue tracking |
| `flarebank-tvl.js` | DefiLlama-Adapters/projects/flrbank/ | TVL tracking |

## Fee Structure

FlareBank has 4 fee sources with the same distribution model:

| Action | Fee Rate | What's Charged |
|--------|----------|----------------|
| Mint (buy) | 10% | WFLR deposited |
| Burn (sell) | 10% | WFLR withdrawn |
| Transfer | 1% + 1% burn | BANK transferred |
| LP Swap | 1% + 1% burn | BANK swapped |

**Fee Distribution:**
| Recipient | Share | Description |
|-----------|-------|-------------|
| Holders | 80% | Dividends to BANK holders |
| Team | 15% | Team wallet |
| DAO | 5% | Treasury |

## Fees Adapter

**Location:** `fees/flarebank.ts` in [dimension-adapters](https://github.com/DefiLlama/dimension-adapters)

**Tracked Metrics:**
| Metric | Value |
|--------|-------|
| dailyFees | All fees (mint/burn/transfer/swap) |
| dailyUserFees | = dailyFees |
| dailyRevenue | 20% (team + DAO) |
| dailyProtocolRevenue | 20% (15% team, 5% DAO) |
| dailyHoldersRevenue | 80% to BANK holders |
| dailySupplySideRevenue | = dailyHoldersRevenue |
| dailyTokenTax | 1% burns on transfers/swaps |

**Events Tracked:**
| Event | Topic | Source |
|-------|-------|--------|
| onTokenPurchase | `0x623b3804...` | Mints |
| onTokenSell | `0xdd736864...` | Burns |
| Transfer | `0xddf252ad...` | Transfers + LP Swaps |

**LP Swap Detection:**
Transfers to/from these addresses are LP swaps:
- Enosys V2: `0x5f29c8d049e47dd180c2b83e3560e8e271110335`
- SparkDex V2: `0x0f574fc895c1abf82aeff334fa9d8ba43f866111`

## TVL Adapter

**Location:** `projects/flrbank/index.js` in [DefiLlama-Adapters](https://github.com/DefiLlama/DefiLlama-Adapters)

**Tracked Value:**
- WFLR in BANK token contract (backing)
- WFLR in IBDP contract
- DAO Treasury holdings (WFLR, sFLR, FXRP)
- V2 LP positions (unwrapped)

## Submission Process

### Fees Adapter

```bash
# 1. Fork & clone dimension-adapters
git clone https://github.com/YOUR_USERNAME/dimension-adapters
cd dimension-adapters

# 2. Copy fees adapter
cp /path/to/flarebank-fees.ts fees/flarebank.ts

# 3. Test
pnpm i
pnpm test fees flarebank

# 4. Submit PR
```

### TVL Adapter (Update)

```bash
# 1. Fork & clone DefiLlama-Adapters
git clone https://github.com/YOUR_USERNAME/DefiLlama-Adapters
cd DefiLlama-Adapters

# 2. Update TVL adapter
cp /path/to/flarebank-tvl.js projects/flrbank/index.js

# 3. Test
node test.js projects/flrbank

# 4. Submit PR
```

## Contract Addresses

| Contract | Address |
|----------|---------|
| BANK Token | `0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059` |
| IBDP | `0x90679234FE693B39BFdf5642060Cb10571Adc59b` |
| DAO Treasury | `0xaa68bc4bab9a63958466f49f5a58c54a412d4906` |
| WFLR | `0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d` |
| Enosys V2 LP | `0x5f29c8d049e47dd180c2b83e3560e8e271110335` |
| SparkDex V2 LP | `0x0f574fc895c1abf82aeff334fa9d8ba43f866111` |

## Fee Calculation Notes

**Mint/Burn:**
- Fee = 10% of WFLR amount
- For burns: `ethereumEarned` is post-fee, so fee = `ethereumEarned / 9`

**Transfer/Swap:**
- 1% burned (supply reduction)
- 1% distributed as fee
- Total tax on transfer = 2%
- Fee is in BANK tokens, not WFLR
