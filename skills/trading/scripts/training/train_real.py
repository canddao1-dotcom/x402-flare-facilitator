#!/usr/bin/env python3
"""
Train DDPG agent on REAL collected data.
"""

import os
import sys
import json
import torch
import numpy as np
from datetime import datetime
from pathlib import Path

# Add paths
sys.path.insert(0, '/home/node/clawd/ai-miguel/src')
SKILL_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(SKILL_DIR / 'scripts' / 'training'))

from data_loader import DataLoader, get_training_stats
from state_normalizer import StateNormalizer

from miguel.trading_engine.agent import LiquidityProvisioningAgent, Experience

MODELS_DIR = SKILL_DIR / 'models'
CONFIG_FILE = SKILL_DIR / 'config' / 'pools.json'


class RealDataTrainer:
    """Train DDPG agent on real collected pool data."""
    
    def __init__(self, pool_name: str):
        self.pool_name = pool_name
        self.data_loader = DataLoader(pool_name)
        self.normalizer = StateNormalizer(state_dim=35)
        
        # Load config
        with open(CONFIG_FILE) as f:
            self.config = json.load(f)
        
        self.pool_config = self.config['pools'].get(pool_name, {})
        self.pool_addr = self.pool_config.get('address', '')[:10].lower()
        
        # Initialize agent
        self.agent = LiquidityProvisioningAgent(
            state_dim=35,
            action_dim=3,
            learning_rate=0.0001,
            gamma=0.99,
            tau=0.001,
            batch_size=64
        )
        
        # Training metrics
        self.episode_rewards = []
        self.losses = []
    
    def compute_reward(self, state: np.ndarray, next_state: np.ndarray, action: np.ndarray) -> float:
        """Compute reward based on state transition."""
        # Price stability reward
        price_change = abs(next_state[0] - state[0])
        stability_reward = max(0, 0.1 - price_change)
        
        # Fee accumulation (from TVL proxy)
        fee_reward = (next_state[28] - state[28]) * 0.1 if next_state[28] > state[28] else 0
        
        # Volatility penalty
        vol_penalty = -state[6] * 0.05  # Penalize high volatility
        
        # Action smoothness
        action_penalty = -np.abs(action).mean() * 0.05
        
        reward = stability_reward + fee_reward + vol_penalty + action_penalty
        return float(np.clip(reward, -2, 2))
    
    def train(self, episodes: int = 100, min_snapshots: int = 50):
        """Train on real data."""
        # Load data
        snapshots = self.data_loader.load_pool_snapshots(days=30)
        swaps = self.data_loader.load_swap_events(days=30)
        
        if len(snapshots) < min_snapshots:
            print(f"❌ Insufficient data: {len(snapshots)} snapshots (need {min_snapshots}+)")
            print(f"   Keep collecting for a few more days.")
            return False
        
        print(f"🎓 Training on REAL data")
        print(f"   Pool: {self.pool_name}")
        print(f"   Snapshots: {len(snapshots)}")
        print(f"   Swaps: {len(swaps)}")
        print(f"   Episodes: {episodes}")
        print()
        
        # Build states
        metrics = self.data_loader.compute_metrics(snapshots)
        swap_metrics = self.data_loader.compute_swap_volume(swaps)
        
        states = []
        for snap in snapshots:
            state = self.data_loader.build_state(snap, metrics, swap_metrics)
            normalized = self.normalizer.normalize_by_range(state)
            states.append(normalized)
        
        # Training loop
        for episode in range(episodes):
            episode_reward = 0
            
            # Random starting point
            start_idx = np.random.randint(0, len(states) - 10)
            
            for i in range(start_idx, min(start_idx + 50, len(states) - 1)):
                state = states[i]
                next_state = states[i + 1]
                
                # Get action
                action = self.agent.act(state, add_noise=True)
                
                # Compute reward
                reward = self.compute_reward(state, next_state, action)
                done = (i == min(start_idx + 49, len(states) - 2))
                
                # Store experience
                exp = Experience(
                    state=state,
                    action=action,
                    reward=reward,
                    next_state=next_state,
                    done=done
                )
                self.agent.replay_buffer.push(exp)
                
                # Train
                if len(self.agent.replay_buffer) >= self.agent.batch_size:
                    loss = self.agent.train()
                    if loss:
                        self.losses.append(loss.get('actor_loss', 0))
                
                episode_reward += reward
            
            self.episode_rewards.append(episode_reward)
            
            if (episode + 1) % 10 == 0:
                avg_reward = np.mean(self.episode_rewards[-10:])
                print(f"   Episode {episode+1}/{episodes} | Avg Reward: {avg_reward:.3f}")
        
        # Save model
        self.save_model()
        
        print(f"\n✅ Training complete!")
        print(f"   Final avg reward: {np.mean(self.episode_rewards[-10:]):.3f}")
        
        return True
    
    def save_model(self):
        """Save trained model."""
        MODELS_DIR.mkdir(exist_ok=True)
        
        actor_path = MODELS_DIR / f'{self.pool_addr}_real_actor.pt'
        critic_path = MODELS_DIR / f'{self.pool_addr}_real_critic.pt'
        
        torch.save(self.agent.actor.state_dict(), actor_path)
        torch.save(self.agent.critic.state_dict(), critic_path)
        
        # Save training metrics
        metrics_path = MODELS_DIR / f'{self.pool_addr}_real_metrics.json'
        with open(metrics_path, 'w') as f:
            json.dump({
                'pool': self.pool_name,
                'trained_at': datetime.utcnow().isoformat(),
                'episodes': len(self.episode_rewards),
                'final_reward': float(np.mean(self.episode_rewards[-10:])),
                'data_snapshots': len(self.data_loader.load_pool_snapshots(days=30))
            }, f, indent=2)
        
        print(f"   💾 Saved: {actor_path.name}")


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('pool', nargs='?', default='sflr-wflr-enosys')
    parser.add_argument('--episodes', type=int, default=100)
    parser.add_argument('--min-data', type=int, default=50)
    parser.add_argument('--check', action='store_true', help='Just check data availability')
    args = parser.parse_args()
    
    if args.check:
        stats = get_training_stats()
        print("📊 Training Data Status\n")
        for pool, s in stats.items():
            ready = "✅" if s['ready_for_training'] else "❌"
            print(f"{ready} {pool}: {s['snapshots']} snapshots, {s['days']:.1f} days")
        return
    
    trainer = RealDataTrainer(args.pool)
    trainer.train(episodes=args.episodes, min_snapshots=args.min_data)


if __name__ == '__main__':
    main()
