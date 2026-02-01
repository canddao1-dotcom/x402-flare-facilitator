#!/usr/bin/env node
/**
 * sFLR Arbitrage Scanner v2
 * 
 * Monitors the spread between:
 * - Sceptre staking rate (FLR → sFLR)
 * - Sceptre redemption rate (sFLR → FLR)
 * - DEX market prices (SparkDex V3.1, Enosys V3, Blazeswap V2)
 * 
 * Arb opportunities:
 * 1. STAKE-SELL: Stake FLR on Sceptre → Sell sFLR on DEX (instant if DEX premium)
 * 2. BUY-REDEEM: Buy sFLR on DEX → Redeem on Sceptre (14.5 day wait, need big discount)
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Config
const RPC = process.env.FLARE_RPC || 'https://flare-api.flare.network/ext/C/rpc';
const provider = new ethers.JsonRpcProvider(RPC);

// Tokens
const SFLR = ethers.getAddress('0x12e605bc104e93B45e1aD99F9e555f659051c2BB');
const WFLR = ethers.getAddress('0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d');

// Sceptre
const SCEPTRE_ROUTER = '0xEcB4b9c9C6d33b4C5B98041DCEc84258bB04d233';

// V3 Pools (from GeckoTerminal)
const V3_POOLS = {
  'SparkDex V3.1': {
    address: '0xc9baba3f36ccaa54675deecc327ec7eaa48cb97d',
    fee: 100,  // 0.01%
    router: '0x60aE616a2155Ee3d9A68541Ba4544862310933d4',  // SparkDex Router
    quoter: '0xA042504aC300448E5e6732c9c0F0C1092b7cAbFe'
  },
  'Enosys V3': {
    address: '0x25b4f3930934f0a3cbb885c624ecee75a2917144',
    fee: 500,  // 0.05%
    router: '0x5FD34090E9b195d8482Ad3CC63dB078534F1b113',
    quoter: '0x0A32EE3f66cC9E68ffb7cBeCf77bAef03e2d7C56'
  }
};

// V2 Pool
const BLAZESWAP_PAIR = '0x3F50F880041521738fa88C46cDF7e0d8Eeb11Aa2';
const BLAZESWAP_ROUTER = '0xe3a1b355ca63abcbc9589334b5e609583c7baa06';

// Thresholds
const STAKE_SELL_MIN_PROFIT_BPS = 10;  // 0.1% min for instant arb
const BUY_REDEEM_MIN_APY = 20;          // 20% APY min for 14.5 day wait
const UNSTAKING_DAYS = 14.5;

// ABIs
const sflrAbi = [
  'function getPooledFlrByShares(uint256) view returns (uint256)',
  'function getSharesByPooledFlr(uint256) view returns (uint256)',
  'function totalPooledFlr() view returns (uint256)',
  'function totalSupply() view returns (uint256)'
];

const poolAbi = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)',
  'function liquidity() view returns (uint128)',
  'function fee() view returns (uint24)',
  'function token0() view returns (address)',
  'function token1() view returns (address)'
];

const pairAbi = [
  'function getReserves() view returns (uint112, uint112, uint32)',
  'function token0() view returns (address)'
];

async function getSceptreRates() {
  const sflr = new ethers.Contract(SFLR, sflrAbi, provider);
  
  const oneEther = ethers.parseEther('1');
  const [pooledPerShare, sharesPerPooled, totalPooled, totalShares] = await Promise.all([
    sflr.getPooledFlrByShares(oneEther),
    sflr.getSharesByPooledFlr(oneEther),
    sflr.totalPooledFlr(),
    sflr.totalSupply()
  ]);
  
  return {
    redemptionRate: parseFloat(ethers.formatEther(pooledPerShare)),
    stakingRate: parseFloat(ethers.formatEther(sharesPerPooled)),
    totalStaked: parseFloat(ethers.formatEther(totalPooled)),
    totalSupply: parseFloat(ethers.formatEther(totalShares))
  };
}

async function getV3PoolPrice(poolAddr, name) {
  try {
    const pool = new ethers.Contract(poolAddr, poolAbi, provider);
    
    const [slot0, liquidity, fee, token0] = await Promise.all([
      pool.slot0(),
      pool.liquidity(),
      pool.fee(),
      pool.token0()
    ]);
    
    const sqrtPriceX96 = slot0[0];
    const Q96 = BigInt(2) ** BigInt(96);
    const priceX192 = sqrtPriceX96 * sqrtPriceX96;
    const priceRaw = Number(priceX192) / Number(Q96 * Q96);
    
    const isSflrToken0 = token0.toLowerCase() === SFLR.toLowerCase();
    const spotPrice = isSflrToken0 ? priceRaw : 1 / priceRaw;
    
    // Adjust for fee
    const feeDecimal = Number(fee) / 1000000;
    const sellPrice = spotPrice * (1 - feeDecimal);  // Price after selling sFLR
    const buyPrice = spotPrice * (1 + feeDecimal);   // Cost to buy sFLR
    
    return {
      name,
      spotPrice,
      sellPrice,
      buyPrice,
      fee: Number(fee),
      liquidity: liquidity.toString()
    };
  } catch(e) {
    return null;
  }
}

async function getBlazeswapPrices() {
  const pair = new ethers.Contract(BLAZESWAP_PAIR, pairAbi, provider);
  
  const [reserves, token0] = await Promise.all([
    pair.getReserves(),
    pair.token0()
  ]);
  
  const [r0, r1] = reserves;
  const isSflrToken0 = token0.toLowerCase() === SFLR.toLowerCase();
  
  const sflrReserve = isSflrToken0 ? r0 : r1;
  const wflrReserve = isSflrToken0 ? r1 : r0;
  
  // Calculate sell price (sFLR → WFLR) with 0.3% fee
  const amountIn = ethers.parseEther('1');
  const amountInWithFee = amountIn * BigInt(997);
  const sellNumerator = amountInWithFee * wflrReserve;
  const sellDenominator = sflrReserve * BigInt(1000) + amountInWithFee;
  const sellOutput = sellNumerator / sellDenominator;
  
  // Calculate buy price (WFLR → sFLR)
  const buyNumerator = amountInWithFee * sflrReserve;
  const buyDenominator = wflrReserve * BigInt(1000) + amountInWithFee;
  const buyOutput = buyNumerator / buyDenominator;
  
  return {
    name: 'Blazeswap V2',
    sellPrice: parseFloat(ethers.formatEther(sellOutput)),
    buyPrice: 1 / parseFloat(ethers.formatEther(buyOutput)),  // FLR per sFLR when buying
    spotPrice: parseFloat(ethers.formatEther(wflrReserve)) / parseFloat(ethers.formatEther(sflrReserve)),
    fee: 3000,
    reserves: {
      sFLR: parseFloat(ethers.formatEther(sflrReserve)),
      WFLR: parseFloat(ethers.formatEther(wflrReserve))
    }
  };
}

async function analyze(verbose = true) {
  const [sceptre, sparkdex, enosys, blazeswap] = await Promise.all([
    getSceptreRates(),
    getV3PoolPrice(V3_POOLS['SparkDex V3.1'].address, 'SparkDex V3.1 (0.01%)'),
    getV3PoolPrice(V3_POOLS['Enosys V3'].address, 'Enosys V3 (0.05%)'),
    getBlazeswapPrices()
  ]);
  
  const pools = [sparkdex, enosys, blazeswap].filter(p => p);
  
  const analysis = {
    timestamp: Date.now(),
    sceptre,
    pools: pools.map(p => ({
      name: p.name,
      spotPrice: p.spotPrice,
      sellPrice: p.sellPrice,
      buyPrice: p.buyPrice,
      fee: p.fee
    })),
    opportunities: []
  };
  
  // Find best pool for each strategy
  const bestSell = pools.reduce((best, p) => p.sellPrice > best.sellPrice ? p : best, { sellPrice: 0 });
  const bestBuy = pools.reduce((best, p) => p.buyPrice < best.buyPrice ? p : best, { buyPrice: Infinity });
  
  // STAKE-SELL Analysis
  // Stake FLR → get sFLR → sell for WFLR
  const stakeSellReturn = sceptre.stakingRate * bestSell.sellPrice;
  const stakeSellProfitBps = (stakeSellReturn - 1) * 10000;
  
  if (stakeSellProfitBps > STAKE_SELL_MIN_PROFIT_BPS) {
    analysis.opportunities.push({
      type: 'STAKE-SELL',
      venue: bestSell.name,
      action: `Stake FLR on Sceptre → Sell sFLR on ${bestSell.name}`,
      profitBps: stakeSellProfitBps.toFixed(1),
      instant: true,
      details: `1 FLR → ${sceptre.stakingRate.toFixed(6)} sFLR → ${stakeSellReturn.toFixed(6)} WFLR`
    });
  }
  
  // BUY-REDEEM Analysis
  // Buy sFLR on DEX → Redeem on Sceptre (14.5 day wait)
  const buyRedeemReturn = sceptre.redemptionRate / bestBuy.buyPrice;
  const buyRedeemProfit = buyRedeemReturn - 1;
  const buyRedeemAPY = buyRedeemProfit * (365 / UNSTAKING_DAYS) * 100;
  
  if (buyRedeemAPY > BUY_REDEEM_MIN_APY) {
    analysis.opportunities.push({
      type: 'BUY-REDEEM',
      venue: bestBuy.name,
      action: `Buy sFLR on ${bestBuy.name} → Redeem on Sceptre (14.5d wait)`,
      profitPct: (buyRedeemProfit * 100).toFixed(2),
      apy: buyRedeemAPY.toFixed(1),
      instant: false,
      details: `1 FLR → ${(1/bestBuy.buyPrice).toFixed(6)} sFLR → ${buyRedeemReturn.toFixed(6)} FLR`
    });
  }
  
  if (verbose) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('              sFLR ARBITRAGE ANALYSIS v2');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Time: ${new Date().toISOString()}\n`);
    
    console.log('📊 SCEPTRE RATES');
    console.log(`   Redemption: 1 sFLR = ${sceptre.redemptionRate.toFixed(6)} FLR`);
    console.log(`   Staking:    1 FLR  = ${sceptre.stakingRate.toFixed(6)} sFLR`);
    console.log(`   TVL: ${(sceptre.totalStaked / 1e9).toFixed(3)}B FLR staked\n`);
    
    console.log('💱 DEX PRICES (sFLR/WFLR)\n');
    console.log('   Pool                   | Spot     | Sell     | Buy      | vs Redeem');
    console.log('   -----------------------|----------|----------|----------|----------');
    
    for (const p of pools) {
      const vsRedeem = ((p.sellPrice / sceptre.redemptionRate - 1) * 100).toFixed(2);
      const sign = vsRedeem >= 0 ? '+' : '';
      console.log(`   ${p.name.padEnd(22)} | ${p.spotPrice.toFixed(4)} | ${p.sellPrice.toFixed(4)} | ${p.buyPrice.toFixed(4)} | ${sign}${vsRedeem}%`);
    }
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                    ARB OPPORTUNITIES');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    console.log(`🔄 STAKE → SELL (instant) via ${bestSell.name}`);
    console.log(`   Path: FLR → Sceptre → sFLR → ${bestSell.name} → WFLR`);
    console.log(`   Return: ${stakeSellReturn.toFixed(6)} WFLR per 1 FLR`);
    console.log(`   P&L: ${stakeSellProfitBps >= 0 ? '+' : ''}${stakeSellProfitBps.toFixed(1)} bps`);
    console.log(`   Status: ${stakeSellProfitBps > STAKE_SELL_MIN_PROFIT_BPS ? '🟢 PROFITABLE!' : '⚪ Not profitable'}\n`);
    
    console.log(`🔄 BUY → REDEEM (14.5d wait) via ${bestBuy.name}`);
    console.log(`   Path: WFLR → ${bestBuy.name} → sFLR → Sceptre → FLR`);
    console.log(`   Return: ${buyRedeemReturn.toFixed(6)} FLR per 1 FLR`);
    console.log(`   P&L: ${buyRedeemProfit >= 0 ? '+' : ''}${(buyRedeemProfit * 100).toFixed(3)}%`);
    console.log(`   APY: ${buyRedeemAPY.toFixed(1)}%`);
    console.log(`   Status: ${buyRedeemAPY > BUY_REDEEM_MIN_APY ? '🟢 PROFITABLE!' : '⚪ Not profitable'}\n`);
    
    if (analysis.opportunities.length > 0) {
      console.log('🎯 ACTIONABLE OPPORTUNITIES:\n');
      for (const opp of analysis.opportunities) {
        console.log(`   ✅ ${opp.type}: ${opp.action}`);
        console.log(`      ${opp.details}`);
        if (opp.instant) {
          console.log(`      Profit: +${opp.profitBps} bps (INSTANT)`);
        } else {
          console.log(`      Profit: +${opp.profitPct}% | APY: ${opp.apy}%`);
        }
        console.log();
      }
    }
    
    console.log('═══════════════════════════════════════════════════════════\n');
  }
  
  return analysis;
}

async function saveHistory(analysis) {
  const historyDir = path.join(__dirname, '..', 'data');
  const historyFile = path.join(historyDir, 'sflr-history.json');
  
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }
  
  let history = [];
  if (fs.existsSync(historyFile)) {
    try {
      history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    } catch(e) {}
  }
  
  // Get best prices
  const bestSellPrice = Math.max(...analysis.pools.map(p => p.sellPrice));
  const bestBuyPrice = Math.min(...analysis.pools.map(p => p.buyPrice));
  
  history.push({
    timestamp: analysis.timestamp,
    redemptionRate: analysis.sceptre.redemptionRate,
    stakingRate: analysis.sceptre.stakingRate,
    bestSellPrice,
    bestBuyPrice,
    stakeSellProfitBps: (analysis.sceptre.stakingRate * bestSellPrice - 1) * 10000,
    opportunities: analysis.opportunities.length
  });
  
  if (history.length > 2000) {
    history = history.slice(-2000);
  }
  
  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'once';
  
  if (command === 'once') {
    const analysis = await analyze(true);
    await saveHistory(analysis);
  } else if (command === 'daemon') {
    console.log('Starting sFLR arb scanner daemon...');
    console.log('Interval: 30 seconds\n');
    
    const run = async () => {
      try {
        const analysis = await analyze(true);
        await saveHistory(analysis);
        
        // Alert on opportunities
        if (analysis.opportunities.length > 0) {
          const alertFile = path.join(__dirname, '..', 'data', 'sflr-alert.json');
          fs.writeFileSync(alertFile, JSON.stringify({
            timestamp: Date.now(),
            read: false,
            opportunities: analysis.opportunities
          }, null, 2));
          console.log('⚠️  ALERT SAVED: sflr-alert.json\n');
        }
      } catch(e) {
        console.error('Error:', e.message);
      }
    };
    
    await run();
    setInterval(run, 30000);
  } else if (command === 'json') {
    const analysis = await analyze(false);
    console.log(JSON.stringify(analysis, null, 2));
  } else if (command === 'history') {
    const historyFile = path.join(__dirname, '..', 'data', 'sflr-history.json');
    if (fs.existsSync(historyFile)) {
      const history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      const last10 = history.slice(-10);
      console.log('Last 10 data points:\n');
      for (const h of last10) {
        const sign = h.stakeSellProfitBps >= 0 ? '+' : '';
        console.log(`${new Date(h.timestamp).toISOString()} | Redeem: ${h.redemptionRate.toFixed(4)} | Sell: ${h.bestSellPrice.toFixed(4)} | P&L: ${sign}${h.stakeSellProfitBps.toFixed(1)} bps`);
      }
    } else {
      console.log('No history yet');
    }
  } else {
    console.log('Usage: sflr-arb.js [once|daemon|json|history]');
  }
}

main().catch(console.error);
