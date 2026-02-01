#!/usr/bin/env node
/**
 * Scheduled Tweet Generator
 * Generates tweets for cron jobs
 * 
 * Usage: 
 *   node scheduled-tweets.js --type daily-stats [--confirm]
 *   node scheduled-tweets.js --type position-status [--confirm]
 *   node scheduled-tweets.js --type weekly-performance [--confirm]
 */

const https = require('https');
const { execSync } = require('child_process');
const path = require('path');

const POST_SCRIPT = path.join(__dirname, 'post.js');
const RPC_URL = 'https://flare-api.flare.network/ext/C/rpc';
const POSITION_MANAGER = '0xd9770b1c7a6ccd33c75b5bcb1c0078f46be46657';

const POSITIONS = [
  { id: 28509, name: 'DAO stXRP/FXRP', pool: '0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770', dex: 'enosys' },
  { id: 34935, name: 'sFLR/WFLR', pool: '0x25b4f3930934f0a3cbb885c624ecee75a2917144', dex: 'enosys' },
  { id: 34936, name: 'CDP/USDT0', pool: '0x975f0369d31f1dd79abf057ad369ae7d5b9f6fb4', dex: 'enosys' },
  { id: 34937, name: 'WFLR/FXRP', pool: '0xb4cb11a84cfbd8f6336dc9417ac45c1f8e5b59e7', dex: 'enosys' },
  { id: 34938, name: 'WFLR/USDT0', pool: '0x3c2a7b76795e58829faaa034486d417dd0155162', dex: 'enosys' },
  { id: 34964, name: 'WFLR/FXRP (Lg)', pool: '0xb4cb11a84cfbd8f6336dc9417ac45c1f8e5b59e7', dex: 'enosys' },
  { id: 34965, name: 'sFLR/WFLR (Lg)', pool: '0x25b4f3930934f0a3cbb885c624ecee75a2917144', dex: 'enosys' },
];

const NEAR_EDGE_PERCENT = 15;

// Parse args
const args = process.argv.slice(2);
let type = '';
let confirm = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--type' && args[i + 1]) type = args[++i];
  if (args[i] === '--confirm') confirm = true;
}

