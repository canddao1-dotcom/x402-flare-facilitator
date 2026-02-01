#!/usr/bin/env python3
"""
Historical Data Fetcher for Backtesting
Fetches pool data from on-chain and APIs for training/backtesting.
"""

import sys
import os
import json
import time
import asyncio
from pathlib import Path
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional
import math

sys.path.insert(0, '/home/node/clawd/ai-miguel/src')

from web3 import Web3
import requests

# Config
RPC_URL = os.getenv('FLARE_RPC', 'https://flare-api.flare.network/ext/C/rpc')
DATA_DIR = Path(__file__).parent.parent / 'data'

# ABIs
POOL_ABI = [
    {"inputs": [], "name": "slot0", "outputs": [
        {"internalType": "uint160", "name": "sqrtPriceX96", "type": "uint160"},
        {"internalType": "int24", "name": "tick", "type": "int24"},
        {"internalType": "uint16", "name": "observationIndex", "type": "uint16"},
        {"internalType": "uint16", "name": "observationCardinality", "type": "uint16"},
        {"internalType": "uint16", "name": "observationCardinalityNext", "type": "uint16"},
        {"internalType": "uint8", "name": "feeProtocol", "type": "uint8"},
        {"internalType": "bool", "name": "unlocked", "type": "bool"}
    ], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "liquidity", "outputs": [
        {"internalType": "uint128", "name": "", "type": "uint128"}
    ], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "token0", "outputs": [
        {"internalType": "address", "name": "", "type": "address"}
    ], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "token1", "outputs": [
        {"internalType": "address", "name": "", "type": "address"}
    ], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "fee", "outputs": [
        {"internalType": "uint24", "name": "", "type": "uint24"}
    ], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "tickSpacing", "outputs": [
        {"internalType": "int24", "name": "", "type": "int24"}
    ], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "feeGrowthGlobal0X128", "outputs": [
        {"internalType": "uint256", "name": "", "type": "uint256"}
    ], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "feeGrowthGlobal1X128", "outputs": [
        {"internalType": "uint256", "name": "", "type": "uint256"}
    ], "stateMutability": "view", "type": "function"},
]

ERC20_ABI = [
    {"inputs": [], "name": "symbol", "outputs": [{"name": "", "type": "string"}], "stateMutability": "view", "type": "function"},
    {"inputs": [], "name": "decimals", "outputs": [{"name": "", "type": "uint8"}], "stateMutability": "view", "type": "function"},
]


