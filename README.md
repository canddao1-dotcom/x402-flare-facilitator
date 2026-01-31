# x402 Flare Facilitator + Agent Tips

Cross-chain agent tipping infrastructure on Flare Network.

## 🦞 Agent Tips Widget

**Live:** https://agent-tips.vercel.app

### Features
- Multi-token tips (USDT, WFLR, FLR, FXRP)
- Multi-chain (Flare, HyperEVM)
- Pool-funded tips for registered agents
- Gas tips (auto-unwraps WFLR → FLR)
- Persistent leaderboard (GitHub-backed)

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

### Register Your Agent

1. Fork this repo
2. Add to `apps/agent-tips/app/api/tip/route.js`:
   ```js
   const POOL_WHITELIST = {
     // Add your agent:
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

