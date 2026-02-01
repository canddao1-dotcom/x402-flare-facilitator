#!/usr/bin/env python3
"""
Swap Event Collector
Tracks individual swaps: wallet address, amounts, direction.
Runs hourly to collect swap events from V3 pools.
"""

import os
import sys
import json
import time
from datetime import datetime
from pathlib import Path

# Add ai-miguel to path
sys.path.insert(0, '/home/node/clawd/ai-miguel/src')

from web3 import Web3, HTTPProvider
from web3.middleware import ExtraDataToPOAMiddleware

# Paths
SKILL_DIR = Path(__file__).parent.parent.parent
CONFIG_FILE = SKILL_DIR / 'config' / 'pools.json'
DATA_DIR = SKILL_DIR / 'data' / 'swaps'

# RPC
RPC_URL = os.getenv('RPC_URL', 'https://flare-api.flare.network/ext/C/rpc')

# Swap event signature (Uniswap V3)
SWAP_EVENT_TOPIC = '0x' + Web3.keccak(text="Swap(address,address,int256,int256,uint160,uint128,int24)").hex()

# Pool ABI for decoding
POOL_ABI = [
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "sender", "type": "address"},
            {"indexed": True, "name": "recipient", "type": "address"},
            {"indexed": False, "name": "amount0", "type": "int256"},
            {"indexed": False, "name": "amount1", "type": "int256"},
            {"indexed": False, "name": "sqrtPriceX96", "type": "uint160"},
            {"indexed": False, "name": "liquidity", "type": "uint128"},
            {"indexed": False, "name": "tick", "type": "int24"}
        ],
        "name": "Swap",
        "type": "event"
    }
]


