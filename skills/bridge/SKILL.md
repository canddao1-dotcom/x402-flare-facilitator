# Bridge Skill

Cross-chain bridging via LayerZero (FAssets Bridge).

## Status: WORKING

## Triggers
- `/bridge`
- `bridge tokens`
- `bridge to hyperliquid`
- `bridge fxrp`
- `cross chain`

## Commands

### `/bridge status`
Check pending bridges and their delivery status.

### `/bridge quote <token> <amount>`
Get a quote for bridging tokens.
- `token`: FXRP, USDT0, FLR
- `amount`: Amount to bridge

Example: `/bridge quote FXRP 10`

### `/bridge send <token> <amount> [recipient]`
Execute a bridge transfer.
- `token`: FXRP, USDT0, FLR
- `amount`: Amount to bridge
- `recipient`: (optional) Destination address, defaults to same address

Example: `/bridge send FXRP 10`

### `/bridge check [txHash]`
Check delivery status of a specific bridge transaction.

Example: `/bridge check 0x1df1d092...`

### `/bridge tokens`
List supported tokens and their OFT adapters.

### `/bridge daemon start|stop|status`
Control the bridge monitor daemon that tracks pending bridges.

## Supported Routes

| From | To | Tokens | Fee |
|------|-----|--------|-----|
| Flare | HyperEVM | FXRP | ~11 FLR |
| Flare | HyperEVM | USDT0 | TBD |
| Flare | HyperEVM | FLR | TBD |

## Architecture

### FAssets Bridge (LayerZero OFT)
- Uses OFT Adapter pattern (lock on source, mint on dest)
- HyperEVM endpoint ID: 30367
- Delivery time: 1-5 minutes typically

### Contracts (Verified)
| Token | OFT Adapter |
|-------|-------------|
| FXRP | `0xd70659a6396285BF7214d7Ea9673184e7C72E07E` |

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/fassets-bridge.js` | Quote and execute bridges |
| `scripts/bridge-monitor.js` | Daemon to track pending bridges |
| `scripts/check-delivery.js` | Check if tokens arrived on dest |

## Data Files

| File | Purpose |
|------|---------|
| `data/pending-bridges.json` | Tracks bridges awaiting delivery |
| `data/bridge-history.json` | Completed bridge history |
