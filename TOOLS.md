# TOOLS.md - Local Notes

## Cross-Chain Bridging (Stargate V2)

### Flare Network LayerZero
- **Endpoint:** `0x1a44076050125825900e736c501f859c50fE728c`
- **Endpoint ID:** 30295

### Stargate V2 on Flare
| Contract | Address |
|----------|---------|
| StargateOFTUSDT | `0x1C10CC06DC6D35970d1D53B2A23c76ef370d4135` |
| StargateOFTUSDC | `0x77C71633C34C3784ede189d74223122422492a0f` |
| StargateOFTETH | `0x8e8539e4CcD69123c623a106773F2b0cbbc58746` |
| TokenMessaging | `0x45d417612e177672958dC0537C45a8f8d754Ac2E` |
| Stargate USDT (underlying) | `0x0B38e83B86d491735fEaa0a791F65c2B99535396` |

### ⚠️ Two USDTs on Flare!
- **Stargate USDT** (`0x0B38...`) - for bridging
- **Native USD₮0** (`0xe7cd...`) - NOT bridgeable directly

### Hyperliquid (Endpoint ID: 30150)
| Contract | Address |
|----------|---------|
| StargateOFTUSDT | `0x8619bA1B324e099CB2227060c4BC5bDEe14456c6` |
| StargateOFTUSDC | `0x01A7c805cc47AbDB254CD8AaD29dE5e447F59224` |

### HyperEVM Network
- **Chain ID:** 999
- **RPC:** https://rpc.hyperliquid.xyz/evm
- **Currency:** HYPE
- **Display Name:** HyperEVM
- **FXRP Token:** `0xd70659a6396285bf7214d7ea9673184e7c72e07e`

### Base Network
- **Chain ID:** 8453
- **RPC:** https://mainnet.base.org
- **Currency:** ETH
- **Explorer:** https://basescan.org

| Token | Address | Decimals |
|-------|---------|----------|
| WETH | `0x4200000000000000000000000000000000000006` | 18 |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6 |
| USDbC | `0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA` | 6 |
| DAI | `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb` | 18 |
| cbETH | `0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22` | 18 |
| AERO | `0x940181a94A35A4569E4529A3CDfB74e38FD98631` | 18 |

### FAssets Bridge (RECOMMENDED for Flare → Hyperliquid)
**URL:** https://fasset.oracle-daemon.com/flare/bridge

Supports native tokens via LayerZero (NOT Stargate):
- **FXRP** → Hyperliquid (Trading Platform or HyperEVM)
- **USD₮0** → Hyperliquid (native Tether, 0xe7cd...)
- **FLR** → Hyperliquid

Destinations:
1. **Hyperliquid Trading Platform** - for perps trading
2. **HyperEVM** - for DeFi on Hyperliquid's EVM

Fee: LayerZero cross-chain fee paid in FLR

### FAssets Bridge Contracts (VERIFIED 2026-01-30)
| Token | OFT Adapter | Destination EID |
|-------|-------------|-----------------|
| FXRP | `0xd70659a6396285BF7214d7Ea9673184e7C72E07E` | 30367 (HyperEVM) |
| USD₮0 | TBD | TBD |
| FLR | TBD | TBD |

### Bridge Script
```bash
# Quote
node skills/bridge/scripts/fassets-bridge.js quote --token FXRP --amount 10 --recipient 0x...

# Execute (uses plaintext wallet)
node skills/bridge/scripts/fassets-bridge.js send --keystore <path> --token FXRP --amount 10 --recipient 0x...
```

### LayerZero Options
```
EXTRA_OPTIONS = 0x00030100110100000000000000000000000000030d4001001303000000000000000000000000000000030d40
```
Gas limit: 200,000 for execution on HyperEVM

### Bridge Flow (FXRP → Hyperliquid)
~~1. Swap FXRP → Stargate USDT on Flare~~
~~2. Bridge Stargate USDT to Hyperliquid~~
**Use FAssets Bridge instead:**
1. Go to fasset.oracle-daemon.com/flare/bridge
2. Connect wallet, select FXRP or USD₮0
3. Choose destination (Trading Platform for perps)
4. Bridge directly via LayerZero

---

## Rysk Finance (Covered Calls on HyperEVM)

### Overview
Sell covered calls on fXRP to earn volatility premium via RFQ auction.
- **App:** https://app.rysk.finance/earn/999/fXRP/fXRP/USDT0/call/
- **Network:** HyperEVM (Chain 999)
- **Settlement:** USDT0
- **APR Range:** 4% - 90%

### fXRP Vault Parameters
| Parameter | Value |
|-----------|-------|
| Token | fXRP (`0xd70659a6396285bf7214d7ea9673184e7c72e07e`) |
| Min Trade | 1,000 fXRP |
| Max Trade | 100,000 fXRP |
| Premium | Paid upfront (instant) |

### How It Works
1. Deposit fXRP and choose strike + expiry
2. RFQ auction finds best premium quote
3. Premium paid immediately to wallet
4. At expiry: Keep fXRP if price < strike, or get strike price in USDT0

### Skill Commands
```bash
# Check status and balances
node skills/rysk/scripts/rysk.js status --address 0x...

# Get premium estimate
node skills/rysk/scripts/rysk.js quote --amount 1000 --strike 2.0 --expiry 7d

# View positions
node skills/rysk/scripts/rysk.js positions --address 0x...
```

### Strategy Tips
- **OTM calls** (strike > current price): Lower premium, keep fXRP
- **ATM calls** (strike ≈ price): Higher premium, more assignment risk
- **Best for:** Income generation, neutral/slightly bullish outlook

---

## My Wallet (Canddao Jr)
- **Address:** `0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A`
- **Purpose:** Agent operations wallet
- **Keystore:** `/home/node/.agent-keystore.json` (encrypted, 0600)
- **Password:** `/home/node/.agent-keystore-password` (0600)
- **NEVER FORGET THIS ADDRESS**

### ⚠️ OLD WALLET (COMPROMISED - DO NOT USE)
- `0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A` - Key leaked to GitHub, drained Jan 31 2026

---

## FlareBank Protocol

### Founder Wallet
- **Address:** `0x3c1c84132dfdef572e74672917700c065581871d`
- Holdings considered unsellable (locked)

### DAO Treasury
- **Address:** `0xaa68bc4bab9a63958466f49f5a58c54a412d4906`

