#!/usr/bin/env python3
"""
Data Collector for Trading Engine
Uses ai-miguel UniV3 utilities to collect real pool data for training.

Collects:
- Pool state snapshots (price, liquidity, tick, TVL)
- Swap volumes per time bucket
- Fee accumulation
- FTSO prices for correlation

Stores data in skills/trading/data/pool_history/
"""

import os
import sys
import json
import time
import argparse
from datetime import datetime, timedelta
from pathlib import Path

# Add ai-miguel to path
sys.path.insert(0, '/home/node/clawd/ai-miguel/src')

from web3 import Web3, HTTPProvider

# Try to import ai-miguel utilities
try:
    from flare_ai_defai.blockchain.pool_provider import (
        UniswapV3PoolProvider,
        DexConfig,
    )
    HAS_POOL_PROVIDER = True
except ImportError as e:
    print(f"Warning: Could not import pool_provider: {e}")
    HAS_POOL_PROVIDER = False

# Constants
RPC_URL = os.getenv('RPC_URL', 'https://flare-api.flare.network/ext/C/rpc')
DATA_DIR = Path('/home/node/clawd/skills/trading/data/pool_history')

# Pool configurations
POOLS = {
    'sflr-wflr-enosys': {
        'address': '0x25b4f3930934f0a3cbb885c624ecee75a2917144',
        'dex': 'enosys',
        'token0': 'WFLR',
        'token1': 'sFLR',
        'fee': 500,  # 0.05%
    },
    'sflr-wflr-sparkdex': {
        'address': '0xc9baba3f36ccaa54675deecc327ec7eaa48cb97d',
        'dex': 'sparkdex',
        'token0': 'WFLR',
        'token1': 'sFLR',
        'fee': 100,  # 0.01%
    },
    'stxrp-fxrp-enosys': {
        'address': '0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770',
        'dex': 'enosys',
        'token0': 'FXRP',
        'token1': 'stXRP',
        'fee': 500,
    },
    'wflr-fxrp-enosys': {
        'address': '0x4663fd36abcf730c816f7fd02f8ffb1f7c0e01c0',
        'dex': 'enosys',
        'token0': 'WFLR',
        'token1': 'FXRP',
        'fee': 3000,
    },
}

# DEX configurations
DEX_CONFIGS = {
    'enosys': DexConfig(
        factory='0x17AA157AC8C54034381b840Cb8f6bf7Fc355f0de',
        nft_manager='0xD9770b1C7A6ccd33C75b5bcB1c0078f46bE46657',
        universal_router='0x17ACa82378c2859E40d84a373b49eE0B318020C4',
        tag='enosys',
        metadata={},
    ),
    'sparkdex': DexConfig(
        factory='0x8a362AA1c81ED0Ee2Ae677A8b59e0f563DD317De',
        nft_manager='0x8087E71f0e0d3C276cD189a39Ec2Dc9F2988C8a5',
        universal_router='0x',
        tag='sparkdex',
        metadata={},
    ),
} if HAS_POOL_PROVIDER else {}


