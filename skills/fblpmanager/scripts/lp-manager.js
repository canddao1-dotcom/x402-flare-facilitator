#!/usr/bin/env node
/**
 * FlareBank LP Manager v3
 * - Checks V3 position health (in/out of range)
 * - Pulls APY data from DefiLlama
 * - Pulls volume + price data from DEXScreener
 * - Historical volatility from GeckoTerminal
 * - Suggests optimal ranges based on historical data
 */

const https = require('https');

const RPC = 'https://flare-api.flare.network/ext/C/rpc';
const DEFILLAMA_URL = 'https://yields.llama.fi/pools';
const DEXSCREENER_URL = 'https://api.dexscreener.com/latest/dex/tokens/0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d';
const GECKOTERMINAL_BASE = 'https://api.geckoterminal.com/api/v2/networks/flare';

// Position managers
const POSITION_MANAGERS = {
  enosys: '0xd9770b1c7a6ccd33c75b5bcb1c0078f46be46657',
  sparkdex: '0xf60e11cd753a0e5989d237e87d559e1b0f9ab5b5'
};

// V3 Positions to monitor
const POSITIONS = [
  {
    id: 28509,
    name: 'DAO stXRP/FXRP',
    dex: 'enosys',
    pool: '0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770',
    defillamaMatch: 'STXRP-FXRP',
    apyDex: 'sparkdex'
  },
  {
    id: 34935,
    name: 'Agent sFLR/WFLR',
    dex: 'enosys',
    pool: '0x25b4f3930934f0a3cbb885c624ecee75a2917144',
    defillamaMatch: 'SFLR-WFLR',
    aggressive: true
  },
  {
    id: 34936,
    name: 'Agent CDP/USDT0',
    dex: 'enosys',
    pool: '0x975f0369d31f1dd79abf057ad369ae7d5b9f6fb4',
    defillamaMatch: 'CDP-USDT',
    aggressive: true
  },
  {
    id: 34937,
    name: 'Agent WFLR/FXRP',
    dex: 'enosys',
    pool: '0xb4cb11a84cfbd8f6336dc9417ac45c1f8e5b59e7',
    defillamaMatch: 'WFLR-FXRP',
    aggressive: true
  },
  {
    id: 34938,
    name: 'Agent WFLR/USDT0',
    dex: 'enosys',
    pool: '0x3c2a7b76795e58829faaa034486d417dd0155162',
    defillamaMatch: 'WFLR-USDT',
    aggressive: true
  },
  {
    id: 34964,
    name: 'Agent WFLR/FXRP',
    dex: 'enosys',
    pool: '0xb4cb11a84cfbd8f6336dc9417ac45c1f8e5b59e7',
    defillamaMatch: 'WFLR-FXRP',
    aggressive: true
  },
  {
    id: 34965,
    name: 'Agent sFLR/WFLR',
    dex: 'enosys',
    pool: '0x25b4f3930934f0a3cbb885c624ecee75a2917144',
    defillamaMatch: 'SFLR-WFLR',
    aggressive: true
  }
];