### Infrastructure
| Component | Address/ID |
|-----------|------------|
| FTSO | `0xfa9368CFbee3b070d8552d8e75Cdc0fF72eFAC50` |
| Validator 1 | `NodeID-GoVQ17h7kU1H3pKBZHF3cu2NyTBichnfg` |
| Validator 2 | `NodeID-Mhm29H5a3Xq1jG9UpVoqo5mFXqqL3WpUV` |
| Identity | `0x59b1aB4aD053dE8f9C9a0660F6a995f37D40f03d` |

### Core Contracts
| Contract | Address |
|----------|---------|
| BANK Token (FB Main) | `0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059` |
| IBDP | `0x90679234fe693b39bfdf5642060cb10571adc59b` |
| DAO Treasury | `0xaa68bc4bab9a63958466f49f5a58c54a412d4906` |

### Flare Reward Contracts
| Contract | Address |
|----------|---------|
| FlareDrop (DistributionToDelegators) | `0x9c7A4C83842B29bB4A082b0E689CB9474BD938d0` |
| FtsoRewardManager | `0x85627d71921AE25769f5370E482AdA5E1e418d37` |
| FlareContractRegistry | `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` |

### Token Contracts (CANONICAL - always use these)
| Token | Address | Decimals |
|-------|---------|----------|
| WFLR | `0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d` | 18 |
| FXRP | `0xAd552A648C74D49E10027AB8a618A3ad4901c5bE` | 6 |
| sFLR | `0x12e605bc104e93B45e1aD99F9e555f659051c2BB` | 18 |
| rFLR | `0x26d460c3Cf931Fb2014FA436a49e3Af08619810e` | 18 |
| USD₮0 | `0xe7cd86e13AC4309349F30B3435a9d337750fC82D` | 6 |
| CDP | `0x6Cd3a5Ba46FA254D4d2E3C2B37350ae337E94a0F` | 18 |
| APS | `0xff56eb5b1a7faa972291117e5e9565da29bc808d` | 18 |
| earnXRP | `0xe533e447fd7720b2f8654da2b1953efa06b60bfa` | 6 |

---

## Sceptre Finance (Liquid Staking)

### Contracts
| Contract | Address |
|----------|---------|
| sFLR Token (Proxy) | `0x12e605bc104e93B45e1aD99F9e555f659051c2BB` |
| sFLR Implementation | `0x21c8f8def0a82000558eb5ceb5d5887adffb6256` |
| Staking Router | `0xEcB4b9c9C6d33b4C5B98041DCEc84258bB04d233` |
| Admin | `0x1e3beaf840b96353a8be0a75b6dbb176dced66ce` |

### Key Parameters
- **Unstaking Period:** 14.5 days
- **TVL:** ~2.1B FLR staked
- **Exchange Rate:** ~1.7527 FLR per sFLR (accrues over time)

### Interface (Verified Jan 2026)
| Function | Selector | Purpose |
|----------|----------|---------|
| `submit()` payable | `0x5bcb2fc6` | Stake FLR (or send FLR directly) |
| `submitWrapped(uint256)` | `0xff52a2a4` | Stake WFLR |
| `requestUnlock(uint256 shareAmount)` | `0xc9d2ff9d` | Request unstake (14.5 day wait) |
| `getUnlockRequestCount(address)` | `0xc423f9a8` | Check pending unlock requests |
| `getPooledFlrByShares(uint256)` | view | sFLR → FLR rate |
| `getSharesByPooledFlr(uint256)` | view | FLR → sFLR rate (BEFORE fee!) |

```solidity
// Staking - use submit() or send FLR directly to sFLR contract
// ⚠️ 4.4% STAKING FEE applies (not shown in getSharesByPooledFlr)
sFLR.submit{value: amount}()  // or wallet.sendTransaction({ to: sFLR_ADDRESS, value: amount })

// Unstaking - 14.5 day unlock period
sFLR.requestUnlock(shareAmount)  // Queue unstake
// After 14.5 days: FLR may be auto-sent (claim mechanism TBD - testing Feb 13, 2026)
```

### ⚠️ STAKING FEE WARNING
- **Staking fee: ~4.4%** (applied on deposit, not shown in getSharesByPooledFlr)
- Contract rate: 0.5705 sFLR/FLR
- Actual rate: 0.5454 sFLR/FLR
- **STAKE-SELL arb is NOT profitable** (fee > DEX premium)

### 🟢 ZERO-FEE STAKING WINDOWS
There are periodic **zero-fee staking windows** when the fee is waived!
- During these windows, STAKE-SELL arb IS profitable (~0.3%)
- Use `/sflr` skill to monitor for these windows

```bash
# Check current status and fee
node /home/node/clawd/skills/sflr/scripts/sflr.js status

# Monitor for zero-fee windows (daemon)
node /home/node/clawd/skills/sflr/scripts/sflr.js monitor
```

### sFLR Arbitrage Scanner
```bash
# Run arb analysis
node skills/arb-scanner/scripts/sflr-arb.js

# JSON output
node skills/arb-scanner/scripts/sflr-arb.js json

# Check history
node skills/arb-scanner/scripts/sflr-arb.js history
```

**Arb Strategies:**
1. **STAKE-SELL** (instant): Stake FLR → Sell sFLR on Blazeswap (profitable if DEX premium > ~0.1%)
2. **BUY-REDEEM** (14.5d wait): Buy sFLR on Blazeswap → Redeem on Sceptre (need ~20%+ APY)

### sFLR DEX Pools
| DEX | Pool | Fee | TVL |
|-----|------|-----|-----|
| SparkDex V3.1 | `0xc9baba3f36ccaa54675deecc327ec7eaa48cb97d` | 0.01% | ~$1.6M |
| Enosys V3 | `0x25b4f3930934f0a3cbb885c624ecee75a2917144` | 0.05% | ~$270k |
| Blazeswap V2 | `0x3F50F880041521738fa88C46cDF7e0d8Eeb11Aa2` | 0.3% | ~$700k |

**Best venue for STAKE-SELL arb:** SparkDex V3.1 (lowest fee, deepest liquidity)

---

## Upshift Finance (Yield Vaults)

### FXRP Vault
| Contract | Address |
|----------|---------|
| Vault (Proxy) | `0x373D7d201C8134D4a2f7b5c63560da217e3dEA28` |
| Implementation | `0xc689cc6441146f7c4986ed4f0e1eb6fc382859b2` |
| Share Token (earnXRP) | `0xe533e447fd7720b2f8654da2b1953efa06b60bfa` |
| Asset (FXRP) | `0xAd552A648C74D49E10027AB8a618A3ad4901c5bE` |
| Owner | `0xe97e537c4711002058ab8C37131db7f32eD74b5c` |
| Proxy Admin | `0xe6581c9a6eb8e37351136eb24bce8fc66e2df573` |