async function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || 'GET',
      headers: options.headers || { 'Content-Type': 'application/json' },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function rpcCall(method, params) {
  const result = await fetchJSON(RPC_URL, {
    method: 'POST',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  if (result.error) throw new Error(result.error.message);
  return result.result;
}

async function getPositionData(positionId) {
  const data = '0x99fbab88' + positionId.toString(16).padStart(64, '0');
  const result = await rpcCall('eth_call', [{ to: POSITION_MANAGER, data }, 'latest']);
  const hex = result.slice(2);
  const tickLowerHex = hex.slice(320, 384);
  const tickUpperHex = hex.slice(384, 448);
  
  let tickLower = BigInt('0x' + tickLowerHex);
  let tickUpper = BigInt('0x' + tickUpperHex);
  const MAX = BigInt('0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  const FULL = BigInt('0x10000000000000000000000000000000000000000000000000000000000000000');
  if (tickLower > MAX) tickLower = tickLower - FULL;
  if (tickUpper > MAX) tickUpper = tickUpper - FULL;
  
  return { tickLower: Number(tickLower), tickUpper: Number(tickUpper) };
}

async function getCurrentTick(poolAddress) {
  const result = await rpcCall('eth_call', [{ to: poolAddress, data: '0x3850c7bd' }, 'latest']);
  const hex = result.slice(2);
  const tickHex = hex.slice(64, 128);
  const tickBigInt = BigInt('0x' + tickHex);
  const MAX = BigInt('0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  const FULL = BigInt('0x10000000000000000000000000000000000000000000000000000000000000000');
  return tickBigInt > MAX ? Number(tickBigInt - FULL) : Number(tickBigInt);
}

function getStatus(currentTick, tickLower, tickUpper) {
  if (currentTick < tickLower || currentTick > tickUpper) {
    return { status: 'OUT', emoji: '❌', percent: null };
  }
  const range = tickUpper - tickLower;
  const pos = currentTick - tickLower;
  const pct = (pos / range) * 100;
  if (pct < NEAR_EDGE_PERCENT || pct > (100 - NEAR_EDGE_PERCENT)) {
    return { status: 'EDGE', emoji: '⚠️', percent: pct.toFixed(0) };
  }
  return { status: 'OK', emoji: '✅', percent: pct.toFixed(0) };
}

async function getAllPositions() {
  const results = [];
  for (const pos of POSITIONS) {
    try {
      const [posData, tick] = await Promise.all([
        getPositionData(pos.id),
        getCurrentTick(pos.pool)
      ]);
      const status = getStatus(tick, posData.tickLower, posData.tickUpper);
      results.push({ ...pos, ...status, tick, tickLower: posData.tickLower, tickUpper: posData.tickUpper });
    } catch (e) {
      results.push({ ...pos, status: 'ERR', emoji: '❓', error: e.message });
    }
  }
  return results;
}

async function generatePositionStatusTweet() {
  const positions = await getAllPositions();
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  
  const ok = positions.filter(p => p.status === 'OK');
  const edge = positions.filter(p => p.status === 'EDGE');
  const out = positions.filter(p => p.status === 'OUT');
  
  let lines = [`🎯 V3 LP Status - ${date}\n`];
  
  // Show problems first
  for (const p of out) {
    lines.push(`❌ ${p.name}: OUT OF RANGE`);
  }
  for (const p of edge) {
    lines.push(`⚠️ ${p.name}: Near edge (${p.percent}%)`);
  }
  
  // Summary
  if (out.length > 0) {
    lines.push(`\n🔄 Rebalance needed on ${out.length} position(s)`);
  } else if (edge.length > 0) {
    lines.push(`\n👀 Watching ${edge.length} position(s) closely`);
  } else {
    lines.push(`✅ All ${ok.length} positions earning`);
  }
  
  lines.push(`\nRunning ${positions.length} concentrated LP positions on @enosys_global`);
  lines.push(`\n— @cand_dao 🤖`);
  
  return lines.join('\n');
}

// STRICT whitelist - only tokens we can explain publicly
// Each token needs: name, what it is, risk level
const WHITELISTED_TOKENS = {
  'wflr': { name: 'WFLR', desc: 'Wrapped Flare', risk: 'low' },
  'sflr': { name: 'sFLR', desc: 'Staked Flare (Sceptre)', risk: 'low' },
  'usd₮0': { name: 'USD₮0', desc: 'Bridged USDT', risk: 'low' },
  'usdc.e': { name: 'USDC.e', desc: 'Bridged USDC', risk: 'low' },
  'cusdx': { name: 'cUSDX', desc: 'Kinetic stablecoin', risk: 'medium' },
  'weth': { name: 'WETH', desc: 'Wrapped ETH', risk: 'low' },
  'fxrp': { name: 'FXRP', desc: 'Flare-wrapped XRP', risk: 'low' },
  'stxrp': { name: 'stXRP', desc: 'Staked XRP (Sceptre)', risk: 'low' },
};

// Projects we trust
const TRUSTED_PROJECTS = ['sparkdex-v3.1', 'sceptre-liquid', 'kinetic'];

function isLowRiskPool(pool) {
  // 1. Must be from trusted project
  if (!TRUSTED_PROJECTS.includes(pool.project)) return false;
  
  // 2. Minimum TVL $200K (serious liquidity)
  if (pool.tvlUsd < 200000) return false;
  
  // 3. APY sanity check - >80% usually unsustainable for major pairs
  if (pool.apy > 80) return false;
  
  // 4. ALL tokens must be whitelisted (strict)
  const symbol = pool.symbol.toLowerCase();
  const tokens = symbol.split('-').filter(t => t.length > 0);
  
  // Single token pools (staking) - must be whitelisted
  if (tokens.length === 1) {
    return Object.keys(WHITELISTED_TOKENS).some(w => tokens[0].includes(w));
  }
  
  // Pair pools - BOTH tokens must be whitelisted
  const allWhitelisted = tokens.every(t => 
    Object.keys(WHITELISTED_TOKENS).some(w => t.includes(w))
  );
  
  return allWhitelisted;
}

function getRiskLabel(pool) {
  const symbol = pool.symbol.toLowerCase();
  const tokens = symbol.split('-');
  const STABLES = ['usd₮0', 'usdc.e', 'usdc', 'cusdx'];
  const hasStable = tokens.some(t => STABLES.some(s => t.includes(s)));
  
  // Stablecoin pairs with high TVL = safest
  if (hasStable && pool.tvlUsd > 1000000) return '🟢';
  if (hasStable && pool.tvlUsd > 500000) return '🟢';
  if (pool.tvlUsd > 1000000) return '🟢';
  if (pool.tvlUsd > 500000) return '🟡';
  return '🟡';  // All pass strict filter, so at least yellow
}

async function generateDailyStatsTweet() {
  // YIELD HUNTER style - actionable farming opportunities on Flare
  try {
    const resp = await fetchJSON('https://yields.llama.fi/pools');
    const flarePools = resp.data.filter(p => 
      p.chain === 'Flare' && 
      p.apy > 5 &&
      isLowRiskPool(p)
    ).sort((a, b) => b.apy - a.apy);
    
    const topPools = flarePools.slice(0, 4);
    
    if (topPools.length === 0) {
      return null;
    }
    
    let lines = [`🔥 Flare Yield Alert\n`];
    lines.push('Best farms RIGHT NOW:\n');
    
    for (const p of topPools) {
      const apy = p.apy.toFixed(0);
      const tvl = p.tvlUsd > 1000000 
        ? `$${(p.tvlUsd / 1000000).toFixed(1)}M` 
        : `$${(p.tvlUsd / 1000).toFixed(0)}K`;
      const project = p.project.includes('sparkdex') ? '@sparkdexai' 
        : p.project.includes('sceptre') ? '@SceptreLSD'
        : p.project;
      const risk = getRiskLabel(p);
      lines.push(`${risk} ${apy}% → ${p.symbol} (${tvl})`);
    }
    
    lines.push(`\nVerified pools. DYOR.`);
    lines.push(`\n— @cand_dao 🤖`);
    
    return lines.join('\n');
  } catch (e) {
    console.error('DefiLlama fetch failed:', e.message);
    return null;
  }
}

async function generateWeeklyTweet() {
  const positions = await getAllPositions();
  const ok = positions.filter(p => p.status === 'OK').length;
  const total = positions.length;
  const pctInRange = ((ok / total) * 100).toFixed(0);
  
  // Get week number
  const now = new Date();
  const week = Math.ceil((now.getDate()) / 7);
  const month = now.toLocaleDateString('en-US', { month: 'short' });
  
  let lines = [
    `📈 Week ${week} LP Recap\n`,
    `Running ${total} V3 positions on @enosys_global`,
    ``,
  ];
  
  if (ok === total) {
    lines.push(`✅ 100% uptime - all positions earning`);
    lines.push(`Concentrated liquidity > passive LPs`);
  } else {
    lines.push(`${ok}/${total} positions in range (${pctInRange}%)`);
    lines.push(`Some rebalancing needed this week`);
  }
  
  lines.push(`\nAgent-managed DeFi on $FLR`);
  lines.push(`\n— @cand_dao 🤖`);
  
  return lines.join('\n');
}

function tweet(text, shouldConfirm) {
  const confirmFlag = shouldConfirm ? '--confirm' : '';
  const escaped = text.replace(/'/g, "'\\''");
  const cmd = `node "${POST_SCRIPT}" '${escaped}' ${confirmFlag}`;
  
  try {
    const result = execSync(cmd, { encoding: 'utf8' });
    console.log(result);
    return true;
  } catch (e) {
    console.error('Tweet failed:', e.message);
    return false;
  }
}

async function main() {
  if (!type) {
    console.log('Usage: node scheduled-tweets.js --type <daily-stats|position-status|weekly-performance> [--confirm]');
    process.exit(1);
  }
  
  let tweetText = null;
  
  switch (type) {
    case 'daily-stats':
      console.log('Generating daily stats tweet...');
      tweetText = await generateDailyStatsTweet();
      break;
    case 'position-status':
      console.log('Generating position status tweet...');
      tweetText = await generatePositionStatusTweet();
      break;
    case 'weekly-performance':
      console.log('Generating weekly performance tweet...');
      tweetText = await generateWeeklyTweet();
      break;
    default:
      console.error('Unknown type:', type);
      process.exit(1);
  }
  
  if (tweetText) {
    console.log('\n--- Tweet ---');
    console.log(tweetText);
    console.log('--- End ---\n');
    tweet(tweetText, confirm);
  } else {
    console.log('Failed to generate tweet');
    process.exit(1);
  }
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
