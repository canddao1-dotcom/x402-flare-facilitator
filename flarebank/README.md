# FlareBank Monitoring Tools

On-chain data queries for FlareBank DAO treasury and protocol stats.

## Scripts

### `dao-balance.mjs`
Pull live DAO treasury balances with formatted output.

```bash
cd scripts && node dao-balance.mjs
```

### `dao-balance-json.mjs`
Same data, JSON output for programmatic use.

```bash
node dao-balance-json.mjs
```

### `protocol-stats.mjs`
Protocol-wide stats: TVL, BANK supply, prices, CDP pool totals.

```bash
node protocol-stats.mjs
```

## What We Can Query

### Wallet Tokens
- FLR (native), WFLR, BANK, FXRP, sFLR, APS, CDP

### LP Positions
- V2 BANK/WFLR pool (LP tokens + underlying)
- V3 FXRP/stXRP position #28509

### CDP Earn Pools (with pending rewards!)
- FXRP Pool: deposit, pending CDP, pending FXRP
- WFLR Pool: deposit, pending CDP, pending WFLR

### Staking
- APS governance staking

## Key Addresses

| Contract | Address |
|----------|---------|
| DAO Treasury | `0xaa68bc4bab9a63958466f49f5a58c54a412d4906` |
| BANK Token | `0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059` |
| IBDP | `0x90679234fe693b39bfdf5642060cb10571adc59b` |
| FXRP CDP Pool | `0x2c817F7159c08d94f09764086330c96Bb3265A2f` |
| WFLR CDP Pool | `0x0Dd6daab4cB9A0ba6707Cf59DBfbc28cc33CA24A` |
| V2 LP | `0x5f29c8d049e47dd180c2b83e3560e8e271110335` |
| APS Staking | `0x7eb8ceb0f64d934a31835b98eb4cbab3ca56df28` |

## RPC Endpoint
```
https://flare-api.flare.network/ext/C/rpc
```