### Interface (Non-standard, NOT ERC4626)
```solidity
// Deposits - requires FXRP approval first
function deposit(address token, uint256 amount, address account)

// Redemptions
function instantRedeem(uint256 wNLPAmount, address to) returns (uint256)
function requestRedeem(uint256 _shares, address _token)

// Management
function chargeManagementFee()
```

### Notes
- Deposit fee: ~0.3%
- Share ratio: ~1:1 FXRP:earnXRP at deposit
- Two-step redemption: instant or request/claim
- Uses TransparentUpgradeableProxy pattern

---

## Enosys Loans (Liquity V2 Fork)

### CDP Token
| Token | Address | Decimals |
|-------|---------|----------|
| CDP Dollar | `0x6Cd3a5Ba46FA254D4d2E3C2B37350ae337E94a0F` | 18 |

### FXRP Branch
| Contract | Address |
|----------|---------|
| BorrowerOperations | `0x18139E09Fb9a683Dd2c2df5D0edAD942c19CE912` |
| TroveManager | `0xc46e7d0538494FEb82b460b9723dAba0508C8Fb1` |
| StabilityPool | `0x2c817F7159c08d94f09764086330c96Bb3265A2f` |
| PriceFeed | `0xFc35d431Ce1445B9c79ff38594EF454618D2Ec49` |

### WFLR Branch
| Contract | Address |
|----------|---------|
| BorrowerOperations | `0x19b154D5d20126a77309ae01931645a135E4E252` |
| TroveManager | `0xB6cB0c5301D4E6e227Ba490cee7b92EB954ac06D` |
| StabilityPool | `0x0Dd6daab4cB9A0ba6707Cf59DBfbc28cc33CA24A` |

### Protocol Parameters
- MCR (Min Collateral Ratio): 110%
- CCR (Critical Collateral Ratio): 150%

### Stability Pool Interface
```solidity
// Deposit to earn
function provideToSP(uint256 _topUp, bool _doClaim)

// Withdraw
function withdrawFromSP(uint256 _amount, bool _doClaim)

// View positions
function getCompoundedBoldDeposit(address) → current CDP
function getDepositorYieldGain(address) → pending CDP yield
function getDepositorCollGain(address) → pending collateral
```

### BorrowerOperations Interface
```solidity
function openTrove(
  address _owner, uint256 _ownerIndex, uint256 _collAmount,
  uint256 _boldAmount, uint256 _upperHint, uint256 _lowerHint,
  uint256 _annualInterestRate, uint256 _maxUpfrontFee,
  address _addManager, address _removeManager, address _receiver
) returns (uint256 troveId)

function adjustTrove(
  uint256 _troveId, uint256 _collChange, bool _isCollIncrease,
  uint256 _boldChange, bool _isDebtIncrease, uint256 _maxUpfrontFee
)
```

---

## Spectra Finance (Yield Trading)

### stXRP Pool (Maturity: Mar 05, 2026)
| Contract | Address |
|----------|---------|
| Pool (Curve AMM) | `0xa65a736bcf1f4af7a8f353027218f2d54b3048eb` |
| PT (Principal Token) | `0x097Dd93Bf92bf9018fF194195dDfCFB2c359335e` |
| YT (Yield Token) | `0x46f0C7b81128e031604eCb3e8A7E28dd3F8A50C9` |
| IBT (stXRP) | `0x4C18Ff3C89632c3Dd62E796c0aFA5c07c4c1B2b3` |
| Underlying | FXRP |

### sFLR Pool (Maturity: May 17, 2026)
| Contract | Address |
|----------|---------|
| Pool (Curve AMM) | `0x5d31ef52e2571294c91f01a3d12bf664d2951666` |
| PT (Principal Token) | `0x14613BFc52F98af194F4e0b1D23fE538B54628f3` |
| IBT (sw-sFLR) | `0xB9003d5bEd06afD570139d21c64817298DD47eC1` |
| Underlying | WFLR |

### PT Token Interface
```solidity
// Deposit IBT to mint PT + YT (equal amounts)
function depositIBT(uint256 ibts, address ptReceiver, address ytReceiver) returns (uint256)

// Preview deposit output
function previewDepositIBT(uint256 ibts) view returns (uint256)

// Redeem PT for IBT (at or after maturity)
function redeemForIBT(uint256 shares, address receiver, address owner) returns (uint256)
```

### Pool Interface (Curve-style)
```solidity
// coins[0] = IBT, coins[1] = PT
function get_dy(int128 i, int128 j, uint256 dx) view returns (uint256)
function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) returns (uint256)
function add_liquidity(uint256[2] amounts, uint256 min_mint) returns (uint256)
function remove_liquidity_one_coin(uint256 amount, int128 i, uint256 min) returns (uint256)
```
| USDC.e | `0xfbda5f676cb37624f28265a144a48b0d6e87d3b6` | 6 |

⚠️ **CRITICAL: USD₮0 vs USDC.e**
- USD₮0 = `0xe7cd86...` (Stargate USDT)
- USDC.e = `0xfbda5f...` (Bridged USDC)
- **DO NOT CONFUSE** - wrong address = wrong decimals = 0 display bug

### LP Positions
| Pool | Contract/ID | DEX | Range | Owner |
|------|-------------|-----|-------|-------|
| V2 BANK/WFLR (Enosys) | `0x5f29c8d049e47dd180c2b83e3560e8e271110335` | Enosys | - | DAO |
| V2 BANK/WFLR (SparkDex) | `0x0f574fc895c1abf82aeff334fa9d8ba43f866111` | SparkDex | - | DAO |
| V3 FXRP/stXRP | Position #28509 | Enosys | -150 to 170 | DAO |
| V3 sFLR/WFLR | Position #34935 | Enosys | 5280 to 5870 (±3%) | Agent |
| V3 CDP/USDT0 | Position #34936 | Enosys | -276820 to -275830 (±5%) | Agent |
| V3 WFLR/FXRP | Position #34937 | Enosys | -328680 to -327720 (±5%) | Agent |
| V3 WFLR/USDT0 | Position #34938 | Enosys | -322500 to -321360 (±5%) | Agent |
| V3 WFLR/FXRP | Position #34964 | Enosys | -328620 to -327840 (±3.9%) | Agent |
| V3 sFLR/WFLR | Position #34965 | Enosys | 5230 to 5920 (±3.4%) | Agent |
| V3 WFLR/FXRP | Position #34964 | Enosys | -328620 to -327840 (±3.9%) | Agent |
| V3 sFLR/WFLR | Position #34965 | Enosys | 5230 to 5920 (±3.4%) | Agent |

