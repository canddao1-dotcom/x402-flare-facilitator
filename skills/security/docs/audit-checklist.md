# Security Audit Checklist

## Private Key Exposure Vectors

### Code & Repository
- [ ] No hardcoded keys in source files
- [ ] `.gitignore` includes wallet patterns (`*wallet*.json`, `*.key`, `.env*`)
- [ ] Git history clean (no keys in past commits)
- [ ] No keys in comments or documentation

### Runtime & API
- [ ] Keys loaded from environment variables only
- [ ] No keys in API response bodies
- [ ] No keys in error messages or stack traces
- [ ] No keys in console/debug logs
- [ ] No keys in URL parameters

### Storage
- [ ] Wallet files encrypted or excluded from backups
- [ ] Wallet files have restricted permissions (`chmod 600`)
- [ ] No wallet files in public directories

### Access Control
- [ ] Limited team access to secret storage (Vercel, AWS, etc.)
- [ ] MFA enabled on deployment platforms
- [ ] Separate wallets for different risk levels

### Monitoring
- [ ] Alerts on unexpected outbound transfers
- [ ] Regular balance checks on hot wallets
- [ ] Audit logs for secret access

---

## Facilitator Key Access Analysis

### Can an external party access the key?

| Attack Vector | Risk | Analysis |
|--------------|------|----------|
| **GitHub repo** | ✅ None | Key not in repo, gitignored |
| **API exploitation** | ✅ None | Key never returned in responses |
| **Frontend JS** | ✅ None | Key only on server, not bundled |
| **Vercel function logs** | ⚠️ Low | Logs don't include key, but Vercel staff could theoretically access |
| **Vercel env vars** | ⚠️ Low | Only project team members can view |
| **Server compromise** | ⚠️ Low | If server hacked, attacker could read env/memory |
| **Social engineering** | ⚠️ Low | Phishing for Vercel/GitHub credentials |
| **DNS/TLS MITM** | ✅ None | HTTPS protects transit, key never sent to client |

### Verdict

**No direct external access path exists.**

Remaining risks require:
- Compromising Vercel account (mitigate: strong password + MFA)
- Compromising server (mitigate: keep deps updated, limit attack surface)
- Social engineering (mitigate: awareness, verify requests)

### Recommendations

1. Enable MFA on Vercel account
2. Keep facilitator balance low (hot wallet principle)
3. Monitor for unexpected transactions
4. Rotate key periodically (quarterly)
