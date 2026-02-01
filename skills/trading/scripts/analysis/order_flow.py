#!/usr/bin/env python3
"""
Order Flow Analysis
Analyzes swap data to detect accumulation/distribution patterns.
Identifies whale activity and predicts market direction.
"""

import json
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Tuple

SKILL_DIR = Path(__file__).parent.parent.parent
SWAP_DATA_DIR = SKILL_DIR / 'data' / 'swaps'
POOL_DATA_DIR = SKILL_DIR / 'data' / 'pool_history'


class OrderFlowAnalyzer:
    """Analyze order flow from swap events."""
    
    def __init__(self, pool_name: str):
        self.pool_name = pool_name
        self.swap_dir = SWAP_DATA_DIR / pool_name
        self.pool_dir = POOL_DATA_DIR / pool_name
    
    def load_swaps(self, days: int = 7) -> List[Dict]:
        """Load swap events."""
        swaps = []
        if not self.swap_dir.exists():
            return swaps
        
        cutoff = datetime.utcnow() - timedelta(days=days)
        
        for f in sorted(self.swap_dir.glob('*.jsonl')):
            with open(f) as file:
                for line in file:
                    try:
                        swap = json.loads(line)
                        if datetime.fromisoformat(swap['datetime']) > cutoff:
                            swaps.append(swap)
                    except:
                        continue
        
        swaps.sort(key=lambda x: x['timestamp'])
        return swaps
    
    def analyze_wallet_activity(self, swaps: List[Dict]) -> Dict[str, Dict]:
        """Analyze activity per wallet address."""
        wallets = defaultdict(lambda: {
            'buy_count': 0,
            'sell_count': 0,
            'buy_volume_token0': 0,
            'sell_volume_token0': 0,
            'buy_volume_token1': 0,
            'sell_volume_token1': 0,
            'net_token0': 0,
            'net_token1': 0,
            'first_seen': None,
            'last_seen': None,
            'txs': []
        })
        
        for swap in swaps:
            # Use recipient as the trader (sender is usually router)
            wallet = swap['recipient']
            amt0 = int(swap['amount0'])
            amt1 = int(swap['amount1'])
            
            w = wallets[wallet]
            
            # Track timing
            if w['first_seen'] is None:
                w['first_seen'] = swap['datetime']
            w['last_seen'] = swap['datetime']
            
            # Classify as buy or sell (of token0)
            if amt0 < 0:  # Receiving token0 = buying
                w['buy_count'] += 1
                w['buy_volume_token0'] += abs(amt0)
                w['buy_volume_token1'] += abs(amt1)
            else:  # Sending token0 = selling
                w['sell_count'] += 1
                w['sell_volume_token0'] += abs(amt0)
                w['sell_volume_token1'] += abs(amt1)
            
            w['net_token0'] += -amt0  # Negative amount0 = received
            w['net_token1'] += -amt1
            
            w['txs'].append({
                'datetime': swap['datetime'],
                'direction': swap['direction'],
                'amount0': amt0,
                'amount1': amt1,
                'tick': swap.get('tick', 0)
            })
        
        return dict(wallets)
    
    def identify_whales(self, wallet_activity: Dict, threshold_pct: float = 10) -> List[Dict]:
        """Identify whale wallets (top % by volume)."""
        if not wallet_activity:
            return []
        
        # Calculate total volume per wallet
        volumes = []
        for addr, data in wallet_activity.items():
            total_vol = data['buy_volume_token0'] + data['sell_volume_token0']
            volumes.append((addr, total_vol, data))
        
        volumes.sort(key=lambda x: x[1], reverse=True)
        
        # Top threshold_pct are whales
        whale_count = max(1, int(len(volumes) * threshold_pct / 100))
        
        whales = []
        for addr, vol, data in volumes[:whale_count]:
            net_position = data['net_token0']
            behavior = 'ACCUMULATING' if net_position > 0 else 'DISTRIBUTING' if net_position < 0 else 'NEUTRAL'
            
            whales.append({
                'address': addr,
                'total_volume': vol,
                'net_token0': net_position,
                'net_token1': data['net_token1'],
                'buy_count': data['buy_count'],
                'sell_count': data['sell_count'],
                'behavior': behavior,
                'first_seen': data['first_seen'],
                'last_seen': data['last_seen']
            })
        
        return whales
    
    def compute_order_flow_metrics(self, swaps: List[Dict]) -> Dict:
        """Compute aggregate order flow metrics."""
        if not swaps:
            return {}
        
        total_buy_volume = 0
        total_sell_volume = 0
        buy_count = 0
        sell_count = 0
        
        # Time-bucketed flow
        hourly_flow = defaultdict(lambda: {'buy': 0, 'sell': 0})
        
        for swap in swaps:
            amt0 = int(swap['amount0'])
            hour = swap['datetime'][:13]  # YYYY-MM-DDTHH
            
            if amt0 < 0:  # Buy
                total_buy_volume += abs(amt0)
                buy_count += 1
                hourly_flow[hour]['buy'] += abs(amt0)
            else:  # Sell
                total_sell_volume += abs(amt0)
                sell_count += 1
                hourly_flow[hour]['sell'] += abs(amt0)
        
        # Net flow
        net_flow = total_buy_volume - total_sell_volume
        
        # Buy/sell ratio (cap at 999 for JSON compatibility)
        if total_sell_volume > 0:
            buy_sell_ratio = total_buy_volume / total_sell_volume
        else:
            buy_sell_ratio = 999.0 if total_buy_volume > 0 else 1.0
        
        # Order flow imbalance (-1 to 1)
        total_volume = total_buy_volume + total_sell_volume
        if total_volume > 0:
            ofi = (total_buy_volume - total_sell_volume) / total_volume
        else:
            ofi = 0
        
        # Recent trend (last 6 hours vs previous)
        sorted_hours = sorted(hourly_flow.keys())
        if len(sorted_hours) >= 2:
            recent_hours = sorted_hours[-6:] if len(sorted_hours) >= 6 else sorted_hours[-len(sorted_hours)//2:]
            older_hours = sorted_hours[:-6] if len(sorted_hours) >= 6 else sorted_hours[:len(sorted_hours)//2]
            
            recent_net = sum(hourly_flow[h]['buy'] - hourly_flow[h]['sell'] for h in recent_hours)
            older_net = sum(hourly_flow[h]['buy'] - hourly_flow[h]['sell'] for h in older_hours)
            
            if older_net != 0:
                trend_change = (recent_net - older_net) / abs(older_net)
            else:
                trend_change = 1 if recent_net > 0 else -1 if recent_net < 0 else 0
        else:
            trend_change = 0
        
        return {
            'total_buy_volume': total_buy_volume,
            'total_sell_volume': total_sell_volume,
            'net_flow': net_flow,
            'buy_count': buy_count,
            'sell_count': sell_count,
            'buy_sell_ratio': round(buy_sell_ratio, 3),
            'order_flow_imbalance': round(ofi, 3),
            'trend_change': round(trend_change, 3),
            'market_direction': 'BULLISH' if ofi > 0.1 else 'BEARISH' if ofi < -0.1 else 'NEUTRAL',
            'trend_signal': 'ACCELERATING' if trend_change > 0.2 else 'DECELERATING' if trend_change < -0.2 else 'STABLE'
        }
    
    def detect_accumulation_distribution(self, swaps: List[Dict], window_hours: int = 24) -> Dict:
        """Detect accumulation or distribution patterns."""
        if not swaps:
            return {}
        
        # Group by time windows
        windows = defaultdict(lambda: {'buys': [], 'sells': []})
        
        for swap in swaps:
            dt = datetime.fromisoformat(swap['datetime'])
            window_key = dt.strftime('%Y-%m-%d') + f"_{dt.hour // window_hours}"
            
            amt0 = int(swap['amount0'])
            if amt0 < 0:
                windows[window_key]['buys'].append(abs(amt0))
            else:
                windows[window_key]['sells'].append(abs(amt0))
        
        # Analyze each window
        patterns = []
        for window, data in sorted(windows.items()):
            buy_vol = sum(data['buys'])
            sell_vol = sum(data['sells'])
            buy_count = len(data['buys'])
            sell_count = len(data['sells'])
            
            # Detect pattern
            if buy_vol > sell_vol * 1.5 and buy_count > sell_count:
                pattern = 'ACCUMULATION'
            elif sell_vol > buy_vol * 1.5 and sell_count > buy_count:
                pattern = 'DISTRIBUTION'
            elif buy_count > sell_count * 2:
                pattern = 'RETAIL_BUYING'
            elif sell_count > buy_count * 2:
                pattern = 'RETAIL_SELLING'
            else:
                pattern = 'MIXED'
            
            patterns.append({
                'window': window,
                'buy_volume': buy_vol,
                'sell_volume': sell_vol,
                'buy_count': buy_count,
                'sell_count': sell_count,
                'pattern': pattern
            })
        
        # Overall assessment
        pattern_counts = defaultdict(int)
        for p in patterns:
            pattern_counts[p['pattern']] += 1
        
        dominant_pattern = max(pattern_counts.items(), key=lambda x: x[1])[0] if pattern_counts else 'UNKNOWN'
        
        return {
            'windows': patterns,
            'pattern_summary': dict(pattern_counts),
            'dominant_pattern': dominant_pattern
        }
    
    def generate_report(self, days: int = 7) -> Dict:
        """Generate comprehensive order flow report."""
        swaps = self.load_swaps(days=days)
        
        if not swaps:
            return {'error': 'No swap data available'}
        
        wallet_activity = self.analyze_wallet_activity(swaps)
        whales = self.identify_whales(wallet_activity)
        metrics = self.compute_order_flow_metrics(swaps)
        patterns = self.detect_accumulation_distribution(swaps)
        
        return {
            'pool': self.pool_name,
            'period_days': days,
            'total_swaps': len(swaps),
            'unique_wallets': len(wallet_activity),
            'metrics': metrics,
            'whales': whales[:5],  # Top 5
            'patterns': patterns,
            'prediction': {
                'direction': metrics.get('market_direction', 'UNKNOWN'),
                'confidence': 'HIGH' if abs(metrics.get('order_flow_imbalance', 0)) > 0.3 else 'MEDIUM' if abs(metrics.get('order_flow_imbalance', 0)) > 0.15 else 'LOW',
                'signal': metrics.get('trend_signal', 'UNKNOWN'),
                'whale_behavior': whales[0]['behavior'] if whales else 'UNKNOWN'
            }
        }
    
    def format_report(self, report: Dict) -> str:
        """Format report for display."""
        if 'error' in report:
            return f"❌ {report['error']}"
        
        m = report['metrics']
        pred = report['prediction']
        
        out = f"📊 **ORDER FLOW ANALYSIS: {report['pool']}**\n\n"
        out += f"**Period:** {report['period_days']} days | {report['total_swaps']} swaps | {report['unique_wallets']} wallets\n\n"
        
        out += f"**Flow Metrics:**\n"
        out += f"• Buy/Sell Ratio: {m['buy_sell_ratio']}\n"
        out += f"• Order Flow Imbalance: {m['order_flow_imbalance']} ({m['market_direction']})\n"
        out += f"• Trend: {m['trend_signal']} ({m['trend_change']:+.1%})\n\n"
        
        out += f"**Prediction:**\n"
        out += f"• Direction: **{pred['direction']}** ({pred['confidence']} confidence)\n"
        out += f"• Whale Behavior: {pred['whale_behavior']}\n\n"
        
        if report['whales']:
            out += f"**Top Whales:**\n"
            for w in report['whales'][:3]:
                net = w['net_token0'] / 1e18
                out += f"• `{w['address'][:10]}...` | {w['behavior']} | Net: {net:+,.2f}\n"
        
        out += f"\n**Pattern:** {report['patterns'].get('dominant_pattern', 'UNKNOWN')}"
        
        return out


def analyze_all_pools(days: int = 7):
    """Analyze order flow for all pools with data."""
    results = {}
    
    if not SWAP_DATA_DIR.exists():
        return results
    
    for pool_dir in SWAP_DATA_DIR.iterdir():
        if pool_dir.is_dir() and pool_dir.name != 'last_block.json':
            analyzer = OrderFlowAnalyzer(pool_dir.name)
            report = analyzer.generate_report(days=days)
            if 'error' not in report:
                results[pool_dir.name] = report
    
    return results


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('pool', nargs='?', default='wflr-usdt0-sparkdex')
    parser.add_argument('--days', type=int, default=7)
    parser.add_argument('--json', action='store_true')
    parser.add_argument('--all', action='store_true')
    args = parser.parse_args()
    
    if args.all:
        results = analyze_all_pools(days=args.days)
        for pool, report in results.items():
            analyzer = OrderFlowAnalyzer(pool)
            print(analyzer.format_report(report))
            print("\n" + "="*50 + "\n")
    else:
        analyzer = OrderFlowAnalyzer(args.pool)
        report = analyzer.generate_report(days=args.days)
        
        if args.json:
            print(json.dumps(report, indent=2, default=str))
        else:
            print(analyzer.format_report(report))


if __name__ == '__main__':
    main()