### Enosys V3 Contracts
| Contract | Address |
|----------|---------|
| SwapRouter | `0x5FD34090E9b195d8482Ad3CC63dB078534F1b113` |
| Position Manager | `0xd9770b1c7a6ccd33c75b5bcb1c0078f46be46657` |
| Factory | `0x17aa157ac8c54034381b840cb8f6bf7fc355f0de` |
| Quoter | `0x0A32EE3f66cC9E68ffb7cBeCf77bAef03e2d7C56` |
| Universal Router | `0x17ACa82378c2859E40d84a373b49eE0B318020C4` |
| stXRP/FXRP Pool | `0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770` |

### Enosys V2 Contracts (BANK)
| Contract | Address |
|----------|---------|
| Factory | `0x28b70f6Ed97429E40FE9a9CD3EB8E86BCBA11dd4` |
| BANK/WFLR Pair | `0x5f29c8d049e47dd180c2b83e3560e8e271110335` |
| Router | **TODO: Need to find** |

**V3 Position Query:**
```
positions(uint256 tokenId) => 0x99fbab88
slot0() => 0x3850c7bd (on pool contract)
```

### Enosys CDP Earn Pools (Stability Pools)
| Pool | Contract |
|------|----------|
| FXRP CDP | `0x2c817F7159c08d94f09764086330c96Bb3265A2f` |
| WFLR CDP | `0x0Dd6daab4cB9A0ba6707Cf59DBfbc28cc33CA24A` |

**View Functions (Liquity-style):**
- `getCompoundedBoldDeposit(address)` → current CDP deposit
- `getDepositorYieldGain(address)` → pending CDP yield
- `getDepositorCollGain(address)` → pending collateral (FXRP/WFLR)

### Staking
| Contract | Address |
|----------|---------|
| APS Staking | `0x7eb8ceb0f64d934a31835b98eb4cbab3ca56df28` |
| Incentives Claim | `0x0c090979c22f9b07efc0cf617c2f38e990fdacd4` |

### DAO APS Staking Rewards (Claimed)
| Date | Tx | FLR | sFLR | HLN | APS | FXRP | USDT0 | Total USD |
|------|-----|-----|------|-----|-----|------|-------|-----------|
| 2026-01-29 | 0x8213278e... | 1.622 | 0.065 | 0.111 | ~0 | 0.004 | 0.013 | ~$0.08 |
| **TOTAL** | - | **1.622** | **0.065** | **0.111** | **~0** | **0.004** | **0.013** | **~$0.08** |

*Note: DAO has 0.0116 APS staked. Rewards claimed via gov.enosys.global.*

### Hypernative API
- Endpoint: `POST https://api.hypernative.xyz/alerts`
- Agents: Mint Agent, Burn Agent, FB DAO WFLR Agent

### Social
- Protocol X: @FlareBank
- Founder X: @Canddao

---

## LP Management

**Skill:** `/fblpmanager` - See `skills/fblpmanager/SKILL.md`

### Commands
```bash
# Full report with opportunities
node /home/node/clawd/skills/fblpmanager/scripts/lp-manager.js --opportunities

# Basic range check only  
node /home/node/clawd/skills/fblpmanager/scripts/lp-monitor.js
```

### Cron Job
- **LP Position Monitor**: Runs 4x daily (00:00, 06:00, 12:00, 18:00 UTC)
- Delivers full position report + top opportunities to Telegram
- Alerts on OUT OF RANGE or NEAR EDGE positions

### Adding New Positions
Edit `POSITIONS` array in `skills/fblpmanager/scripts/lp-manager.js`:
```javascript
{
  id: 28509,           // NFT position ID
  name: 'DAO stXRP/FXRP',
  dex: 'enosys',       // or 'sparkdex'
  pool: '0xa4ce...',   // Pool contract address
  defillamaMatch: 'STXRP-FXRP',  // Match string for APY lookup
  apyDex: 'sparkdex'   // Optional: use different DEX for APY proxy
}
```

---

## FlareBank Vault Skill

**Skill:** `/fb` - See `skills/flarebank-vault/SKILL.md`

### Usage
```bash
# Check status (balance, prices)
node /home/node/clawd/skills/flarebank-vault/scripts/vault.js status

# Mint BANK (send FLR, receive BANK)
node /home/node/clawd/skills/flarebank-vault/scripts/vault.js mint --amount 1

# Burn BANK (send BANK, receive FLR)
node /home/node/clawd/skills/flarebank-vault/scripts/vault.js burn --amount 1

# Claim dividends to wallet
node /home/node/clawd/skills/flarebank-vault/scripts/vault.js claim

# Compound dividends into BANK
node /home/node/clawd/skills/flarebank-vault/scripts/vault.js compound
```

### Function Selectors (FlareBank Main)
| Function | Selector | Purpose |
|----------|----------|---------|
| `buy(address _referredBy) payable` | `0xf088d547` | Mint BANK |
| `sell(uint256)` | `0x35a4f939` | Burn BANK |
| `withdraw()` | `0x3ccfd60b` | Claim dividends |
| `reinvest()` | `0xfdb5a03e` | Compound divs |
| `buyPrice()` | `0x8620410b` | Mint price |
| `sellPrice()` | `0x4b750334` | Burn price |
| `totalSupply()` | `0x18160ddd` | Total BANK |
| `balanceOf(address)` | `0x70a08231` | Balance |

---

## Function Selectors (Legacy Reference)
```
totalSupply() => 0x18160ddd
buyPrice() => 0x8620410b
sellPrice() => 0x4b750334
nextClaimEpoch() => 0x96137390
balanceOf(address) => 0x70a08231
```

## FlareDrop Event
```
AccountClaimed(address indexed whoClaimed, address indexed sentTo, uint256 month, uint256 amount)
- topic0 = 0xbdb59bec3f0c77052f6645d7365d5008c0affb5d51489a220d01bb1af96897b0
- topic1 = whoClaimed (who initiated)
- topic2 = sentTo (recipient)
- data[0:32] = month
- data[32:64] = amount
```

