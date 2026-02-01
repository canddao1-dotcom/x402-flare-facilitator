---
name: fblpmanager
description: FlareBank LP position management and DeFi pool analysis. Check V3 position health (in/out of range), find LP opportunities on SparkDex and Enosys, compare DEX volumes, analyze pools for range setting, and get EXACT deployment recommendations with prices and tick ranges. Triggers on "/fblpmanager", "lp manager", "lp positions", "check lp", "pool opportunities", "dex volumes", "v3 positions", "deployment guide", "where to deploy".
---

# FlareBank LP Manager

Manage DAO V3 LP positions and find optimal deployment opportunities on Flare DEXes.

## Quick Command

Run the LP manager for position health + deployment guide:

```bash
node /home/node/clawd/skills/fblpmanager/scripts/lp-manager.js --opportunities
node /home/node/clawd/skills/fblpmanager/scripts/deployment-guide.js
```

## ⚠️ CRITICAL: Output Format - READ THIS

**🚨 Run BOTH scripts and combine into the format below.**
**🚨 Show PRICES not tick ranges.**
**🚨 Include daily deployment suggestions with reasoning.**
**🚨 Do NOT show tick range tables - users want price ranges.**

When user asks for "/fblpmanager", "lp manager", "lp positions", or "check lp":

1. Run `lp-manager.js --opportunities` for position health + opportunities
2. Run `deployment-guide.js` for exact price ranges
3. Output in the EXACT format below - do not deviate

## Required Output Format

```
📊 **LP POSITION REPORT**
📅 [DATE] UTC

🟢 **[Position Name]** (#[ID])
   [PAIR] | [FEE]% fee | [DEX]
   Price: [CURRENT] [[LOWER] ↔ [UPPER]] [TOKEN1]/[TOKEN0]
   Position: [X]% | [HEALTHY/NEAR EDGE/OUT OF RANGE]
   Holdings: [AMT] [TOKEN0] + [AMT] [TOKEN1]
   APY: [X]%
   📈 30d Range: [X]% | Avg Daily: [X]%

✅ All positions healthy
(or ⚠️ warnings if NEAR EDGE / 🔴 alerts if OUT OF RANGE)

---

📈 **TOP LP OPPORTUNITIES**
| Pool | DEX | APY | 24h Vol | TVL |
|---|---|---|---|---|
| [PAIR] | [DEX] | [X]% | $[VOL] | $[TVL] |
(show top 7-10 by APY, only those with meaningful volume/TVL)

💹 **DEX VOLUME (24h)**
• Enosys: $[X]M vol | $[X]M TVL
• SparkDex: $[X]M vol | $[X]M TVL

---

🎯 **DAILY DEPLOYMENT SUGGESTIONS**

**🥇 #1: [POOL] ([DEX] [FEE]%)**
[One-line reasoning - why this pool today]
Current: 1 [TOKEN] = **[PRICE] [TOKEN]**
• Weekly range: **[LOWER] - [UPPER]**
• Monthly range: **[LOWER] - [UPPER]**

**🥈 #2: [POOL] ([DEX] [FEE]%)**
[One-line reasoning]
Current: 1 [TOKEN] = **[PRICE] [TOKEN]**
• Weekly range: **[LOWER] - [UPPER]**
• Monthly range: **[LOWER] - [UPPER]**

**🥉 #3: [POOL] ([DEX] [FEE]%)**
[One-line reasoning]
Current: 1 [TOKEN] = **[PRICE] [TOKEN]**
• Weekly range: **[LOWER] - [UPPER]**
• Monthly range: **[LOWER] - [UPPER]**

**📌 Current DAO Position: [POOL]**
Current: 1 [TOKEN] = **[PRICE] [TOKEN]**
• Weekly range: **[LOWER] - [UPPER]**
• Monthly range: **[LOWER] - [UPPER]**

---

💡 **Today's Take:**
[2-3 sentence summary: top pick, why, any market observations]
```

