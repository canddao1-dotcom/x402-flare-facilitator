#!/usr/bin/env python3
"""
Trading Engine CLI
Unified interface for data collection, training, and inference.

Usage:
  /trading status                    - Show engine status
  /trading collect <pool>            - Collect pool snapshot
  /trading train <pool> [episodes]   - Train agent on pool
  /trading predict <pool>            - Get action recommendation
  /trading backtest <pool> [days]    - Backtest strategy
"""

import os
import sys
import json
import argparse
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

# Paths
SKILL_DIR = Path(__file__).parent.parent
SCRIPTS_DIR = SKILL_DIR / 'scripts'
DATA_DIR = SKILL_DIR / 'data'
MODELS_DIR = SKILL_DIR / 'models'
CONFIG_DIR = SKILL_DIR / 'config'


def load_config():
    """Load pool configuration."""
    config_file = CONFIG_DIR / 'pools.json'
    if config_file.exists():
        with open(config_file) as f:
            return json.load(f)
    return {}


def cmd_status(args):
    """Show trading engine status."""
    config = load_config()
    pools = config.get('pools', {})
    
    print("=" * 60)
    print("🤖 TRADING ENGINE STATUS")
    print("=" * 60)
    
    # Check daemons
    print("\n📡 Data Collection Daemons:")
    pid_file = Path('/tmp/trading-data-collector.pid')
    if pid_file.exists():
        pid = pid_file.read_text().strip()
        result = subprocess.run(['ps', '-p', pid], capture_output=True)
        if result.returncode == 0:
            print(f"  ✅ Data collector running (PID {pid})")
        else:
            print(f"  ❌ Data collector not running")
    else:
        print(f"  ❌ Data collector not started")
    
    # Pool status
    print("\n📊 Configured Pools:")
    for name, pool in pools.items():
        enabled = "✅" if pool.get('enabled') else "⬚"
        print(f"  {enabled} {name}: {pool['token0']}/{pool['token1']} ({pool['dex']})")
    
    # Data status
    print("\n💾 Collected Data:")
    pool_history = DATA_DIR / 'pool_history'
    if pool_history.exists():
        for pool_dir in pool_history.iterdir():
            if pool_dir.is_dir():
                snapshots = sum(1 for f in pool_dir.glob('*.jsonl') 
                               for _ in open(f))
                print(f"  {pool_dir.name}: {snapshots} snapshots")
    
    # Model status
    print("\n🧠 Trained Models:")
    if MODELS_DIR.exists():
        models = list(MODELS_DIR.glob('*_actor.pt'))
        if models:
            for model in models:
                size = model.stat().st_size / 1024
                print(f"  {model.name}: {size:.1f} KB")
        else:
            print("  No models trained yet")
    
    # Training config
    training = config.get('training', {})
    print("\n⚙️ Training Config:")
    print(f"  State dim: {training.get('state_dim', 35)}")
    print(f"  Action dim: {training.get('action_dim', 3)}")
    print(f"  Batch size: {training.get('batch_size', 64)}")
    
    print("\n" + "=" * 60)


def cmd_collect(args):
    """Collect pool data."""
    pool = args.pool
    action = args.action or 'snapshot'
    
    collector_script = SCRIPTS_DIR / 'collectors' / 'data_collector.py'
    
    if action == 'snapshot':
        subprocess.run([
            'python3', str(collector_script),
            'snapshot', '--pool', pool
        ])
    elif action == 'historical':
        subprocess.run([
            'python3', str(collector_script),
            'historical', '--pool', pool,
            '--step', str(args.step or 1800)
        ])
    elif action == 'daemon':
        subprocess.run([
            'python3', str(collector_script),
            'daemon', '--pool', pool,
            '--interval', str(args.interval or 300)
        ])


