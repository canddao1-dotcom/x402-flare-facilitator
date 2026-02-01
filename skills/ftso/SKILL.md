---
name: price
description: Get real-time token prices from Flare FTSO oracle. Query current prices, historical data, list supported symbols. Triggers on "/price", "ftso price", "token price", "what's the price of".
---

# Price Skill (FTSO)

Unified interface for FTSO price feeds on Flare network.

## Quick Command

```bash
node /home/node/clawd/skills/ftso/scripts/ftso.js <symbol>
```

## Subcommands

| Command | Description |
|---------|-------------|
| `<symbol>` | Get current price for symbol |
| `<sym1> <sym2>...` | Get multiple prices at once |
| `history <sym> [period]` | Historical price data |
| `list` | List all supported symbols |

## Usage Examples

```bash
# Single price
/price FLR

# Multiple prices
/price FLR XRP ETH BTC

# JSON output
/price FLR --json

# Historical data
/price history FLR 7d
/price history XRP 30d

# List all symbols
/price list
```

## Symbol Aliases

These aliases are automatically resolved:

| Alias | Resolves To |
|-------|-------------|
| WFLR | FLR |
| SFLR | FLR |
| FXRP | XRP |
| USD₮0 | USDT |
| USDT0 | USDT |

## Supported Symbols

### Crypto
- FLR, XRP, ETH, BTC, LTC
- XLM, DOGE, ADA, ALGO
- ARB, AVAX, BNB, FIL
- LINK, MATIC, SOL
- USDC, USDT

## Data Source

- **On-chain only** - no external APIs
- **FtsoV2 Contract** - official Flare oracle
- **~3 second updates** - near real-time prices

## Historical Data

The history daemon polls FTSO every 5 minutes and stores locally:

```bash
# Start daemon (if not running)
/home/node/clawd/skills/ftso-history/scripts/ensure-daemon.sh

# Query history
/price history FLR 7d
/price history XRP 30d
```

Periods: `1d`, `7d`, `14d`, `30d`, `90d`

## Integration

Use in other scripts:

```javascript
const { getPrice, getPrices } = require('/home/node/clawd/skills/ftso/scripts/price.js');

const flrPrice = await getPrice('FLR');
const prices = await getPrices(['FLR', 'XRP', 'ETH']);
```

## Contract Reference

| Contract | Address |
|----------|---------|
| FlareContractRegistry | `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` |
| FtsoV2 | Resolved dynamically from registry |