// Top pools for analysis (GeckoTerminal addresses)
const ANALYSIS_POOLS = [
  // High volume pairs
  { name: 'WFLR/FXRP', addr: '0xb4cb11a84cfbd8f6336dc9417ac45c1f8e5b59e7', fee: '0.3%', dex: 'Enosys' },
  { name: 'FXRP/USD₮0', addr: '0x88d46717b16619b37fa2dfd2f038defb4459f1f7', fee: '0.05%', dex: 'Enosys' },
  { name: 'WFLR/USD₮0', addr: '0x3c2a7b76795e58829faaa034486d417dd0155162', fee: '0.3%', dex: 'Enosys' },
  { name: 'WFLR/USD₮0', addr: '0x63873f0d7165689022feef1b77428df357b33dcf', fee: '0.05%', dex: 'SparkDex' },
  { name: 'USD₮0/USDC.e', addr: '0x0b40111b4cf6dd1001f36f9c631956fefa56bc3b', fee: '0.01%', dex: 'Enosys' },
  { name: 'WFLR/FXRP', addr: '0x589689984a06e4640593edec64e415c415940c7f', fee: '0.05%', dex: 'SparkDex' },
  { name: 'FXRP/USD₮0', addr: '0x686f53f0950ef193c887527ec027e6a574a4dbe1', fee: '0.3%', dex: 'Enosys' },
  { name: 'WETH/USD₮0', addr: '0x724bd6413925dd4d513b35b1cf9c6f1c378e3691', fee: '0.05%', dex: 'SparkDex' },
  // CDP pair
  { name: 'CDP/USD₮0', addr: '0x975f0369d31f1dd79abf057ad369ae7d5b9f6fb4', fee: '0.05%', dex: 'Enosys' },
  { name: 'USD₮0/cUSDX', addr: '0x99ed6dfd982d4b3ddd726625a585a3b019523bbb', fee: '0.01%', dex: 'Enosys' },
  // XRP pairs
  { name: 'stXRP/FXRP', addr: '0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770', fee: '0.05%', dex: 'Enosys' },
  { name: 'stXRP/WFLR', addr: '0x8ee8414ee2b9d4bf6c8de40d95167c2643c2c544', fee: '0.05%', dex: 'SparkDex' },
  // Liquid staking
  { name: 'sFLR/WFLR', addr: '0x25b4f3930934f0a3cbb885c624ecee75a2917144', fee: '0.05%', dex: 'SparkDex' },
  { name: 'sFLR/WFLR', addr: '0xc9baba3f36ccaa54675deecc327ec7eaa48cb97d', fee: '0.01%', dex: 'SparkDex' },
  { name: 'flrETH/WETH', addr: '0xa8697b82a5e9f108296c6299859e82472340aea7', fee: '0.05%', dex: 'Enosys' }
];

// Token info
const TOKENS = {
  '0x1d80c49bbbcd1c0911346656b529df9e5c2f783d': { symbol: 'WFLR', decimals: 18 },
  '0x12e605bc104e93b45e1ad99f9e555f659051c2bb': { symbol: 'sFLR', decimals: 18 },
  '0xad552a648c74d49e10027ab8a618a3ad4901c5be': { symbol: 'FXRP', decimals: 6 },
  '0x96b41289d90444b8add57e6f265db5ae8651df29': { symbol: 'stXRP', decimals: 6 },
  '0x4c18ff3c89632c3dd62e796c0afa5c07c4c1b2b3': { symbol: 'XRP', decimals: 6 },
  '0xe7cd86e13ac4309349f30b3435a9d337750fc82d': { symbol: 'USDT0', decimals: 6 },
  '0xfbda5f676cb37624f28265a144a48b0d6e87d3b6': { symbol: 'USDC.e', decimals: 6 },
  '0x6cd3a5ba46fa254d4d2e3c2b37350ae337e94a0f': { symbol: 'CDP', decimals: 18 },
};

// RPC helper
async function rpcCall(to, data) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      jsonrpc: '2.0', method: 'eth_call',
      params: [{ to, data }, 'latest'], id: 1
    });
    const req = https.request({
      hostname: 'flare-api.flare.network', port: 443,
      path: '/ext/C/rpc', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch { resolve({ error: 'parse error' }); }
      });
    });
    req.on('error', () => resolve({ error: 'network error' }));
    req.write(body);
    req.end();
  });
}

// HTTP GET helper
async function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('JSON parse error')); }
      });
    }).on('error', reject);
  });
}

// GeckoTerminal OHLCV fetch
async function fetchOHLCV(poolAddr, days = 30) {
  try {
    const url = `${GECKOTERMINAL_BASE}/pools/${poolAddr}/ohlcv/day?aggregate=1&limit=${days}`;
    const data = await fetchJSON(url);
    return data.data?.attributes?.ohlcv_list || [];
  } catch {
    return [];
  }
}

