---
name: bankrate
description: BANK token price checker. Compare LP market price vs contract mint/burn rates, check arbitrage spread. Triggers on "/bankrate", "bank price", "bank rate", "bank lp price".
---

# BANK Rate Skill

Check BANK token prices from both LP market and contract rates.

## Usage

```bash
node /home/node/clawd/skills/bankrate/scripts/bankrate.js
```

## Output
- **LP Price:** BANK price derived from Enosys V2 BANK/WFLR pool reserves
- **Contract Buy Price:** Price to mint BANK (send FLR, receive BANK)
- **Contract Sell Price:** Price to burn BANK (send BANK, receive FLR)
- **Spread:** Difference between buy and sell prices
- **LP vs Contract:** Premium/discount of LP price vs contract rates

## Contracts
| Contract | Address |
|----------|---------|
| BANK Token | `0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059` |
| Enosys V2 BANK/WFLR | `0x5f29c8d049e47dd180c2b83e3560e8e271110335` |
