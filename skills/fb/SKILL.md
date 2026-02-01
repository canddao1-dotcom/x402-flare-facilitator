---
name: fb
description: FlareBank protocol operations. View dashboard, mint/burn BANK, claim dividends, compound rewards. Triggers on "/fb", "flarebank", "bank token", "mint bank", "burn bank".
---

# FlareBank Skill

Unified interface for FlareBank protocol operations.

## Quick Command

```bash
node /home/node/clawd/skills/fb/scripts/fb.js <command> [options]
```

## Subcommands

| Command | Description |
|---------|-------------|
| `dashboard` | Full protocol analytics (TVL, supply, rewards) |
| `status` | Vault status, balances, pending dividends |
| `mint <amount>` | Mint BANK by depositing FLR |
| `burn <amount>` | Burn BANK to withdraw FLR |
| `claim` | Claim pending dividends to wallet |
| `compound` | Compound dividends into more BANK |

## Usage Examples

```bash
# Full protocol dashboard
/fb dashboard

# Check vault status and balances
/fb status

# Mint BANK with 100 FLR
/fb mint 100

# Burn 10 BANK for FLR
/fb burn 10

# Claim dividends
/fb claim

# Compound dividends
/fb compound
```

## Protocol Overview

### How BANK Works

1. **Minting:** Send FLR → receive BANK at `buyPrice()` rate
2. **Burning:** Send BANK → receive FLR at `sellPrice()` rate
3. **Spread:** Buy price > sell price (by design - value accrual)
4. **Dividends:** 10% fee on all activity → distributed to holders
5. **Compounding:** `reinvest()` auto-buys BANK with pending divs

### Value Accrual

BANK holders benefit from:
- FTSO delegation rewards → TVL grows
- FlareDrops → TVL grows
- Buy/sell/transfer fees → dividends to holders
- No new BANK minted from rewards → price appreciation

### Fee Structure

| Action | Fee | Distribution |
|--------|-----|--------------|
| Mint | 10% of FLR | 80% holders, 15% team, 5% DAO |
| Burn | 10% of FLR | 80% holders, 15% team, 5% DAO |
| Transfer | 1% burn + 1% fee | 80% holders, 15% team, 5% DAO |

## Dashboard Output

The dashboard shows:

- **Protocol TVL** - FB Main, DAO Treasury, LP positions, IBDP queue
- **BANK Token** - Supply, circulating, mint/burn prices, backing
- **DAO Treasury** - All token holdings with valuations
- **LP Positions** - Enosys V2, SparkDex V2, V3 positions
- **CDP Earn Pools** - Deposits, pending yields
- **Staking** - APS staking, rFLR vesting
- **Rewards** - FlareDrops, FTSO rewards, validator fees
- **Activity** - Mint/burn/transfer stats (all time, 30d, 7d, 24h)

## Contract Reference

| Contract | Address |
|----------|---------|
| BANK Token (FB Main) | `0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059` |
| IBDP | `0x90679234fe693b39bfdf5642060cb10571adc59b` |
| DAO Treasury | `0xaa68bc4bab9a63958466f49f5a58c54a412d4906` |

## Function Selectors

| Function | Selector |
|----------|----------|
| `buy(address)` | `0xf088d547` |
| `sell(uint256)` | `0x35a4f939` |
| `withdraw()` | `0x3ccfd60b` |
| `reinvest()` | `0xfdb5a03e` |
| `buyPrice()` | `0x8620410b` |
| `sellPrice()` | `0x4b750334` |

## Keystore

Default: `/home/node/clawd/skills/fblpmanager/data/clawd-wallet.json`
Agent wallet: `0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A`
