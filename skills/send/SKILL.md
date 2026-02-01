---
name: send
description: Safe token transfers with confirmation. Send tokens with address validation, balance checks, and mandatory confirmation. Triggers on "/send", "send tokens", "transfer tokens to".
---

# Send Skill

Simple, safe token transfers with mandatory confirmations.

## Purpose

**Zero mistakes** through:
- Address validation against known addresses
- Balance check before sending
- Mandatory confirmation prompt
- Automatic memory logging
- Dry-run by default

## Commands

| Command | Description |
|---------|-------------|
| `/send <amount> <token> to <address>` | Send tokens |
| `/send check <address>` | Validate address |
| `/send history` | Recent sends |

## Examples

```
/send 100 BANK to 0xaa68bc4bab9a63958466f49f5a58c54a412d4906
/send 50 FLR to DAO
/send 1000 WFLR to 0x...
```

## Safety Features

### 1. Address Book (Known Addresses)
Validates against TOOLS.md addresses:
- `DAO` → 0xaa68bc4bab9a63958466f49f5a58c54a412d4906
- `FBMAIN` → 0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059
- `IBDP` → 0x90679234fe693b39bfdf5642060cb10571adc59b
- `FOUNDER` → 0x3c1c84132dfdef572e74672917700c065581871d
- `MY_WALLET` → 0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A

### 2. Pre-Send Checklist
Before ANY send:
1. ✅ Is address in known list or explicitly confirmed?
2. ✅ Is balance sufficient?
3. ✅ Is amount reasonable (not entire balance)?
4. ✅ Double-check token (FLR vs WFLR vs BANK)
5. ✅ Dry-run successful?

### 3. Confirmation Prompt
Always show:
```
⚠️ SEND CONFIRMATION
━━━━━━━━━━━━━━━━━━━━
Amount: 100 BANK
To: 0xaa68...4906 (DAO Treasury)
From: 0x0DFa...93cC (My Wallet)
Balance after: 150 BANK
Gas estimate: ~0.02 FLR
━━━━━━━━━━━━━━━━━━━━
Type 'confirm' to proceed
```

### 4. Post-Send Logging
Automatically logs to memory:
```
[TX] SEND | 100 BANK → 0xaa68...4906 (DAO) | tx: 0x... | gas: 0.02 FLR
```

## Script Usage

```bash
# Check balance first
node /home/node/clawd/skills/send/scripts/send.js \
  --keystore /path/to/keystore.json \
  --to 0xaa68bc4bab9a63958466f49f5a58c54a412d4906 \
  --amount 100 \
  --token BANK \
  --dry-run

# Execute (requires explicit --confirm)
node /home/node/clawd/skills/send/scripts/send.js \
  --keystore /path/to/keystore.json \
  --to 0xaa68bc4bab9a63958466f49f5a58c54a412d4906 \
  --amount 100 \
  --token BANK \
  --confirm
```

## Blocked Actions

NEVER send without:
- [ ] Verifying recipient address
- [ ] Checking current balance
- [ ] Dry-run first
- [ ] Explicit confirmation

## Integration

Uses:
- `wallet/send-tx.js` for actual transaction
- `memory/log.js` for logging
- Known addresses from TOOLS.md
