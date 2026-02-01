---
name: arb
description: Triangle arbitrage scanner and executor. Scan for profitable WFLR triangles across Enosys, SparkDex, Blazeswap. Triggers on "/arb", "arb scan", "arbitrage", "triangle arb", "check arb".
---

# Arb Scanner Skill

Lightweight triangle arbitrage scanner and executor for Flare DEXs.

## Features
- **Pure RPC** - No AI tokens burned during monitoring
- **Auto-discovery** - Finds pools via factory contracts
- **Multi-DEX** - Enosys V3, SparkDex V3.1, Blazeswap V2, Enosys V2
- **Low overhead** - ~10 RPC calls per scan
- **Auto-execution** - Triggers execution on >1% opportunities

## Usage

### Scanner

```bash
# Single scan (shows all triangles)
node /home/node/clawd/skills/arb-scanner/scripts/scanner.js once

# Run as daemon (polls every 15s)
node /home/node/clawd/skills/arb-scanner/scripts/scanner.js daemon
```

### Executor

```bash
# Execute pending alert from scanner
node /home/node/clawd/skills/arb-scanner/scripts/arb-executor.js execute

# Execute specific alert file
node /home/node/clawd/skills/arb-scanner/scripts/arb-executor.js execute --alert-file ./alert.json
```

## Config (in scanner.js)

| Setting | Default | Description |
|---------|---------|-------------|
| MIN_PROFIT_PCT | 0.5% | Minimum net profit to log |
| ALERT_THRESHOLD | 1.0% | Minimum profit to trigger brain alert |
| POLL_INTERVAL | 15000 | Milliseconds between scans (15s) |
| GAS_COST_FLR | 0.3 | Estimated gas for 3 swaps |
| ALERT_COOLDOWN | 300000 | Minimum ms between alerts (5 min) |

## Triangle Paths

Scans all combinations:
```
WFLR → X → Y → WFLR
```

Where X, Y ∈ {FXRP, sFLR, rFLR, USDT0, USDCe, stXRP, CDP, WETH, WBTC, BANK, APS}

## Output Files

### `data/opportunities.json`
All opportunities found (top 5):
```json
{
  "timestamp": 1706578200000,
  "opportunities": [{
    "path": ["WFLR", "FXRP", "USDT0", "WFLR"],
    "profitPct": 0.52,
    "netProfitPct": 0.35,
    "route": [...]
  }]
}
```

### `data/pending-alert.json`
Triggered when profit > ALERT_THRESHOLD:
```json
{
  "timestamp": 1706578200000,
  "type": "arb_opportunity",
  "profit": 1.23,
  "path": ["WFLR", "FXRP", "sFLR", "WFLR"],
  "route": [...],
  "read": false
}
```

### `data/executed.json`
Log of all execution attempts (success/failure).

## HEARTBEAT Integration

Add to HEARTBEAT.md:
```bash
# 1. Ensure daemon is running
/home/node/clawd/skills/arb-scanner/scripts/ensure-daemon.sh

# 2. Check for pending alerts
cat /home/node/clawd/skills/arb-scanner/data/pending-alert.json 2>/dev/null
```

When `pending-alert.json` exists with `read: false`, execute the arb!

## DEXs Monitored

| DEX | Type | Factory | Router |
|-----|------|---------|--------|
| Enosys | V3 | `0x17aa157ac8c54034381b840cb8f6bf7fc355f0de` | `0x5FD34090E9b195d8482Ad3CC63dB078534F1b113` |
| SparkDex | V3.1 | `0x8A2578d23d4C532cC9A98FaD91C0523f5efDE652` | `0x8a1E35F5c98C4E85B36B7B253222eE17773b2781` |
| Blazeswap | V2 | `0x440602f459D7Dd500a74528003e6A20A46d6e2A6` | Direct pair swaps |
| Enosys V2 | V2 | `0x28b70f6Ed97429E40FE9a9CD3EB8E86BCBA11dd4` | Direct pair swaps |

## Execution Flow

1. Scanner detects profitable triangle (>1% after gas)
2. Writes alert to `pending-alert.json`
3. HEARTBEAT checks for alerts
4. Agent calls `arb-executor.js execute`
5. Executor:
   - Loads alert
   - Marks as read (prevents duplicate)
   - Executes each leg sequentially
   - Logs result to `executed.json`
   - Deletes alert on success

## Tokens Monitored

| Token | Address | Decimals |
|-------|---------|----------|
| WFLR | `0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d` | 18 |
| sFLR | `0x12e605bc104e93B45e1aD99F9e555f659051c2BB` | 18 |
| rFLR | `0x26d460c3Cf931Fb2014FA436a49e3Af08619810e` | 18 |
| FXRP | `0xAd552A648C74D49E10027AB8a618A3ad4901c5bE` | 6 |
| stXRP | `0x4C18Ff3C89632c3Dd62E796c0aFA5c07c4c1B2b3` | 6 |
| USDT0 | `0xe7cd86e13AC4309349F30B3435a9d337750fC82D` | 6 |
| USDCe | `0xfbda5f676cb37624f28265a144a48b0d6e87d3b6` | 6 |
| CDP | `0x6Cd3a5Ba46FA254D4d2E3C2B37350ae337E94a0F` | 18 |
| BANK | `0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059` | 18 |
| APS | `0xff56eb5b1a7faa972291117e5e9565da29bc808d` | 18 |
| WETH | `0x1502FA4be69d526124D453619276FacCab275d3D` | 18 |
| WBTC | `0x5D9ab5522c64E1F6ef5e3627ECCc093f56167818` | 8 |

## Swap Scripts

Direct access to individual DEX swaps:
```bash
# Enosys V3
node skills/wallet/scripts/swap-v3.js swap --keystore <path> --from WFLR --to FXRP --amount 100

# SparkDex V3.1
node skills/wallet/scripts/swap-sparkdex.js swap --keystore <path> --from WFLR --to FXRP --amount 100

# Blazeswap V2
node skills/wallet/scripts/swap-blazeswap.js swap --keystore <path> --from WFLR --to FXRP --amount 100
```

## Manual Execution Example

If scanner finds: `WFLR → FXRP → sFLR → WFLR` at 1.5%

```bash
# Leg 1: WFLR → FXRP on Enosys V3
/swap WFLR FXRP 100

# Leg 2: FXRP → sFLR on SparkDex
/swap spark FXRP sFLR <amount>

# Leg 3: sFLR → WFLR on Blazeswap
/swap blaze sFLR WFLR <amount>
```
