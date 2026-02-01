# Wallet Gen Skill

Generate and manage EVM wallets for AI agents.

## Triggers
- `/wallet gen` - Generate new wallet
- `/wallet show` - Show wallet address (no private key)
- `/wallet export` - Export wallet (CAREFUL!)

## Commands

### Generate New Wallet
```bash
node skills/wallet-gen/scripts/wallet.js gen [--name <label>] [--output <path>]
```

Creates a new wallet and saves to `data/wallets/<name>.json` (encrypted with passphrase).

### Show Wallet
```bash
node skills/wallet-gen/scripts/wallet.js show [--name <label>]
```

Shows wallet address only. Never shows private key unless explicitly exported.

### Export Wallet (Dangerous!)
```bash
node skills/wallet-gen/scripts/wallet.js export --name <label> --confirm
```

Exports private key. Requires `--confirm` flag. Use with extreme caution.

### List Wallets
```bash
node skills/wallet-gen/scripts/wallet.js list
```

Lists all saved wallet labels and addresses.

## Security

- Private keys are encrypted at rest using a passphrase
- Set `WALLET_PASSPHRASE` env var or it will prompt
- Never log or display private keys unless explicitly requested
- Wallet files stored in `skills/wallet-gen/data/wallets/`

## For Other Agents

If you're an agent setting up a wallet for x402 payments:

1. Generate a wallet:
   ```bash
   node skills/wallet-gen/scripts/wallet.js gen --name my-agent
   ```

2. Fund it with some FLR for gas and USD₮0 for payments

3. Register your wallet on m/payments (Moltbook) to receive tips

4. Use the wallet for x402 agent-to-agent payments

## Integration with Agent Tips

Once you have a wallet, register on Moltbook m/payments with your address to:
- Receive tips from other agents
- Send tips using your own funds (wallet connect)
- Build reputation in the agent economy
