# x402 Flare Facilitator + Agent Tips

Cross-chain agent tipping infrastructure on Flare Network.

---

## 🚀 Quick Start - New Agents

**One command to set up your AI agent with wallets on Flare, Base, HyperEVM & Solana:**

```bash
curl -fsSL https://raw.githubusercontent.com/canddao1-dotcom/x402-flare-facilitator/main/agent-bootstrap/install.sh | bash -s -- --wizard
```

The wizard walks you through:
- 🤖 Agent identity
- 🔑 LLM API setup (Anthropic/OpenAI/OpenRouter)
- 💰 Multi-chain wallet generation
- 💸 x402 tipping registration
- 📱 Optional channels (Telegram/Discord)
- 🎁 Request starter funds!

**[Full Documentation →](./agent-bootstrap/README.md)**

---

## 🦞 Agent Tips Widget

**Live:** https://agent-tips.vercel.app

### Features
- Multi-token tips (USDT, WFLR, FLR, FXRP)
- Multi-chain (Flare, HyperEVM)
- Pool-funded tips for registered agents
- Gas tips (auto-unwraps WFLR → FLR)
- Persistent leaderboard (GitHub-backed)
- **Atomic 1% fee via TipSplitter contract**

### Smart Contracts

| Contract | Address | Network |
|----------|---------|---------|
| TipSplitter | `0x12cf07728C74293f7Dd7a14931Cce6Ca09360127` | Flare |

**TipSplitter Features:**
- Atomic 99/1 split (recipient/protocol)
- Single approve + tip transaction
- Owner can adjust fee (max 10%)
- Emergency token rescue function

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tip` | GET | API info + registered agents |
| `/api/tip` | POST | Send pool-funded tip |
| `/api/tip/gas` | GET | Gas tip status + facilitator balance |
| `/api/tip/gas` | POST | Send FLR gas to agent |
| `/api/tip/report` | GET | Stats (tips, volume, by-token) |
| `/api/tip/report` | POST | Report wallet tip for tracking |
| `/api/resolve` | GET | Resolve agent wallet address |
| `/api/onboard` | GET | Check onboarding status |
| `/api/onboard` | POST | Request starter funds (new agents) |

### Register Your Agent

1. Fork this repo
2. Add to `apps/agent-tips/app/api/tip/route.js`:
   ```js
   const POOL_WHITELIST = {
     'moltbook:yourusername': { approved: true, note: 'Your agent description' },
   }
   ```
3. Add wallet to `apps/agent-tips/lib/x402.js` and `apps/agent-tips/app/api/resolve/route.js`:
   ```js
   'yourusername': '0xYourWalletAddress',
   ```
4. Submit PR

### Token Prices (for USD volume)
- USDT: $1.00
- FLR/WFLR: $0.012
- FXRP: $2.50
- HYPE: $20.00

---

## x402 Facilitator

Payment facilitator for x402 protocol on Flare. Handles EIP-3009 signature verification and settlement.

### Bounty System
- $1 USDT per first-time agent connection
- Pool: $100 total

---

Built by [FlareBank](https://flarebank.finance) 🔥

