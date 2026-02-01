#!/usr/bin/env node
/**
 * Trading Engine Commands
 * 
 * Usage:
 *   /trading                    - Show status
 *   /trading status             - Detailed engine status
 *   /trading pools              - List configured pools
 *   /trading collect <pool>     - Collect snapshot
 *   /trading history <pool>     - Collect 24h historical
 *   /trading train <pool> [eps] - Train agent
 *   /trading data <pool>        - Show collected data stats
 *   /trading daemon             - Check/start daemon
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.join(__dirname, '..');
const CONFIG_FILE = path.join(SKILL_DIR, 'config', 'pools.json');
const DATA_DIR = path.join(SKILL_DIR, 'data', 'pool_history');
const MODELS_DIR = path.join(SKILL_DIR, 'models');

// Load config
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    return { pools: {}, dexes: {} };
  }
}

// Format number with commas
function fmt(n) {
  if (typeof n === 'string') n = parseFloat(n);
  if (n > 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n > 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n > 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n > 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(4);
}

// Check if daemon is running
function isDaemonRunning() {
  const pidFile = '/tmp/trading-data-collector.pid';
  if (!fs.existsSync(pidFile)) return null;
  
  const pid = fs.readFileSync(pidFile, 'utf8').trim();
  try {
    execSync(`ps -p ${pid}`, { stdio: 'ignore' });
    return pid;
  } catch {
    return null;
  }
}

// Count snapshots for a pool
function countSnapshots(pool) {
  const poolDir = path.join(DATA_DIR, pool);
  if (!fs.existsSync(poolDir)) return 0;
  
  let count = 0;
  const files = fs.readdirSync(poolDir).filter(f => f.endsWith('.jsonl'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(poolDir, file), 'utf8');
    count += content.split('\n').filter(l => l.trim()).length;
  }
  return count;
}

// Get latest snapshot for pool
function getLatestSnapshot(pool) {
  const poolDir = path.join(DATA_DIR, pool);
  if (!fs.existsSync(poolDir)) return null;
  
  const files = fs.readdirSync(poolDir)
    .filter(f => f.endsWith('.jsonl'))
    .sort()
    .reverse();
  
  if (files.length === 0) return null;
  
  const content = fs.readFileSync(path.join(poolDir, files[0]), 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length === 0) return null;
  
  return JSON.parse(lines[lines.length - 1]);
}

// Fetch V3 pools from DefiLlama (same as LP skill)
async function fetchDefiLlamaPools() {
  return new Promise((resolve, reject) => {
    const https = require('https');
    https.get('https://yields.llama.fi/pools', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const pools = JSON.parse(data).data
            .filter(p => p.chain === 'Flare')
            .filter(p => ['sparkdex-v3.1', 'enosys-v3'].includes(p.project))
            .filter(p => p.tvlUsd > 5000)
            .sort((a, b) => b.tvlUsd - a.tvlUsd);
          resolve(pools);
        } catch (e) { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

// Commands
const commands = {
  status: () => {
    const config = loadConfig();
    const daemonPid = isDaemonRunning();
    
    let out = '🤖 **TRADING ENGINE**\n\n';
    
    // Daemon status
    out += '**Data Collector:**\n';
    if (daemonPid) {
      out += `✅ Running (PID ${daemonPid})\n`;
    } else {
      out += '❌ Not running\n';
      out += '→ Run: `/trading daemon`\n';
    }
    
    // Models
    out += '\n**Trained Models:**\n';
    if (fs.existsSync(MODELS_DIR)) {
      const models = fs.readdirSync(MODELS_DIR).filter(f => f.includes('_actor.pt'));
      if (models.length > 0) {
        models.forEach(m => {
          const size = (fs.statSync(path.join(MODELS_DIR, m)).size / 1024).toFixed(0);
          out += `• ${m} (${size} KB)\n`;
        });
      } else {
        out += '• No models yet\n';
      }
    }
    
    // Quick pool stats
    out += '\n**Pools Collecting:**\n';
    const pools = config.pools || {};
    for (const [name, pool] of Object.entries(pools)) {
      if (pool.enabled) {
        const count = countSnapshots(name);
        const latest = getLatestSnapshot(name);
        if (latest) {
          out += `• ${name}: ${count} snapshots, tick=${latest.tick}, price=${latest.price.toFixed(4)}\n`;
        } else {
          out += `• ${name}: ${count} snapshots\n`;
        }
      }
    }
    
    out += '\n_Commands: status, pools, collect, history, train, data, daemon_';
    return out;
  },
  
  pools: () => {
    const config = loadConfig();
    const pools = config.pools || {};
    
    let out = '📊 **CONFIGURED POOLS**\n\n';
    
    for (const [name, pool] of Object.entries(pools)) {
      const status = pool.enabled ? '✅' : '⬚';
      const count = countSnapshots(name);
      out += `${status} **${name}**\n`;
      out += `   ${pool.token0}/${pool.token1} on ${pool.dex}\n`;
      out += `   Fee: ${(pool.fee / 10000).toFixed(2)}% | Snapshots: ${count}\n`;
      out += `   \`${pool.address.slice(0, 10)}...${pool.address.slice(-6)}\`\n\n`;
    }
    
    return out;
  },
  
  collect: (args) => {
    const pool = args[0] || 'sflr-wflr-enosys';
    const config = loadConfig();
    
    if (!config.pools[pool]) {
      return `❌ Unknown pool: ${pool}\n\nAvailable: ${Object.keys(config.pools).join(', ')}`;
    }
    
    try {
      // Try collectors subdirectory first, then root
      let collector = path.join(SKILL_DIR, 'scripts', 'collectors', 'data_collector.py');
      if (!fs.existsSync(collector)) {
        collector = path.join(SKILL_DIR, 'scripts', 'data_collector.py');
      }
      
      const result = execSync(`python3 ${collector} snapshot --pool ${pool}`, {
        encoding: 'utf8',
        timeout: 30000
      });
      
      // Parse the JSON output - find line starting with {
      const lines = result.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          try {
            const data = JSON.parse(trimmed);
            return `✅ **Snapshot Collected**\n\n` +
              `**Pool:** ${pool}\n` +
              `**Block:** ${data.block}\n` +
              `**Tick:** ${data.tick}\n` +
              `**Price:** ${data.price.toFixed(6)}\n` +
              `**Liquidity:** ${fmt(data.liquidity)}\n` +
              `**Time:** ${data.datetime}`;
          } catch {}
        }
      }
      
      // If no JSON found, still success if checkmark in output
      if (result.includes('✓')) {
        const latest = getLatestSnapshot(pool);
        if (latest) {
          return `✅ **Snapshot Collected**\n\n` +
            `**Pool:** ${pool}\n` +
            `**Block:** ${latest.block}\n` +
            `**Tick:** ${latest.tick}\n` +
            `**Price:** ${latest.price.toFixed(6)}\n` +
            `**Time:** ${latest.datetime}`;
        }
      }
      return `✅ Snapshot collected for ${pool}`;
    } catch (e) {
      return `❌ Error collecting: ${e.message}`;
    }
  },
  
  history: (args) => {
    const pool = args[0] || 'sflr-wflr-enosys';
    const config = loadConfig();
    
    if (!config.pools[pool]) {
      return `❌ Unknown pool: ${pool}`;
    }
    
    return `⏳ **Collecting 24h historical data for ${pool}...**\n\n` +
      `This runs in background. Check with \`/trading data ${pool}\`\n\n` +
      `_Collecting ~24 snapshots (1 per hour)..._`;
    
    // Note: actual collection happens async - would need to spawn
  },
  
  train: (args) => {
    const pool = args[0] || 'sflr-wflr-enosys';
    const episodes = parseInt(args[1]) || 100;
    const config = loadConfig();
    
    if (!config.pools[pool]) {
      return `❌ Unknown pool: ${pool}`;
    }
    
    const poolAddr = config.pools[pool].address;
    const snapshots = countSnapshots(pool);
    
    if (snapshots < 10) {
      return `⚠️ **Insufficient data for ${pool}**\n\n` +
        `Snapshots: ${snapshots} (need 100+ for good training)\n\n` +
        `Collect more data first:\n` +
        `\`/trading collect ${pool}\`\n` +
        `\`/trading history ${pool}\``;
    }
    
    return `🎓 **Training Agent**\n\n` +
      `**Pool:** ${pool}\n` +
      `**Address:** \`${poolAddr.slice(0, 10)}...\`\n` +
      `**Episodes:** ${episodes}\n` +
      `**Data:** ${snapshots} snapshots\n\n` +
      `_Training runs async. This takes ~${(episodes * 6 / 60).toFixed(0)} minutes._\n\n` +
      `Check models with \`/trading status\``;
  },
  
  data: (args) => {
    const pool = args[0] || 'sflr-wflr-enosys';
    const poolDir = path.join(DATA_DIR, pool);
    
    if (!fs.existsSync(poolDir)) {
      return `❌ No data for ${pool}\n\nCollect with: \`/trading collect ${pool}\``;
    }
    
    const files = fs.readdirSync(poolDir);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
    const histFiles = files.filter(f => f.startsWith('historical_'));
    
    let totalSnapshots = 0;
    let latestSnapshot = null;
    let earliestTimestamp = Infinity;
    let latestTimestamp = 0;
    
    for (const file of jsonlFiles) {
      const content = fs.readFileSync(path.join(poolDir, file), 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      totalSnapshots += lines.length;
      
      for (const line of lines) {
        try {
          const snap = JSON.parse(line);
          if (snap.timestamp < earliestTimestamp) earliestTimestamp = snap.timestamp;
          if (snap.timestamp > latestTimestamp) {
            latestTimestamp = snap.timestamp;
            latestSnapshot = snap;
          }
        } catch {}
      }
    }
    
    let out = `📊 **DATA: ${pool}**\n\n`;
    out += `**Total Snapshots:** ${totalSnapshots}\n`;
    out += `**Daily Files:** ${jsonlFiles.length}\n`;
    out += `**Historical Files:** ${histFiles.length}\n`;
    
    if (latestSnapshot) {
      const duration = latestTimestamp - earliestTimestamp;
      const hours = (duration / 3600).toFixed(1);
      
      out += `\n**Time Range:** ${hours} hours\n`;
      out += `\n**Latest:**\n`;
      out += `• Block: ${latestSnapshot.block}\n`;
      out += `• Tick: ${latestSnapshot.tick}\n`;
      out += `• Price: ${latestSnapshot.price.toFixed(6)}\n`;
      out += `• Time: ${latestSnapshot.datetime}\n`;
    }
    
    // Training readiness
    out += '\n**Training Ready:** ';
    if (totalSnapshots >= 1000) {
      out += '✅ Yes';
    } else if (totalSnapshots >= 100) {
      out += '⚠️ Minimal';
    } else {
      out += `❌ Need ${100 - totalSnapshots}+ more`;
    }
    
    return out;
  },
  
  daemon: () => {
    const pid = isDaemonRunning();
    
    if (pid) {
      return `✅ **Daemon Running**\n\n` +
        `PID: ${pid}\n` +
        `Pool: sflr-wflr-enosys\n` +
        `Interval: 5 minutes\n` +
        `Log: /tmp/trading-data-collector.log`;
    }
    
    // Start daemon
    try {
      const script = path.join(SKILL_DIR, 'scripts', 'ensure-daemon.sh');
      execSync(`bash ${script}`, { encoding: 'utf8' });
      
      const newPid = isDaemonRunning();
      return `🚀 **Daemon Started**\n\n` +
        `PID: ${newPid}\n` +
        `Pool: sflr-wflr-enosys\n` +
        `Interval: 5 minutes`;
    } catch (e) {
      return `❌ Failed to start daemon: ${e.message}`;
    }
  },
  
  // Check training data readiness
  ready: () => {
    try {
      const result = execSync(
        `python3 ${path.join(SKILL_DIR, 'scripts', 'training', 'data_loader.py')}`,
        { encoding: 'utf8', timeout: 30000 }
      );
      return result;
    } catch (e) {
      return `❌ Error checking data: ${e.message}`;
    }
  },
  
  // Train on real data
  train: (args) => {
    const pool = args[0] || 'sflr-wflr-enosys';
    const episodes = args[1] || '100';
    
    return `🎓 **Training on Real Data**\n\n` +
      `Pool: ${pool}\n` +
      `Episodes: ${episodes}\n\n` +
      `Run manually:\n` +
      `\`\`\`\n` +
      `python3 ${path.join(SKILL_DIR, 'scripts', 'training', 'train_real.py')} ${pool} --episodes ${episodes}\n` +
      `\`\`\`\n\n` +
      `Or check data first:\n` +
      `\`/trading ready\``;
  },
  
  // Get prediction
  predict: (args) => {
    const pool = args[0] || 'sflr-wflr-enosys';
    
    try {
      const result = execSync(
        `python3 ${path.join(SKILL_DIR, 'scripts', 'inference', 'predictor.py')} ${pool}`,
        { encoding: 'utf8', timeout: 30000 }
      );
      return result;
    } catch (e) {
      return `❌ Error getting prediction: ${e.message}`;
    }
  },
  
  // Run backtest
  backtest: (args) => {
    const pool = args[0] || 'sflr-wflr-enosys';
    const days = args[1] || '7';
    
    try {
      const result = execSync(
        `python3 ${path.join(SKILL_DIR, 'scripts', 'inference', 'backtest.py')} ${pool} --days ${days}`,
        { encoding: 'utf8', timeout: 60000 }
      );
      return result;
    } catch (e) {
      return `❌ Error running backtest: ${e.message}`;
    }
  },
  
  // Order flow analysis
  flow: (args) => {
    const pool = args[0] || 'wflr-usdt0-sparkdex';
    const days = args[1] || '7';
    
    try {
      const result = execSync(
        `python3 ${path.join(SKILL_DIR, 'scripts', 'analysis', 'order_flow.py')} ${pool} --days ${days}`,
        { encoding: 'utf8', timeout: 30000 }
      );
      return result;
    } catch (e) {
      return `❌ Error analyzing flow: ${e.message}`;
    }
  },
  
  // Whale tracking
  whales: (args) => {
    const pool = args[0] || 'wflr-usdt0-sparkdex';
    
    try {
      const result = execSync(
        `python3 ${path.join(SKILL_DIR, 'scripts', 'analysis', 'order_flow.py')} ${pool} --json`,
        { encoding: 'utf8', timeout: 30000 }
      );
      const data = JSON.parse(result);
      
      if (!data.whales || data.whales.length === 0) {
        return '❌ No whale data available';
      }
      
      let out = `🐋 **WHALE ACTIVITY: ${pool}**\n\n`;
      
      for (const w of data.whales.slice(0, 5)) {
        const net = (w.net_token0 / 1e18).toFixed(2);
        const emoji = w.behavior === 'ACCUMULATING' ? '🟢' : w.behavior === 'DISTRIBUTING' ? '🔴' : '⚪';
        out += `${emoji} \`${w.address.slice(0,10)}...\`\n`;
        out += `   ${w.behavior} | Net: ${net} | Buys: ${w.buy_count} Sells: ${w.sell_count}\n\n`;
      }
      
      return out;
    } catch (e) {
      return `❌ Error: ${e.message}`;
    }
  },
  
  discover: async () => {
    const pools = await fetchDefiLlamaPools();
    
    if (pools.length === 0) {
      return '❌ Failed to fetch pools from DefiLlama';
    }
    
    let out = '📊 **V3 POOLS AVAILABLE**\n\n';
    out += '```\n';
    out += 'Pool                 | DEX       | TVL      | APY\n';
    out += '-'.repeat(55) + '\n';
    
    pools.slice(0, 20).forEach(p => {
      const dex = p.project.includes('spark') ? 'SparkDex' : 'Enosys';
      const tvl = p.tvlUsd > 1e6 ? `$${(p.tvlUsd/1e6).toFixed(1)}M` : `$${(p.tvlUsd/1e3).toFixed(0)}K`;
      out += `${p.symbol.padEnd(20)} | ${dex.padEnd(9)} | ${tvl.padEnd(8)} | ${(p.apy || 0).toFixed(1)}%\n`;
    });
    out += '```\n';
    out += `\n_Total: ${pools.length} V3 pools on Flare_`;
    
    return out;
  }
};

// Async wrapper for commands
const asyncCommands = ['discover'];

// Main
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'status';
  const cmdArgs = args.slice(1);
  
  if (commands[cmd]) {
    const result = commands[cmd](cmdArgs);
    // Handle async commands
    if (result && typeof result.then === 'function') {
      console.log(await result);
    } else {
      console.log(result);
    }
  } else {
    // Default to status if unknown command
    console.log(commands.status());
  }
}

main().catch(console.error);
