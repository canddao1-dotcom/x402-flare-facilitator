---
name: wallet
description: Wallet operations for multiple networks (Flare, HyperEVM, Base). Check balances, send tokens, wrap/unwrap, approve spending. Triggers on "/wallet", "check balance", "send tokens".
---

# Wallet Skill

Unified interface for wallet operations across Flare, HyperEVM, and Base networks.

## Quick Command

```bash
node /home/node/clawd/skills/wallet/scripts/wallet.js <command> [options]
```

## Supported Networks

| Network | Chain ID | Native | Explorer |
|---------|----------|--------|----------|
| flare | 14 | FLR | flarescan.com |
| hyperevm | 999 | HYPE | explorer.hyperliquid.xyz |
| base | 8453 | ETH | basescan.org |

Use `--network <name>` to specify (default: flare)

## Subcommands

| Command | Description |
|---------|-------------|
| `balance [address]` | Check native and token balances |
| `send <amount> <token> to <address>` | Send native or tokens |
| `wrap <amount>` | Wrap native to wrapped token |
| `unwrap <amount>` | Unwrap to native |
| `approve <token> <spender>` | Approve token spending |
| `allowance <token> <spender>` | Check current allowance |
| `gas` | Current gas prices |
| `info <token>` | Token info lookup |
| `generate` | Generate new wallet |
| `networks` | List supported networks |

## Usage Examples

### Flare (default)
```bash
/wallet balance
/wallet balance 0xaa68bc4bab9a63958466f49f5a58c54a412d4906
/wallet balance --tokens
/wallet send 10 FLR to 0xRecipient
/wallet send 100 WFLR to 0xRecipient
/wallet wrap 100
/wallet unwrap 50
```

### Base
```bash
/wallet balance --network base
/wallet balance 0x... --network base --tokens
/wallet send 0.01 ETH to 0x... --network base
/wallet send 100 USDC to 0x... --network base
/wallet gas --network base
```

### HyperEVM
```bash
/wallet balance --network hyperevm
/wallet balance --network hyper --tokens
```

## Common Tokens

### Flare
| Token | Address | Decimals |
|-------|---------|----------|
| WFLR | `0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d` | 18 |
| BANK | `0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059` | 18 |
| sFLR | `0x12e605bc104e93B45e1aD99F9e555f659051c2BB` | 18 |
| FXRP | `0xad552a648c74d49e10027ab8a618a3ad4901c5be` | 6 |
| USD₮0 | `0xe7cd86e13AC4309349F30B3435a9d337750fC82D` | 6 |

### Base
| Token | Address | Decimals |
|-------|---------|----------|
| WETH | `0x4200000000000000000000000000000000000006` | 18 |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 |
| DAI | `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb` | 18 |
| AERO | `0x940181a94A35A4569E4529A3CDfB74e38FD98631` | 18 |

### HyperEVM
| Token | Address | Decimals |
|-------|---------|----------|
| fXRP | `0xd70659a6396285bf7214d7ea9673184e7c72e07e` | 6 |
| USDT0 | `0x3cBFE5AD65574a89F4E24D553E40Fc7EA5Af0e19` | 6 |

## Known Spenders (Flare)

| Name | Address | Purpose |
|------|---------|---------|
| enosys-v3-router | `0x5FD34090E9b195d8482Ad3CC63dB078534F1b113` | V3 swaps |
| enosys-v3-position | `0xd9770b1c7a6ccd33c75b5bcb1c0078f46be46657` | LP positions |
| sparkdex-v3-router | `0x7a57DF6665B5b4B9f8C555e19502333D0B89aD59` | SparkDex swaps |

## Security Notes

⚠️ **NEVER:**
- Store private keys in plain text
- Log private keys to console
- Share private keys in chat

✅ **ALWAYS:**
- Use encrypted keystores
- Verify addresses before sending
- Test with small amounts first

## Keystore

Default: `/home/node/clawd/skills/fblpmanager/data/clawd-wallet.json`
Agent wallet: `0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A`