## FTSOv2 Delegation Reward Event
```
RewardClaimed(address indexed provider, address indexed beneficiary, address indexed recipient, uint24 epoch, uint8 claimType, uint120 amount)
- Contract: 0xc8f55c5aa2c752ee285bd872855c749f4ee6239b
- topic0 = 0x06f77960d1401cc7d724b5c2b5ad672b9dbf08d8b11516a38c21697c23fbb0d2
- topic1 = provider (FTSO address)
- topic2 = beneficiary (who earned)
- topic3 = recipient (who received)
- data[0:32] = epoch number
- data[32:64] = claimType
- data[64:96] = amount (wei)
```

## Routescan API Patterns
```
# FlareDrop claims to specific recipient (topic2 = sentTo)
/api?module=logs&action=getLogs&address=0x9c7A4C83842B29bB4A082b0E689CB9474BD938d0&topic0=0xbdb59bec3f0c77052f6645d7365d5008c0affb5d51489a220d01bb1af96897b0&topic0_2_opr=and&topic2=<padded_recipient>

# FTSO rewards to specific recipient (topic3 = recipient)
/api?module=logs&action=getLogs&address=0xc8f55c5aa2c752ee285bd872855c749f4ee6239b&topic0=0x06f77960d1401cc7d724b5c2b5ad672b9dbf08d8b11516a38c21697c23fbb0d2&topic0_3_opr=and&topic3=<padded_recipient>

# Base URL: https://api.routescan.io/v2/network/mainnet/evm/14/etherscan
# Pagination: &page=N&offset=1000
```

## Function Selectors (Stability Pool)
```
getTotalBoldDeposits() => 0xf71c6940
getCollBalance() => 0x0367b302
getYieldGainsOwed() => 0x02f90015
getYieldGainsPending() => 0x560ee5df
getCompoundedBoldDeposit(address) => 0x065f566d
getDepositorYieldGain(address) => 0xdaed0a9b
getDepositorCollGain(address) => 0x47ea8354
deposits(address) => 0xfc7e286d
stashedColl(address) => 0x7b4c6287
```

## Function Selectors (rFLR Vesting)
```
getBalancesOf(address) => 0xd6ab3b7f
  → returns (wNatBalance, rNatBalance, lockedBalance)
  → vested = rNatBalance - lockedBalance
  → unvested = lockedBalance
```

## Flare RPC
- Mainnet: `https://flare-api.flare.network/ext/C/rpc`

## Data Query Capabilities

### ✅ Confirmed Working
1. Wallet token balances (all ERC20s via balanceOf)
2. Native FLR balance (eth_getBalance)
3. V2 LP position (LP balance + reserves calculation)
4. V3 LP position (NFT position query)
5. CDP Earn pools - deposits AND pending rewards
6. APS staking balance
7. Protocol TVL (FB Main WFLR balance only)
8. FTSO reward claims (via Routescan event logs)
9. FlareDrop claims (via Routescan event logs)

### 📊 TVL & Tokenomics Notes
- **TVL = FB Main WFLR balance ONLY** (not IBDP)
- **IBDP role:** Collects delegation rewards + FLR drops → deposits to FB Main
- **Effect:** Increases TVL backing (and BANK price) WITHOUT minting new supply
- This is the core value accrual mechanism for BANK holders

### 🔄 Reward Flow Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    FTSO DELEGATION                          │
├─────────────────────────────────────────────────────────────┤
│ FB Main WFLR ──┬──► FlareBank FTSO ──► Rewards ──► FB Main │
│ IBDP WFLR ─────┘    (beneficiary=IBDP, recipient=FB Main)  │
│                                                             │
│ DAO WFLR ──────────► FlareBank FTSO ──► Rewards ──► DAO    │
├─────────────────────────────────────────────────────────────┤
│                    FTSO PROVIDER FEES                       │
├─────────────────────────────────────────────────────────────┤
│ Identity Contract (0x59b1...) collects FTSO provider fees  │
│   └──► DAO Treasury (via RewardClaimed)                    │
├─────────────────────────────────────────────────────────────┤
│                    VALIDATOR FEES                           │
├─────────────────────────────────────────────────────────────┤
│ Validator self-bond rewards (~11M FLR bonded)              │
│ Validator operation fees (2 validators)                     │
│   └──► DAO Treasury (WFLR transfers, ~2x/month)            │
├─────────────────────────────────────────────────────────────┤
│                    FLAREDROP                                │
├─────────────────────────────────────────────────────────────┤
│ FB Main + IBDP claim FlareDrops ──► FB Main TVL            │
│ DAO claims FlareDrops ──► DAO Treasury                     │
└─────────────────────────────────────────────────────────────┘
```

### 📈 Historical Reward Totals (as of 2026-01-29)
| Destination | FTSO Rewards | FlareDrop | Validator Fees | Total |
|-------------|--------------|-----------|----------------|-------|
| FB Main TVL | 1,823,038 FLR | 6,123,225 FLR | - | 7,946,263 FLR |
| DAO Treasury | 3,278,368 FLR | 114,416 FLR | 1,127,324 FLR | 4,520,108 FLR |
| **TOTAL** | **5,101,406 FLR** | **6,237,641 FLR** | **1,127,324 FLR** | **12,466,371 FLR** |

FB Main FTSO breakdown:
- FB Main delegation: 1,043,456 FLR (99 claims)
- IBDP delegation → FB Main: 779,582 FLR (95 claims)

DAO FTSO breakdown:
- FTSO provider fees (Identity): 3,245,098 FLR (66 claims)
- FlareBank FTSO delegation: 27,322 FLR
- Other FTSOs: 5,948 FLR

DAO Validator fees claimed: 1,127,324 FLR (20 claims)
- Self-bond staking rewards (~11M FLR bonded)
- Validator operation fees (2 validators)

### ⚠️ Rate Limited
- Hypernative API (needs IP whitelist or local execution)
- Flare public RPC: 30 block limit for getLogs (use Routescan API instead)

---

## X/Twitter Posting

### Skill
- **Path:** `/home/node/clawd/skills/x-post/`
- **Trigger:** `/x-post`, "tweet", "post to x"

### Usage
```bash
# Dry-run (preview)
node /home/node/clawd/skills/x-post/scripts/post.js "Tweet text"

# Actually post
node /home/node/clawd/skills/x-post/scripts/post.js "Tweet text" --confirm

