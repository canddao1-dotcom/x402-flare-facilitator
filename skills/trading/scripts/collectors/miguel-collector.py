#!/usr/bin/env python3
"""
Data Collector using ai-miguel UniV3 utilities
Leverages existing pool_provider for proper V3 data collection.
"""

import os
import sys
import json
import time
from datetime import datetime
from pathlib import Path

# Add ai-miguel to path
sys.path.insert(0, '/home/node/clawd/ai-miguel/src')

from flare_ai_defai.blockchain.pool_provider import (
    UniswapV3PoolProvider,
    DexConfig,
    PoolStats,
)

# Paths
SKILL_DIR = Path(__file__).parent.parent.parent
CONFIG_FILE = SKILL_DIR / 'config' / 'pools.json'
DATA_DIR = SKILL_DIR / 'data' / 'pool_history'

# DEX Configs for ai-miguel
DEX_CONFIGS = [
    DexConfig(
        factory='0x17AA157AC8C54034381b840Cb8f6bf7Fc355f0de',
        nft_manager='0xD9770b1C7A6ccd33C75b5bcB1c0078f46bE46657',
        universal_router='0x17ACa82378c2859E40d84a373b49eE0B318020C4',
        tag='enosys',
        metadata={},
    ),
    DexConfig(
        factory='0x8a362AA1c81ED0Ee2Ae677A8b59e0f563DD317De',
        nft_manager='0x8087E71f0e0d3C276cD189a39Ec2Dc9F2988C8a5',
        universal_router='0x',
        tag='sparkdex',
        metadata={},
    ),
]


class MiguelCollector:
    """Data collector using ai-miguel UniV3 utilities."""
    
    def __init__(self):
        self.provider = UniswapV3PoolProvider(DEX_CONFIGS)
        self.config = self.load_config()
    
    def load_config(self):
        with open(CONFIG_FILE) as f:
            return json.load(f)
    
    def get_enabled_pools(self):
        return {k: v for k, v in self.config['pools'].items() if v.get('enabled', False)}
    
    def collect_pool(self, name: str, pool_config: dict) -> dict:
        """Collect pool stats using ai-miguel provider."""
        try:
            # Use get_pool_stats from ai-miguel
            stats: PoolStats = self.provider.get_pool_stats(
                pool_config['address'],
                block=None  # Latest
            )
            
            return {
                'pool': pool_config['address'],
                'pool_name': name,
                'dex': pool_config.get('dex', stats.get('tag', 'unknown')),
                'token0': pool_config.get('token0', ''),
                'token1': pool_config.get('token1', ''),
                'fee': stats.get('fee', pool_config.get('fee', 0)),
                'block': stats.get('block', 0),
                'timestamp': int(datetime.utcnow().timestamp()),
                'datetime': datetime.utcnow().isoformat(),
                # Tick data - essential for LP training
                'tick': stats.get('tick', 0),
                'tick_spacing': stats.get('tick_spacing', 0),
                'sqrt_price_x96': str(stats.get('sqrt_price_x96', 0)),
                'price': stats.get('price', 0),
                'liquidity': str(stats.get('liquidity', 0)),
                'token_a_tvl': stats.get('token_a_tvl', 0),
                'token_b_tvl': stats.get('token_b_tvl', 0),
                'tvl_usd': stats.get('tvl_usd', 0),
                'fees_earned_token0': stats.get('fees_earned_token0', 0),
                'fees_earned_token1': stats.get('fees_earned_token1', 0),
                'fees_earned_usd': stats.get('fees_earned_usd', 0),
            }
        except Exception as e:
            print(f"  ❌ {name}: {e}")
            return None
    
    def save_snapshot(self, name: str, snapshot: dict):
        """Save snapshot to daily JSONL file."""
        pool_dir = DATA_DIR / name
        pool_dir.mkdir(parents=True, exist_ok=True)
        
        date_str = datetime.utcnow().strftime('%Y-%m-%d')
        daily_file = pool_dir / f'{date_str}.jsonl'
        
        with open(daily_file, 'a') as f:
            f.write(json.dumps(snapshot) + '\n')
    
    def collect_all(self):
        """Collect from all enabled pools."""
        pools = self.get_enabled_pools()
        print(f"\n📊 Collecting {len(pools)} pools @ {datetime.utcnow().strftime('%H:%M:%S')} UTC")
        
        success = 0
        for name, config in pools.items():
            snapshot = self.collect_pool(name, config)
            if snapshot:
                self.save_snapshot(name, snapshot)
                tvl = snapshot.get('tvl_usd', 0)
                tvl_str = f"${tvl:,.0f}" if tvl else "N/A"
                print(f"  ✓ {name}: price={snapshot['price']:.6f}, TVL={tvl_str}")
                success += 1
        
        print(f"  Collected {success}/{len(pools)} pools")
        return success
    
    def discover_pools(self, min_tvl: float = 10000):
        """Discover all V3 pools using ai-miguel."""
        print("🔍 Discovering pools...")
        
        all_pools = self.provider.fetch_pools()
        print(f"Found {len(all_pools)} total pools")
        
        # Get stats for pools with sufficient TVL
        stats = self.provider.get_all_pools_stats_with_batch_ticks(
            [p.address for p in all_pools]
        )
        
        # Filter by TVL
        good_pools = [s for s in stats if s.get('tvl_usd', 0) >= min_tvl]
        good_pools.sort(key=lambda x: x.get('tvl_usd', 0), reverse=True)
        
        print(f"\nPools with TVL >= ${min_tvl:,.0f}:")
        print("-" * 70)
        for p in good_pools[:20]:
            print(f"{p['tag']:12} | TVL: ${p['tvl_usd']:>12,.0f} | {p.get('token_in', '?')}/{p.get('token_out', '?')}")
        
        return good_pools
    
    def run_daemon(self, interval: int = 300):
        """Run as daemon."""
        print(f"🚀 Starting Miguel collector daemon")
        print(f"   Using ai-miguel UniswapV3PoolProvider")
        print(f"   Interval: {interval}s")
        print(f"   Pools: {len(self.get_enabled_pools())} enabled")
        
        while True:
            try:
                self.collect_all()
            except Exception as e:
                print(f"❌ Error: {e}")
            time.sleep(interval)


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['once', 'daemon', 'discover', 'status'], default='once', nargs='?')
    parser.add_argument('--interval', type=int, default=300)
    parser.add_argument('--min-tvl', type=float, default=10000)
    args = parser.parse_args()
    
    collector = MiguelCollector()
    
    if args.action == 'once':
        collector.collect_all()
    elif args.action == 'daemon':
        collector.run_daemon(args.interval)
    elif args.action == 'discover':
        collector.discover_pools(args.min_tvl)
    elif args.action == 'status':
        pools = collector.get_enabled_pools()
        print(f"Enabled pools: {len(pools)}")
        for name in pools:
            pool_dir = DATA_DIR / name
            count = sum(sum(1 for _ in open(f)) for f in pool_dir.glob('*.jsonl')) if pool_dir.exists() else 0
            print(f"  {name}: {count} snapshots")


if __name__ == '__main__':
    main()
