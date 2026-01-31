# Agent Bootstrap

Spin up a new OpenClaw agent with multi-chain wallets in one command.

## One-Line Install (Mac/Linux/Ubuntu)

**Quick Start (wallet only):**
```bash
curl -fsSL https://raw.githubusercontent.com/canddao1-dotcom/x402-flare-facilitator/main/agent-bootstrap/install.sh | bash -s -- my-agent-name
```

**Full Setup Wizard (recommended):**
```bash
curl -fsSL https://raw.githubusercontent.com/canddao1-dotcom/x402-flare-facilitator/main/agent-bootstrap/install.sh | bash -s -- --wizard
```

The wizard guides you through:
- 🤖 Agent identity (name, description)
- 🔑 LLM API key (Anthropic/OpenAI/OpenRouter)  
- 💰 Multi-chain wallet generation
- 💸 x402 tipping registration
- 📱 Optional channels (Telegram/Discord)

**Windows (Git Bash/WSL):** Same commands above.

## Manual Install

```bash
git clone https://github.com/canddao1-dotcom/x402-flare-facilitator.git
cd x402-flare-facilitator/agent-bootstrap
npm install

# Basic wallet generation
node scripts/bootstrap.js new --name my-agent

# Full setup wizard
node scripts/wizard.js
```

This creates wallets for:
- **EVM chains**: Flare, Base, HyperEVM (same address)
- **Solana**: Separate Ed25519 keypair

## Commands

### Create New Agent

```bash
node scripts/bootstrap.js new --name <agent-name>
```

Generates:
- `data/<agent-name>/evm-keystore.json` - Encrypted EVM private key
- `data/<agent-name>/solana-keystore.json` - Encrypted Solana keypair
- `data/<agent-name>/PASSPHRASE.json` - Master decryption key (⚠️ SECURE THIS!)
- `data/<agent-name>/wallet-summary.json` - Addresses & network info
- `data/<agent-name>/openclaw.env.example` - Config template

### List Agents

```bash
node scripts/bootstrap.js list
```

### Verify Setup

```bash
node scripts/verify.js <agent-name>
```

Checks:
- Balances on all chains
- Keystore file integrity
- Funding status

## Supported Networks

| Network | Chain ID | Currency | Type |
|---------|----------|----------|------|
| Flare | 14 | FLR | EVM |
| Base | 8453 | ETH | EVM |
| HyperEVM | 999 | HYPE | EVM |
| Solana | - | SOL | Ed25519 |

## Security

### Encryption
- All private keys encrypted with AES-256-GCM
- Unique passphrase generated per agent
- Keys derived using scrypt (memory-hard)

### Best Practices
1. **Move PASSPHRASE.json** to a secure location immediately
2. **Never commit** keystores or passphrases to git
3. **Add to .gitignore**: `data/*/`
4. **Use environment variables** for passphrases in production

## OpenClaw Integration

After bootstrapping:

1. Copy `openclaw.env.example` to your agent's `.env`
2. Fill in `WALLET_PASSPHRASE` from `PASSPHRASE.json`
3. Fund wallets with native gas tokens:
   - Flare: FLR
   - Base: ETH
   - HyperEVM: HYPE
   - Solana: SOL
4. Register on [ERC-8004](https://www.8004scan.io/) for agent identity

## Example Workflow

```bash
# 1. Bootstrap
node scripts/bootstrap.js new --name trading-bot

# 2. Verify (shows funding addresses)
node scripts/verify.js trading-bot

# 3. Fund wallets (send tokens to displayed addresses)

# 4. Copy config to your agent
cp data/trading-bot/openclaw.env.example ~/my-agent/.env

# 5. Secure the passphrase
mv data/trading-bot/PASSPHRASE.json ~/secure-location/

# 6. Start your OpenClaw agent!
```

## Programmatic Usage

```javascript
import { bootstrap } from './scripts/bootstrap.js';

const summary = await bootstrap('my-agent');
console.log(summary.wallets.evm.address);  // EVM address
console.log(summary.wallets.solana.address);  // Solana address
```

## Decrypting Keys

To decrypt a keystore (for export/migration):

```javascript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function decrypt(data, passphrase) {
  const key = crypto.scryptSync(passphrase, 'agent-bootstrap-salt', 32);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(data.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
  let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// EVM: returns hex private key
const evmKey = decrypt(keystore.encryptedKey, passphrase);

// Solana: returns hex, convert to keypair
const solHex = decrypt(keystore.encryptedKey, passphrase);
const keypair = Buffer.from(solHex, 'hex');  // 64 bytes
```

---

Built by [FlareBank](https://flarebank.finance) 🔥
