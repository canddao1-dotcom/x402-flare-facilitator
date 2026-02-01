---
name: fbdashboard
description: FlareBank protocol analytics and dashboard. Use when asked about FlareBank TVL, BANK token price/supply, DAO treasury holdings, LP positions, FTSO delegation, validators, or protocol metrics. Triggers on "flarebank dashboard", "fb stats", "protocol tvl", "bank price", "dao treasury", "/fbdashboard".
---

# FlareBank Protocol Skill

Query FlareBank protocol data from Flare mainnet.

## Quick Command

Run the dashboard script for full protocol overview:

```bash
node /home/node/clawd/skills/flarebank/scripts/dashboard.js
```

## ⚠️ CRITICAL: Output Format - READ THIS

**🚨 ALWAYS output the COMPLETE dashboard - EVERY SINGLE TABLE.**
**🚨 NEVER summarize, condense, or cherry-pick sections.**
**🚨 DO NOT be "helpful" by shortening output - the user WANTS all the data.**

The tables render with nice formatting in Telegram. When user asks for "flarebank dashboard", "fb stats", or "/fbdashboard":

1. Run the script: `node /home/node/clawd/skills/flarebank/scripts/dashboard.js`
2. Copy-paste the ENTIRE output as your response
3. Do NOT add commentary, summaries, or "highlights"
4. Do NOT truncate or skip any sections

If the output is long, that's fine - send it all. The user specifically wants comprehensive data.

## What It Returns

The dashboard outputs these sections with full markdown tables:

### Protocol Overview
- **📈 PROTOCOL TVL**: FB Main, DAO Treasury, LP WFLR, IBDP queue
- **🏦 BANK TOKEN**: Supply, circulating, price, mint/burn prices, backing
- **🏛️ DAO TREASURY**: All token holdings with WFLR valuations
- **💧 LP POSITIONS**: Enosys V2, SparkDex V2, V3 position details

### Rewards & Staking
- **🌾 CDP EARN POOLS**: Deposits, pending yield, liquidation collateral
- **🎁 PENDING REWARDS**: CDP yield and collateral claimable
- **🥩 APS STAKING**: DAO staked APS, held APS, total
- **🔒 rFLR VESTING**: Vested vs unvested breakdown
- **🪂 FLAREDROP CLAIMS**: Historical claims with All Time/30d/7d/24h breakdown
  - DAO claims (kept in treasury)
  - IBDP claims → FB Main (deposited to backing)
  - FB Main claims (direct to backing)
- **📊 FTSO DELEGATION REWARDS**: Delegation rewards from FTSO providers
  - DAO, IBDP, FB Main breakdown
  - All Time / 30d / 7d / 24h periods
- **🏛️ FTSO PROVIDER FEES**: Provider fees from running FlareBank FTSO
  - DAO, IBDP, FB Main breakdown
  - All Time / 30d / 7d / 24h periods
- **🔐 VALIDATOR FEES CLAIMED**: Validator self-bond + operation fees
  - WFLR transfers to DAO Treasury
  - All Time / 30d / 7d / 24h periods

### Infrastructure
- **🌐 FTSO**: Total WFLR delegated
- **🔐 VALIDATORS**: Stake, delegation, uptime, expiry countdown
- **💰 PROVIDER EARNINGS**: Estimated FLR per epoch/month/year

### Activity & Fees (All Time / 30d / 7d / 24h)
- **🏭 MINT STATISTICS**: Count, WFLR deposited, BANK minted, fees
- **💸 MINT FEE DISTRIBUTION**: Holders 80%, Team 15%, DAO 5%
- **🔥 BURN STATISTICS**: Count, BANK burned, WFLR withdrawn, fees
- **💸 BURN FEE DISTRIBUTION**: Holders 80%, Team 15%, DAO 5%
- **📤 TRANSFER STATISTICS**: Count, BANK sent, 1% burned, 1% fee
- **💸 TRANSFER FEE DISTRIBUTION**: Holders 80%, Team 15%, DAO 5%
- **🔄 LP SWAP STATISTICS**: Buys/sells from V2 LPs
- **📊 SWAP VOLUME & FEES**: Total swaps, volume, 1% fee
- **💸 SWAP FEE DISTRIBUTION**: Holders 80%, Team 15%, DAO 5%