class SwapCollector:
    """Collects swap events from V3 pools."""
    
    def __init__(self):
        self.w3 = Web3(HTTPProvider(RPC_URL))
        self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
        self.config = self.load_config()
        self.last_block_file = DATA_DIR / 'last_block.json'
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    def load_config(self):
        with open(CONFIG_FILE) as f:
            return json.load(f)
    
    def get_enabled_pools(self):
        return {k: v for k, v in self.config['pools'].items() if v.get('enabled', False)}
    
    def get_last_block(self, pool_name: str) -> int:
        """Get last processed block for a pool."""
        if self.last_block_file.exists():
            with open(self.last_block_file) as f:
                data = json.load(f)
                return data.get(pool_name, 0)
        return 0
    
    def save_last_block(self, pool_name: str, block: int):
        """Save last processed block for a pool."""
        data = {}
        if self.last_block_file.exists():
            with open(self.last_block_file) as f:
                data = json.load(f)
        data[pool_name] = block
        with open(self.last_block_file, 'w') as f:
            json.dump(data, f)
    
    def get_swaps(self, pool_address: str, from_block: int, to_block: int) -> list:
        """Fetch swap events from a pool."""
        pool_address = self.w3.to_checksum_address(pool_address)
        
        # Batch requests (RPC limits to 30 blocks per query)
        BATCH_SIZE = 25
        logs = []
        
        for batch_start in range(from_block, to_block + 1, BATCH_SIZE):
            batch_end = min(batch_start + BATCH_SIZE - 1, to_block)
            try:
                batch_logs = self.w3.eth.get_logs({
                    'address': pool_address,
                    'topics': [SWAP_EVENT_TOPIC],
                    'fromBlock': batch_start,
                    'toBlock': batch_end
                })
                logs.extend(batch_logs)
            except Exception as e:
                # Skip failed batches
                continue
        
        swaps = []
        contract = self.w3.eth.contract(address=pool_address, abi=POOL_ABI)
        
        for log in logs:
            try:
                # Decode event
                event = contract.events.Swap().process_log(log)
                
                # Get block timestamp
                block = self.w3.eth.get_block(log['blockNumber'])
                
                swap = {
                    'block': log['blockNumber'],
                    'tx_hash': log['transactionHash'].hex(),
                    'log_index': log['logIndex'],
                    'timestamp': block['timestamp'],
                    'datetime': datetime.utcfromtimestamp(block['timestamp']).isoformat(),
                    'sender': event['args']['sender'],
                    'recipient': event['args']['recipient'],
                    'amount0': str(event['args']['amount0']),
                    'amount1': str(event['args']['amount1']),
                    'sqrt_price_x96': str(event['args']['sqrtPriceX96']),
                    'liquidity': str(event['args']['liquidity']),
                    'tick': event['args']['tick'],
                    # Direction: positive amount0 = sell token0, negative = buy token0
                    'direction': 'sell_token0' if event['args']['amount0'] > 0 else 'buy_token0'
                }
                swaps.append(swap)
            except Exception as e:
                print(f"    Error decoding swap: {e}")
                continue
        
        return swaps
    
    def collect_pool(self, name: str, pool_config: dict, lookback_blocks: int = 1800) -> int:
        """Collect swaps for a single pool."""
        pool_address = pool_config['address']
        
        current_block = self.w3.eth.block_number
        last_block = self.get_last_block(name)
        
        # If first run, only look back lookback_blocks
        if last_block == 0:
            from_block = current_block - lookback_blocks
        else:
            from_block = last_block + 1
        
        if from_block >= current_block:
            return 0
        
        # Fetch swaps
        swaps = self.get_swaps(pool_address, from_block, current_block)
        
        if swaps:
            # Save to daily file
            pool_dir = DATA_DIR / name
            pool_dir.mkdir(parents=True, exist_ok=True)
            
            date_str = datetime.utcnow().strftime('%Y-%m-%d')
            daily_file = pool_dir / f'{date_str}.jsonl'
            
            with open(daily_file, 'a') as f:
                for swap in swaps:
                    swap['pool'] = pool_address
                    swap['pool_name'] = name
                    f.write(json.dumps(swap) + '\n')
        
        # Update last block
        self.save_last_block(name, current_block)
        
        return len(swaps)
    
    def collect_all(self, lookback_blocks: int = 1800):
        """Collect swaps from all enabled pools."""
        pools = self.get_enabled_pools()
        print(f"\n🔄 Collecting swaps from {len(pools)} pools @ {datetime.utcnow().strftime('%H:%M:%S')} UTC")
        
        total_swaps = 0
        for name, config in pools.items():
            try:
                count = self.collect_pool(name, config, lookback_blocks)
                if count > 0:
                    print(f"  ✓ {name}: {count} swaps")
                total_swaps += count
            except Exception as e:
                print(f"  ❌ {name}: {e}")
        
        print(f"  Total: {total_swaps} swaps collected")
        return total_swaps
    
    def run_daemon(self, interval: int = 3600):
        """Run as daemon, collecting hourly."""
        print(f"🚀 Starting swap collector daemon")
        print(f"   Interval: {interval}s ({interval//60} min)")
        print(f"   Pools: {len(self.get_enabled_pools())} enabled")
        print(f"   Data dir: {DATA_DIR}")
        
        while True:
            try:
                self.collect_all()
            except Exception as e:
                print(f"❌ Error: {e}")
            time.sleep(interval)
    
    def stats(self):
        """Show swap collection stats."""
        pools = self.get_enabled_pools()
        print(f"📊 Swap Collection Stats\n")
        
        total_swaps = 0
        for name in pools:
            pool_dir = DATA_DIR / name
            count = 0
            if pool_dir.exists():
                for f in pool_dir.glob('*.jsonl'):
                    count += sum(1 for _ in open(f))
            total_swaps += count
            print(f"  {name}: {count} swaps")
        
        print(f"\n  Total: {total_swaps} swaps")
        
        # Show sample
        sample_file = DATA_DIR / 'sflr-wflr-enosys' / f'{datetime.utcnow().strftime("%Y-%m-%d")}.jsonl'
        if sample_file.exists():
            print(f"\n📋 Recent swaps (sflr-wflr-enosys):")
            with open(sample_file) as f:
                lines = f.readlines()[-5:]
                for line in lines:
                    swap = json.loads(line)
                    amt0 = int(swap['amount0']) / 1e18
                    amt1 = int(swap['amount1']) / 1e18
                    print(f"  {swap['datetime'][:16]} | {swap['direction']:12} | {abs(amt0):.2f} / {abs(amt1):.2f} | {swap['recipient'][:10]}...")


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['once', 'daemon', 'stats'], default='once', nargs='?')
    parser.add_argument('--interval', type=int, default=3600, help='Daemon interval (default 1 hour)')
    parser.add_argument('--lookback', type=int, default=1800, help='Initial lookback blocks (~1hr)')
    args = parser.parse_args()
    
    collector = SwapCollector()
    
    if args.action == 'once':
        collector.collect_all(args.lookback)
    elif args.action == 'daemon':
        collector.run_daemon(args.interval)
    elif args.action == 'stats':
        collector.stats()


if __name__ == '__main__':
    main()
