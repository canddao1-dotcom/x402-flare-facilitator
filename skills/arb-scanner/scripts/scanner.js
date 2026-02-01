#!/usr/bin/env node
/**
 * Lightweight Triangle Arbitrage Scanner
 * 
 * Pure RPC - no AI tokens. Runs as daemon or cron.
 * Monitors pool prices across DEXs, alerts on profitable triangles.
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const RPC_URL = 'https://flare-api.flare.network/ext/C/rpc';
const DATA_DIR = path.join(__dirname, '..', 'data');
const ALERT_FILE = path.join(DATA_DIR, 'opportunities.json');
const PENDING_ALERT_FILE = path.join(DATA_DIR, 'pending-alert.json');
const MIN_PROFIT_PCT = 0.5;  // Minimum profit % to log
const ALERT_THRESHOLD = 1.0; // Minimum profit % to trigger brain alert
const POLL_INTERVAL = 15000; // 15 seconds
const GAS_COST_FLR = 0.3;    // Estimated gas cost in FLR for 3 swaps
const ALERT_COOLDOWN = 300000; // 5 minutes between alerts
const MIN_LIQUIDITY_USD = 100; // Minimum $100 liquidity in pool to consider
const WFLR_PRICE_USD = 0.018;  // Approximate WFLR price for liquidity calc

// Tokens with verified addresses
const TOKENS = {
  // Core
  WFLR:  { addr: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d', decimals: 18 },
  sFLR:  { addr: '0x12e605bc104e93B45e1aD99F9e555f659051c2BB', decimals: 18 },
  rFLR:  { addr: '0x26d460c3Cf931Fb2014FA436a49e3Af08619810e', decimals: 18 },
  
  // XRP variants
  FXRP:  { addr: '0xAd552A648C74D49E10027AB8a618A3ad4901c5bE', decimals: 6 },
  stXRP: { addr: '0x4C18Ff3C89632c3Dd62E796c0aFA5c07c4c1B2b3', decimals: 6 },
  
  // Stablecoins
  USDT0: { addr: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', decimals: 6 },
  USDCe: { addr: '0xfbda5f676cb37624f28265a144a48b0d6e87d3b6', decimals: 6 },
  CDP:   { addr: '0x6Cd3a5Ba46FA254D4d2E3C2B37350ae337E94a0F', decimals: 18 },
  
  // Protocol tokens
  BANK:  { addr: '0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059', decimals: 18 },
  APS:   { addr: '0xff56eb5b1a7faa972291117e5e9565da29bc808d', decimals: 18 },
  
  // Wrapped assets
  WETH:  { addr: '0x1502FA4be69d526124D453619276FacCab275d3D', decimals: 18 },
  WBTC:  { addr: '0x5D9ab5522c64E1F6ef5e3627ECCc093f56167818', decimals: 8 },
};

// DEX Factories (V3)
const V3_DEXES = {
  enosys: {
    name: 'Enosys',
    factory: '0x17aa157ac8c54034381b840cb8f6bf7fc355f0de',
  },
  sparkdex: {
    name: 'SparkDex',
    factory: '0x8A1E01273E7E7b9B12eb7fE3f9E86e894269AD97',
  },
};

// V2 DEXs disabled - V3 only for reliability
// const V2_DEXES = {};

const FEE_TIERS = [500, 3000, 10000]; // 0.05%, 0.3%, 1%

// Pairs to monitor (will check all fee tiers on all DEXs)
const PAIRS = [
  // WFLR pairs (most liquid)
  ['WFLR', 'FXRP'],
  ['WFLR', 'sFLR'],
  ['WFLR', 'USDT0'],
  ['WFLR', 'USDCe'],
  ['WFLR', 'stXRP'],
  ['WFLR', 'CDP'],
  ['WFLR', 'WETH'],
  ['WFLR', 'WBTC'],
  ['WFLR', 'rFLR'],
  ['WFLR', 'APS'],
  
  // FXRP pairs
  ['FXRP', 'USDT0'],
  ['FXRP', 'USDCe'],
  ['FXRP', 'sFLR'],
  ['FXRP', 'stXRP'],
  ['FXRP', 'CDP'],
  
  // sFLR pairs
  ['sFLR', 'USDT0'],
  ['sFLR', 'USDCe'],
  ['sFLR', 'stXRP'],
  ['sFLR', 'rFLR'],
  
  // Stablecoin pairs
  ['USDT0', 'USDCe'],
  ['USDT0', 'CDP'],
  ['USDCe', 'CDP'],
  
  // Cross pairs
  ['stXRP', 'USDT0'],
  ['stXRP', 'USDCe'],
  ['WETH', 'USDT0'],
  ['WETH', 'WBTC'],
  ['WBTC', 'USDT0'],
];

// ABIs
const V3_FACTORY_ABI = ['function getPool(address, address, uint24) view returns (address)'];
const V2_FACTORY_ABI = ['function getPair(address, address) view returns (address)'];
const V3_POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)',
  'function token0() view returns (address)',
  'function liquidity() view returns (uint128)',
];
const V2_POOL_ABI = [
  'function getReserves() view returns (uint112, uint112, uint32)',
  'function token0() view returns (address)',
];

// ═══════════════════════════════════════════════════════════════════════════
// PRICE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function sqrtPriceX96ToPrice(sqrtPriceX96, decimals0, decimals1) {
  // price = (sqrtPriceX96 / 2^96)^2 * 10^(decimals0-decimals1)
  const sqrtPrice = Number(sqrtPriceX96) / (2 ** 96);
  const price = sqrtPrice * sqrtPrice;
  return price * Math.pow(10, decimals0 - decimals1);
}

function getTokenByAddr(addr) {
  const lowerAddr = addr.toLowerCase();
  for (const [symbol, token] of Object.entries(TOKENS)) {
    if (token.addr.toLowerCase() === lowerAddr) return { symbol, ...token };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// POOL DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════

async function discoverPools(provider) {
  const pools = [];
  
  // V3 pools (with fee tiers)
  for (const [dexKey, dex] of Object.entries(V3_DEXES)) {
    const factory = new ethers.Contract(dex.factory, V3_FACTORY_ABI, provider);
    
    for (const [tokenA, tokenB] of PAIRS) {
      if (!TOKENS[tokenA] || !TOKENS[tokenB]) continue;
      const addrA = TOKENS[tokenA].addr;
      const addrB = TOKENS[tokenB].addr;
      
      for (const fee of FEE_TIERS) {
        try {
          const poolAddr = await factory.getPool(addrA, addrB, fee);
          if (poolAddr && poolAddr !== ethers.ZeroAddress) {
            pools.push({
              type: 'v3',
              dex: dexKey,
              dexName: dex.name,
              addr: poolAddr,
              tokenA,
              tokenB,
              fee,
            });
          }
        } catch (e) {}
      }
    }
  }
  
  // V2 pools disabled - using V3 only for reliability
  
  return pools;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRICE FETCHER
// ═══════════════════════════════════════════════════════════════════════════

async function fetchV3Price(provider, pool) {
  const contract = new ethers.Contract(pool.addr, V3_POOL_ABI, provider);
  const [slot0, token0Addr, liquidity] = await Promise.all([
    contract.slot0(),
    contract.token0(),
    contract.liquidity(),
  ]);
  
  if (liquidity === 0n) return null;
  
  const sqrtPriceX96 = slot0[0];
  const token0 = getTokenByAddr(token0Addr);
  if (!token0) return null;
  
  const isToken0First = token0.symbol === pool.tokenA;
  const t0 = isToken0First ? TOKENS[pool.tokenA] : TOKENS[pool.tokenB];
  const t1 = isToken0First ? TOKENS[pool.tokenB] : TOKENS[pool.tokenA];
  const sym0 = isToken0First ? pool.tokenA : pool.tokenB;
  const sym1 = isToken0First ? pool.tokenB : pool.tokenA;
  
  const price = sqrtPriceX96ToPrice(sqrtPriceX96, t0.decimals, t1.decimals);
  
  return {
    dex: pool.dex,
    dexName: pool.dexName,
    token0: sym0,
    token1: sym1,
    fee: pool.fee,
    price: price,
    pool: pool.addr,
    type: 'v3',
  };
}

async function fetchV2Price(provider, pool) {
  const contract = new ethers.Contract(pool.addr, V2_POOL_ABI, provider);
  const [reserves, token0Addr] = await Promise.all([
    contract.getReserves(),
    contract.token0(),
  ]);
  
  const [reserve0, reserve1] = reserves;
  if (reserve0 === 0n || reserve1 === 0n) return null;
  
  const token0 = getTokenByAddr(token0Addr);
  if (!token0) return null;
  
  const isToken0First = token0.symbol === pool.tokenA;
  const t0 = isToken0First ? TOKENS[pool.tokenA] : TOKENS[pool.tokenB];
  const t1 = isToken0First ? TOKENS[pool.tokenB] : TOKENS[pool.tokenA];
  const sym0 = isToken0First ? pool.tokenA : pool.tokenB;
  const sym1 = isToken0First ? pool.tokenB : pool.tokenA;
  
  const r0 = Number(reserve0) / (10 ** t0.decimals);
  const r1 = Number(reserve1) / (10 ** t1.decimals);
  
  // Estimate liquidity in USD (use WFLR as proxy for all non-stables)
  let liquidityUSD = 0;
  if (sym0 === 'WFLR') liquidityUSD = r0 * WFLR_PRICE_USD * 2;
  else if (sym1 === 'WFLR') liquidityUSD = r1 * WFLR_PRICE_USD * 2;
  else if (sym0 === 'USDT0' || sym0 === 'USDCe') liquidityUSD = r0 * 2;
  else if (sym1 === 'USDT0' || sym1 === 'USDCe') liquidityUSD = r1 * 2;
  else liquidityUSD = r0 * WFLR_PRICE_USD * 2; // Rough estimate
  
  // Skip extremely low liquidity pools
  if (liquidityUSD < MIN_LIQUIDITY_USD) return null;
  
  const price = r1 / r0; // token1 per token0
  
  return {
    dex: pool.dex,
    dexName: pool.dexName,
    token0: sym0,
    token1: sym1,
    fee: pool.fee,
    price: price,
    pool: pool.addr,
    type: 'v2',
    reserve0: r0,
    reserve1: r1,
    liquidityUSD,
  };
}

async function fetchPrices(provider, pools) {
  const prices = {};
  
  await Promise.all(pools.map(async (pool) => {
    try {
      let data;
      // V3 only
      if (pool.type === 'v3') {
        data = await fetchV3Price(provider, pool);
      } else if (false) { // V2 disabled
        data = await fetchV2Price(provider, pool);
      }
      
      if (data) {
        const key = `${pool.dex}:${data.token0}-${data.token1}:${pool.fee}`;
        prices[key] = data;
      }
    } catch (e) {
      // Pool read failed
    }
  }));
  
  return prices;
}

// ═══════════════════════════════════════════════════════════════════════════
// TRIANGLE CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════

function findBestRoute(prices, fromToken, toToken) {
  let best = null;
  let bestRate = 0;
  
  for (const [key, data] of Object.entries(prices)) {
    let rate = 0;
    let direction = null;
    
    if (data.token0 === fromToken && data.token1 === toToken) {
      rate = data.price;
      direction = 'sell0';
    } else if (data.token1 === fromToken && data.token0 === toToken) {
      rate = 1 / data.price;
      direction = 'sell1';
    } else {
      continue;
    }
    
    // Apply fee
    const feeMultiplier = 1 - (data.fee / 1000000);
    rate = rate * feeMultiplier;
    
    if (rate > bestRate) {
      bestRate = rate;
      best = { ...data, rate, direction, key };
    }
  }
  
  return best;
}

function calcTriangle(prices, path, startAmount = 100) {
  let amount = startAmount;
  const route = [];
  
  for (let i = 0; i < path.length - 1; i++) {
    const fromToken = path[i];
    const toToken = path[i + 1];
    
    const step = findBestRoute(prices, fromToken, toToken);
    if (!step) return null;
    
    const amountOut = amount * step.rate;
    route.push({
      from: fromToken,
      to: toToken,
      dex: step.dexName,
      pool: step.pool,
      fee: step.fee,
      amountIn: amount,
      amountOut: amountOut,
      rate: step.rate,
    });
    
    amount = amountOut;
  }
  
  const profit = amount - startAmount;
  const profitPct = (profit / startAmount) * 100;
  
  return { path, route, startAmount, endAmount: amount, profit, profitPct };
}

function generateTriangles(baseToken = 'WFLR') {
  const others = Object.keys(TOKENS).filter(t => t !== baseToken);
  const triangles = [];
  
  for (let i = 0; i < others.length; i++) {
    for (let j = 0; j < others.length; j++) {
      if (i !== j) {
        triangles.push([baseToken, others[i], others[j], baseToken]);
      }
    }
  }
  
  return triangles;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCANNER
// ═══════════════════════════════════════════════════════════════════════════

let cachedPools = null;

async function scan(provider, verbose = false) {
  // Discover pools once (or refresh periodically)
  if (!cachedPools) {
    if (verbose) console.log('Discovering pools...');
    cachedPools = await discoverPools(provider);
    if (verbose) console.log(`Found ${cachedPools.length} pools`);
  }
  
  const prices = await fetchPrices(provider, cachedPools);
  const triangles = generateTriangles('WFLR');
  const opportunities = [];
  
  for (const path of triangles) {
    const result = calcTriangle(prices, path, 100);
    if (!result) continue;
    
    // Account for gas
    const netProfitPct = result.profitPct - (GAS_COST_FLR / 100 * 100);
    
    if (verbose && result.profitPct > -1) {
      const arrow = result.profitPct > 0 ? '📈' : '📉';
      console.log(`${arrow} ${path.join('→')}: ${result.profitPct.toFixed(3)}%`);
    }
    
    if (netProfitPct >= MIN_PROFIT_PCT) {
      opportunities.push({
        ...result,
        netProfitPct,
        timestamp: Date.now(),
      });
    }
  }
  
  opportunities.sort((a, b) => b.netProfitPct - a.netProfitPct);
  return opportunities;
}

// ═══════════════════════════════════════════════════════════════════════════
// DAEMON
// ═══════════════════════════════════════════════════════════════════════════

async function runDaemon() {
  console.log('🔍 Arb Scanner Started');
  console.log(`   Min profit: ${MIN_PROFIT_PCT}%`);
  console.log(`   Alert threshold: ${ALERT_THRESHOLD}%`);
  console.log(`   Poll interval: ${POLL_INTERVAL/1000}s`);
  console.log('');
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  let lastAlert = 0;
  let lastBrainAlert = 0;
  
  async function poll() {
    try {
      const opportunities = await scan(provider, false);
      const now = Date.now();
      
      if (opportunities.length > 0) {
        const best = opportunities[0];
        
        // Log to console (rate limited)
        if (now - lastAlert > 60000) {
          console.log(`\n🚨 [${new Date().toISOString()}] ${best.path.join('→')} +${best.netProfitPct.toFixed(2)}%`);
          for (const step of best.route) {
            console.log(`   ${step.from}→${step.to} via ${step.dex} (${step.fee/10000}%)`);
          }
          lastAlert = now;
        }
        
        // Save all opportunities to file
        fs.writeFileSync(ALERT_FILE, JSON.stringify({
          timestamp: now,
          opportunities: opportunities.slice(0, 5),
        }, null, 2));
        
        // Trigger brain alert if above threshold and cooldown passed
        if (best.netProfitPct >= ALERT_THRESHOLD && (now - lastBrainAlert > ALERT_COOLDOWN)) {
          const alert = {
            timestamp: now,
            type: 'arb_opportunity',
            profit: best.netProfitPct,
            path: best.path,
            route: best.route,
            read: false,
          };
          fs.writeFileSync(PENDING_ALERT_FILE, JSON.stringify(alert, null, 2));
          console.log(`\n🧠 BRAIN ALERT TRIGGERED: ${best.netProfitPct.toFixed(2)}%`);
          lastBrainAlert = now;
        }
      } else {
        process.stdout.write('.');
      }
    } catch (e) {
      console.error('\nPoll error:', e.message);
    }
  }
  
  await poll();
  setInterval(poll, POLL_INTERVAL);
}

async function runOnce(verbose = true) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  console.log('🔍 Scanning for arbitrage opportunities...\n');
  
  const opportunities = await scan(provider, verbose);
  
  console.log('\n' + '═'.repeat(50));
  if (opportunities.length > 0) {
    console.log(`🚨 Found ${opportunities.length} profitable opportunities:\n`);
    
    for (const opp of opportunities.slice(0, 5)) {
      console.log(`📈 ${opp.path.join(' → ')}`);
      console.log(`   Profit: ${opp.profitPct.toFixed(3)}% gross | ${opp.netProfitPct.toFixed(3)}% net`);
      console.log(`   Route:`);
      for (const step of opp.route) {
        console.log(`     ${step.from} → ${step.to} via ${step.dex} (fee: ${step.fee/10000}%)`);
        console.log(`       ${step.amountIn.toFixed(4)} → ${step.amountOut.toFixed(4)}`);
      }
      console.log('');
    }
  } else {
    console.log('No profitable opportunities found (threshold: ' + MIN_PROFIT_PCT + '%)');
  }
  
  return opportunities;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const cmd = args[0] || 'once';

if (cmd === 'daemon') {
  runDaemon();
} else if (cmd === 'once') {
  runOnce().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
} else {
  console.log('Usage: node scanner.js [once|daemon]');
}
