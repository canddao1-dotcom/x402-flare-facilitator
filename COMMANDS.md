# Command Reference

Consolidated slash commands with subcommand architecture. 9 clean skills.

## Quick Reference

| Skill | Command | Description |
|-------|---------|-------------|
| LP | `/lp` | V3 LP position management |
| Swap | `/swap` | Token swaps on Flare DEXs |
| Wallet | `/wallet` | Balance, send, wrap, approve |
| FlareBank | `/fb` | Protocol dashboard, mint/burn BANK |
| Upshift | `/upshift` | Upshift yield vaults (earnXRP) |
| CDP | `/cdp` | Enosys Loans - CDP stability pools |
| Spectra | `/spectra` | Yield trading - PT/YT tokens |
| Price | `/price` | FTSO oracle prices |
| Tweet | `/tweet` | X/Twitter posting |
| Risk | `/risk` | LP position risk metrics |
| Portfolio | `/portfolio` | Wallet portfolio analysis |

---

## /lp - LP Management

Manage V3 liquidity positions on Enosys and SparkDex.

```bash
/lp check              # Quick health check (in/out of range)
/lp report             # Full report + opportunities + suggestions
/lp positions          # View all positions with pending fees
/lp collect <id>       # Collect fees from position
/lp remove <id> [%]    # Remove liquidity (default 100%)
/lp mint ...           # Mint new V3 position
/lp rebalance <id>     # Close and redeploy at new range
/lp deploy             # Deployment guide with price ranges
```

**Script:** `skills/lp/scripts/lp.js`

---

## /swap - Token Swaps

Execute swaps on Flare DEXs with unified interface.

```bash
/swap WFLR FXRP 100                # Enosys V3 swap (default)
/swap WFLR SFLR 50 --fee 500       # Use 0.05% pool
/swap spark WFLR USDT0 100         # SparkDex V3.1 swap
/swap v2 WFLR BANK 10              # V2 swap (for BANK)
/swap v2 BANK WFLR 1               # Sell BANK
/swap quote WFLR FXRP 100          # Get quote only
/swap wrap 100                     # Wrap FLR → WFLR
/swap unwrap 50                    # Unwrap WFLR → FLR
/swap pools                        # List V3 pools
```

**Script:** `skills/swap/scripts/swap.js`

---

## /wallet - Wallet Operations

Balance checks, transfers, approvals, gas prices.

```bash
/wallet balance                    # My wallet balance
/wallet balance 0xaa68bc...        # Check specific address
/wallet balance --tokens           # Include all tokens
/wallet send 10 FLR to 0x...       # Send native FLR
/wallet send 100 WFLR to 0x...     # Send ERC20
/wallet wrap 100                   # Wrap FLR
/wallet unwrap 50                  # Unwrap WFLR
/wallet approve WFLR enosys-v3-router  # Approve spending
/wallet allowance WFLR enosys      # Check allowance
/wallet gas                        # Current gas prices
/wallet info BANK                  # Token info
/wallet generate                   # Generate new wallet
```

**Script:** `skills/wallet/scripts/wallet.js`

---

## /fb - FlareBank Protocol

Protocol dashboard, vault operations, mint/burn BANK.

```bash
/fb dashboard          # Full protocol analytics
/fb status             # Vault status + balances
/fb mint 100           # Mint BANK with 100 FLR
/fb burn 10            # Burn 10 BANK for FLR
/fb claim              # Claim dividends
/fb compound           # Compound dividends → BANK
```

**Script:** `skills/fb/scripts/fb.js`

---

## /upshift - Upshift Finance Vaults

Interact with Upshift yield vaults (earnXRP).

```bash
/upshift status                    # Vault TVL, share price
/upshift balance                   # Your earnXRP balance
/upshift balance 0x...             # Check specific address
/upshift deposit 100               # Deposit 100 FXRP → earnXRP
/upshift redeem 50                 # Instant redeem 50 earnXRP → FXRP
/upshift request 50                # Queue redemption request
```

**Contracts:**
- Vault: `0x373D7d201C8134D4a2f7b5c63560da217e3dEA28`
- earnXRP: `0xe533e447fd7720b2f8654da2b1953efa06b60bfa`
- Asset: FXRP (`0xAd552A648C74D49E10027AB8a618A3ad4901c5bE`)

**Script:** `skills/upshift/scripts/upshift.js`

---

## /cdp - Enosys Loans (Liquity V2)

CDP stability pools - earn yield + liquidation collateral.