## What NOT to Show

- ❌ Tick range tables (users don't care about ticks)
- ❌ Volatility tables with 7d/30d/daily columns
- ❌ "Suggested tick ranges" sections
- ❌ Strategy guide explanations (tight/moderate/wide/conservative)
- ❌ Percentage range tables

## Health Status

| Status | Emoji | Meaning |
|--------|-------|---------|
| HEALTHY | 🟢 | Position >10% and <90% from bounds |
| NEAR EDGE | 🟡 | Position <10% or >90% from bounds |
| OUT OF RANGE | 🔴 | Current tick outside position range |

## APY Data Source

APY comes from **DefiLlama Yields API** (`https://yields.llama.fi/pools`):
- **Base APY** = Trading fees earned by LPs (from swap volume)
- **Reward APY** = Token incentives (e.g., SPRK rewards on SparkDex)
- **Total APY** = Base + Rewards

The API aggregates on-chain data and calculates 24h/7d APY based on actual fee generation.

## Deployment Suggestion Logic

Rank pools by:
1. **APY** - Higher is better
2. **Volume** - Needs $100K+ daily for meaningful fees
3. **TVL** - $500K+ indicates healthy liquidity
4. **Volatility** - Lower = tighter ranges = more capital efficient

Top picks should balance all factors, not just highest APY.

## Data Sources

- **DefiLlama** - APY data (base + reward yields)
- **DEXScreener** - Live volume, price changes, TVL
- **GeckoTerminal** - 30-day historical OHLCV for volatility
- **Flare RPC** - On-chain prices, position data, current ticks

## Adding New Positions

Edit `POSITIONS` array in `scripts/lp-manager.js`:

```javascript
{
  id: 28509,              // NFT position ID
  name: 'DAO stXRP/FXRP', // Display name
  dex: 'enosys',          // 'enosys' or 'sparkdex'
  pool: '0xa4ce...',      // Pool contract address
  defillamaMatch: 'STXRP-FXRP',  // Symbol for APY lookup
  apyDex: 'sparkdex'      // Optional: use different DEX for APY
}
```

## Automated Monitoring

### LP Monitor Daemon (Background Process)

A lightweight daemon runs continuously, checking positions every 15 minutes via RPC (no AI tokens).

**Start/ensure daemon is running:**
```bash
/home/node/clawd/skills/fblpmanager/scripts/ensure-daemon.sh
```

**Check daemon status:**
```bash
cat /tmp/lp-monitor-daemon.pid && ps aux | grep lp-monitor
```

**View daemon logs:**
```bash
tail -f /tmp/lp-monitor-daemon.log
```

**How it works:**
1. Checks position tick vs range every 15 min (RPC only, ~0 cost)
2. If OUT OF RANGE or NEAR EDGE → triggers full AI report
3. 1-hour cooldown between alerts to prevent spam

**Auto-restart:** Added to `HEARTBEAT.md` so daemon restarts on any Clawdbot restart.

### Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| LP Position Monitor | On alert (daemon-triggered) | Full rebalance report with prices |
| LP Position Monitor | 4x daily backup (00,06,12,18 UTC) | Scheduled full report |
| FlareBank Dashboard | Mondays 09:00 UTC | Full protocol stats |

### Rebalance Alert Format

When daemon detects OUT OF RANGE or NEAR EDGE, the triggered report uses this format:

```
🚨 **REBALANCE ALERT**

🔴 **[Position Name]** (#[ID])
   [PAIR] | [FEE]% fee | [DEX]
   Price: [CURRENT] [[LOWER] ↔ [UPPER]] [TOKEN1]/[TOKEN0]
   Position: OUT OF RANGE ❌
   Holdings: [AMT] [TOKEN0] + [AMT] [TOKEN1]

---

🔧 **REBALANCE RECOMMENDATION**

**Close position #[ID] and redeploy:**
Current price: **[PRICE]** [TOKEN1]/[TOKEN0]
• Suggested weekly range: **[LOWER] - [UPPER]**
• Suggested monthly range: **[LOWER] - [UPPER]**

Action: Close #[ID], withdraw liquidity, open new position at suggested range.
```

### Adding New Positions to Monitor

Edit `POSITIONS` array in BOTH files:
- `scripts/lp-manager.js` - Full report
- `scripts/lp-monitor-daemon.js` - Background monitor

```javascript
{
  id: 28509,
  name: 'DAO stXRP/FXRP',
  pool: '0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770'
}
```

---

## Advanced Operations

### Wallet Manager (`wallet-manager.js`)

Secure wallet operations for treasury management:

```bash
# Generate new wallet
node scripts/wallet-manager.js generate

# Import existing wallet
node scripts/wallet-manager.js import <privateKey>

# Check balances (FLR, WFLR, sFLR, BANK)
node scripts/wallet-manager.js balance <address>
```

**Features:**
- Wallet generation with mnemonic backup
- Encrypted wallet storage (AES-256-GCM)
- Multi-token balance checking
- ERC20 approve/transfer operations

### LP Operations (`lp-operations.js`)

Direct position management operations:

```bash
# Get position details
node scripts/lp-operations.js position <nftManager> <tokenId>

# Get pool state (tick, price, liquidity)
node scripts/lp-operations.js pool <poolAddress>

# Full health report
node scripts/lp-operations.js health <nftManager> <tokenId> <poolAddress>

# Collect fees (requires wallet)
node scripts/lp-operations.js collect <privateKey> <nftManager> <tokenId>

# Decrease liquidity
node scripts/lp-operations.js decrease <privateKey> <nftManager> <tokenId> [percent]
```

**DEX NFT Managers:**
- Enosys: `0xD9770b1C7A6ccd33C75b5bcB1c0078f46bE46657`
- SparkDex: `0xbEEFA7FAb245B568183D5f67731487908630d801`

### LP Rebalancer (`lp-rebalancer.js`)

Automated position rebalancing with strategy selection:

```bash
# Simulate rebalance (no execution)
node scripts/lp-rebalancer.js simulate <nftManager> <tokenId> <poolAddress> [strategy]

# Execute rebalance (dry run default)
node scripts/lp-rebalancer.js execute <privateKey> <nftManager> <tokenId> <poolAddress> [strategy]

# Execute LIVE (actually submits transactions)
node scripts/lp-rebalancer.js execute <privateKey> <nftManager> <tokenId> <poolAddress> [strategy] --live

# List strategies
node scripts/lp-rebalancer.js strategies
```

**Rebalance Strategies:**
| Strategy | Spread | Use Case |
|----------|--------|----------|
| aggressive | ±5% | Max fees, frequent rebalance |
| moderate | ±10% | Balanced (default) |
| conservative | ±15% | Less rebalancing |
| wide | ±25% | Minimal rebalancing |

**Rebalance Steps (executed atomically):**
1. Collect unclaimed fees
2. Remove 100% liquidity
3. Collect withdrawn tokens
4. Approve tokens for NFT Manager
5. Mint new position at new range

**Example - DAO stXRP/FXRP Rebalance:**
```bash
# Simulate first
node scripts/lp-rebalancer.js simulate \
  0xD9770b1C7A6ccd33C75b5bcB1c0078f46bE46657 \
  28509 \
  0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770 \
  moderate

# Review simulation, then execute
node scripts/lp-rebalancer.js execute \
  <DAO_PRIVATE_KEY> \
  0xD9770b1C7A6ccd33C75b5bcB1c0078f46bE46657 \
  28509 \
  0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770 \
  moderate --live
```

### Test Suite

Run all tests:
```bash
cd /home/node/clawd/skills/fblpmanager && npm test
```

Tests wallet generation, balance checks, position queries, pool state, health reports, and rebalance simulation.