// Analyze historical volatility
function analyzeVolatility(ohlcv) {
  if (!ohlcv || ohlcv.length < 7) return null;
  
  const ranges = ohlcv.map(d => {
    const [ts, o, h, l, c, v] = d;
    return {
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      range: (h - l) / l * 100,
      high: h,
      low: l,
      close: c,
      volume: v
    };
  });
  
  // Sort by date descending (most recent first)
  ranges.sort((a, b) => b.date.localeCompare(a.date));
  
  const avgRange = ranges.reduce((a, r) => a + r.range, 0) / ranges.length;
  const maxRange = Math.max(...ranges.map(r => r.range));
  
  // Calculate ranges for different periods
  const last7 = ranges.slice(0, 7);
  const last14 = ranges.slice(0, 14);
  const last30 = ranges;
  
  const calcPeriodStats = (data) => {
    if (data.length === 0) return null;
    const highs = data.map(r => r.high);
    const lows = data.map(r => r.low);
    const high = Math.max(...highs);
    const low = Math.min(...lows);
    const avgDaily = data.reduce((a, r) => a + r.range, 0) / data.length;
    return {
      high,
      low,
      range: (high - low) / low * 100,
      avgDaily
    };
  };
  
  return {
    days: ranges.length,
    currentPrice: ranges[0]?.close,
    avgDailyRange: avgRange,
    maxDailyRange: maxRange,
    week: calcPeriodStats(last7),
    twoWeek: calcPeriodStats(last14),
    month: calcPeriodStats(last30),
    recentDays: ranges.slice(0, 7)
  };
}

// Calculate suggested ranges
function suggestRanges(stats) {
  if (!stats) return null;
  
  // Ticks per 1% price move (V3 uses 1.0001 per tick)
  const ticksPerPercent = Math.abs(Math.log(1.01) / Math.log(1.0001)); // ~99.5
  
  return {
    tight: {
      name: '🔥 Tight (Max Fees)',
      desc: 'Daily rebalancing needed',
      rangePct: stats.avgDailyRange * 1.5,
      ticks: Math.round(stats.avgDailyRange * 1.5 * ticksPerPercent),
      timeInRange: '40-60%',
      rebalance: 'Daily'
    },
    moderate: {
      name: '⚖️ Moderate (Balanced)',
      desc: 'Weekly monitoring',
      rangePct: stats.week?.range * 1.2 || stats.avgDailyRange * 5,
      ticks: Math.round((stats.week?.range * 1.2 || stats.avgDailyRange * 5) * ticksPerPercent),
      timeInRange: '70-80%',
      rebalance: 'Weekly'
    },
    wide: {
      name: '🛡️ Wide (Safe)',
      desc: 'Monthly check-ins',
      rangePct: stats.twoWeek?.range * 1.3 || stats.avgDailyRange * 10,
      ticks: Math.round((stats.twoWeek?.range * 1.3 || stats.avgDailyRange * 10) * ticksPerPercent),
      timeInRange: '85-95%',
      rebalance: 'Bi-weekly'
    },
    conservative: {
      name: '🏦 Conservative (Set & Forget)',
      desc: 'Minimal management',
      rangePct: stats.month?.range * 1.5 || stats.avgDailyRange * 20,
      ticks: Math.round((stats.month?.range * 1.5 || stats.avgDailyRange * 20) * ticksPerPercent),
      timeInRange: '95%+',
      rebalance: 'Monthly'
    }
  };
}

// Parse signed int from hex
function parseSignedInt(hex) {
  const val = BigInt('0x' + hex);
  if (val >= BigInt('0x8000000000000000000000000000000000000000000000000000000000000000')) {
    return Number(val - BigInt('0x10000000000000000000000000000000000000000000000000000000000000000'));
  }
  return Number(val);
}

// Get current tick from pool
async function getPoolTick(pool) {
  const r = await rpcCall(pool, '0x3850c7bd');
  if (r.error || !r.result) return null;
  const data = r.result.slice(2);
  return parseSignedInt(data.slice(64, 128));
}

// Get V3 position data
async function getPosition(posId, dex) {
  const manager = POSITION_MANAGERS[dex] || POSITION_MANAGERS.enosys;
  const data = '0x99fbab88' + posId.toString(16).padStart(64, '0');
  const r = await rpcCall(manager, data);
  if (r.error || !r.result || r.result === '0x') return null;
  
  const hex = r.result.slice(2);
  const fields = [];
  for (let i = 0; i < hex.length; i += 64) {
    fields.push(hex.slice(i, i + 64));
  }
  
  return {
    token0: '0x' + fields[2].slice(24),
    token1: '0x' + fields[3].slice(24),
    fee: parseInt(fields[4], 16),
    tickLower: parseSignedInt(fields[5]),
    tickUpper: parseSignedInt(fields[6]),
    liquidity: BigInt('0x' + fields[7])
  };
}