# Reply to a tweet
node /home/node/clawd/skills/x-post/scripts/post.js "Reply" --reply-to <tweet_id> --confirm
```

### Credentials
- Stored in `/home/node/clawd/.secrets/x-api.env`
- **DO NOT COMMIT** - folder is gitignored

### Limits
- 280 chars per tweet
- 5 tweets/day (self-imposed)
- All tweets logged to `memory/tweets.md`

### Bot Account
- Handle: **@cand_dao**
- Account ID: `1587859833109319681`
- First tweet: https://x.com/cand_dao/status/2016877330514211156

### Social Handles (tag in tweets)
| Account | Handle |
|---------|--------|
| Bot | @cand_dao |
| Protocol | @FlareBank |
| Founder | @Canddao |
| Enosys DEX | @enosys_global |
| SparkDex | @sparkdexai |

### Tweet Templates
See `/home/node/clawd/skills/x-post/TEMPLATES.md` for:
- Daily pool stats
- Position performance reports  
- Rebalance alerts
- Volume spike alerts
- DEX comparisons (Enosys V3 vs SparkDex V3.1)
- Fee collection summaries

**Style:** Analytical, data-heavy. Always cite sources. Tag DEXs.

---

## FTSO Price Feed

Get real-time prices from Flare's FTSO v2 oracle.

### Usage
```bash
# Single price
node /home/node/clawd/skills/ftso/scripts/price.js FLR

# Multiple prices
node /home/node/clawd/skills/ftso/scripts/price.js FLR XRP ETH BTC USDT

# JSON output
node /home/node/clawd/skills/ftso/scripts/price.js FLR --json
```

### Symbol Mapping
- WFLR, SFLR → FLR
- FXRP, stXRP → XRP
- USD₮0 → USDT
- USDC.e → USDC

---

## Portfolio Analysis

Analyze wallet holdings with USD valuation.

### Usage
```bash
# Analyze any wallet
node /home/node/clawd/skills/portfolio/scripts/analyze.js <address>

# My wallet
node /home/node/clawd/skills/portfolio/scripts/analyze.js 0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A

# DAO treasury
node /home/node/clawd/skills/portfolio/scripts/analyze.js 0xaa68bc4bab9a63958466f49f5a58c54a412d4906
```

---

## Risk Analysis

Calculate LP position risk metrics.

### Usage
```bash
# Full risk report
node /home/node/clawd/skills/risk/scripts/lp-risk.js

# JSON output
node /home/node/clawd/skills/risk/scripts/lp-risk.js --json
```

### Risk Levels
- 🟢 LOW - Healthy, no action needed
- 🟡 MEDIUM - Monitor closely
- 🟠 HIGH - Rebalance recommended
- 🔴 CRITICAL - Immediate action required

---

## OpenOcean DEX Aggregator

Best rates across ALL Flare DEXs (SparkDex V2/V3, Enosys V3, Blazeswap).

### Usage
```bash
# Get quote (compares all DEXs)
node /home/node/clawd/skills/wallet/scripts/swap-openocean.js quote --from WFLR --to FXRP --amount 100

# Execute swap
node /home/node/clawd/skills/wallet/scripts/swap-openocean.js swap --keystore <path> --from WFLR --to FXRP --amount 100 --slippage 1
```

### Contracts
| Contract | Address |
|----------|---------|
| OpenOcean Router | `0x6352a56caadC4F1E25CD6c75970Fa768A3304e64` |

### Supported DEXs
- SparkDex V2 & V3.1
- Enosys V3
- Blazeswap

**Note:** OpenOcean finds optimal routes, splitting across multiple DEXs when beneficial.

---

### SparkDex V3.1 Contracts
| Contract | Address |
|----------|---------|
| V3Factory | `0x8A2578d23d4C532cC9A98FaD91C0523f5efDE652` |
| SwapRouter | `0x8a1E35F5c98C4E85B36B7B253222eE17773b2781` |
| UniversalRouter | `0x0f3D8a38D4c74afBebc2c42695642f0e3acb15D3` |
| NFT Position Manager | `0xEE5FF5Bc5F852764b5584d92A4d592A53DC527da` |
| QuoterV2 | `0x5B5513c55fd06e2658010c121c37b07fC8e8B705` |
| Permit2 | `0xB952578f3520EE8Ea45b7914994dcf4702cEe578` |

Source: https://docs.sparkdex.ai/additional-information/smart-contract-overview/v2-v3.1-dex

### SparkDex V3.1 Pools (Verified - All 34 with liquidity)

**High Liquidity (tested ✅):**
| Pool | Address | Fee | Tested |
|------|---------|-----|--------|
| WFLR/sFLR | `0x9A3215f8B0d128816F75175c9fD74e7ebbD987DA` | 0.05% | ✅ |
| WFLR/sFLR | `0x9b35c9185659C0536dc0d8c674cE722b7d3859Ba` | 1% | |
| WFLR/sFLR | `0xD75D57A09E42E6aA336c274D08164B04aA7E7dDb` | 0.3% | |
| WFLR/USDC.e | `0x3Bc1eCbcd645e525508c570A0fF04480a5614a86` | 0.05% | |
| WFLR/USD₮0 | `0x63873f0d7165689022FeEf1B77428DF357b33dcf` | 0.05% | ✅ |
| WFLR/FXRP | `0x589689984a06E4640593eDec64e415c415940C7F` | 0.05% | ✅ |
| WFLR/FXRP | `0xDAD1976C48cf93A7D90f106382C60Cd2c888b2dc` | 0.3% | ✅ |
| WFLR/FXRP | `0x08E6cB0c6b91dba21B9b5DFF5694faB75fA91440` | 1% | |
| WFLR/stXRP | `0x8ee8414eE2B9D4Bf6c8DE40d95167C2643C2c544` | 0.05% | ✅ |
| WFLR/stXRP | `0xEB60231fdB15f37F8dCfFD351B3C776A556e7736` | 0.3% | |
| WFLR/stXRP | `0xb80f6188de9670649DbcB45FDEea82E713138A34` | 1% | |
| WFLR/USD₮0 | `0x2860DB7a2B33B79e59Ea450Ff43B2dC673A22D3d` | 0.3% | |
| WFLR/USD₮0 | `0x809AC9CCf86CCc1793CE2229b87D9c11242bB3b0` | 1% | |
| WFLR/USDC.e | `0x0272e53d5a76D9e10B17dbe66ef12250816706C7` | 0.3% | |
| WFLR/USDC.e | `0x87B8135DeFE130Cb3Edf78a578a230D4d5F19bad` | 1% | |

**Cross-Asset Pools:**
| Pool | Address | Fee | Tested |
|------|---------|-----|--------|
| FXRP/sFLR | `0x39D3AAa76D153518CB10bfD5DF92c65D8573a0b5` | 0.3% | ✅ |
| FXRP/sFLR | `0x2fD9Ca7353788DfbbeA36292252533809A8e9da3` | 1% | |
| FXRP/sFLR | `0x9C0d44D2F6e60a4995153c2d848C113a3bdE56e7` | 0.05% | |
| FXRP/USD₮0 | `0x88D46717b16619B37fa2DfD2F038DEFB4459F1F7` | 0.05% | ✅ |
| FXRP/USD₮0 | `0x8F7E2dCbbb1A1BCacE7832e4770ec31D8C6937cB` | 0.3% | |
| FXRP/USD₮0 | `0x38dE858370813ae58af11245962a9b03B661a9Ae` | 1% | |
| FXRP/stXRP | `0xffEd33D28ca65e52e927849F456D8e820B324508` | 0.05% | |
| FXRP/stXRP | `0xb0501E64fa11d810d47666012e24c5d55799ef7D` | 0.3% | |
| FXRP/stXRP | `0xe6a19F2af519cad120253Ff6372f5f76c5658Ec2` | 1% | |
| sFLR/stXRP | `0xd7428eb2052D736B3384524eff732d0BA2051793` | 0.05% | |
| sFLR/stXRP | `0x07FC2A6170a2070a133f63eC226768761559994a` | 0.3% | |
| sFLR/stXRP | `0xD5638D302378Fc414CbB4fbCe97c2061BaA32657` | 1% | |
| sFLR/USDC.e | `0x68E9c7E90C159cFF4f7c257D7c0B3FB1Fa1f8Ef5` | 0.05% | |
| sFLR/USDC.e | `0x38e386c7237140CA809a36162A652748fEC51492` | 1% | |

**Stablecoin Pools:**
| Pool | Address | Fee | Tested |
|------|---------|-----|--------|
| USD₮0/USDC.e | `0xb3fFF9a416f549534af0C6d52f13155450117fe3` | 0.05% | ✅ |
| USD₮0/USDC.e | `0xC706C8FeC94D0c44E636fD0333EB57377f07f662` | 0.3% | |
| USD₮0/USDC.e | `0xD84A2A9Cd6B850FB802dc12c6434dB67da015f53` | 1% | |
| stXRP/USDC.e | `0x7FFed91010b3c5813e019336F1C772F20d4D0b51` | 1% | |
| stXRP/USD₮0 | `0xd0B506208974Ca6088a65B613216E07F7c65263b` | 0.05% | |

### SparkDex V3.1 Swap Interface
⚠️ **CRITICAL: Uses original SwapRouter interface WITH deadline in struct**
(Different from Enosys which uses SwapRouter02 style without deadline)

```solidity
// exactInputSingle params struct
struct ExactInputSingleParams {
    address tokenIn;
    address tokenOut;
    uint24 fee;
    address recipient;
    uint256 deadline;      // ← Required! (Enosys doesn't have this)
    uint256 amountIn;
    uint256 amountOutMinimum;
    uint160 sqrtPriceLimitX96;
}
```

**Fee Tiers:**
- `500` = 0.05%
- `3000` = 0.3%
- `10000` = 1%

**Swap Script:** `skills/wallet/scripts/swap-sparkdex.js`
```bash
# Quote
node skills/wallet/scripts/swap-sparkdex.js quote --from WFLR --to FXRP --amount 180 --fee 3000

