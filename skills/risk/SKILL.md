---
name: risk
description: Risk analysis for LP positions. Calculate impermanent loss, position exposure, volatility metrics. Triggers on "/risk", "risk analysis", "position risk", "impermanent loss", "lp risk".
---

# Risk Metrics Skill

Calculate risk metrics for LP positions and portfolio exposure.

## Usage

```bash
# Analyze LP position risk
node /home/node/clawd/skills/risk/scripts/lp-risk.js

# Full risk report
node /home/node/clawd/skills/risk/scripts/report.js
```

## Metrics Calculated

### Position Risk
- **Range utilization** - How much of the range is being used
- **Edge proximity** - Distance to tick boundaries
- **Impermanent loss estimate** - Based on price movement
- **Concentration risk** - Single position dominance

### Portfolio Risk
- **Protocol exposure** - % in each DEX
- **Token correlation** - Correlated vs uncorrelated pairs
- **Out-of-range ratio** - Positions not earning fees
- **Rebalance urgency** - Which positions need attention

## Risk Levels

- 🟢 **LOW** - Healthy position, no action needed
- 🟡 **MEDIUM** - Monitor closely, consider rebalancing soon
- 🟠 **HIGH** - Rebalance recommended
- 🔴 **CRITICAL** - Immediate action required