### Summary
- **📋 SUPPLY SUMMARY**: Current supply, minted, burned, untracked mints
- **💱 PRICES**: FXRP, stXRP, sFLR, FLR/USD from Enosys V3

## Fee Structure

| Action | Fee | Distribution |
|--------|-----|--------------|
| Mint | 10% of WFLR | 80% holders, 15% team, 5% DAO |
| Burn | 10% of WFLR | 80% holders, 15% team, 5% DAO |
| Transfer | 1% burn + 1% fee | 80% holders, 15% team, 5% DAO |
| LP Swap | 1% burn + 1% fee | 80% holders, 15% team, 5% DAO |

## Contract Reference

| Contract | Address |
|----------|---------|
| BANK Token (FB Main) | `0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059` |
| IBDP | `0x90679234fe693b39bfdf5642060cb10571adc59b` |
| DAO Treasury | `0xaa68bc4bab9a63958466f49f5a58c54a412d4906` |
| WFLR | `0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d` |
| sFLR | `0x12e605bc104e93B45e1aD99F9e555f659051c2BB` |
| rFLR | `0x26d460c3Cf931Fb2014FA436a49e3Af08619810e` |
| FXRP | `0xad552a648c74d49e10027ab8a618a3ad4901c5be` |
| Enosys V2 LP | `0x5f29c8d049e47dd180c2b83e3560e8e271110335` |
| SparkDex V2 LP | `0x0f574fc895c1abf82aeff334fa9d8ba43f866111` |
| FlareDrop | `0x9c7A4C83842B29bB4A082b0E689CB9474BD938d0` |
| FtsoRewardManager (v1) | `0x85627d71921AE25769f5370E482AdA5E1e418d37` |
| RewardManager (FTSOv2) | `0xc8f55c5aa2c752ee285bd872855c749f4ee6239b` |
| APS Staking | `0x7eb8ceb0f64d934a31835b98eb4cbab3ca56df28` |

## Data Sources

- **On-chain RPC**: Flare mainnet for balances, prices, positions
- **Routescan API**: Historical mint/burn/transfer/FlareDrop events
- **P-Chain RPC**: Validator stake and delegation data

## FlareDrop Tracking

FlareDrop claims are tracked via `AccountClaimed` events from DistributionToDelegators:
- **topic1** = `whoClaimed` (who initiated the claim)
- **topic2** = `sentTo` (where rewards were sent)

Key insight: IBDP claims FlareDrop but sends to FB Main (increases BANK backing).

## Reward Flow

```
FlareDrop → DAO (kept in treasury)
FlareDrop → IBDP → FB Main (backing)
FlareDrop → FB Main (backing)
FTSO Delegation → DAO (kept in treasury)
FTSO Delegation → FB Main (backing)
Validator Staking → DAO (kept in treasury)
```

## Protocol Rewards Tracking

FTSOv2 rewards (delegation + staking) are tracked via `RewardClaimed` events from RewardManager:
- **Contract**: `0xc8f55c5aa2c752ee285bd872855c749f4ee6239b`
- **Topic0**: `0x06f77960d1401cc7d724b5c2b5ad672b9dbf08d8b11516a38c21697c23fbb0d2`
- **Topic1** = Provider (FTSO or Identity contract)
- **Topic2** = Beneficiary (who earned)
- **Topic3** = Recipient (who received)
- **Data** = [epoch, claimType, amount]

**Claim Types:**
- **Type 1** = Validator Staking (provider = Identity contract `0x59b1ab4a...`)
- **Type 2** = FTSO Delegation (provider = FTSO address)
