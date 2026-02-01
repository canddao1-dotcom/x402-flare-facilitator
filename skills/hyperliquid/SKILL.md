# Hyperliquid Skill

Trade perpetual futures on Hyperliquid L1.

## Status: IN DEVELOPMENT

## Agent Wallet
- **Address:** `0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A`
- **Current Balance:** 0 USDC (need to bridge funds)

## API Endpoints
- Info: `https://api.hyperliquid.xyz/info`
- Exchange: `https://api.hyperliquid.xyz/exchange`

## Supported Markets (Selected)
| Asset | Max Leverage | Notes |
|-------|--------------|-------|
| BTC | 40x | Most liquid |
| ETH | 25x | |
| XRP | 20x | Flare ecosystem |
| SOL | 20x | |
| HYPE | 10x | HL native token |

## Authentication
Hyperliquid uses EIP-712 signed messages. Need to:
1. Build typed data structure
2. Sign with wallet private key
3. Submit signed action

## Triggers
- `/hl`
- `/hyperliquid`
- `trade on hyperliquid`
- `hl position`

## Commands (Planned)
```bash
# Check account
node skills/hyperliquid/scripts/hl.js account

# Get market info
node skills/hyperliquid/scripts/hl.js markets

# Place order
node skills/hyperliquid/scripts/hl.js order --asset BTC --side long --size 0.01 --leverage 10

# Check positions
node skills/hyperliquid/scripts/hl.js positions
```

## Deposit Flow
1. Get Stargate USDT on Flare
2. Bridge to Hyperliquid via Stargate
3. Transfer from L1 to perps account
4. Trade!