# Swap
node skills/wallet/scripts/swap-sparkdex.js swap --keystore <path> --from WFLR --to FXRP --amount 180 --fee 3000 --slippage 2
```

### SparkDex Event Signatures (Standard V3)
| Event | Signature |
|-------|-----------|
| Swap | `0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67` |
| Transfer | `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef` |
| Deposit (WFLR) | `0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c` |

### stXRP Token (Firelight)
- Address: `0x4C18Ff3C89632c3Dd62E796c0aFA5c07c4c1B2b3`
- Decimals: 6
- Primary pool: SparkDex WFLR/stXRP (0.05% fee)

---

## Blazeswap V2

### Contracts
| Contract | Address |
|----------|---------|
| Router | `0xe3a1b355ca63abcbc9589334b5e609583c7baa06` |
| Factory | `0x440602f459D7Dd500a74528003e6A20A46d6e2A6` |

**Note:** Always use the router for atomic swaps (MEV-safe). Direct pair swaps are vulnerable to MEV attacks.

### Common Pairs
| Pair | Address |
|------|---------|
| WFLR/FXRP | `0xaEbAb34e4726e174998A086C418E60f84E8695D0` |
| WFLR/sFLR | `0x3F50F880041521738fa88C46cDF7e0d8Eeb11Aa2` |
| WFLR/USDT0 | `0x5eD30e42557E3edd2f898FbcA26Cd7c6f391Ae1C` |
| WFLR/USDCe | `0xB1eC7ef55fa2E84eb6fF9FF0fa1e33387f892f68` |
| FXRP/USDT0 | `0x3D6EFe2e110F13ea22231be6B01B428B38CafC92` |

### Router Interface (Atomic Swaps)
```solidity
// Blazeswap Router - use for MEV-safe atomic swaps
interface IBlazeSwapRouter {
    function getAmountsOut(uint amountIn, address[] path) external view returns (uint[] amounts);
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] path,
        address to,
        uint deadline
    ) external returns (uint[] amounts);
}
```

### Swap Script
```bash
# Quote (uses router.getAmountsOut)
node skills/wallet/scripts/swap-blazeswap.js quote --from WFLR --to FXRP --amount 100

# Execute atomic swap (uses router.swapExactTokensForTokens)
node skills/wallet/scripts/swap-blazeswap.js swap --keystore <path> --from WFLR --to FXRP --amount 100 --slippage 1

# List pairs
node skills/wallet/scripts/swap-blazeswap.js pairs
```

### Unified Swap Skill
```bash
# Via /swap skill (recommended)
/swap blaze WFLR FXRP 100
```

---

## Triangle Arbitrage Scanner

### Scripts
| Script | Purpose |
|--------|---------|
| `skills/arb-scanner/scripts/scanner.js` | Daemon that monitors prices |
| `skills/arb-scanner/scripts/arb-executor.js` | Executes triangle trades |

### Usage
```bash
# Run scanner once
node skills/arb-scanner/scripts/scanner.js once

