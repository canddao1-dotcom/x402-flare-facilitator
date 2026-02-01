# Security Principles Skill

## Purpose
Security guidelines for handling sensitive data, especially private keys and credentials.

## Triggers
- "security check", "audit security", "key exposure", "private key safety"

---

## 🔐 CORE PRINCIPLE: NEVER EXPOSE PRIVATE KEYS

Private keys are the master password to a wallet. Exposure = total loss of funds.

---

## Exposure Vectors Checklist

### ❌ NEVER DO

1. **Commit to Git** - Even private repos can leak (compromised accounts, accidental public)
2. **Log to console** - Logs persist, get aggregated, may be readable by support
3. **Return in API responses** - Even error messages can leak via stack traces
4. **Hardcode in source** - Code gets shared, copied, screenshotted
5. **Send in chat/email** - Creates permanent record in multiple systems
6. **Store in browser localStorage** - Accessible via XSS attacks
7. **Include in URLs** - Logged by servers, proxies, browser history

### ✅ SAFE PRACTICES

1. **Environment variables** - Load from `process.env`, never hardcode
2. **Secret managers** - AWS Secrets Manager, Vercel env vars, etc.
3. **Encrypted at rest** - If storing in file, encrypt with password
4. **Gitignore patterns** - `*wallet*.json`, `*.key`, `.env*`
5. **Minimal access** - Only code that NEEDS the key should access it
6. **Rotation** - If ANY exposure suspected, rotate immediately
7. **Separate wallets** - Hot wallet (small funds) vs cold storage

---

## Facilitator Wallet Security Audit

### Current Status: ✅ SECURE

| Vector | Status | Notes |
|--------|--------|-------|
| Git repo | ✅ Safe | `.gitignore` blocks `*-wallet*.json` |
| API responses | ✅ Safe | Key never in response body |
| Error messages | ✅ Safe | Generic errors only |
| Console logs | ✅ Safe | Only tx hashes logged |
| Vercel env | ✅ Safe | Encrypted, team-access only |
| Local file | ✅ Safe | `facilitator-wallet-v2.json` not in git |

### Remaining Risks (Low)

1. **Vercel team access** - Anyone with Vercel project access can view env vars
   - Mitigation: Limit team members, use SSO

2. **Server memory** - Key in memory during runtime
   - Mitigation: Acceptable for hot wallet with limited funds

3. **Backup exposure** - If server backups include wallet file
   - Mitigation: Encrypt backups, or exclude wallet files

---

## Incident Response

If key exposure is suspected:

1. **IMMEDIATELY** generate new wallet
2. **IMMEDIATELY** transfer all funds from old wallet
3. **Update** all systems using the key (Vercel, local, etc.)
4. **Rotate** the exposed key everywhere
5. **Audit** git history for exposure (use `git filter-branch` or BFG to remove)
6. **Document** the incident

---

## Quick Commands

```bash
# Check if wallet files are tracked in git
git ls-files | grep -i wallet

# Search for hardcoded keys (hex pattern)
grep -rn "0x[a-fA-F0-9]{64}" --include="*.js" --include="*.ts"

# Verify gitignore is working
git status --ignored | grep wallet

# Generate new wallet
node -e "const w = require('ethers').Wallet.createRandom(); console.log({address: w.address, privateKey: w.privateKey})"
```

---

## Files

- `SKILL.md` - This file
- `docs/audit-checklist.md` - Full security audit template