def cmd_train(args):
    """Train agent on pool data."""
    pool = args.pool
    episodes = args.episodes or 100
    
    # Get pool address from config
    config = load_config()
    pools = config.get('pools', {})
    
    if pool not in pools:
        print(f"Unknown pool: {pool}")
        print(f"Available: {list(pools.keys())}")
        return
    
    pool_address = pools[pool]['address']
    
    trainer_script = SCRIPTS_DIR / 'training' / 'trainer.py'
    
    print(f"🎓 Training agent for {pool}")
    print(f"   Pool address: {pool_address}")
    print(f"   Episodes: {episodes}")
    
    subprocess.run([
        'python3', str(trainer_script),
        '--pool', pool_address,
        '--episodes', str(episodes),
        '--log-every', str(max(10, episodes // 10)),
        '--save-every', str(max(50, episodes // 2))
    ])


def cmd_predict(args):
    """Get action prediction from trained model."""
    pool = args.pool
    
    config = load_config()
    pools = config.get('pools', {})
    
    if pool not in pools:
        print(f"Unknown pool: {pool}")
        return
    
    pool_address = pools[pool]['address']
    short_addr = pool_address[:10].lower()
    
    # Find model
    model_path = MODELS_DIR / f'{short_addr}_final_actor.pt'
    if not model_path.exists():
        print(f"❌ No trained model found for {pool}")
        print(f"   Run: /trading train {pool}")
        return
    
    # Get current pool state
    collector_script = SCRIPTS_DIR / 'collectors' / 'data_collector.py'
    result = subprocess.run([
        'python3', str(collector_script),
        'snapshot', '--pool', pool
    ], capture_output=True, text=True)
    
    print(f"\n🔮 Prediction for {pool}:")
    print(f"   Model: {model_path.name}")
    print(f"   TODO: Implement inference pipeline")
    print(f"   Current state captured - need inference script")


def cmd_backtest(args):
    """Backtest strategy on historical data."""
    pool = args.pool
    days = args.days or 7
    
    print(f"📈 Backtesting {pool} over {days} days")
    print(f"   TODO: Implement backtesting")
    print(f"   Need: Historical data + trained model + simulator")


def main():
    parser = argparse.ArgumentParser(
        description='Trading Engine CLI',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  trading-cli.py status
  trading-cli.py collect sflr-wflr-enosys --action snapshot
  trading-cli.py train sflr-wflr-enosys --episodes 500
  trading-cli.py predict sflr-wflr-enosys
  trading-cli.py backtest sflr-wflr-enosys --days 14
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Command')
    
    # Status
    status_parser = subparsers.add_parser('status', help='Show engine status')
    
    # Collect
    collect_parser = subparsers.add_parser('collect', help='Collect pool data')
    collect_parser.add_argument('pool', help='Pool name')
    collect_parser.add_argument('--action', choices=['snapshot', 'historical', 'daemon'],
                               default='snapshot', help='Collection action')
    collect_parser.add_argument('--step', type=int, help='Block step for historical')
    collect_parser.add_argument('--interval', type=int, help='Daemon interval')
    
    # Train
    train_parser = subparsers.add_parser('train', help='Train agent')
    train_parser.add_argument('pool', help='Pool name')
    train_parser.add_argument('--episodes', type=int, default=100, help='Training episodes')
    
    # Predict
    predict_parser = subparsers.add_parser('predict', help='Get action prediction')
    predict_parser.add_argument('pool', help='Pool name')
    
    # Backtest
    backtest_parser = subparsers.add_parser('backtest', help='Backtest strategy')
    backtest_parser.add_argument('pool', help='Pool name')
    backtest_parser.add_argument('--days', type=int, default=7, help='Days to backtest')
    
    args = parser.parse_args()
    
    if args.command == 'status':
        cmd_status(args)
    elif args.command == 'collect':
        cmd_collect(args)
    elif args.command == 'train':
        cmd_train(args)
    elif args.command == 'predict':
        cmd_predict(args)
    elif args.command == 'backtest':
        cmd_backtest(args)
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
