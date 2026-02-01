# Wallets Skill

**Trigger:** `/wallets`, `/wallet`, `check balance`, `send tokens`, `receive tokens`, `wallet setup`

Manage your agent's multi-chain wallets across Flare, Base, HyperEVM, and Solana.

## Commands

### Check Balances
```bash
node scripts/wallets.js balance
node scripts/wallets.js balance --network flare
node scripts/wallets.js balance --token USDT  # Check specific token
```

### Send Tokens
```bash
# Send native tokens
node scripts/wallets.js send --to 0x... --amount 10 --network flare

# Send ERC20 tokens
node scripts/wallets.js send --to 0x... --amount 100 --token USDT --network flare

# With confirmation (default: requires --confirm)
node scripts/wallets.js send --to 0x... --amount 10 --network flare --confirm
```

### Receive (Show Addresses)
```bash
node scripts/wallets.js receive
node scripts/wallets.js receive --network flare
node scripts/wallets.js receive --qr  # Show QR codes (if terminal supports)
```

### Setup New Wallet
```bash
node scripts/wallets.js setup --name "MyAgent"
node scripts/wallets.js setup --import "0x..."  # Import existing key
```

### Export/Backup
```bash
node scripts/wallets.js export --format json
node scripts/wallets.js export --format seed  # Show seed phrase (CAREFUL!)
```

## Environment Variables

Required:
- `WALLET_KEYSTORE_PATH` - Path to keystore directory
- `WALLET_PASSPHRASE` - Passphrase to decrypt keystore

Optional:
- `FLARE_RPC` - Flare RPC URL (default: https://flare-api.flare.network/ext/C/rpc)
- `BASE_RPC` - Base RPC URL (default: https://mainnet.base.org)
- `HYPEREVM_RPC` - HyperEVM RPC URL (default: https://rpc.hyperliquid.xyz/evm)
- `SOLANA_RPC` - Solana RPC URL (default: https://api.mainnet-beta.solana.com)

## Supported Networks

| Network | Chain ID | Currency | Type |
|---------|----------|----------|------|
| Flare | 14 | FLR | EVM |
| Base | 8453 | ETH | EVM |
| HyperEVM | 999 | HYPE | EVM |
| Solana | - | SOL | Ed25519 |

## Supported Tokens (Flare)

| Token | Address | Decimals |
|-------|---------|----------|
| WFLR | 0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d | 18 |
| USD₮0 | 0xe7cd86e13AC4309349F30B3435a9d337750fC82D | 6 |
| FXRP | 0xAd552A648C74D49E10027AB8a618A3ad4901c5bE | 6 |
| sFLR | 0x12e605bc104e93B45e1aD99F9e555f659051c2BB | 18 |

## Safety Features

- **Confirmation required** for all sends (use `--confirm` flag)
- **Balance check** before sending
- **Gas estimation** to prevent failed transactions
- **Address validation** to prevent mistakes

## Example Usage

### Agent checking balances:
```
/wallets balance
```
Output:
```
💰 Wallet Balances
━━━━━━━━━━━━━━━━━━━
📍 0xDb35...ea9A

Flare:    125.50 FLR ($2.51)
Base:     0.05 ETH ($150.00)
HyperEVM: 10.00 HYPE
Solana:   2.5 SOL ($250.00)

Tokens (Flare):
  USD₮0:  50.00
  FXRP:   1,000.00
  sFLR:   100.00
```

### Agent sending tokens:
```
/wallets send 10 FLR to 0x1234...
```
Output:
```
📤 Send Confirmation
━━━━━━━━━━━━━━━━━━━
Amount: 10 FLR
To: 0x1234...5678
Network: Flare
Gas: ~0.001 FLR

⚠️ Reply "confirm" to proceed
```
