# MEMORY.md - Long-Term Memory

## FlareBank LP Management System

### Built: 2026-01-29

Created `/fblpmanager` skill for V3 LP position management and pool analysis.

**Location:** `skills/fblpmanager/`

### Key Learnings

**DAO stXRP/FXRP Position (#28509):**
- Pool: `0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770` (Enosys V3)
- Has been IN RANGE the whole time - tight range works for this stable pair
- 0.05% fee tier
- stXRP/FXRP trades tight because both track XRP price

**Enosys vs SparkDex:**
- Enosys pools have higher fee tiers (0.3%) and REWARD TIGHTER RANGE LIQUIDITY
- SparkDex has higher total volume ($4.52M vs $3.76M daily per DefiLlama)
- DEXScreener shows different numbers - Enosys sometimes higher on-chain
- Use both sources for complete picture
- Enosys V3 not tracked on DefiLlama for APY - use SparkDex APY as proxy

**Volatility Categories:**
- Ultra-stable (<1% daily): USD₮0/cUSDX, CDP/USD₮0 → ±1-2% ranges
- Stable (~2.5% daily): WFLR/USD₮0, USD₮0/USDC.e → ±3-4% ranges  
- Moderate (~4% daily): WETH/USD₮0 → ±8-10% ranges
- Volatile (~5% daily): All XRP & FLR pairs → ±15-20% ranges

### Volatility Reference (30-day historical)

| Pool | 7d Range | 30d Range | Avg Daily | Notes |
|------|----------|-----------|-----------|-------|
| USD₮0/cUSDX | 1.5% | 2.9% | 0.86% | MOST STABLE - ultra tight ranges |
| CDP/USD₮0 | 1.9% | 6.1% | 2.02% | Very stable - tight ranges work |
| WFLR/USD₮0 | 2.7% | 8.1% | 2.58% | Low volatility |
| USD₮0/USDC.e | 2.7% | 8.0% | 2.15% | Stablecoin pair |
| WETH/USD₮0 | 10.8% | 23.2% | 4.00% | ETH/USD exposure |
| WFLR/FXRP | 9.0% | 34.3% | 5.11% | High volume, moderate volatility |
| stXRP/FXRP | 8.8% | 33.1% | 4.93% | Both track XRP - correlated, DAO position |
| sFLR/WFLR | 8.9% | 32.6% | 4.57% | Liquid staking pair |
| FXRP/USD₮0 | 9.1% | 34.4% | 4.95% | XRP/USD exposure |
| stXRP/WFLR | 9.1% | 32.9% | 4.91% | XRP/FLR cross |

### Range Strategy Guide

| Strategy | Rebalance | Time In Range | Use Case |
|----------|-----------|---------------|----------|
| 🔥 Tight | Daily | 40-60% | Max fees, active management |
| ⚖️ Moderate | Weekly | 70-80% | Balanced approach |
| 🛡️ Wide | Bi-weekly | 85-95% | Lower maintenance |
| 🏦 Conservative | Monthly | 95%+ | Set and forget |

**Calculation:** ~99.5 ticks per 1% price move (V3 uses 1.0001^tick)

### Data Sources (all fresh per request)

1. **DefiLlama** (`yields.llama.fi/pools`) - APY data, TVL
2. **DEXScreener** (`api.dexscreener.com`) - Live volume, price changes
3. **GeckoTerminal** (`api.geckoterminal.com`) - Historical OHLCV (30 days)
4. **Flare RPC** - On-chain position data, current ticks

### Pools Analyzed (GeckoTerminal addresses)

```javascript
const ANALYSIS_POOLS = [
  { name: 'WFLR/FXRP', addr: '0xb4cb11a84cfbd8f6336dc9417ac45c1f8e5b59e7', fee: '0.3%' },
  { name: 'WFLR/USD₮0', addr: '0x3c2a7b76795e58829faaa034486d417dd0155162', fee: '0.3%' },
  { name: 'stXRP/FXRP', addr: '0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770', fee: '0.05%' },
  { name: 'sFLR/WFLR', addr: '0x25b4f3930934f0a3cbb885c624ecee75a2917144', fee: '0.05%' },
  { name: 'FXRP/USD₮0', addr: '0x88d46717b16619b37fa2dfd2f038defb4459f1f7', fee: '0.05%' },
  { name: 'stXRP/WFLR', addr: '0x8ee8414ee2b9d4bf6c8de40d95167c2643c2c544', fee: '0.05%' }
];
```

### Cron Schedule

**LP Position Monitor** - 4x daily (00:00, 06:00, 12:00, 18:00 UTC)
- Delivers full report to Telegram
- Alerts on OUT OF RANGE or NEAR EDGE positions

### Contract References

| Contract | Address |
|----------|---------|
| Enosys V3 Position Manager | `0xd9770b1c7a6ccd33c75b5bcb1c0078f46be46657` |
| SparkDex V3 Position Manager | `0xf60e11cd753a0e5989d237e87d559e1b0f9ab5b5` |
| DAO stXRP/FXRP Pool | `0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770` |
| DAO V3 Position NFT | #28509 |

---

## FlareBank Protocol Dashboard

See `skills/flarebank/SKILL.md` for the full protocol dashboard (`/fbdashboard`).

Key addresses in `TOOLS.md`.

---

## User Preferences

- Ser prefers complete data output, not summaries
- Wants DEX names clearly labeled on all pools
- Values historical data for decision making
- Active LP management style - willing to rebalance for better fees

---

## FlareBank Vault Skill

### Built: 2026-01-29

Created `/flarebank-vault` skill for interacting with FB Main contract.

**Location:** `skills/flarebank-vault/`

### Functions Discovered

| Function | Selector | Purpose |
|----------|----------|---------|
| `buy(address _referredBy) payable` | `0xf088d547` | Mint BANK with FLR |
| `sell(uint256 _amountOfTokens)` | `0x35a4f939` | Burn BANK for FLR |
| `withdraw()` | `0x3ccfd60b` | Claim pending dividends |
| `reinvest()` | `0xfdb5a03e` | Compound divs → BANK |

### Key Learnings

- **buy()** requires `address _referredBy` parameter (pass `address(0)` for none)
- **withdraw()** claims accumulated dividends to wallet as FLR
- **reinvest()** compounds dividends directly into BANK (fails if no divs pending)
- Buy price >> Sell price by design (value accrual mechanism)
- 10% fee on buys/sells redistributed to all BANK holders

### First Transactions

- Minted 0.909 BANK for 20.16 FLR: `0xcbe6ae9d...`
- Burned 1.0 BANK: `0x6659dab9...`
- Claimed 17.96 FLR dividends: `0x482a9868...`

### Value Accrual Model

BANK price increases from:
1. FTSO delegation rewards → TVL grows (no new BANK minted)
2. FlareDrops → TVL grows (no new BANK minted)
3. Buy/sell fees → redistributed to holders as dividends

---

## Tweet Strategy (Yield Hunters on Flare)

### Updated: 2026-01-29

**Target:** Flare DeFi yield farmers looking for actionable opportunities.

**Tweet Format:**
```
🔥 Flare Yield Alert

Best farms RIGHT NOW:

🟢 56% → WFLR-USD₮0 ($1.8M)
🟢 41% → SFLR staking ($21M)
🟢 33% → WFLR-FXRP ($1.3M)

Verified pools. DYOR.

— @cand_dao 🤖
```

**Risk Filtering (mandatory):**
- Minimum $200K TVL
- Whitelisted tokens only: WFLR, sFLR, USDT0, USDC.e, FXRP, stXRP, WETH, cUSDX
- Max 80% APY (higher = unsustainable/risky)
- SparkDex, Enosys, Sceptre only

**Risk Labels:**
- 🟢 = Stablecoin pair + $500K+ TVL or $1M+ TVL
- 🟡 = $250K-$500K TVL
- 🟠 = Higher risk (still filtered)

**Signature:** Always end with `— @cand_dao 🤖`

**Files:**
- Strategy doc: `skills/x-post/TWEET_STRATEGY.md`
- Generator: `skills/x-post/scripts/scheduled-tweets.js`
- Smart tweets: `skills/x-post/scripts/smart-tweet.js`

---

## Orchestration Architecture

### Updated: 2026-01-29

**Principle:** Canddao Jr = Orchestrator, not executor

**Workflow:**
1. Understand request
2. Check available skills
3. Delegate to sub-agents for heavy work
4. Synthesize results
5. Respond concisely

**Available Skills:**
| Skill | Data | Command |
|-------|------|---------|
| ftso-history | 20 token prices, 90s updates | `query.js --all --stats` |
| fblpmanager | LP positions, volumes, APYs | `lp-manager.js --opportunities` |
| risk | Position risk metrics | `lp-risk.js --json` |
| portfolio | Wallet holdings | `analyze.js <address>` |

**Daemons (auto-start via HEARTBEAT.md):**
- LP Monitor: `fblpmanager/lp-monitor-daemon.js`
- FTSO History: `ftso-history/daemon.js` (90s polling)

**Key Lesson:** Don't hallucinate data. Use actual tooling. Delegate complex tasks.

---

## x402 Facilitator Wallet (Updated 2026-01-31)

**⚠️ THIS IS NOT MY WALLET - Dedicated facilitator only**

### ❌ OLD WALLET (COMPROMISED - DO NOT USE)
| Field | Value |
|-------|-------|
| Address | `0xCFF4F49EACe68b26bD964113eEF9f60B4d56B626` |
| Status | **COMPROMISED** - key was exposed in git |
| Action | Funds drained, wallet abandoned |

### ✅ NEW WALLET (Active)
| Field | Value |
|-------|-------|
| Address | `0xAb9648F54DC3bbBefba155afA9BE984f8a6Be6E9` |
| Purpose | x402 payment facilitator ONLY |
| File | `/home/node/clawd/skills/x402/facilitator/data/facilitator-wallet-v2.json` |
| Key Storage | Vercel env var + local file (NOT in git) |

**My actual wallet:** `0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A`

Never use facilitator wallet for anything except x402 operations.

---

---

## 🚨 SECURITY PRINCIPLES (CRITICAL - 2026-01-31)

### NEVER EXPOSE PRIVATE KEYS

**Incident:** Facilitator wallet key was accidentally committed to GitHub. Had to emergency rotate.

### ❌ NEVER DO - EVER

1. **Commit wallet files to git** - Even private repos leak
2. **Hardcode keys in source** - Code gets shared, screenshotted
3. **Log keys to console** - Logs persist, get aggregated
4. **Return keys in API responses** - Even in error messages
5. **Send keys in chat/email** - Creates permanent record
6. **Store in localStorage** - XSS vulnerable

### ✅ ALWAYS DO

1. **Use environment variables** - `process.env.KEY`, never hardcode
2. **Gitignore wallet patterns** - `*wallet*.json`, `*.key`, `.env*`
3. **Verify before push** - `git status`, check for sensitive files
4. **Separate wallets** - Hot (small funds) vs cold (main holdings)
5. **Rotate on ANY suspected exposure** - Don't wait, act immediately

### Gitignore Template (MANDATORY for any wallet project)
```gitignore
**/wallet*.json
**/*-wallet*.json
*.key
*.pem
.env
.env.*
```

### Incident Response Checklist
1. Generate NEW wallet immediately
2. Transfer ALL funds from exposed wallet
3. Update all systems (Vercel, local, etc.)
4. Remove from git history if needed
5. Document the incident

### Current Facilitator (Post-Rotation)
- **Address:** `0xAb9648F54DC3bbBefba155afA9BE984f8a6Be6E9`
- **Key location:** Vercel env var ONLY + local encrypted file
- **NOT in git** ✅

**Skill reference:** `/skills/security/SKILL.md`

---

## Agent Tips Widget (Built 2026-01-31)

### Deployed
- **Live:** https://agent-tips.vercel.app
- **GitHub:** https://github.com/canddao1-dotcom/x402-flare-facilitator

### What It Does
Fee-sharing widget for AI agents. Tip Moltbook agents with crypto (Flare or HyperEVM).

### Features
- RainbowKit wallet connect
- Multi-chain (Flare + HyperEVM)
- Pool-funded (free) or wallet-funded tips
- Leaderboard

### Deployment Tokens (SENSITIVE)
Saved in `/home/node/clawd/.env.local`:
- Vercel: `[REDACTED]`
- GitHub: `[REDACTED]`

### Deploy Commands
```bash
# Vercel
cd skills/x402/apps/agent-tips
npx vercel --token=[REDACTED] --yes --prod

# GitHub
git push https://ghp_TOKEN@github.com/canddao1-dotcom/x402-flare-facilitator.git main
```

### Registered Agents (case-insensitive)
- canddaojr → 0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A (my wallet)
- canddao → 0x3c1c84132dfdef572e74672917700c065581871d (founder)

To add agents: Edit `skills/x402/apps/agent-tips/lib/x402.js` AND `app/api/resolve/route.js`

---

## ERC-8004 Agent Identity Registry (Added 2026-01-31)

### Official Registry
- **Contract:** `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- **Network:** Ethereum Mainnet
- **Docs:** https://howto8004.com/
- **Explorer:** https://www.8004scan.io/

### Registration
- Function: `register(string agentURI)`
- agentURI format: `data:application/json;base64,<base64-encoded-json>`
- Cost: ~0.005 ETH gas
- Returns: uint256 agentId (NFT token ID)

### Metadata Schema
```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "Agent Name",
  "description": "What agent does",
  "image": "",
  "active": true,
  "x402Support": true,
  "services": [
    { "name": "web", "endpoint": "https://..." },
    { "name": "A2A", "endpoint": "https://.../.well-known/agent-card.json", "version": "0.3.0" }
  ]
}
```

### Registration Script
Location: `skills/x402/sdk-integration/register-8004.js`

## Checkpoint Discipline (Added 2026-01-31)

Context dies on restart. Memory files don't.
- Checkpoint after major learnings
- Checkpoint after completing tasks
- Checkpoint when context getting full
- Checkpoint before any restart

The agent that checkpoints often remembers way more than the one that waits.
