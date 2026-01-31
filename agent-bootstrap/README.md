# 🤖 Agent Bootstrap

**Spin up a new AI agent with multi-chain wallets in one command.**

Get your agent running on Flare, Base, HyperEVM, and Solana in under 5 minutes.

---

## 🚀 Quick Start

### One-Line Install (Mac/Linux/Windows WSL)

**Full Setup Wizard (Recommended):**
```bash
curl -fsSL https://raw.githubusercontent.com/canddao1-dotcom/x402-flare-facilitator/main/agent-bootstrap/install.sh | bash -s -- --wizard
```

**Quick Wallet Only:**
```bash
curl -fsSL https://raw.githubusercontent.com/canddao1-dotcom/x402-flare-facilitator/main/agent-bootstrap/install.sh | bash -s -- my-agent-name
```

That's it! The wizard walks you through everything.

---

## 📋 What You Get

After running the wizard, you'll have:

| File | Purpose |
|------|---------|
| `.env` | Ready-to-use config for your agent |
| `evm-keystore.json` | Encrypted wallet for Flare/Base/HyperEVM |
| `solana-keystore.json` | Encrypted wallet for Solana |
| `PASSPHRASE.json` | Master key to decrypt wallets (keep safe!) |
| `wallet-summary.json` | Your wallet addresses |

### Supported Networks

| Network | Type | Currency | What It's For |
|---------|------|----------|---------------|
| **Flare** | EVM | FLR | DeFi, x402 payments, main network |
| **Base** | EVM | ETH | Low-cost transactions, Coinbase ecosystem |
| **HyperEVM** | EVM | HYPE | Hyperliquid ecosystem |
| **Solana** | Ed25519 | SOL | High-speed transactions |

Your EVM address is the same on Flare, Base, and HyperEVM. Solana uses a separate address.

---

## 🧙 The Setup Wizard

The wizard guides you through 6 steps:

### Step 1: Agent Identity
- Choose a name for your agent (e.g., "TradingBot", "MyAssistant")
- Add a brief description

### Step 2: LLM Provider
Choose your AI backend:
- **Anthropic (Claude)** - Recommended, best reasoning
- **OpenAI (GPT-4)** - Great all-rounder  
- **OpenRouter** - Access multiple models

You'll need an API key. Get one from:
- Anthropic: https://console.anthropic.com/settings/keys
- OpenAI: https://platform.openai.com/api-keys
- OpenRouter: https://openrouter.ai/keys

### Step 3: Wallet Generation
- Automatically creates encrypted wallets
- One EVM key (works on all EVM chains)
- One Solana key
- Everything encrypted with a secure passphrase

### Step 4: x402 Tipping
- Enable receiving tips from other agents and users
- Auto-registers you on https://agent-tips.vercel.app
- This is how agents pay each other!

### Step 5: Messaging Channels (Optional)
Connect your agent to:
- **Telegram** - Create a bot via @BotFather
- **Discord** - Create an app at discord.com/developers

### Step 6: Review & Confirm
- See everything before saving
- Go back and change anything
- Only saves when you confirm

### 💰 Starter Funds
After setup, you can request starter funds from our pool:
- 1 USDT to test x402 payments
- Sent to your Flare wallet
- One-time per wallet

---

## 🔧 Manual Installation

If you prefer manual setup:

```bash
# 1. Clone the repo
git clone https://github.com/canddao1-dotcom/x402-flare-facilitator.git
cd x402-flare-facilitator/agent-bootstrap

# 2. Install dependencies
npm install

# 3. Run the wizard
node scripts/wizard.js

# Or just generate wallets
node scripts/bootstrap.js new --name my-agent
```

---

## 📁 File Structure

After setup, your agent folder looks like:

```
data/my-agent/
├── .env                    # Your config (edit WALLET_PASSPHRASE!)
├── evm-keystore.json       # Encrypted EVM private key
├── solana-keystore.json    # Encrypted Solana keypair  
├── PASSPHRASE.json         # ⚠️ MOVE THIS TO SECURE LOCATION!
├── wallet-summary.json     # Addresses & network info
├── config-summary.json     # Full config (API keys redacted)
└── openclaw.env.example    # Template for reference
```

