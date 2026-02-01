#!/usr/bin/env python3
"""
Training Loop for RL Agent
Full implementation of DDPG training for LP strategies.
"""

import sys
import os
import json
import time
import asyncio
import numpy as np
from pathlib import Path
from decimal import Decimal
from datetime import datetime

sys.path.insert(0, '/home/node/clawd/ai-miguel/src')

from web3 import Web3
from miguel.trading_engine.environment import UniswapV3Environment
from miguel.trading_engine.agent import LiquidityProvisioningAgent, Experience
from miguel.trading_engine.models import ActionSpace, ActionType
from miguel.trading_engine.risk_manager import RiskManager
from miguel.trading_engine.rewards import RewardCalculator

# Import our normalizer
from state_normalizer import StateNormalizer

# Config
RPC_URL = os.getenv('FLARE_RPC', 'https://flare-api.flare.network/ext/C/rpc')
DATA_DIR = Path(__file__).parent.parent / 'data'
MODELS_DIR = Path(__file__).parent.parent / 'models'


class TradingTrainer:
    """Trainer for RL-based LP strategy."""
    
    def __init__(
        self,
        pool_address: str,
        wallet_address: str = '0x0DFa93560e0DCfF78F7e3985826e42e53E9493cC',
        initial_balance_0: float = 10000,
        initial_balance_1: float = 5000,
        state_dim: int = 35,
        action_dim: int = 3,
        hidden_dim: int = 256
    ):
        self.pool_address = pool_address
        self.wallet_address = wallet_address
        
        # Web3
        self.w3 = Web3(Web3.HTTPProvider(RPC_URL))
        
        # Environment
        self.env = UniswapV3Environment(
            pool_address=pool_address,
            web3_provider=self.w3,
            wallet_address=wallet_address,
            initial_balance_0=Decimal(str(initial_balance_0)),
            initial_balance_1=Decimal(str(initial_balance_1)),
            max_positions=5,
            simulation_mode=True
        )
        
        # Agent
        self.agent = LiquidityProvisioningAgent(
            state_dim=state_dim,
            action_dim=action_dim,
            hidden_dim=hidden_dim,
            lr_actor=1e-4,
            lr_critic=1e-3,
            gamma=0.99,
            tau=0.005,
            buffer_size=100000,
            batch_size=128,
            noise_std=0.1
        )
        
        # State normalizer for stable training
        self.normalizer = StateNormalizer(state_dim=state_dim)
        
        # Training metrics
        self.episode_rewards = []
        self.episode_lengths = []
        self.training_losses = []
        
    def generate_state(self, normalize: bool = True) -> np.ndarray:
        """Generate observation state from environment."""
        # In full implementation, this would fetch real pool state
        # For now, generate realistic synthetic state with REASONABLE values
        
        # Pool features (11) - use realistic Flare pool values
        current_tick = np.random.randint(5000, 6000)  # sFLR/WFLR typical range
        price = 1.75 + np.random.uniform(-0.1, 0.1)   # ~1.75 sFLR per WFLR
        liquidity = np.random.uniform(1e8, 5e8)       # Typical pool liquidity
        fee_growth_0 = np.random.uniform(1e16, 1e18)
        fee_growth_1 = np.random.uniform(1e16, 1e18)
        volume_24h = np.random.uniform(1e5, 5e6)      # Daily volume
        fees_24h = volume_24h * 0.0005                # 0.05% fee tier
        volatility = np.random.uniform(0.02, 0.08)
        trend = np.random.uniform(-0.3, 0.3)
        tick_lower = current_tick - np.random.randint(200, 500)
        tick_upper = current_tick + np.random.randint(200, 500)
        
        pool_features = np.array([
            price, liquidity, fee_growth_0, fee_growth_1,
            volume_24h, fees_24h, volatility, trend,
            current_tick, tick_lower, tick_upper
        ])
        
        # Market features (8)
        vol_1h = np.random.uniform(0.01, 0.03)
        vol_24h = np.random.uniform(0.02, 0.06)
        implied_vol = np.random.uniform(0.2, 0.4)
        volume_trend = np.random.uniform(-0.5, 0.5)
        liq_depth = np.random.uniform(1.0, 3.0)
        arb_opps = np.random.randint(0, 5)
        corr_btc = np.random.uniform(0.3, 0.8)
        corr_eth = np.random.uniform(0.4, 0.9)
        
        market_features = np.array([
            vol_1h, vol_24h, implied_vol, volume_trend,
            liq_depth, arb_opps, corr_btc, corr_eth
        ])
        
        # Position features (9)
        pos_tick_lower = tick_lower
        pos_tick_upper = tick_upper
        pos_liquidity = np.random.uniform(1e6, 1e8)
        amount0 = np.random.uniform(500, 5000)        # WFLR
        amount1 = np.random.uniform(250, 2500)        # sFLR
        pos_value = amount0 * 0.02 + amount1 * 0.035  # USD value
        il = np.random.uniform(-0.05, 0.02)
        fees_earned = np.random.uniform(0, 50)
        in_range = 1.0 if tick_lower <= current_tick <= tick_upper else 0.0
        
        position_features = np.array([
            pos_tick_lower, pos_tick_upper, pos_liquidity,
            amount0, amount1, pos_value, il, fees_earned, in_range
        ])
        
        # Portfolio features (7)
        portfolio_value = np.random.uniform(200, 500)  # USD
        balance_0 = np.random.uniform(1000, 5000)
        balance_1 = np.random.uniform(500, 2500)
        total_fees = np.random.uniform(0, 100)
        total_il = np.random.uniform(-50, 20)
        sharpe = np.random.uniform(0, 2.5)
        max_dd = np.random.uniform(0.01, 0.1)
        
        portfolio_features = np.array([
            portfolio_value, balance_0, balance_1,
            total_fees, total_il, sharpe, max_dd
        ])
        
        # Combine all features
        raw_state = np.concatenate([
            pool_features,      # 11
            market_features,    # 8
            position_features,  # 9
            portfolio_features  # 7
        ])  # Total: 35
        
        # Normalize for stable training
        if normalize:
            state = self.normalizer.normalize_by_range(raw_state)
        else:
            state = raw_state
        
        return state.astype(np.float32)
    
    def compute_reward(self, state: np.ndarray, action: np.ndarray, next_state: np.ndarray) -> float:
        """Compute reward for transition. All values are normalized to ~[-1,1]."""
        # With normalized states, deltas are already in reasonable range
        
        # Feature indices (after normalization):
        # 27 = in_range, 28 = portfolio_value, 30 = total_fees, 31 = total_il
        
        # Reward components (scaled for normalized values)
        in_range = next_state[27]  # Already 0 or 1 (normalized stays same)
        
        # Deltas in normalized space are small
        portfolio_delta = next_state[28] - state[28]
        fees_delta = next_state[30] - state[30]
        il_delta = next_state[31] - state[31]
        
        # Reward function
        range_reward = 0.3 * in_range              # Strong incentive to stay in range
        portfolio_reward = 0.2 * portfolio_delta   # Portfolio growth
        fees_reward = 0.3 * fees_delta             # Fee collection
        il_penalty = -0.2 * il_delta               # IL penalty (negative IL delta is bad)
        
        # Action smoothness penalty (prefer small adjustments)
        action_magnitude = np.abs(action).mean()
        action_penalty = -0.1 * action_magnitude
        
        # Total reward clipped to reasonable range
        reward = range_reward + portfolio_reward + fees_reward + il_penalty + action_penalty
        reward = np.clip(reward, -2.0, 2.0)
        
        return float(reward)
    
    def train_episode(self, max_steps: int = 500) -> dict:
        """Run one training episode."""
        state = self.generate_state()
        episode_reward = 0.0
        steps = 0
        losses = []
        
        for step in range(max_steps):
            # Select action with exploration noise
            action = self.agent.select_action(state, add_noise=True)
            
            # Simulate environment step (generate next state)
            next_state = self.generate_state()
            
            # Compute reward
            reward = self.compute_reward(state, action, next_state)
            
            # Check if done (max steps only for now - portfolio check disabled as values are normalized)
            done = step >= max_steps - 1
            
            # Store experience
            experience = Experience(
                state=state,
                action=action,
                reward=reward,
                next_state=next_state,
                done=done
            )
            self.agent.replay_buffer.push(experience)
            
            # Store experience and train agent
            self.agent.store_experience(state, action, reward, next_state, done)
            
            if len(self.agent.replay_buffer) >= self.agent.batch_size:
                loss_dict = self.agent.train()
                if loss_dict is not None and isinstance(loss_dict, dict):
                    # Extract actor loss as main metric
                    actor_loss = loss_dict.get('actor_loss', 0)
                    if actor_loss and not np.isinf(actor_loss):
                        losses.append(float(actor_loss))
            
            episode_reward += reward
            steps += 1
            state = next_state
            
            if done:
                break
        
        return {
            'reward': episode_reward,
            'steps': steps,
            'avg_loss': np.mean(losses) if losses else 0.0
        }
    
    def train(self, episodes: int = 1000, save_every: int = 100, log_every: int = 10):
        """Run full training loop."""
        print(f"🎓 Starting training for {episodes} episodes")
        print(f"   Pool: {self.pool_address}")
        print(f"   Save every: {save_every} episodes")
        
        start_time = time.time()
        
        for episode in range(episodes):
            result = self.train_episode()
            
            self.episode_rewards.append(result['reward'])
            self.episode_lengths.append(result['steps'])
            if result['avg_loss'] > 0:
                self.training_losses.append(result['avg_loss'])
            
            # Log progress
            if (episode + 1) % log_every == 0:
                avg_reward = np.mean(self.episode_rewards[-log_every:])
                avg_steps = np.mean(self.episode_lengths[-log_every:])
                elapsed = time.time() - start_time
                
                print(f"   Episode {episode + 1}/{episodes} | "
                      f"Avg Reward: {avg_reward:.3f} | "
                      f"Avg Steps: {avg_steps:.0f} | "
                      f"Time: {elapsed:.1f}s")
            
            # Save checkpoint
            if (episode + 1) % save_every == 0:
                self.save_checkpoint(episode + 1)
        
        # Final save
        self.save_checkpoint(episodes, final=True)
        
        total_time = time.time() - start_time
        print(f"\n✅ Training complete!")
        print(f"   Total time: {total_time:.1f}s")
        print(f"   Final avg reward: {np.mean(self.episode_rewards[-100:]):.3f}")
        
        return {
            'episodes': episodes,
            'final_avg_reward': np.mean(self.episode_rewards[-100:]),
            'total_time': total_time
        }
    
    def save_checkpoint(self, episode: int, final: bool = False):
        """Save model and training state."""
        import torch
        
        MODELS_DIR.mkdir(exist_ok=True)
        DATA_DIR.mkdir(exist_ok=True)
        
        # Save model
        prefix = 'final' if final else f'ep{episode}'
        pool_name = self.pool_address[:10]
        
        model_path = MODELS_DIR / f'{pool_name}_{prefix}_actor.pt'
        torch.save(self.agent.actor.state_dict(), model_path)
        
        critic_path = MODELS_DIR / f'{pool_name}_{prefix}_critic.pt'
        torch.save(self.agent.critic.state_dict(), critic_path)
        
        # Save training metrics
        metrics = {
            'episode': episode,
            'timestamp': datetime.now().isoformat(),
            'pool_address': self.pool_address,
            'episode_rewards': self.episode_rewards[-1000:],  # Last 1000
            'episode_lengths': self.episode_lengths[-1000:],
            'training_losses': self.training_losses[-1000:],
            'avg_reward_100': float(np.mean(self.episode_rewards[-100:])) if len(self.episode_rewards) >= 100 else 0,
        }
        
        metrics_path = DATA_DIR / f'{pool_name}_training_metrics.json'
        with open(metrics_path, 'w') as f:
            json.dump(metrics, f, indent=2)
        
        print(f"   💾 Checkpoint saved: {model_path.name}")
    
    def load_checkpoint(self, model_path: str):
        """Load a saved model."""
        import torch
        self.agent.actor.load_state_dict(torch.load(model_path))
        print(f"✅ Loaded model from {model_path}")


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Train RL agent')
    parser.add_argument('--pool', '-p', default='0x25b4f3930934f0a3cbb885c624ecee75a2917144',
                        help='Pool address')
    parser.add_argument('--episodes', '-e', type=int, default=1000, help='Training episodes')
    parser.add_argument('--save-every', type=int, default=100, help='Save every N episodes')
    parser.add_argument('--log-every', type=int, default=10, help='Log every N episodes')
    
    args = parser.parse_args()
    
    trainer = TradingTrainer(pool_address=args.pool)
    trainer.train(
        episodes=args.episodes,
        save_every=args.save_every,
        log_every=args.log_every
    )


if __name__ == '__main__':
    main()
