#!/usr/bin/env python3
"""
State Normalizer for Trading Engine
Normalizes features to prevent exploding gradients during RL training.
"""

import numpy as np
from typing import Dict, Optional
import json
from pathlib import Path


class StateNormalizer:
    """
    Running mean/std normalizer for state features.
    Uses Welford's online algorithm for numerical stability.
    """
    
    def __init__(self, state_dim: int, clip_range: float = 10.0):
        self.state_dim = state_dim
        self.clip_range = clip_range
        
        # Running statistics
        self.mean = np.zeros(state_dim, dtype=np.float64)
        self.var = np.ones(state_dim, dtype=np.float64)
        self.count = 0
        
        # Feature ranges for manual normalization
        self.feature_ranges = self._default_ranges()
    
    def _default_ranges(self) -> Dict[str, tuple]:
        """Default expected ranges for each feature group."""
        return {
            # Pool features (11)
            'price': (0.0001, 1000),           # Wide range for different pairs
            'liquidity': (1e3, 1e12),          # Pool liquidity
            'fee_growth_0': (0, 1e20),         # Fee growth accumulators
            'fee_growth_1': (0, 1e20),
            'volume_24h': (0, 1e9),            # Daily volume
            'fees_24h': (0, 1e7),              # Daily fees
            'volatility': (0, 1),              # 0-100%
            'trend': (-1, 1),                  # Already normalized
            'tick': (-900000, 900000),         # Uniswap tick range
            'tick_lower': (-900000, 900000),
            'tick_upper': (-900000, 900000),
            
            # Market features (8)
            'vol_1h': (0, 0.5),
            'vol_24h': (0, 1),
            'implied_vol': (0, 2),
            'volume_trend': (-1, 1),
            'liq_depth': (0, 10),
            'arb_opps': (0, 100),
            'corr_btc': (-1, 1),
            'corr_eth': (-1, 1),
            
            # Position features (9)
            'pos_tick_lower': (-900000, 900000),
            'pos_tick_upper': (-900000, 900000),
            'pos_liquidity': (0, 1e12),
            'amount0': (0, 1e9),
            'amount1': (0, 1e9),
            'pos_value': (0, 1e9),
            'il': (-1, 1),
            'fees_earned': (0, 1e6),
            'in_range': (0, 1),
            
            # Portfolio features (7)
            'portfolio_value': (0, 1e9),
            'balance_0': (0, 1e9),
            'balance_1': (0, 1e9),
            'total_fees': (0, 1e6),
            'total_il': (-1e6, 1e6),
            'sharpe': (-5, 5),
            'max_dd': (0, 1),
        }
    
    def normalize_by_range(self, state: np.ndarray) -> np.ndarray:
        """
        Normalize state using predefined feature ranges.
        Maps features to approximately [-1, 1] range.
        """
        normalized = np.zeros_like(state, dtype=np.float32)
        
        # Feature indices mapping
        # Pool: 0-10, Market: 11-18, Position: 19-27, Portfolio: 28-34
        ranges = [
            # Pool features
            (0.0001, 1000),    # price
            (1e3, 1e12),       # liquidity
            (0, 1e20),         # fee_growth_0
            (0, 1e20),         # fee_growth_1
            (0, 1e9),          # volume_24h
            (0, 1e7),          # fees_24h
            (0, 1),            # volatility
            (-1, 1),           # trend
            (-900000, 900000), # tick
            (-900000, 900000), # tick_lower
            (-900000, 900000), # tick_upper
            
            # Market features
            (0, 0.5),          # vol_1h
            (0, 1),            # vol_24h
            (0, 2),            # implied_vol
            (-1, 1),           # volume_trend
            (0, 10),           # liq_depth
            (0, 100),          # arb_opps
            (-1, 1),           # corr_btc
            (-1, 1),           # corr_eth
            
            # Position features
            (-900000, 900000), # pos_tick_lower
            (-900000, 900000), # pos_tick_upper
            (0, 1e12),         # pos_liquidity
            (0, 1e9),          # amount0
            (0, 1e9),          # amount1
            (0, 1e9),          # pos_value
            (-1, 1),           # il
            (0, 1e6),          # fees_earned
            (0, 1),            # in_range
            
            # Portfolio features
            (0, 1e9),          # portfolio_value
            (0, 1e9),          # balance_0
            (0, 1e9),          # balance_1
            (0, 1e6),          # total_fees
            (-1e6, 1e6),       # total_il
            (-5, 5),           # sharpe
            (0, 1),            # max_dd
        ]
        
        for i, (low, high) in enumerate(ranges):
            if i >= len(state):
                break
            
            # Normalize to [-1, 1]
            if high > low:
                normalized[i] = 2.0 * (state[i] - low) / (high - low) - 1.0
            else:
                normalized[i] = 0.0
            
            # Clip to prevent extreme values
            normalized[i] = np.clip(normalized[i], -self.clip_range, self.clip_range)
        
        return normalized
    
    def update(self, state: np.ndarray):
        """Update running statistics with new observation."""
        self.count += 1
        
        delta = state - self.mean
        self.mean += delta / self.count
        delta2 = state - self.mean
        self.var += delta * delta2
    
    def normalize_running(self, state: np.ndarray) -> np.ndarray:
        """Normalize using running mean/std."""
        if self.count < 2:
            return state
        
        std = np.sqrt(self.var / (self.count - 1) + 1e-8)
        normalized = (state - self.mean) / std
        
        return np.clip(normalized, -self.clip_range, self.clip_range).astype(np.float32)
    
    def save(self, path: str):
        """Save normalizer state."""
        data = {
            'state_dim': self.state_dim,
            'clip_range': self.clip_range,
            'mean': self.mean.tolist(),
            'var': self.var.tolist(),
            'count': self.count
        }
        with open(path, 'w') as f:
            json.dump(data, f)
    
    def load(self, path: str):
        """Load normalizer state."""
        with open(path, 'r') as f:
            data = json.load(f)
        
        self.state_dim = data['state_dim']
        self.clip_range = data['clip_range']
        self.mean = np.array(data['mean'])
        self.var = np.array(data['var'])
        self.count = data['count']


