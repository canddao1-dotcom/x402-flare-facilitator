#!/usr/bin/env python3
"""
Backtest - Evaluate strategy on historical data.
"""

import os
import sys
import json
import torch
import numpy as np
from datetime import datetime
from pathlib import Path

sys.path.insert(0, '/home/node/clawd/ai-miguel/src')
SKILL_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(SKILL_DIR / 'scripts' / 'training'))

from data_loader import DataLoader
from state_normalizer import StateNormalizer
from miguel.trading_engine.agent import Actor

MODELS_DIR = SKILL_DIR / 'models'


class Backtester:
    """Backtest trading strategy on historical data."""
    
    def __init__(self, pool_name: str, model_type: str = 'real'):
        self.pool_name = pool_name
        self.data_loader = DataLoader(pool_name)
        self.normalizer = StateNormalizer(state_dim=35)
        
        # Load model
        self.model = self.load_model(model_type)
    
    def load_model(self, model_type: str):
        """Load trained model."""
        # Find model file
        patterns = [
            f'*_{model_type}_actor.pt',
            '*_final_actor.pt',
            '*_actor.pt'
        ]
        
        for pattern in patterns:
            models = list(MODELS_DIR.glob(pattern))
            if models:
                model_path = models[0]
                break
        else:
            print("❌ No model found")
            return None
        
        try:
            model = Actor(state_dim=35, action_dim=3)
            model.load_state_dict(torch.load(model_path, map_location='cpu'))
            model.eval()
            print(f"✓ Loaded: {model_path.name}")
            return model
        except Exception as e:
            print(f"❌ Failed to load model: {e}")
            return None
    
    def simulate_position(self, entry_tick: int, lower_tick: int, upper_tick: int,
                         current_tick: int, liquidity: float = 1000) -> dict:
        """Simulate LP position performance."""
        in_range = lower_tick <= current_tick <= upper_tick
        
        # Simplified IL calculation
        if in_range:
            # Position earning fees
            range_width = upper_tick - lower_tick
            fee_rate = 0.0005  # 0.05% pool
            estimated_fees = liquidity * fee_rate * 0.1  # Per period
            il = 0
        else:
            # Out of range - IL accumulates, no fees
            tick_distance = min(abs(current_tick - lower_tick), abs(current_tick - upper_tick))
            il = -tick_distance * 0.0001 * liquidity  # Simplified IL
            estimated_fees = 0
        
        return {
            'in_range': in_range,
            'estimated_fees': estimated_fees,
            'il': il,
            'pnl': estimated_fees + il
        }
    
    def run(self, days: int = 7) -> dict:
        """Run backtest."""
        if self.model is None:
            return {'error': 'No model loaded'}
        
        snapshots = self.data_loader.load_pool_snapshots(days=days)
        swaps = self.data_loader.load_swap_events(days=days)
        
        if len(snapshots) < 10:
            return {'error': f'Insufficient data: {len(snapshots)} snapshots'}
        
        metrics = self.data_loader.compute_metrics(snapshots)
        swap_metrics = self.data_loader.compute_swap_volume(swaps)
        
        # Build states
        states = []
        for snap in snapshots:
            state = self.data_loader.build_state(snap, metrics, swap_metrics)
            normalized = self.normalizer.normalize_by_range(state)
            states.append((normalized, snap))
        
        # Simulate trading
        results = []
        position = None
        total_fees = 0
        total_il = 0
        rebalances = 0
        
        for i, (state, snap) in enumerate(states):
            current_tick = snap.get('tick', 0)
            tick_spacing = snap.get('tick_spacing', 10)
            
            # Get action
            with torch.no_grad():
                state_tensor = torch.FloatTensor(state).unsqueeze(0)
                action = self.model(state_tensor).numpy()[0]
            
            # Interpret action
            range_width = int(abs(action[0]) * 1000)
            center_offset = int(action[1] * 200)
            
            center_tick = current_tick + center_offset
            lower_tick = ((center_tick - range_width // 2) // tick_spacing) * tick_spacing
            upper_tick = ((center_tick + range_width // 2) // tick_spacing) * tick_spacing
            
            # Check if should rebalance
            should_rebalance = position is None or abs(action[1]) > 0.3
            
            if should_rebalance:
                position = {
                    'lower': lower_tick,
                    'upper': upper_tick,
                    'entry_tick': current_tick
                }
                rebalances += 1
            
            # Simulate position
            if position:
                perf = self.simulate_position(
                    position['entry_tick'],
                    position['lower'],
                    position['upper'],
                    current_tick
                )
                total_fees += perf['estimated_fees']
                total_il += perf['il']
                
                results.append({
                    'timestamp': snap['datetime'],
                    'tick': current_tick,
                    'in_range': perf['in_range'],
                    'fees': perf['estimated_fees'],
                    'il': perf['il']
                })
        
        # Calculate metrics
        in_range_pct = sum(1 for r in results if r['in_range']) / len(results) * 100 if results else 0
        
        return {
            'pool': self.pool_name,
            'period_days': days,
            'snapshots': len(snapshots),
            'rebalances': rebalances,
            'in_range_pct': round(in_range_pct, 1),
            'total_fees': round(total_fees, 4),
            'total_il': round(total_il, 4),
            'net_pnl': round(total_fees + total_il, 4),
            'note': 'Simulated results - not actual trading'
        }
    
    def format_results(self, results: dict) -> str:
        """Format backtest results."""
        if 'error' in results:
            return f"❌ {results['error']}"
        
        out = f"📈 **Backtest Results**\n\n"
        out += f"**Pool:** {results['pool']}\n"
        out += f"**Period:** {results['period_days']} days ({results['snapshots']} snapshots)\n\n"
        out += f"**Performance:**\n"
        out += f"• In-range: {results['in_range_pct']}%\n"
        out += f"• Rebalances: {results['rebalances']}\n"
        out += f"• Fees: {results['total_fees']}\n"
        out += f"• IL: {results['total_il']}\n"
        out += f"• Net PnL: {results['net_pnl']}\n\n"
        out += f"⚠️ {results['note']}"
        
        return out


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('pool', nargs='?', default='sflr-wflr-enosys')
    parser.add_argument('--days', type=int, default=7)
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()
    
    bt = Backtester(args.pool)
    results = bt.run(days=args.days)
    
    if args.json:
        print(json.dumps(results, indent=2))
    else:
        print(bt.format_results(results))


if __name__ == '__main__':
    main()