---

## 🔐 Security Best Practices

### DO ✅
- Move `PASSPHRASE.json` to a secure location immediately
- Use environment variables for sensitive values in production
- Keep keystores encrypted at rest
- Back up your passphrase somewhere safe (password manager, etc.)

### DON'T ❌
- Never commit keystores or passphrases to git
- Never share your private keys or passphrase
- Never store passphrase in plain text on servers

### Add to .gitignore
```
data/*/
*.json
.env
PASSPHRASE*
*-keystore.json
```

---

## 🛠️ Commands Reference

### Generate Wallets Only
```bash
node scripts/bootstrap.js new --name my-agent
```

### Run Full Wizard
```bash
node scripts/wizard.js
```

### List Created Agents
```bash
node scripts/bootstrap.js list
```

### Verify Setup & Check Balances
```bash
node scripts/verify.js my-agent
```

### Show Agent Info (JSON)
```bash
node scripts/bootstrap.js show --name my-agent
```

---

## 💰 Funding Your Wallets

After setup, you need to add funds for gas:

| Network | Send To | Get Tokens |
|---------|---------|------------|
| Flare | Your EVM address | Buy FLR on exchanges |
| Base | Your EVM address | Bridge ETH from Ethereum |
| HyperEVM | Your EVM address | Bridge from Hyperliquid |
| Solana | Your Solana address | Buy SOL on exchanges |

### Check Balances
```bash
node scripts/verify.js my-agent
```

This shows balances on all networks with links to block explorers.

---

## 🔗 x402 Tipping Integration

x402 is how agents pay each other. After setup:

### Request a Tip (Test)
```bash
curl -X POST https://agent-tips.vercel.app/api/tip \
  -H "Content-Type: application/json" \
  -d '{"agent": "my-agent", "amount": "1", "token": "USDT"}'
```

### Check Your Balance
Visit: https://agent-tips.vercel.app/leaderboard

### Send Tips to Other Agents
Use wallet connect at https://agent-tips.vercel.app

---

## 🆘 Troubleshooting

### "Node.js not found"
Install Node.js 18 or later: https://nodejs.org/

### "Agent name required" error
Make sure to pass the agent name:
```bash
curl ... | bash -s -- my-agent-name
# or for wizard:
curl ... | bash -s -- --wizard
```

### "Wallet generation failed"
Check that you have write permissions to the current directory.

### Can't decrypt wallet
Make sure `WALLET_PASSPHRASE` in your `.env` matches the value from `PASSPHRASE.json`.

### API key not working
Double-check you copied the full key including any prefixes (sk-ant-, sk-, etc.)

---

## 🌐 Resources

- **Docs**: https://docs.clawd.bot
- **Agent Tips**: https://agent-tips.vercel.app
- **GitHub**: https://github.com/canddao1-dotcom/x402-flare-facilitator
- **Discord**: https://discord.gg/clawd

---

## 📜 What is x402?

x402 is a protocol for agent-to-agent payments. It lets AI agents:
- Receive tips and payments
- Pay for services from other agents
- Build reputation through transactions

The "402" refers to HTTP status code 402 (Payment Required) - agents can request payment for their services.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Your AI Agent                           │
├─────────────────────────────────────────────────────────────┤
│  .env config  │  LLM API  │  Wallets  │  Channels          │
└───────┬───────┴─────┬─────┴─────┬─────┴──────┬─────────────┘
        │             │           │            │
        ▼             ▼           ▼            ▼
   ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
   │ OpenClaw │  │ Anthropic│  │  Flare   │  │ Telegram │
   │  Agent   │  │  OpenAI  │  │  Base    │  │ Discord  │
   │ Runtime  │  │ OpenRouter│  │ HyperEVM │  │   etc.   │
   └─────────┘  └──────────┘  │  Solana  │  └──────────┘
                              └──────────┘
```

---

## 📄 License

MIT - Use freely, attribution appreciated.

---

Built with ❤️ by [FlareBank](https://flarebank.finance)

**Questions?** Open an issue or join our Discord!
