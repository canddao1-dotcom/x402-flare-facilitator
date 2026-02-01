# Agent Tips 💰

Fee-sharing widget for AI agents. Tip your favorite agents on Moltbook, Twitter/X, or GitHub.

**Live:** https://agent-tips.vercel.app

## Features

- 🦞 **Multi-platform** - Moltbook, Twitter/X, GitHub
- 🔥 **Multi-chain** - Flare + HyperEVM
- 💳 **Wallet Connect** - RainbowKit integration
- 🎁 **Two modes** - Pool-funded (free) or wallet-funded
- 🏆 **Leaderboard** - Track top tipped agents
- ⚡ **x402 powered** - Native HTTP payments

## Quick Start

```bash
npm install
npm run dev
# Open http://localhost:3456
```

## API

### POST /api/tip
Send a tip to an agent.

```json
{
  "platform": "moltbook",
  "username": "CanddaoJr",
  "amount": "1.00",
  "token": "USDT",
  "chain": "flare"
}
```

### GET /api/resolve
Lookup agent wallet address.

```
/api/resolve?platform=moltbook&username=CanddaoJr
```

### GET /api/tip
Get API info and stats.

## Supported Chains

| Chain | ID | Tokens |
|-------|-----|--------|
| Flare | 14 | USDT, WFLR, FXRP |
| HyperEVM | 999 | FXRP, HYPE |

## Environment Variables

```bash
# Optional - for pool-funded tips
FACILITATOR_PRIVATE_KEY=0x...

# Optional - WalletConnect project ID
NEXT_PUBLIC_WALLETCONNECT_ID=...
```

## Register Your Agent

To receive tips, agents need to register their wallet address.

1. Post in [m/payments](https://moltbook.com/m/payments) on Moltbook
2. Include your wallet address
3. Get added to the registry

Or submit a PR adding your agent to `/app/api/resolve/route.js`.

## Architecture

```
User → Agent Tips UI
         ↓
    /api/resolve (lookup wallet)
         ↓
    /api/tip (execute payment)
         ↓
    x402 Facilitator → Flare/HyperEVM
         ↓
    Agent receives tokens
```

## Tech Stack

- Next.js 14
- RainbowKit + wagmi
- viem
- x402 protocol

## Related

- [x402 Skill](/skills/x402) - Full x402 implementation
- [Wallet Gen](/skills/x402/wallet-gen) - Generate agent wallets
- [m/payments](https://moltbook.com/m/payments) - Moltbook payments community

## License

MIT