// Tick <-> Price conversions
function tickToPrice(tick) {
  return Math.pow(1.0001, tick);
}

// Convert tick to human-readable price (adjusted for decimals)
// Returns: how many token1 for 1 token0 (in human units)
function tickToHumanPrice(tick, decimals0, decimals1) {
  const rawPrice = Math.pow(1.0001, tick);
  // Adjust for decimal difference: humanPrice = rawPrice * 10^(decimals0 - decimals1)
  return rawPrice * Math.pow(10, decimals0 - decimals1);
}

// Format price for display (auto-scale decimals)
function formatPrice(price) {
  if (price >= 1000) return price.toFixed(0);
  if (price >= 100) return price.toFixed(1);
  if (price >= 10) return price.toFixed(2);
  if (price >= 1) return price.toFixed(3);
  if (price >= 0.01) return price.toFixed(4);
  if (price >= 0.0001) return price.toFixed(6);
  return price.toExponential(2);
}

// Calculate position amounts
function calculateAmounts(liquidity, tickLower, tickUpper, currentTick, decimals0, decimals1) {
  const sqrtLower = Math.sqrt(Math.pow(1.0001, tickLower));
  const sqrtUpper = Math.sqrt(Math.pow(1.0001, tickUpper));
  const sqrtCurrent = Math.sqrt(Math.pow(1.0001, currentTick));
  
  const L = Number(liquidity);
  let amount0 = 0, amount1 = 0;
  
  if (currentTick < tickLower) {
    amount0 = L * (sqrtUpper - sqrtLower) / (sqrtLower * sqrtUpper);
  } else if (currentTick > tickUpper) {
    amount1 = L * (sqrtUpper - sqrtLower);
  } else {
    amount0 = L * (sqrtUpper - sqrtCurrent) / (sqrtCurrent * sqrtUpper);
    amount1 = L * (sqrtCurrent - sqrtLower);
  }
  
  return {
    amount0: amount0 / Math.pow(10, decimals0),
    amount1: amount1 / Math.pow(10, decimals1)
  };
}

// Check all positions
async function checkPositions() {
  const results = [];
  
  for (const pos of POSITIONS) {
    const [position, currentTick, ohlcv] = await Promise.all([
      getPosition(pos.id, pos.dex),
      getPoolTick(pos.pool),
      fetchOHLCV(pos.pool, 30)
    ]);
    
    if (!position || currentTick === null) {
      results.push({ ...pos, error: 'Failed to fetch data' });
      continue;
    }
    
    const t0Info = TOKENS[position.token0.toLowerCase()] || { symbol: position.token0.slice(0, 8), decimals: 18 };
    const t1Info = TOKENS[position.token1.toLowerCase()] || { symbol: position.token1.slice(0, 8), decimals: 18 };
    
    const inRange = currentTick >= position.tickLower && currentTick <= position.tickUpper;
    const rangeWidth = position.tickUpper - position.tickLower;
    const distFromLower = currentTick - position.tickLower;
    const positionInRange = (distFromLower / rangeWidth * 100);
    
    const amounts = calculateAmounts(
      position.liquidity,
      position.tickLower,
      position.tickUpper,
      currentTick,
      t0Info.decimals,
      t1Info.decimals
    );
    
    let health = 'HEALTHY';
    let healthEmoji = '🟢';
    
    if (!inRange) {
      health = 'OUT OF RANGE';
      healthEmoji = '🔴';
    } else if (positionInRange < 10 || positionInRange > 90) {
      health = 'NEAR EDGE';
      healthEmoji = '🟡';
    }
    
    // Analyze volatility for this position's pool
    const volatility = analyzeVolatility(ohlcv);
    const suggestedRanges = suggestRanges(volatility);
    
    // Calculate human-readable prices
    const currentPrice = tickToHumanPrice(currentTick, t0Info.decimals, t1Info.decimals);
    const lowerPrice = tickToHumanPrice(position.tickLower, t0Info.decimals, t1Info.decimals);
    const upperPrice = tickToHumanPrice(position.tickUpper, t0Info.decimals, t1Info.decimals);
    
    results.push({
      id: pos.id,
      name: pos.name,
      dex: pos.dex,
      pair: `${t0Info.symbol}/${t1Info.symbol}`,
      token0: t0Info,
      token1: t1Info,
      fee: position.fee / 10000,
      currentTick,
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
      currentPrice,
      lowerPrice,
      upperPrice,
      inRange,
      positionInRange: positionInRange.toFixed(1),
      amount0: amounts.amount0,
      amount1: amounts.amount1,
      health,
      healthEmoji,
      defillamaMatch: pos.defillamaMatch,
      apyDex: pos.apyDex,
      volatility,
      suggestedRanges
    });
  }
  
  return results;
}