def test_normalizer():
    """Test the normalizer."""
    normalizer = StateNormalizer(state_dim=35)
    
    # Generate random state with realistic values
    state = np.array([
        1.75,           # price
        1e9,            # liquidity
        1e18,           # fee_growth_0
        1e18,           # fee_growth_1
        1e6,            # volume_24h
        3000,           # fees_24h
        0.05,           # volatility
        0.3,            # trend
        5500,           # tick
        5000,           # tick_lower
        6000,           # tick_upper
        0.02,           # vol_1h
        0.05,           # vol_24h
        0.3,            # implied_vol
        0.1,            # volume_trend
        2.0,            # liq_depth
        5,              # arb_opps
        0.7,            # corr_btc
        0.8,            # corr_eth
        5000,           # pos_tick_lower
        6000,           # pos_tick_upper
        1e8,            # pos_liquidity
        1000,           # amount0
        500,            # amount1
        2000,           # pos_value
        -0.02,          # il
        50,             # fees_earned
        1.0,            # in_range
        15000,          # portfolio_value
        8000,           # balance_0
        4000,           # balance_1
        200,            # total_fees
        -50,            # total_il
        1.5,            # sharpe
        0.05,           # max_dd
    ], dtype=np.float32)
    
    normalized = normalizer.normalize_by_range(state)
    
    print("Original state (sample):")
    print(f"  price: {state[0]:.4f}")
    print(f"  liquidity: {state[1]:.2e}")
    print(f"  fee_growth_0: {state[2]:.2e}")
    
    print("\nNormalized state (sample):")
    print(f"  price: {normalized[0]:.4f}")
    print(f"  liquidity: {normalized[1]:.4f}")
    print(f"  fee_growth_0: {normalized[2]:.4f}")
    
    print(f"\nNormalized range: [{normalized.min():.4f}, {normalized.max():.4f}]")
    print(f"Mean: {normalized.mean():.4f}, Std: {normalized.std():.4f}")


if __name__ == '__main__':
    test_normalizer()