class PoolDataFetcher:
    """Fetches and stores pool data for training."""
    
    def __init__(self, pool_address: str):
        self.pool_address = Web3.to_checksum_address(pool_address)
        self.w3 = Web3(Web3.HTTPProvider(RPC_URL))
        self.pool = self.w3.eth.contract(address=self.pool_address, abi=POOL_ABI)
        
        # Get pool info
        self.token0 = self.pool.functions.token0().call()
        self.token1 = self.pool.functions.token1().call()
        self.fee = self.pool.functions.fee().call()
        self.tick_spacing = self.pool.functions.tickSpacing().call()
        
        # Get token info
        token0_contract = self.w3.eth.contract(address=self.token0, abi=ERC20_ABI)
        token1_contract = self.w3.eth.contract(address=self.token1, abi=ERC20_ABI)
        
        self.token0_symbol = token0_contract.functions.symbol().call()
        self.token1_symbol = token1_contract.functions.symbol().call()
        self.token0_decimals = token0_contract.functions.decimals().call()
        self.token1_decimals = token1_contract.functions.decimals().call()
        
        print(f"📊 Pool: {self.token0_symbol}/{self.token1_symbol} ({self.fee/10000}%)")
    
    def get_current_state(self) -> Dict:
        """Get current pool state."""
        slot0 = self.pool.functions.slot0().call()
        liquidity = self.pool.functions.liquidity().call()
        fee_growth_0 = self.pool.functions.feeGrowthGlobal0X128().call()
        fee_growth_1 = self.pool.functions.feeGrowthGlobal1X128().call()
        
        sqrt_price_x96 = slot0[0]
        tick = slot0[1]
        
        # Calculate price from sqrtPriceX96
        # price = (sqrtPriceX96 / 2^96)^2 * 10^(decimals0 - decimals1)
        price = (sqrt_price_x96 / (2**96))**2 * 10**(self.token0_decimals - self.token1_decimals)
        
        return {
            'timestamp': datetime.now().isoformat(),
            'block': self.w3.eth.block_number,
            'pool_address': self.pool_address,
            'token0': self.token0_symbol,
            'token1': self.token1_symbol,
            'sqrt_price_x96': str(sqrt_price_x96),
            'tick': tick,
            'price': float(price),
            'liquidity': str(liquidity),
            'fee_growth_0_x128': str(fee_growth_0),
            'fee_growth_1_x128': str(fee_growth_1),
            'fee_tier': self.fee,
        }
    
    def fetch_historical_from_gecko(self, days: int = 30) -> List[Dict]:
        """Fetch historical OHLCV from GeckoTerminal."""
        print(f"📈 Fetching {days}d historical data from GeckoTerminal...")
        
        # GeckoTerminal API
        url = f"https://api.geckoterminal.com/api/v2/networks/flare/pools/{self.pool_address.lower()}/ohlcv/day"
        params = {
            'aggregate': 1,
            'limit': days,
            'currency': 'usd'
        }
        
        try:
            resp = requests.get(url, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            
            ohlcv_list = data.get('data', {}).get('attributes', {}).get('ohlcv_list', [])
            
            history = []
            for candle in ohlcv_list:
                timestamp, open_p, high, low, close, volume = candle
                history.append({
                    'timestamp': datetime.fromtimestamp(timestamp).isoformat(),
                    'open': float(open_p),
                    'high': float(high),
                    'low': float(low),
                    'close': float(close),
                    'volume': float(volume)
                })
            
            print(f"   ✅ Got {len(history)} days of data")
            return history
            
        except Exception as e:
            print(f"   ❌ GeckoTerminal error: {e}")
            return []
    
    def save_snapshot(self, filename: Optional[str] = None):
        """Save current state to file."""
        DATA_DIR.mkdir(exist_ok=True)
        
        state = self.get_current_state()
        
        if filename is None:
            filename = f"pool_{self.pool_address[:10]}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        filepath = DATA_DIR / filename
        with open(filepath, 'w') as f:
            json.dump(state, f, indent=2)
        
        print(f"💾 Saved snapshot: {filepath.name}")
        return filepath
    
    def collect_snapshots(self, count: int = 100, interval_seconds: int = 60):
        """Collect multiple snapshots over time."""
        print(f"📸 Collecting {count} snapshots at {interval_seconds}s intervals...")
        
        snapshots = []
        for i in range(count):
            state = self.get_current_state()
            snapshots.append(state)
            
            if (i + 1) % 10 == 0:
                print(f"   {i + 1}/{count} snapshots collected")
            
            if i < count - 1:
                time.sleep(interval_seconds)
        
        # Save all snapshots
        DATA_DIR.mkdir(exist_ok=True)
        filename = f"snapshots_{self.pool_address[:10]}_{datetime.now().strftime('%Y%m%d')}.json"
        filepath = DATA_DIR / filename
        
        with open(filepath, 'w') as f:
            json.dump(snapshots, f, indent=2)
        
        print(f"💾 Saved {len(snapshots)} snapshots: {filepath.name}")
        return snapshots
    
    def build_training_dataset(self, days: int = 30) -> Dict:
        """Build complete dataset for training."""
        print(f"🔧 Building training dataset...")
        
        # Current state
        current = self.get_current_state()
        
        # Historical OHLCV
        history = self.fetch_historical_from_gecko(days)
        
        # Calculate features
        if history:
            prices = [h['close'] for h in history]
            volumes = [h['volume'] for h in history]
            
            # Volatility (30d)
            returns = [(prices[i] - prices[i-1]) / prices[i-1] for i in range(1, len(prices))]
            volatility = float(np.std(returns)) if len(returns) > 1 else 0.05
            
            # Trend
            if len(prices) >= 7:
                trend = (prices[-1] - prices[-7]) / prices[-7]
            else:
                trend = 0.0
            
            # Average volume
            avg_volume = sum(volumes) / len(volumes) if volumes else 0
        else:
            volatility = 0.05
            trend = 0.0
            avg_volume = 0
        
        dataset = {
            'pool_address': self.pool_address,
            'token0': self.token0_symbol,
            'token1': self.token1_symbol,
            'fee_tier': self.fee,
            'current_state': current,
            'historical_ohlcv': history,
            'computed_features': {
                'volatility_30d': volatility,
                'trend_7d': trend,
                'avg_daily_volume': avg_volume
            },
            'created_at': datetime.now().isoformat()
        }
        
        # Save dataset
        DATA_DIR.mkdir(exist_ok=True)
        filename = f"dataset_{self.pool_address[:10]}_{datetime.now().strftime('%Y%m%d')}.json"
        filepath = DATA_DIR / filename
        
        with open(filepath, 'w') as f:
            json.dump(dataset, f, indent=2)
        
        print(f"✅ Dataset saved: {filepath.name}")
        print(f"   Pool: {self.token0_symbol}/{self.token1_symbol}")
        print(f"   History: {len(history)} days")
        print(f"   Volatility: {volatility:.4f}")
        print(f"   Trend: {trend:+.2%}")
        
        return dataset


# Need numpy for calculations
import numpy as np


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Fetch pool data')
    parser.add_argument('--pool', '-p', default='0x25b4f3930934f0a3cbb885c624ecee75a2917144',
                        help='Pool address')
    parser.add_argument('--action', '-a', default='dataset',
                        choices=['snapshot', 'collect', 'dataset'],
                        help='Action to perform')
    parser.add_argument('--days', '-d', type=int, default=30, help='Days of history')
    parser.add_argument('--count', '-c', type=int, default=100, help='Snapshot count')
    parser.add_argument('--interval', '-i', type=int, default=60, help='Interval seconds')
    
    args = parser.parse_args()
    
    fetcher = PoolDataFetcher(args.pool)
    
    if args.action == 'snapshot':
        fetcher.save_snapshot()
    elif args.action == 'collect':
        fetcher.collect_snapshots(args.count, args.interval)
    elif args.action == 'dataset':
        fetcher.build_training_dataset(args.days)


if __name__ == '__main__':
    main()