// Fetch DefiLlama APY data
async function getFlarePoolAPYs() {
  try {
    const data = await fetchJSON(DEFILLAMA_URL);
    return data.data.filter(p => p.chain === 'Flare');
  } catch {
    return [];
  }
}

// Fetch DEXScreener data
async function getDEXScreenerData() {
  try {
    const data = await fetchJSON(DEXSCREENER_URL);
    return data.pairs || [];
  } catch {
    return [];
  }
}

// Find matching APY
function findAPY(pools, matchString, dex = null) {
  if (!matchString) return null;
  
  const normalized = matchString.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  let filtered = pools;
  if (dex) {
    const dexMap = {
      'enosys': ['enosys', 'blazeswap'],
      'sparkdex': ['sparkdex']
    };
    const dexPatterns = dexMap[dex] || [dex];
    filtered = pools.filter(p => 
      dexPatterns.some(pattern => p.project.toLowerCase().includes(pattern))
    );
  }
  
  return filtered.find(p => {
    const pNorm = p.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return pNorm === normalized || pNorm.includes(normalized) || normalized.includes(pNorm);
  });
}

// Merge pool data
function mergePoolData(apyPools, dexscreenerPairs) {
  return apyPools.map(pool => {
    const symbolParts = pool.symbol.toUpperCase().split('-');
    const dexMatch = dexscreenerPairs.find(p => {
      const base = p.baseToken?.symbol?.toUpperCase();
      const quote = p.quoteToken?.symbol?.toUpperCase();
      const dexName = p.dexId?.toLowerCase();
      const projectMatch = pool.project.toLowerCase().includes(dexName);
      return projectMatch && symbolParts.includes(base) && symbolParts.includes(quote);
    });
    
    return {
      ...pool,
      volume24h: dexMatch?.volume?.h24 || null,
      priceChange24h: dexMatch?.priceChange?.h24 || null
    };
  });
}

// Get top opportunities
function getTopOpportunities(pools, dexPairs, minTVL = 50000, limit = 15) {
  const merged = mergePoolData(pools, dexPairs);
  
  return merged
    .filter(p => (p.tvlUsd || 0) >= minTVL)
    .filter(p => p.project.includes('v3') || p.project.includes('sparkdex') || p.project.includes('enosys'))
    .sort((a, b) => (b.apy || 0) - (a.apy || 0))
    .slice(0, limit);
}

// Format numbers
function fmtNum(n, decimals = 0) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(decimals);
}

// Fetch volatility data for analysis pools
async function getPoolVolatilityData() {
  const results = [];
  
  for (const pool of ANALYSIS_POOLS) {
    const ohlcv = await fetchOHLCV(pool.addr, 30);
    const stats = analyzeVolatility(ohlcv);
    const ranges = suggestRanges(stats);
    
    results.push({
      ...pool,
      volatility: stats,
      ranges
    });
  }
  
  return results;
}

