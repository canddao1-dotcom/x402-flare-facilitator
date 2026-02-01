---
name: flarebank-vault
description: "INTERNAL LIBRARY - Do not trigger directly. Implementation for fb skill. Use /fb for BANK operations."
internal: true
---

# FlareBank Vault Skill

**⚠️ INTERNAL LIBRARY** - Use via `/fb` skill, not directly.

Implements FlareBank main vault operations (mint BANK, burn BANK, claim/compound dividends).

## Quick Commands

```bash
# Check status (balance, pending divs, prices)
node /home/node/clawd/skills/flarebank-vault/scripts/vault.js status

# Mint BANK (send FLR, receive BANK)
node /home/node/clawd/skills/flarebank-vault/scripts/vault.js mint --amount 20

# Burn BANK (send BANK, receive FLR)
node /home/node/clawd/skills/flarebank-vault/scripts/vault.js burn --amount 1

# Claim dividends to wallet
node /home/node/clawd/skills/flarebank-vault/scripts/vault.js claim

# Compound dividends into BANK
node /home/node/clawd/skills/flarebank-vault/scripts/vault.js compound
```

## Contract Details

| Item | Value |
|------|-------|
| Contract | `0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059` |
| Token | BANK (18 decimals) |
| Network | Flare Mainnet |

## Functions

| Function | Selector | Purpose |
|----------|----------|---------|
| `buy(address _referredBy) payable` | `0xf088d547` | Mint BANK with FLR |
| `sell(uint256 _amountOfTokens)` | `0x35a4f939` | Burn BANK for FLR |
| `withdraw()` | `0x3ccfd60b` | Claim pending dividends |
| `reinvest()` | `0xfdb5a03e` | Compound divs → BANK |
| `buyPrice()` | `0x8620410b` | Current mint price |
| `sellPrice()` | `0x4b750334` | Current burn price |
| `balanceOf(address)` | `0x70a08231` | BANK balance |

## How It Works

1. **Minting:** Send FLR → receive BANK at `buyPrice()` rate
2. **Burning:** Send BANK → receive FLR at `sellPrice()` rate  
3. **Spread:** Buy price >> sell price (by design - value accrual)
4. **Dividends:** 10% fee on all buys/sells → distributed to holders
5. **Compounding:** `reinvest()` auto-buys BANK with pending divs

## Value Accrual

BANK holders benefit from:
- FTSO delegation rewards → TVL grows
- FlareDrops → TVL grows
- Buy/sell fees → dividends to holders
- No new BANK minted from rewards → price appreciation
