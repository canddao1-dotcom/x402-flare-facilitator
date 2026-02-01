#!/usr/bin/env node
/**
 * Order Flow Analysis CLI
 * 
 * Commands:
 *   /orderflow <pool>           - Full analysis (default)
 *   /orderflow whales <pool>    - Top whale activity
 *   /orderflow patterns <pool>  - Accumulation/distribution patterns
 *   /orderflow metrics <pool>   - Flow metrics only
 *   /orderflow all              - Analyze all pools
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.join(__dirname, '..', '..');
const SWAP_DIR = path.join(SKILL_DIR, 'data', 'swaps');
const SCRIPT = path.join(__dirname, 'order_flow.py');

// Available pools with swap data
function getAvailablePools() {
  if (!fs.existsSync(SWAP_DIR)) return [];
  return fs.readdirSync(SWAP_DIR)
    .filter(f => fs.statSync(path.join(SWAP_DIR, f)).isDirectory());
}

// Count swaps for a pool
function countSwaps(pool) {
  const poolDir = path.join(SWAP_DIR, pool);
  if (!fs.existsSync(poolDir)) return 0;
  
  let count = 0;
  const files = fs.readdirSync(poolDir).filter(f => f.endsWith('.jsonl'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(poolDir, file), 'utf8');
    count += content.split('\n').filter(l => l.trim()).length;
  }
  return count;
}

// Run Python analyzer and return JSON
function analyze(pool, days = 7) {
  try {
    const result = execSync(`python3 ${SCRIPT} ${pool} --days ${days} --json`, {
      encoding: 'utf8',
      timeout: 30000
    });
    return JSON.parse(result);
  } catch (e) {
    return { error: e.message };
  }
}

// Format number
function fmt(n, decimals = 2) {
  if (typeof n === 'string') n = parseFloat(n);
  if (n > 1e18) return (n / 1e18).toFixed(decimals);
  if (n > 1e12) return (n / 1e12).toFixed(decimals) + 'T';
  if (n > 1e9) return (n / 1e9).toFixed(decimals) + 'B';
  if (n > 1e6) return (n / 1e6).toFixed(decimals) + 'M';
  if (n > 1e3) return (n / 1e3).toFixed(decimals) + 'K';
  return n.toFixed(decimals);
}

const commands = {
  // Full analysis
  analyze: (args) => {
    const pool = args[0] || 'wflr-usdt0-sparkdex';
    const days = parseInt(args[1]) || 7;
    
    const swapCount = countSwaps(pool);
    if (swapCount === 0) {
      return `❌ No swap data for ${pool}\n\n` +
        `Available pools: ${getAvailablePools().join(', ')}`;
    }
    
    const data = analyze(pool, days);
    if (data.error) return `❌ ${data.error}`;
    
    const m = data.metrics || {};
    const pred = data.prediction || {};
    
    let out = `📊 **ORDER FLOW: ${pool}**\n\n`;
    out += `📅 ${days} days | ${data.total_swaps} swaps | ${data.unique_wallets} wallets\n\n`;
    
    // Market direction
    const dirEmoji = m.market_direction === 'BULLISH' ? '🟢' : 
                     m.market_direction === 'BEARISH' ? '🔴' : '⚪';
    out += `**Market:** ${dirEmoji} ${m.market_direction} (${pred.confidence} conf)\n`;
    out += `**Trend:** ${m.trend_signal} (${(m.trend_change * 100).toFixed(1)}%)\n`;
    out += `**Pattern:** ${data.patterns?.dominant_pattern || 'N/A'}\n\n`;
    
    // Metrics
    out += `**Flow Metrics:**\n`;
    out += `• Buy/Sell Ratio: ${m.buy_sell_ratio}\n`;
    out += `• Order Imbalance: ${(m.order_flow_imbalance * 100).toFixed(1)}%\n`;
    out += `• Buy Vol: ${fmt(m.total_buy_volume)} | Sell Vol: ${fmt(m.total_sell_volume)}\n`;
    out += `• Net Flow: ${fmt(m.net_flow)}\n\n`;
    
    // Top whale
    if (data.whales && data.whales.length > 0) {
      const w = data.whales[0];
      const emoji = w.behavior === 'ACCUMULATING' ? '🟢' : 
                    w.behavior === 'DISTRIBUTING' ? '🔴' : '⚪';
      out += `**Top Whale:** ${emoji} ${w.behavior}\n`;
      out += `\`${w.address.slice(0,10)}...\` | Net: ${fmt(w.net_token0)}\n`;
    }
    
    return out;
  },
  
  // Whale activity
  whales: (args) => {
    const pool = args[0] || 'wflr-usdt0-sparkdex';
    const days = parseInt(args[1]) || 7;
    
    const data = analyze(pool, days);
    if (data.error) return `❌ ${data.error}`;
    
    if (!data.whales || data.whales.length === 0) {
      return `❌ No whale data for ${pool}`;
    }
    
    let out = `🐋 **WHALE TRACKER: ${pool}**\n`;
    out += `📅 ${days} days | Top ${data.whales.length} whales\n\n`;
    
    for (const w of data.whales) {
      const emoji = w.behavior === 'ACCUMULATING' ? '🟢' : 
                    w.behavior === 'DISTRIBUTING' ? '🔴' : '⚪';
      out += `${emoji} **${w.behavior}**\n`;
      out += `\`${w.address}\`\n`;
      out += `Net: ${fmt(w.net_token0)} | Buys: ${w.buy_count} | Sells: ${w.sell_count}\n`;
      out += `First: ${w.first_seen?.slice(0, 10)} | Last: ${w.last_seen?.slice(0, 10)}\n\n`;
    }
    
    return out;
  },
  
  // Patterns
  patterns: (args) => {
    const pool = args[0] || 'wflr-usdt0-sparkdex';
    const days = parseInt(args[1]) || 7;
    
    const data = analyze(pool, days);
    if (data.error) return `❌ ${data.error}`;
    
    const patterns = data.patterns || {};
    
    let out = `📈 **PATTERNS: ${pool}**\n`;
    out += `📅 ${days} days analysis\n\n`;
    
    out += `**Dominant:** ${patterns.dominant_pattern || 'UNKNOWN'}\n\n`;
    
    if (patterns.pattern_summary) {
      out += `**Pattern Distribution:**\n`;
      for (const [pattern, count] of Object.entries(patterns.pattern_summary)) {
        const bar = '█'.repeat(Math.min(count * 2, 10));
        out += `${pattern.padEnd(15)} ${bar} ${count}\n`;
      }
    }
    
    out += `\n**Recent Windows:**\n`;
    const windows = (patterns.windows || []).slice(-5);
    for (const w of windows) {
      const ratio = w.buy_volume > w.sell_volume ? 
        `+${((w.buy_volume / (w.sell_volume || 1) - 1) * 100).toFixed(0)}%` :
        `-${((w.sell_volume / (w.buy_volume || 1) - 1) * 100).toFixed(0)}%`;
      out += `${w.window}: ${w.pattern} (${ratio})\n`;
    }
    
    return out;
  },
  
  // Metrics only
  metrics: (args) => {
    const pool = args[0] || 'wflr-usdt0-sparkdex';
    const days = parseInt(args[1]) || 7;
    
    const data = analyze(pool, days);
    if (data.error) return `❌ ${data.error}`;
    
    const m = data.metrics || {};
    
    let out = `📊 **FLOW METRICS: ${pool}**\n\n`;
    out += `| Metric | Value |\n`;
    out += `|--------|-------|\n`;
    out += `| Buy Volume | ${fmt(m.total_buy_volume)} |\n`;
    out += `| Sell Volume | ${fmt(m.total_sell_volume)} |\n`;
    out += `| Net Flow | ${fmt(m.net_flow)} |\n`;
    out += `| Buy/Sell Ratio | ${m.buy_sell_ratio} |\n`;
    out += `| Order Imbalance | ${(m.order_flow_imbalance * 100).toFixed(1)}% |\n`;
    out += `| Trend Change | ${(m.trend_change * 100).toFixed(1)}% |\n`;
    out += `| Direction | ${m.market_direction} |\n`;
    out += `| Trend Signal | ${m.trend_signal} |\n`;
    
    return out;
  },
  
  // List pools with data
  list: () => {
    const pools = getAvailablePools();
    
    if (pools.length === 0) {
      return `❌ No swap data collected yet\n\n` +
        `Start swap collector:\n` +
        `\`/trading daemon\``;
    }
    
    let out = `📊 **POOLS WITH SWAP DATA**\n\n`;
    
    for (const pool of pools) {
      const count = countSwaps(pool);
      out += `• **${pool}**: ${count} swaps\n`;
    }
    
    out += `\n_Analyze with: \`/orderflow <pool>\`_`;
    return out;
  },
  
  // Analyze all pools
  all: (args) => {
    const days = parseInt(args[0]) || 7;
    const pools = getAvailablePools();
    
    if (pools.length === 0) {
      return `❌ No swap data available`;
    }
    
    let out = `📊 **ORDER FLOW SUMMARY**\n`;
    out += `📅 ${days} days | ${pools.length} pools\n\n`;
    
    out += `| Pool | Direction | Imbalance | Whales |\n`;
    out += `|------|-----------|-----------|--------|\n`;
    
    for (const pool of pools.slice(0, 10)) {
      const data = analyze(pool, days);
      if (data.error) continue;
      
      const m = data.metrics || {};
      const emoji = m.market_direction === 'BULLISH' ? '🟢' : 
                   m.market_direction === 'BEARISH' ? '🔴' : '⚪';
      const whaleBehavior = data.whales?.[0]?.behavior?.slice(0, 5) || 'N/A';
      
      out += `| ${pool.slice(0, 20)} | ${emoji} ${m.market_direction} | ${(m.order_flow_imbalance * 100).toFixed(1)}% | ${whaleBehavior} |\n`;
    }
    
    return out;
  },
  
  help: () => {
    return `📊 **ORDER FLOW ANALYZER**\n\n` +
      `**Commands:**\n` +
      `\`/orderflow <pool>\` - Full analysis\n` +
      `\`/orderflow whales <pool>\` - Top whale activity\n` +
      `\`/orderflow patterns <pool>\` - Accum/distrib patterns\n` +
      `\`/orderflow metrics <pool>\` - Flow metrics only\n` +
      `\`/orderflow list\` - Pools with data\n` +
      `\`/orderflow all\` - Summary all pools\n\n` +
      `**Example:**\n` +
      `\`/orderflow wflr-usdt0-sparkdex\``;
  }
};

// Main
function main() {
  const args = process.argv.slice(2);
  let cmd = args[0] || 'help';
  let cmdArgs = args.slice(1);
  
  // If first arg looks like a pool name, default to analyze
  if (cmd && cmd.includes('-') && !commands[cmd]) {
    cmdArgs = [cmd, ...cmdArgs];
    cmd = 'analyze';
  }
  
  if (commands[cmd]) {
    console.log(commands[cmd](cmdArgs));
  } else {
    // Try as pool name
    console.log(commands.analyze([cmd, ...cmdArgs]));
  }
}

main();