// Format report
function formatReport(positions, apyData, dexData, volatilityData, showOpportunities) {
  const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const lines = [];
  
  lines.push(`📊 **LP POSITION REPORT**`);
  lines.push(`📅 ${timestamp}`);
  lines.push('');
  
  // Position status
  let allHealthy = true;
  for (const p of positions) {
    if (p.error) {
      lines.push(`❌ ${p.name}: ${p.error}`);
      allHealthy = false;
      continue;
    }
    
    lines.push(`${p.healthEmoji} **${p.name}** (#${p.id})`);
    lines.push(`   ${p.pair} | ${p.fee}% fee | ${p.dex.toUpperCase()}`);
    lines.push(`   Price: ${formatPrice(p.currentPrice)} [${formatPrice(p.lowerPrice)} ↔ ${formatPrice(p.upperPrice)}] ${p.token1.symbol}/${p.token0.symbol}`);
    lines.push(`   Position: ${p.positionInRange}% | ${p.health}`);
    lines.push(`   Holdings: ${p.amount0.toFixed(2)} ${p.token0.symbol} + ${p.amount1.toFixed(2)} ${p.token1.symbol}`);
    
    const apyMatch = findAPY(apyData, p.defillamaMatch, p.apyDex || p.dex);
    if (apyMatch) {
      const source = p.apyDex && p.apyDex !== p.dex ? `${apyMatch.project}*` : apyMatch.project;
      lines.push(`   APY: ${apyMatch.apy?.toFixed(2)}% (base: ${apyMatch.apyBase?.toFixed(2)}%) [${source}]`);
    }
    
    // Show volatility for position
    if (p.volatility) {
      lines.push(`   📈 30d Range: ${p.volatility.month?.range?.toFixed(1)}% | Avg Daily: ${p.volatility.avgDailyRange?.toFixed(2)}%`);
    }
    
    if (!p.inRange) allHealthy = false;
    lines.push('');
  }
  
  if (allHealthy) {
    lines.push('✅ All positions healthy');
  } else {
    lines.push('⚠️ **ACTION NEEDED** - Check positions above');
  }
  
  if (showOpportunities) {
    // Top opportunities
    const opportunities = getTopOpportunities(apyData, dexData);
    
    lines.push('');
    lines.push('📈 **TOP LP OPPORTUNITIES**');
    lines.push('```');
    lines.push('Pool              | DEX      | APY    | 24h Vol   | TVL');
    lines.push('------------------|----------|--------|-----------|--------');
    
    opportunities.forEach(p => {
      const pair = p.symbol.padEnd(17).slice(0, 17);
      const dex = p.project.replace('-v3.1', '').replace('sparkdex', 'SparkDex').replace('enosys', 'Enosys').padEnd(8).slice(0, 8);
      const apy = (p.apy?.toFixed(1) + '%').padStart(6);
      const vol = p.volume24h ? ('$' + fmtNum(p.volume24h)).padStart(9) : '     N/A '.padStart(9);
      const tvl = ('$' + fmtNum(p.tvlUsd)).padStart(8);
      lines.push(`${pair} | ${dex} | ${apy} | ${vol} | ${tvl}`);
    });
    lines.push('```');
    
    // DEX volume comparison
    lines.push('');
    lines.push('💹 **DEX VOLUME (24h)**');
    const knownDexes = ['sparkdex', 'enosys', 'blazeswap'];
    const byDex = {};
    dexData.forEach(p => {
      const dex = p.dexId?.toLowerCase() || 'unknown';
      if (!knownDexes.includes(dex)) return;
      if (!byDex[dex]) byDex[dex] = { volume: 0, tvl: 0 };
      byDex[dex].volume += parseFloat(p.volume?.h24 || 0);
      byDex[dex].tvl += parseFloat(p.liquidity?.usd || 0);
    });
    
    Object.entries(byDex).sort((a, b) => b[1].volume - a[1].volume).forEach(([dex, data]) => {
      const name = dex.charAt(0).toUpperCase() + dex.slice(1);
      lines.push(`• ${name}: $${fmtNum(data.volume)} vol | $${fmtNum(data.tvl)} TVL`);
    });
    
    // Volatility and range suggestions
    if (volatilityData && volatilityData.length > 0) {
      lines.push('');
      lines.push('📐 **HISTORICAL VOLATILITY & SUGGESTED RANGES**');
      lines.push('```');
      lines.push('Pool         | DEX      | Fee   | 7d     | 30d    | Daily');
      lines.push('-------------|----------|-------|--------|--------|------');
      
      volatilityData.filter(p => p.volatility).forEach(p => {
        const name = p.name.padEnd(12).slice(0, 12);
        const dex = (p.dex || '?').padEnd(8).slice(0, 8);
        const fee = (p.fee || '?').padEnd(5).slice(0, 5);
        const w = (p.volatility.week?.range?.toFixed(1) + '%').padStart(6) || '  N/A ';
        const m = (p.volatility.month?.range?.toFixed(1) + '%').padStart(6) || '  N/A ';
        const d = (p.volatility.avgDailyRange?.toFixed(1) + '%').padStart(5) || ' N/A ';
        lines.push(`${name} | ${dex} | ${fee} | ${w} | ${m} | ${d}`);
      });
      lines.push('```');
      
      // Tick range suggestions for ALL pools
      lines.push('');
      lines.push('🎯 **SUGGESTED TICK RANGES FOR DAO DEPLOYMENT**');
      lines.push('```');
      lines.push('Pool         | DEX      | Fee   | Tight    | Moderate | Wide     | Conserv.');
      lines.push('             |          |       | (Daily)  | (Weekly) | (2-week) | (Monthly)');
      lines.push('-------------|----------|-------|----------|----------|----------|----------');
      
      const poolsWithData = volatilityData.filter(p => p.ranges);
      poolsWithData.forEach(p => {
        const name = p.name.padEnd(12).slice(0, 12);
        const dex = (p.dex || '?').padEnd(8).slice(0, 8);
        const fee = (p.fee || '?').padEnd(5).slice(0, 5);
        const tight = (p.ranges.tight.ticks + ' ticks').padStart(8);
        const mod = (p.ranges.moderate.ticks + ' ticks').padStart(8);
        const wide = (p.ranges.wide.ticks + ' ticks').padStart(8);
        const cons = (p.ranges.conservative.ticks + ' ticks').padStart(8);
        lines.push(`${name} | ${dex} | ${fee} | ${tight} | ${mod} | ${wide} | ${cons}`);
      });
      lines.push('```');
      
      // Percentage view
      lines.push('');
      lines.push('📊 **RANGE AS PERCENTAGE (±from current price)**');
      lines.push('```');
      lines.push('Pool         | DEX      | Tight ±  | Moderate ± | Wide ±   | Conserv. ±');
      lines.push('-------------|----------|----------|------------|----------|----------');
      
      poolsWithData.forEach(p => {
        const name = p.name.padEnd(12).slice(0, 12);
        const dex = (p.dex || '?').padEnd(8).slice(0, 8);
        const tight = ((p.ranges.tight.rangePct/2).toFixed(1) + '%').padStart(8);
        const mod = ((p.ranges.moderate.rangePct/2).toFixed(1) + '%').padStart(10);
        const wide = ((p.ranges.wide.rangePct/2).toFixed(1) + '%').padStart(8);
        const cons = ((p.ranges.conservative.rangePct/2).toFixed(1) + '%').padStart(9);
        lines.push(`${name} | ${dex} | ${tight} | ${mod} | ${wide} | ${cons}`);
      });
      lines.push('```');
      
      lines.push('');
      lines.push('💡 **Strategy Guide:**');
      lines.push('• **Tight** = Max fees, daily rebalancing, 40-60% time in range');
      lines.push('• **Moderate** = Balanced, weekly check, 70-80% in range');
      lines.push('• **Wide** = Lower maintenance, bi-weekly, 85-95% in range');
      lines.push('• **Conservative** = Set & forget, monthly, 95%+ in range');
    }
  }
  
  return { text: lines.join('\n'), allHealthy };
}