class DataCollector:
    """Collects pool data for training."""
    
    def __init__(self, pool_name: str):
        if pool_name not in POOLS:
            raise ValueError(f"Unknown pool: {pool_name}. Available: {list(POOLS.keys())}")
        
        self.pool_config = POOLS[pool_name]
        self.pool_name = pool_name
        self.pool_address = self.pool_config['address']
        
        # Initialize web3 with POA middleware for Flare
        from web3.middleware import ExtraDataToPOAMiddleware
        self.w3 = Web3(HTTPProvider(RPC_URL))
        self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
        
        # Data directory
        self.data_dir = DATA_DIR / pool_name
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        # Pool ABI (minimal for slot0 and liquidity)
        self.pool_abi = [
            {
                "inputs": [],
                "name": "slot0",
                "outputs": [
                    {"name": "sqrtPriceX96", "type": "uint160"},
                    {"name": "tick", "type": "int24"},
                    {"name": "observationIndex", "type": "uint16"},
                    {"name": "observationCardinality", "type": "uint16"},
                    {"name": "observationCardinalityNext", "type": "uint16"},
                    {"name": "feeProtocol", "type": "uint8"},
                    {"name": "unlocked", "type": "bool"}
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "liquidity",
                "outputs": [{"name": "", "type": "uint128"}],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "feeGrowthGlobal0X128",
                "outputs": [{"name": "", "type": "uint256"}],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "feeGrowthGlobal1X128",
                "outputs": [{"name": "", "type": "uint256"}],
                "stateMutability": "view",
                "type": "function"
            },
        ]
        
        self.pool_contract = self.w3.eth.contract(
            address=self.w3.to_checksum_address(self.pool_address),
            abi=self.pool_abi
        )
    
    def get_pool_state(self, block: int = None) -> dict:
        """Get current pool state."""
        try:
            block_id = block if block else 'latest'
            
            slot0 = self.pool_contract.functions.slot0().call(block_identifier=block_id)
            liquidity = self.pool_contract.functions.liquidity().call(block_identifier=block_id)
            fee_growth_0 = self.pool_contract.functions.feeGrowthGlobal0X128().call(block_identifier=block_id)
            fee_growth_1 = self.pool_contract.functions.feeGrowthGlobal1X128().call(block_identifier=block_id)
            
            # Calculate price from sqrtPriceX96
            sqrt_price_x96 = slot0[0]
            tick = slot0[1]
            price = (sqrt_price_x96 / (2**96)) ** 2
            
            # Get block info
            if block:
                block_info = self.w3.eth.get_block(block)
                timestamp = block_info['timestamp']
            else:
                block_info = self.w3.eth.get_block('latest')
                block = block_info['number']
                timestamp = block_info['timestamp']
            
            return {
                'pool': self.pool_address,
                'pool_name': self.pool_name,
                'block': block,
                'timestamp': timestamp,
                'datetime': datetime.utcfromtimestamp(timestamp).isoformat(),
                'sqrtPriceX96': str(sqrt_price_x96),
                'tick': tick,
                'liquidity': str(liquidity),
                'price': price,
                'feeGrowthGlobal0X128': str(fee_growth_0),
                'feeGrowthGlobal1X128': str(fee_growth_1),
                'token0': self.pool_config['token0'],
                'token1': self.pool_config['token1'],
                'fee': self.pool_config['fee'],
            }
        except Exception as e:
            print(f"Error getting pool state: {e}")
            return None
    
    def collect_snapshot(self) -> dict:
        """Collect and save a snapshot."""
        state = self.get_pool_state()
        if not state:
            return None
        
        # Save to daily file
        date_str = datetime.utcnow().strftime('%Y-%m-%d')
        daily_file = self.data_dir / f'{date_str}.jsonl'
        
        with open(daily_file, 'a') as f:
            f.write(json.dumps(state) + '\n')
        
        print(f"✓ Snapshot saved: block={state['block']}, tick={state['tick']}, price={state['price']:.6f}")
        return state
    
    def collect_historical(self, from_block: int, to_block: int, step: int = 1800):
        """Collect historical snapshots between blocks.
        
        Args:
            from_block: Starting block
            to_block: Ending block
            step: Block step (~1 hour = 1800 blocks at 2s/block)
        """
        print(f"Collecting historical data from block {from_block} to {to_block}")
        
        snapshots = []
        for block in range(from_block, to_block, step):
            state = self.get_pool_state(block)
            if state:
                snapshots.append(state)
                print(f"  Block {block}: tick={state['tick']}, price={state['price']:.6f}")
            time.sleep(0.1)  # Rate limit
        
        # Save to file
        output_file = self.data_dir / f'historical_{from_block}_{to_block}.json'
        with open(output_file, 'w') as f:
            json.dump(snapshots, f, indent=2)
        
        print(f"\n✓ Saved {len(snapshots)} snapshots to {output_file}")
        return snapshots
    
    def run_daemon(self, interval_seconds: int = 300):
        """Run as daemon, collecting snapshots every interval."""
        print(f"Starting data collector daemon for {self.pool_name}")
        print(f"Interval: {interval_seconds}s")
        print(f"Data dir: {self.data_dir}")
        
        while True:
            try:
                self.collect_snapshot()
            except Exception as e:
                print(f"Error collecting snapshot: {e}")
            
            time.sleep(interval_seconds)
    
    def get_training_dataset(self, days: int = 7) -> list:
        """Load recent data for training."""
        all_data = []
        
        # Load daily files
        for i in range(days):
            date = datetime.utcnow() - timedelta(days=i)
            date_str = date.strftime('%Y-%m-%d')
            daily_file = self.data_dir / f'{date_str}.jsonl'
            
            if daily_file.exists():
                with open(daily_file, 'r') as f:
                    for line in f:
                        all_data.append(json.loads(line))
        
        # Sort by timestamp
        all_data.sort(key=lambda x: x['timestamp'])
        
        return all_data


def main():
    parser = argparse.ArgumentParser(description='Collect pool data for training')
    parser.add_argument('action', choices=['snapshot', 'historical', 'daemon', 'status', 'dataset'],
                       help='Action to perform')
    parser.add_argument('--pool', default='sflr-wflr-enosys',
                       help='Pool name')
    parser.add_argument('--from-block', type=int,
                       help='Starting block for historical collection')
    parser.add_argument('--to-block', type=int,
                       help='Ending block for historical collection')
    parser.add_argument('--step', type=int, default=1800,
                       help='Block step for historical (default: 1800 ~1hr)')
    parser.add_argument('--interval', type=int, default=300,
                       help='Daemon interval in seconds (default: 300)')
    parser.add_argument('--days', type=int, default=7,
                       help='Days of data for dataset')
    
    args = parser.parse_args()
    
    collector = DataCollector(args.pool)
    
    if args.action == 'snapshot':
        state = collector.collect_snapshot()
        if state:
            print(json.dumps(state, indent=2))
    
    elif args.action == 'historical':
        if not args.from_block or not args.to_block:
            # Default: last 24 hours
            current_block = collector.w3.eth.block_number
            args.to_block = current_block
            args.from_block = current_block - (24 * 60 * 30)  # ~24 hours at 2s/block
        
        collector.collect_historical(args.from_block, args.to_block, args.step)
    
    elif args.action == 'daemon':
        collector.run_daemon(args.interval)
    
    elif args.action == 'status':
        print(f"Pool: {args.pool}")
        print(f"Address: {collector.pool_address}")
        print(f"Data dir: {collector.data_dir}")
        
        # Count snapshots
        total_snapshots = 0
        for f in collector.data_dir.glob('*.jsonl'):
            with open(f, 'r') as file:
                total_snapshots += sum(1 for _ in file)
        
        print(f"Total snapshots: {total_snapshots}")
        
        # Latest state
        state = collector.get_pool_state()
        if state:
            print(f"\nLatest state:")
            print(f"  Block: {state['block']}")
            print(f"  Tick: {state['tick']}")
            print(f"  Price: {state['price']:.6f}")
            print(f"  Liquidity: {state['liquidity']}")
    
    elif args.action == 'dataset':
        data = collector.get_training_dataset(args.days)
        print(f"Loaded {len(data)} snapshots from last {args.days} days")
        
        if data:
            # Save as training dataset
            output = DATA_DIR / f'{args.pool}_dataset.json'
            with open(output, 'w') as f:
                json.dump(data, f, indent=2)
            print(f"Saved to {output}")


if __name__ == '__main__':
    main()
