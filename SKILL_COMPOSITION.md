# SKILL_COMPOSITION.md - How Skills Chain Together

**Use skills like building blocks.** For complex tasks, chain multiple skills rather than figuring things out from scratch.

## Skill Hierarchy

### User-Facing (Entry Points)
These are the skills users trigger directly:

| Skill | Purpose | Calls |
|-------|---------|-------|
| `/fb` | FlareBank operations | → flarebank-vault, flarebank |
| `/swap` | Token swaps | → wallet/* swap scripts |
| `/lp` | LP positions | → standalone |
| `/fblpmanager` | LP management | → wallet (for wrap/send) |
| `/price` | Current prices | → ftso |
| `/portfolio` | Holdings overview | → wallet, lp, cdp |
| `/wallet` | Basic wallet ops | → standalone |

### Internal Libraries (Don't trigger directly)
| Skill | Used By |
|-------|---------|
| flarebank-vault | fb |
| flarebank (dashboard.js) | fb |
| wallet/swap-*.js | swap |
| ftso-history | arb-scanner, analytics |

---

## Complex Task Chains

### "Rebalance my LP position"
```
1. /price          → Get current prices
2. /lp check       → Check position status (in/out of range)
3. /fblpmanager    → Execute rebalance
   └── uses wallet → wrap/unwrap if needed
   └── uses swap   → swap tokens if needed
```

### "What's my total exposure?"
```
1. /portfolio      → Aggregates everything:
   └── wallet      → Token balances
   └── lp          → LP positions
   └── cdp         → Stability pool deposits
   └── price       → Current valuations
```

### "Execute arbitrage"
```
1. arb-scanner     → Detect opportunity
   └── ftso-history → Historical price context
2. /swap           → Execute leg 1
3. /swap           → Execute leg 2
4. /swap           → Execute leg 3 (triangle)
```

### "Mint BANK and add to LP"
```
1. /fb mint        → Mint BANK tokens
2. /swap wrap      → Wrap FLR if needed  
3. /fblpmanager    → Add to LP position
```

### "Daily FlareBank report"
```
1. /fbdashboard    → Full protocol metrics
2. /fblpmanager    → LP position health
3. /tweet          → Post summary (optional)
```

---

## Skill Selection Rules

1. **Exact match** - If user says "/swap", use swap skill
2. **Intent match** - "trade WFLR for FXRP" → swap skill
3. **Multi-step** - Break down, use skills in sequence
4. **Never reinvent** - If a skill does it, use the skill

## Anti-Patterns

❌ Writing raw contract calls when swap skill exists
❌ Manually calculating prices when ftso skill exists  
❌ Building LP queries from scratch when lp skill exists
❌ Triggering internal libraries directly (use facades)

---

## Quick Reference

| Task | Skill Chain |
|------|-------------|
| Check price | `/price` |
| Swap tokens | `/swap` |
| Check LP health | `/lp` or `/fblpmanager` |
| Mint/burn BANK | `/fb` |
| Full dashboard | `/fbdashboard` |
| Wallet balance | `/wallet` |
| Rebalance LP | `/fblpmanager` → swap → wallet |
| Portfolio view | `/portfolio` |
| Post to X | `/tweet` |