# Run as daemon (background)
node skills/arb-scanner/scripts/scanner.js daemon

# Execute pending alert
node skills/arb-scanner/scripts/arb-executor.js execute
```

### Alert File
- Location: `skills/arb-scanner/data/pending-alert.json`
- Scanner writes opportunities with >1% profit
- Executor reads and executes multi-leg trades

### DEXs Monitored
- Enosys V3 (most liquidity)
- SparkDex V3.1
- Blazeswap V2
- Enosys V2

---

## Trading Engine (RL-based LP Strategy)

### Skill: `/trading`
Location: `/home/node/clawd/skills/trading/`

### Commands
```bash
# Check status
python3 /home/node/clawd/skills/trading/scripts/trading.py status

# Simulate
python3 /home/node/clawd/skills/trading/scripts/trading.py simulate --pool sflr-wflr-enosys

# Train agent
python3 /home/node/clawd/skills/trading/scripts/trainer.py --pool <address> --episodes 1000

# Fetch data
python3 /home/node/clawd/skills/trading/scripts/data_fetcher.py --action dataset --days 30
```

### Source
Ported from ai-miguel: `/home/node/clawd/ai-miguel/src/miguel/trading_engine/`

### Dependencies (installed)
- torch (CPU), numpy, web3, structlog, rich, cryptography

### Pools
| Name | Address |
|------|---------|
| sFLR/WFLR (Enosys) | `0x25b4f3930934f0a3cbb885c624ecee75a2917144` |
| sFLR/WFLR (SparkDex) | `0xc9baba3f36ccaa54675deecc327ec7eaa48cb97d` |
| stXRP/FXRP | `0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770` |

---

## Moltbook (AI Social Network)

### Account
- **Agent Name:** CanddaoJr
- **Profile:** https://moltbook.com/u/CanddaoJr
- **API Key:** stored in `~/.config/moltbook/credentials.json`
- **Registered:** 2026-01-30

### API Usage
```bash
# Authenticated requests
curl -sL --location-trusted -H "Authorization: Bearer $(cat ~/.config/moltbook/credentials.json | grep api_key | cut -d'"' -f4)" \
  "https://www.moltbook.com/api/v1/agents/me"

# Post (30 min cooldown)
curl -sL --location-trusted -X POST "https://www.moltbook.com/api/v1/posts" \
  -H "Authorization: Bearer API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"submolt": "general", "title": "...", "content": "..."}'
```

### Skill Location
`/home/node/clawd/skills/moltbook/`

### Owned Submolts
- **m/flare** - Flare Network ecosystem

### Following
Starclawd, HughMann, Ronin, promptr, Dominus, UltraClawd, Mei, eudaemon_0, ClawdClawderberg

---

## Stargate USDT Swap Route (Discovered 2026-01-30)

**Problem:** Stargate USDT has no V3 liquidity on Flare.

**Solution:** Two-hop via Blazeswap V2:
```
Stargate USDT → WFLR → USD₮0 (or any target token)
```

### Blazeswap Pairs for Stargate USDT
| Pair | Address | Liquidity |
|------|---------|-----------|
| SUSDT/WFLR | `0xdf4b31b81d59eca0cfc30ecb2beb36eaebaf7a49` | ~$100k |
| WFLR/USDT0 | `0x5eD30e42757E3edd2f898FbcA26Cd7c6f391Ae1C` | ~$212k |

### Swap Commands
```bash
# Step 1: SUSDT → WFLR
node -e "
const path = ['0x0B38e83B86d491735fEaa0a791F65c2B99535396', '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d'];
// Use Blazeswap router: 0xe3a1b355ca63abcbc9589334b5e609583c7baa06
"

# Step 2: WFLR → USD₮0
node -e "
const path = ['0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d', '0xe7cd86e13AC4309349F30B3435a9d337750fC82D'];
// Use same Blazeswap router
"
```


---

## x402 Facilitator Wallet (SEPARATE from Agent Wallet)

| Purpose | Address |
|---------|---------|
| **Agent Main** | `0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A` |
| **x402 Facilitator** | `0xAb9648F54DC3bbBefba155afA9BE984f8a6Be6E9` |

⚠️ **NEVER CONFUSE THESE** - Facilitator wallet is dedicated to x402 only.

Facilitator wallet file: `/home/node/clawd/skills/x402/facilitator/data/facilitator-wallet-v2.json`

---

## TipSplitter Contract (Agent Tips)

### Contract
- **Address:** `0x12cf07728C74293f7Dd7a14931Cce6Ca09360127`
- **Network:** Flare (chainId 14)
- **Owner:** `0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A` (CanddaoJr)
- **Fee:** 1% (100 bps)

### Usage
```javascript
// Approve token spend first
await token.approve(SPLITTER, amount);
// Then call tip
await splitter.tip(tokenAddress, recipientAddress, amount);
```

### Owner Functions
- `setFee(uint256 bps)` - Change fee (max 10%)
- `setFeeRecipient(address)` - Change fee wallet
- `rescue(token, to, amount)` - Emergency token recovery

---

## ERC-8004 Agent Identity Registry

### Official Contract (Ethereum Mainnet)
- **Address:** `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- **Network:** Ethereum Mainnet (Chain ID: 1)
- **Explorer:** https://www.8004scan.io/
- **Docs:** https://howto8004.com/

### CanddaoJr Registration ✅
- **Agent ID:** 22673
- **8004scan:** https://www.8004scan.io/agents/ethereum/22673
- **Etherscan:** https://etherscan.io/nft/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/22673
- **TX:** `0xe8326f1d2b426524e476bae3da10033d0157ad45a1302e86c9fd7d1158449e42`
- **Block:** 24356901
- **Registered:** 2026-01-31 19:20 UTC

### Registration Function
```solidity
function register(string agentURI) returns (uint256 agentId)
```

### Agent URI Format
Data URI with base64-encoded JSON:
```
data:application/json;base64,<base64-json>
```

### Metadata Schema
```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "CanddaoJr",
  "description": "AI trading assistant",
  "image": "",
  "active": true,
  "x402Support": true,
  "services": [
    { "name": "web", "endpoint": "https://moltbook.com/u/CanddaoJr" },
    { "name": "x402", "endpoint": "https://agent-tips.vercel.app" }
  ]
}
```

### Registration Script
```bash
node /home/node/clawd/skills/x402/sdk-integration/register-8004.js status
node /home/node/clawd/skills/x402/sdk-integration/register-8004.js register
```
