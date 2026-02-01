#!/usr/bin/env python3
"""
Multi-Pool Data Collector
Collects snapshots from ALL enabled pools in config.
"""

import os
import sys
import json
import time
from datetime import datetime
from pathlib import Path

from web3 import Web3, HTTPProvider
from web3.middleware import ExtraDataToPOAMiddleware

# Paths
SKILL_DIR = Path(__file__).parent.parent.parent
CONFIG_FILE = SKILL_DIR / 'config' / 'pools.json'
DATA_DIR = SKILL_DIR / 'data' / 'pool_history'

# RPC
RPC_URL = os.getenv('RPC_URL', 'https://flare-api.flare.network/ext/C/rpc')

# Pool ABI
POOL_ABI = [
    {"inputs": [], "name": "slot0", "outputs": [
        {"name": "sqrtPriceX96", "type": "uint160"},
        {"name": "tick", "type": "int24"},
        {"name": "observationIndex", "type": "uint16"},
        {"name": "observationCardinality", "type": "uint16"},
        {"name": "observationCardinalityNext", "type": "uint16"},
        {"name": "feeProtocol", "type": "uint8"},
        {"name": "unlocked", "type": "bool"}
    ], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "liquidity", "outputs": [{"type": "uint128"}], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "feeGrowthGlobal0X128", "outputs": [{"type": "uint256"}], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "feeGrowthGlobal1X128", "outputs": [{"type": "uint256"}], "stateMutability": "view", "type": "function"},
]


class MultiCollector:
    def __init__(self):
        self.w3 = Web3(HTTPProvider(RPC_URL))
        self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
        self.config = self.load_config()
    
    def load_config(self):
        with open(CONFIG_FILE) as f:
            return json.load(f)
    
    def get_enabled_pools(self):
        return {k: v for k, v in self.config['pools'].items() if v.get('enabled', False)}
    
    def collect_pool(self, name: str, pool_config: dict) -> dict:
        """Collect snapshot from a single pool."""
        try:
            contract = self.w3.eth.contract(
                address=self.w3.to_checksum_address(pool_config['address']),
                abi=POOL_ABI
            )
            
            slot0 = contract.functions.slot0().call()
            liquidity = contract.functions.liquidity().call()
            fg0 = contract.functions.feeGrowthGlobal0X128().call()
            fg1 = contract.functions.feeGrowthGlobal1X128().call()
            
            block = self.w3.eth.get_block('latest')
            
            # Calculate price from sqrtPriceX96
            sqrt_price_x96 = slot0[0]
            tick = slot0[1]
            price = (sqrt_price_x96 / (2**96)) ** 2
            
            return {
                'pool': pool_config['address'],
                'pool_name': name,
                'dex': pool_config.get('dex', 'unknown'),
                'token0': pool_config.get('token0', ''),
                'token1': pool_config.get('token1', ''),
                'fee': pool_config.get('fee', 0),
                'block': block['number'],
                'timestamp': block['timestamp'],
                'datetime': datetime.utcfromtimestamp(block['timestamp']).isoformat(),
                'sqrtPriceX96': str(sqrt_price_x96),
                'tick': tick,
                'liquidity': str(liquidity),
                'price': price,
                'feeGrowthGlobal0X128': str(fg0),
                'feeGrowthGlobal1X128': str(fg1),
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
        """Collect snapshots from all enabled pools."""
        pools = self.get_enabled_pools()
        print(f"\n📊 Collecting {len(pools)} pools @ {datetime.utcnow().strftime('%H:%M:%S')} UTC")
        
        success = 0
        for name, config in pools.items():
            snapshot = self.collect_pool(name, config)
            if snapshot:
                self.save_snapshot(name, snapshot)
                print(f"  ✓ {name}: tick={snapshot['tick']}, price={snapshot['price']:.6f}")
                success += 1
        
        print(f"  Collected {success}/{len(pools)} pools")
        return success
    
    def run_daemon(self, interval: int = 300):
        """Run as daemon, collecting all pools every interval."""
        print(f"🚀 Starting multi-pool collector daemon")
        print(f"   Interval: {interval}s")
        print(f"   Pools: {len(self.get_enabled_pools())} enabled")
        print(f"   Data dir: {DATA_DIR}")
        
        while True:
            try:
                self.collect_all()
            except Exception as e:
                print(f"❌ Error: {e}")
            
            time.sleep(interval)


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['once', 'daemon', 'status'], default='once', nargs='?')
    parser.add_argument('--interval', type=int, default=300)
    args = parser.parse_args()
    
    collector = MultiCollector()
    
    if args.action == 'once':
        collector.collect_all()
    elif args.action == 'daemon':
        collector.run_daemon(args.interval)
    elif args.action == 'status':
        pools = collector.get_enabled_pools()
        print(f"Enabled pools: {len(pools)}")
        for name, config in pools.items():
            pool_dir = DATA_DIR / name
            count = 0
            if pool_dir.exists():
                for f in pool_dir.glob('*.jsonl'):
                    count += sum(1 for _ in open(f))
            print(f"  {name}: {count} snapshots ({config['dex']})")


if __name__ == '__main__':
    main()
