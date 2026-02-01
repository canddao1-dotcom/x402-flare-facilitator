# Trading Engine Skill

RL-based intelligent LP strategy engine for Flare V3 DEXs with order flow analysis.

---
name: trading
triggers:
  - /trading
  - /orderflow
  - train agent
  - lp strategy
  - trading engine
  - order flow
  - whale activity
---

## Commands

### Trading Engine
| Command | Description |
|---------|-------------|
| `/trading` | Engine status |
| `/trading ready` | Check data readiness for training |
| `/trading pools` | List configured pools |
| `/trading discover` | Find V3 pools (DefiLlama) |
| `/trading collect <pool>` | Collect snapshot now |
| `/trading train <pool> [eps]` | Train on real data |
| `/trading predict <pool>` | Get trading recommendation |
| `/trading backtest <pool> [days]` | Backtest strategy |
| `/trading daemon` | Check/start data collector |

### Order Flow Analysis
| Command | Description |
|---------|-------------|
| `/trading flow <pool>` | Full order flow analysis |
| `/trading whales <pool>` | Top whale activity |
| `/orderflow <pool>` | Full analysis (alias) |
| `/orderflow whales <pool>` | Whale tracker |
| `/orderflow patterns <pool>` | Accumulation/distribution |
| `/orderflow metrics <pool>` | Flow metrics only |
| `/orderflow list` | Pools with swap data |
| `/orderflow all` | Summary all pools |

## Data Collection (Automated)

Two daemons collect data continuously:

**Pool Collector (every 5 min):**
- tick, price, liquidity, TVL
- Fee growth, token amounts
- sqrt_price_x96 for precise math

**Swap Collector (hourly):**
- Wallet addresses (sender, recipient)
- Amounts (token0, token1)
- Direction (buy/sell)
- Transaction hash

## Order Flow Analysis

Analyzes swap data to detect market direction, whale behavior, and accumulation/distribution patterns.

### Metrics
- **Order Flow Imbalance (OFI):** Buy vs sell pressure (-1 to +1)
- **Buy/Sell Ratio:** Volume comparison
- **Trend Change:** Recent flow vs historical
- **Market Direction:** BULLISH / BEARISH / NEUTRAL

### Whale Detection
- Top 10% by volume classified as whales
- Tracks: net position, buy/sell counts, timing
- Behavior: ACCUMULATING / DISTRIBUTING / NEUTRAL

### Patterns
- **ACCUMULATION:** High buy volume + buy count
- **DISTRIBUTION:** High sell volume + sell count
- **RETAIL_BUYING:** Many small buys
- **RETAIL_SELLING:** Many small sells

### Usage Examples
```bash
# Full analysis
/orderflow wflr-usdt0-sparkdex

# Check whale activity
/orderflow whales sflr-wflr-enosys

# Accumulation patterns
/orderflow patterns wflr-fxrp-enosys 14

# All pools summary
/orderflow all
```

## Training Pipeline

### 1. Check Data Readiness
```bash
/trading ready
```
Shows snapshots per pool. Need 100+ for training (~1 week of collection).

### 2. Train on Real Data
```bash
/trading train sflr-wflr-enosys 200
```
Or manually:
```bash
python3 scripts/training/train_real.py sflr-wflr-enosys --episodes 200
```

### 3. Get Predictions
```bash
/trading predict sflr-wflr-enosys
```
Returns: recommended tick range, liquidity %, action (HOLD/REBALANCE)

### 4. Backtest
```bash
/trading backtest sflr-wflr-enosys 7
```
Simulates strategy over historical data.

## Model Architecture

**DDPG (Deep Deterministic Policy Gradient):**
- State: 35 dimensions (pool, market, position, portfolio features)
- Action: 3 continuous values
  - `range_width`: How wide to set the LP range
  - `center_offset`: Where to center the range vs current tick
  - `liquidity_fraction`: How much capital to deploy

**Training:**
- Replay buffer: 100K experiences
- Batch size: 64
- Learning rate: 0.0001
- Target network soft updates (τ=0.001)

## Directory Structure

```
skills/trading/
├── config/
│   └── pools.json              # Pool configurations (12 pools)
├── data/
│   ├── pool_history/           # Tick/price/TVL snapshots
│   │   └── {pool}/YYYY-MM-DD.jsonl
│   └── swaps/                  # Swap events for order flow
│       └── {pool}/YYYY-MM-DD.jsonl
├── models/
│   ├── {pool}_real_actor.pt    # Trained DDPG actor
│   └── {pool}_real_metrics.json
└── scripts/
    ├── trading.js              # Main command interface
    ├── ensure-daemon.sh        # Pool collector daemon
    ├── ensure-swap-daemon.sh   # Swap collector daemon
    ├── collectors/
    │   ├── miguel-collector.py # Pool data (uses ai-miguel)
    │   └── swap-collector.py   # Swap events from chain
    ├── training/
    │   ├── data_loader.py      # Load collected data
    │   ├── state_normalizer.py # Feature normalization
    │   ├── trainer.py          # Synthetic training
    │   └── train_real.py       # REAL data training
    ├── inference/
    │   ├── predictor.py        # Get recommendations
    │   └── backtest.py         # Strategy evaluation
    └── analysis/
        ├── order_flow.py       # Order flow analyzer (Python)
        └── order-flow-cli.js   # CLI wrapper (/orderflow)
```

## Configured Pools (10)

| Pool | DEX | Fee |
|------|-----|-----|
| sflr-wflr-enosys | Enosys | 0.05% |
| sflr-wflr-sparkdex | SparkDex | 0.01% |
| sflr-wflr-sparkdex-05 | SparkDex | 0.05% |
| stxrp-fxrp-enosys | Enosys | 0.05% |
| stxrp-fxrp-sparkdex | SparkDex | 0.05% |
| cdp-usdt0-enosys | Enosys | 0.05% |
| wflr-usdt0-enosys | Enosys | 0.3% |
| wflr-usdt0-sparkdex | SparkDex | 0.05% |
| wflr-fxrp-enosys | Enosys | 0.3% |
| wflr-fxrp-sparkdex | SparkDex | 0.05% |

## Integration with LP Skill

After getting a prediction:
```
/trading predict sflr-wflr-enosys
→ Recommended range: [5400 → 5800]

/lp rebalance 34935 --lower 5400 --upper 5800
```

## Timeline

1. **Now:** Data collecting (10 pools, 5 min intervals)
2. **1 week:** ~2000 snapshots per pool → ready for training
3. **After training:** Real predictions with confidence
4. **Future:** Auto-execution integration

## Source

Based on ai-miguel trading engine:
`/home/node/clawd/ai-miguel/src/miguel/trading_engine/`