```bash
/cdp status                        # Protocol stats, pool TVL
/cdp balance                       # Your CDP + pool positions
/cdp balance 0x...                 # Check specific address
/cdp pools                         # Detailed pool stats
/cdp deposit 100 fxrp              # Deposit 100 CDP to FXRP pool
/cdp deposit 50 wflr               # Deposit 50 CDP to WFLR pool
/cdp withdraw 25 fxrp              # Withdraw from FXRP pool
/cdp claim fxrp                    # Claim yield + collateral
```

**Pools:** `fxrp`, `wflr`

**Contracts:**
- CDP Token: `0x6Cd3a5Ba46FA254D4d2E3C2B37350ae337E94a0F`
- FXRP StabilityPool: `0x2c817F7159c08d94f09764086330c96Bb3265A2f`
- WFLR StabilityPool: `0x0Dd6daab4cB9A0ba6707Cf59DBfbc28cc33CA24A`

**Script:** `skills/cdp/scripts/cdp.js`

---

## /spectra - Yield Trading (Spectra Finance)

Trade yield on stXRP and sFLR via PT (Principal) and YT (Yield) tokens.

```bash
/spectra status                    # Pool stats, TVL, rates
/spectra balance                   # Your PT/YT/LP balances
/spectra pools                     # List all pools
/spectra deposit 10 --pool stxrp   # Deposit 10 stXRP → PT + YT
/spectra swap pt ibt 5 --pool stxrp  # Swap 5 PT → stXRP
/spectra swap stxrp pt 5           # Swap 5 stXRP → PT
/spectra lp add 10 --pool stxrp    # Add liquidity
```

**Pools:** `stxrp` (Mar 2026), `sflr` (May 2026)

**Contracts (stXRP pool):**
- Pool: `0xa65a736bcf1f4af7a8f353027218f2d54b3048eb`
- PT: `0x097Dd93Bf92bf9018fF194195dDfCFB2c359335e`
- YT: `0x46f0C7b81128e031604eCb3e8A7E28dd3F8A50C9`
- IBT (stXRP): `0x4C18Ff3C89632c3Dd62E796c0aFA5c07c4c1B2b3`

**Script:** `skills/spectra/scripts/spectra.js`

---

## /price - FTSO Prices

Real-time prices from Flare's FTSO oracle.

```bash
/price FLR                         # FLR/USD price
/price FLR XRP ETH BTC             # Multiple prices
/price FLR --json                  # JSON output
/price history FLR 7d              # 7-day history
/price history XRP 30d             # 30-day history
/price list                        # All supported symbols
```

**Script:** `skills/ftso/scripts/ftso.js`

---

## /tweet - X/Twitter

Post tweets from @cand_dao bot account.

```bash
/tweet "GM Flare! 🔥"              # Draft (dry-run)
/tweet "GM Flare! 🔥" --confirm    # Actually post
/tweet daily                       # Daily stats tweet
/tweet daily --confirm             # Post daily stats
/tweet weekly                      # Weekly performance
```

**Script:** `skills/x-post/scripts/post.js`

---

## /risk - LP Risk Analysis

Risk metrics for LP positions.

```bash
/risk                              # Analyze all positions
/risk <position_id>                # Specific position
```

**Script:** `skills/risk/scripts/lp-risk.js`

---

## /portfolio - Portfolio Analysis

Full wallet portfolio breakdown.

```bash
/portfolio                         # My wallet analysis
/portfolio 0xaa68bc...             # Specific address
```

**Script:** `skills/portfolio/scripts/analyze.js`

---

## Script Base Paths

| Skill | Path |
|-------|------|
| LP | `skills/lp/scripts/lp.js` |
| Swap | `skills/swap/scripts/swap.js` |
| Wallet | `skills/wallet/scripts/wallet.js` |
| FlareBank | `skills/fb/scripts/fb.js` |
| Upshift | `skills/upshift/scripts/upshift.js` |
| CDP | `skills/cdp/scripts/cdp.js` |
| Spectra | `skills/spectra/scripts/spectra.js` |
| Price | `skills/ftso/scripts/ftso.js` |
| Tweet | `skills/x-post/scripts/post.js` |
| Risk | `skills/risk/scripts/lp-risk.js` |
| Portfolio | `skills/portfolio/scripts/analyze.js` |

## Keystore & Wallet

- **Agent Wallet:** `0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A`
- **Keystore:** `/home/node/clawd/skills/fblpmanager/data/clawd-wallet.json`
- **DAO Treasury:** `0xaa68bc4bab9a63958466f49f5a58c54a412d4906`

## Daemons

| Daemon | Purpose | Check |
|--------|---------|-------|
| LP Monitor | Position health (15min) | `cat /tmp/lp-monitor-daemon.pid` |
| FTSO History | Price polling (5min) | `skills/ftso-history/scripts/ctl.sh status` |
