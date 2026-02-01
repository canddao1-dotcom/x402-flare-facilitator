#!/usr/bin/env python3
"""
Inference - Get trading recommendations from trained model.
"""

import os
import sys
import json
import torch
import numpy as np
from pathlib import Path
from datetime import datetime

# Add paths
sys.path.insert(0, '/home/node/clawd/ai-miguel/src')
SKILL_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(SKILL_DIR / 'scripts' / 'training'))

from data_loader import DataLoader, get_training_stats
from state_normalizer import StateNormalizer

# Model paths
MODELS_DIR = SKILL_DIR / 'models'
CONFIG_FILE = SKILL_DIR / 'config' / 'pools.json'


class TradingPredictor:
    """Get trading recommendations from trained DDPG model."""
    
    def __init__(self, pool_name: str):
        self.pool_name = pool_name
        self.config = self.load_config()
        self.pool_config = self.config['pools'].get(pool_name, {})
        
        # Load model
        self.model = None
        self.normalizer = StateNormalizer(state_dim=35)
        self.load_model()
        
        # Data loader
        self.data_loader = DataLoader(pool_name)
    
    def load_config(self):
        with open(CONFIG_FILE) as f:
            return json.load(f)
    
    def load_model(self):
        """Load trained actor model."""
        pool_addr = self.pool_config.get('address', '')[:10].lower()
        model_path = MODELS_DIR / f'{pool_addr}_final_actor.pt'
        
        if not model_path.exists():
            # Try any available model
            models = list(MODELS_DIR.glob('*_final_actor.pt'))
            if models:
                model_path = models[0]
            else:
                print(f"❌ No trained model found")
                return
        
        try:
            # Load actor network architecture
            from miguel.trading_engine.agent import Actor
            
            self.model = Actor(state_dim=35, action_dim=3)
            self.model.load_state_dict(torch.load(model_path, map_location='cpu'))
            self.model.eval()
            print(f"✓ Loaded model: {model_path.name}")
        except Exception as e:
            print(f"❌ Failed to load model: {e}")
            self.model = None
    
    def get_current_state(self) -> np.ndarray:
        """Get current state from latest snapshot."""
        snapshots = self.data_loader.load_pool_snapshots(days=1)
        swaps = self.data_loader.load_swap_events(days=1)
        
        if not snapshots:
            raise ValueError("No recent snapshots available")
        
        latest = snapshots[-1]
        metrics = self.data_loader.compute_metrics(snapshots)
        swap_metrics = self.data_loader.compute_swap_volume(swaps)
        
        state = self.data_loader.build_state(latest, metrics, swap_metrics)
        return state, latest
    
    def predict(self) -> dict:
        """Get trading recommendation."""
        if self.model is None:
            return {'error': 'No model loaded'}
        
        try:
            # Get current state
            state, snapshot = self.get_current_state()
            
            # Normalize
            normalized_state = self.normalizer.normalize_by_range(state)
            
            # Get action from model
            with torch.no_grad():
                state_tensor = torch.FloatTensor(normalized_state).unsqueeze(0)
                action = self.model(state_tensor).numpy()[0]
            
            # Interpret action
            # action[0]: range_width (0-1) -> ticks
            # action[1]: center_offset (-1 to 1) -> tick offset from current
            # action[2]: liquidity_fraction (0-1) -> % of capital to deploy
            
            current_tick = snapshot.get('tick', 0)
            tick_spacing = snapshot.get('tick_spacing', 10)
            
            # Convert to tick range
            range_width_ticks = int(abs(action[0]) * 1000)  # Max 1000 ticks wide
            center_offset = int(action[1] * 200)  # Max 200 tick offset
            liquidity_pct = max(0, min(1, (action[2] + 1) / 2)) * 100  # Convert to %
            
            # Calculate recommended range
            center_tick = current_tick + center_offset
            lower_tick = center_tick - range_width_ticks // 2
            upper_tick = center_tick + range_width_ticks // 2
            
            # Align to tick spacing
            lower_tick = (lower_tick // tick_spacing) * tick_spacing
            upper_tick = (upper_tick // tick_spacing) * tick_spacing
            
            return {
                'pool': self.pool_name,
                'timestamp': datetime.utcnow().isoformat(),
                'current_tick': current_tick,
                'current_price': snapshot.get('price', 0),
                'recommendation': {
                    'action': 'REBALANCE' if abs(action[1]) > 0.3 else 'HOLD',
                    'lower_tick': lower_tick,
                    'upper_tick': upper_tick,
                    'range_width': upper_tick - lower_tick,
                    'liquidity_pct': round(liquidity_pct, 1),
                    'center_offset': center_offset,
                },
                'raw_action': action.tolist(),
                'confidence': 'LOW',  # Until trained on real data
                'note': 'Model trained on synthetic data - use with caution'
            }
            
        except Exception as e:
            return {'error': str(e)}
    
    def format_recommendation(self) -> str:
        """Get formatted recommendation string."""
        pred = self.predict()
        
        if 'error' in pred:
            return f"❌ Error: {pred['error']}"
        
        rec = pred['recommendation']
        
        out = f"🤖 **Trading Recommendation**\n\n"
        out += f"**Pool:** {pred['pool']}\n"
        out += f"**Time:** {pred['timestamp'][:16]}\n\n"
        out += f"**Current:** tick={pred['current_tick']}, price={pred['current_price']:.4f}\n\n"
        out += f"**Action:** {rec['action']}\n"
        out += f"**Range:** [{rec['lower_tick']} → {rec['upper_tick']}] ({rec['range_width']} ticks)\n"
        out += f"**Liquidity:** {rec['liquidity_pct']}%\n\n"
        out += f"⚠️ {pred['note']}"
        
        return out


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('pool', nargs='?', default='sflr-wflr-enosys')
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()
    
    predictor = TradingPredictor(args.pool)
    
    if args.json:
        print(json.dumps(predictor.predict(), indent=2))
    else:
        print(predictor.format_recommendation())


if __name__ == '__main__':
    main()
