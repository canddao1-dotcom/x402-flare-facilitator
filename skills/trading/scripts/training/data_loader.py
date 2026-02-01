#!/usr/bin/env python3
"""
Data Loader for Training
Loads real collected data and converts to training format.
"""

import json
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Tuple

SKILL_DIR = Path(__file__).parent.parent.parent
POOL_DATA_DIR = SKILL_DIR / 'data' / 'pool_history'
SWAP_DATA_DIR = SKILL_DIR / 'data' / 'swaps'


class DataLoader:
    """Loads and processes collected pool/swap data for training."""
    
    def __init__(self, pool_name: str):
        self.pool_name = pool_name
        self.pool_dir = POOL_DATA_DIR / pool_name
        self.swap_dir = SWAP_DATA_DIR / pool_name
    
    def load_pool_snapshots(self, days: int = 7) -> List[Dict]:
        """Load pool snapshots from last N days."""
        snapshots = []
        
        if not self.pool_dir.exists():
            return snapshots
        
        # Load all jsonl files
        for f in sorted(self.pool_dir.glob('*.jsonl')):
            with open(f) as file:
                for line in file:
                    try:
                        snap = json.loads(line)
                        snapshots.append(snap)
                    except:
                        continue
        
        # Filter by date
        cutoff = datetime.utcnow() - timedelta(days=days)
        snapshots = [s for s in snapshots if datetime.fromisoformat(s['datetime']) > cutoff]
        
        # Sort by timestamp
        snapshots.sort(key=lambda x: x['timestamp'])
        
        return snapshots
    
    def load_swap_events(self, days: int = 7) -> List[Dict]:
        """Load swap events from last N days."""
        swaps = []
        
        if not self.swap_dir.exists():
            return swaps
        
        for f in sorted(self.swap_dir.glob('*.jsonl')):
            with open(f) as file:
                for line in file:
                    try:
                        swap = json.loads(line)
                        swaps.append(swap)
                    except:
                        continue
        
        cutoff = datetime.utcnow() - timedelta(days=days)
        swaps = [s for s in swaps if datetime.fromisoformat(s['datetime']) > cutoff]
        swaps.sort(key=lambda x: x['timestamp'])
        
        return swaps
    
    def compute_metrics(self, snapshots: List[Dict]) -> Dict:
        """Compute training metrics from snapshots."""
        if len(snapshots) < 2:
            return {}
        
        prices = [s['price'] for s in snapshots]
        ticks = [s.get('tick', 0) for s in snapshots]
        
        # Price volatility
        returns = np.diff(np.log(np.array(prices) + 1e-10))
        volatility = np.std(returns) if len(returns) > 0 else 0
        
        # Tick range
        tick_min = min(ticks)
        tick_max = max(ticks)
        tick_range = tick_max - tick_min
        
        # Price trend
        if len(prices) >= 2:
            trend = (prices[-1] - prices[0]) / (prices[0] + 1e-10)
        else:
            trend = 0
        
        return {
            'volatility': volatility,
            'tick_min': tick_min,
            'tick_max': tick_max,
            'tick_range': tick_range,
            'price_trend': trend,
            'avg_price': np.mean(prices),
            'snapshot_count': len(snapshots)
        }
    
    def compute_swap_volume(self, swaps: List[Dict], hours: int = 24) -> Dict:
        """Compute swap volume metrics with order flow analysis."""
        if not swaps:
            return {
                'volume_token0': 0, 'volume_token1': 0, 'swap_count': 0,
                'buy_volume': 0, 'sell_volume': 0, 'order_flow_imbalance': 0,
                'whale_net_flow': 0, 'unique_wallets': 0
            }
        
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        recent = [s for s in swaps if datetime.fromisoformat(s['datetime']) > cutoff]
        
        vol0 = sum(abs(int(s['amount0'])) for s in recent)
        vol1 = sum(abs(int(s['amount1'])) for s in recent)
        
        # Order flow analysis
        buy_volume = 0
        sell_volume = 0
        wallet_flows = {}
        
        for s in recent:
            amt0 = int(s['amount0'])
            wallet = s.get('recipient', '')
            
            if amt0 < 0:  # Buy
                buy_volume += abs(amt0)
            else:  # Sell
                sell_volume += abs(amt0)
            
            # Track per wallet
            if wallet not in wallet_flows:
                wallet_flows[wallet] = 0
            wallet_flows[wallet] += -amt0  # Net flow
        
        # Order flow imbalance (-1 to 1)
        total_vol = buy_volume + sell_volume
        ofi = (buy_volume - sell_volume) / total_vol if total_vol > 0 else 0
        
        # Whale flow (top wallet by volume)
        whale_net = 0
        if wallet_flows:
            sorted_wallets = sorted(wallet_flows.items(), key=lambda x: abs(x[1]), reverse=True)
            whale_net = sorted_wallets[0][1] if sorted_wallets else 0
        
        return {
            'volume_token0': vol0,
            'volume_token1': vol1,
            'swap_count': len(recent),
            'buy_volume': buy_volume,
            'sell_volume': sell_volume,
            'order_flow_imbalance': ofi,
            'whale_net_flow': whale_net,
            'unique_wallets': len(wallet_flows)
        }
    
    def build_state(self, snapshot: Dict, metrics: Dict, swap_metrics: Dict) -> np.ndarray:
        """Build 35-dim state vector from snapshot + metrics + order flow."""
        
        # Pool features (11)
        pool_features = [
            snapshot.get('price', 0),
            float(snapshot.get('liquidity', 0)) / 1e18,  # Normalize
            float(snapshot.get('sqrt_price_x96', 0)) / 1e24,
            0,  # fee_growth placeholder
            swap_metrics.get('volume_token0', 0) / 1e18,
            swap_metrics.get('volume_token1', 0) / 1e18,
            metrics.get('volatility', 0),
            metrics.get('price_trend', 0),
            snapshot.get('tick', 0) / 10000,  # Normalize tick
            metrics.get('tick_min', 0) / 10000,
            metrics.get('tick_max', 0) / 10000,
        ]
        
        # Market features (8) - NOW WITH ORDER FLOW
        market_features = [
            metrics.get('volatility', 0),  # hourly vol
            metrics.get('volatility', 0) * 2,  # daily vol proxy
            swap_metrics.get('order_flow_imbalance', 0),  # OFI: -1 to 1
            metrics.get('price_trend', 0),
            swap_metrics.get('unique_wallets', 0) / 50,  # Normalized wallet count
            swap_metrics.get('swap_count', 0) / 100,  # Activity level
            swap_metrics.get('buy_volume', 0) / (swap_metrics.get('sell_volume', 1) + 1e-10),  # Buy/sell ratio
            swap_metrics.get('whale_net_flow', 0) / 1e18,  # Whale direction
        ]
        
        # Position features (9) - placeholder for now
        position_features = [0] * 9
        
        # Portfolio features (7)
        portfolio_features = [
            snapshot.get('tvl_usd', 0) / 1e6,  # Normalize TVL
            float(snapshot.get('token_a_tvl', 0)),
            float(snapshot.get('token_b_tvl', 0)),
            snapshot.get('fees_earned_usd', 0),
            0,  # total IL placeholder
            0,  # sharpe placeholder
            0,  # max dd placeholder
        ]
        
        state = np.array(
            pool_features + market_features + position_features + portfolio_features,
            dtype=np.float32
        )
        
        return state
    
    def create_training_episodes(self, episode_length: int = 100) -> List[List[Dict]]:
        """Create training episodes from sequential snapshots."""
        snapshots = self.load_pool_snapshots(days=30)
        swaps = self.load_swap_events(days=30)
        
        if len(snapshots) < episode_length:
            return []
        
        metrics = self.compute_metrics(snapshots)
        swap_metrics = self.compute_swap_volume(swaps)
        
        # Build states for all snapshots
        states = []
        for snap in snapshots:
            state = self.build_state(snap, metrics, swap_metrics)
            states.append({
                'state': state,
                'snapshot': snap,
                'timestamp': snap['timestamp']
            })
        
        # Split into episodes
        episodes = []
        for i in range(0, len(states) - episode_length, episode_length // 2):
            episode = states[i:i + episode_length]
            episodes.append(episode)
        
        return episodes


def get_training_stats():
    """Get stats for all pools with collected data."""
    stats = {}
    
    if not POOL_DATA_DIR.exists():
        return stats
    
    for pool_dir in POOL_DATA_DIR.iterdir():
        if pool_dir.is_dir():
            loader = DataLoader(pool_dir.name)
            snapshots = loader.load_pool_snapshots(days=30)
            swaps = loader.load_swap_events(days=30)
            
            if snapshots:
                metrics = loader.compute_metrics(snapshots)
                swap_metrics = loader.compute_swap_volume(swaps)
                
                stats[pool_dir.name] = {
                    'snapshots': len(snapshots),
                    'swaps': len(swaps),
                    'days': (snapshots[-1]['timestamp'] - snapshots[0]['timestamp']) / 86400 if len(snapshots) > 1 else 0,
                    'volatility': metrics.get('volatility', 0),
                    'tick_range': metrics.get('tick_range', 0),
                    'ready_for_training': len(snapshots) >= 100
                }
    
    return stats


if __name__ == '__main__':
    print("📊 Training Data Stats\n")
    stats = get_training_stats()
    
    for pool, s in stats.items():
        ready = "✅" if s['ready_for_training'] else "❌"
        print(f"{ready} {pool}:")
        print(f"   Snapshots: {s['snapshots']}, Swaps: {s['swaps']}")
        print(f"   Days: {s['days']:.1f}, Volatility: {s['volatility']:.4f}")
        print()