// Main
async function main(options = {}) {
  const { showOpportunities = false, verbose = false } = options;
  
  const [positions, apyData, dexData, volatilityData] = await Promise.all([
    checkPositions(),
    getFlarePoolAPYs(),
    getDEXScreenerData(),
    showOpportunities ? getPoolVolatilityData() : Promise.resolve([])
  ]);
  
  const report = formatReport(positions, apyData, dexData, volatilityData, showOpportunities);
  
  console.log(report.text);
  
  if (verbose) {
    console.log('\n--- DEBUG ---');
    console.log(`Positions: ${positions.length}`);
    console.log(`DefiLlama pools: ${apyData.length}`);
    console.log(`DEXScreener pairs: ${dexData.length}`);
    console.log(`Volatility pools: ${volatilityData.length}`);
  }
  
  return {
    positions,
    apyData,
    dexData,
    volatilityData,
    report: report.text,
    allHealthy: report.allHealthy
  };
}

module.exports = { main, checkPositions, getFlarePoolAPYs, getDEXScreenerData, getPoolVolatilityData };

if (require.main === module) {
  const args = process.argv.slice(2);
  const showOpps = args.includes('--opportunities') || args.includes('-o');
  const verbose = args.includes('--verbose') || args.includes('-v');
  
  main({ showOpportunities: showOpps, verbose }).catch(console.error);
}
