#!/usr/bin/env node
/**
 * DAO LP Deployment Guide
 * Human-readable price ranges for direct deployment
 */

const https = require('https');

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
        catch { resolve({ error: 'parse' }); }
      });
    });
    req.on('error', () => resolve({ error: 'network' }));
    req.write(body);
    req.end();
  });
}

async function getPoolTick(poolAddr) {
  const result = await rpcCall(poolAddr, '0x3850c7bd');
  if (result.result && result.result !== '0x') {
    const hex = result.result.slice(2);
    let tick = BigInt('0x' + hex.slice(64, 128));
    if (tick >= BigInt('0x8000000000000000000000000000000000000000000000000000000000000000')) {
      tick = tick - BigInt('0x10000000000000000000000000000000000000000000000000000000000000000');
    }
    return Number(tick);
  }
  return null;
}

function tickToPrice(tick, d0, d1) {
  return Math.pow(1.0001, tick) * Math.pow(10, d0 - d1);
}

// Pool configurations with historical volatility percentages
const POOLS = [
  { 
    name: 'CDP/USD₮0', 
    addr: '0x975f0369d31f1dd79abf057ad369ae7d5b9f6fb4', 
    d0: 18, d1: 6, 
    weekPct: 2.3, 
    monthPct: 7.9, 
    token0: 'CDP', 
    token1: 'USD₮0', 
    dex: 'Enosys', 
    fee: '0.05%',
    vol: '$123K', 
    tvl: '$1.4M',
    note: 'Ultra stable stablecoin pair'
  },
  { 
    name: 'WFLR/USD₮0', 
    addr: '0x3c2a7b76795e58829faaa034486d417dd0155162', 
    d0: 18, d1: 6,
    weekPct: 3.2, 
    monthPct: 10.5, 
    token0: 'WFLR', 
    token1: 'USD₮0', 
    dex: 'Enosys', 
    fee: '0.3%',
    vol: '$660K', 
    tvl: '$1.4M',
    note: 'Low volatility, high volume'
  },
  { 
    name: 'stXRP/FXRP', 
    addr: '0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770', 
    d0: 6, d1: 6,
    weekPct: 10.6, 
    monthPct: 43.0, 
    token0: 'stXRP', 
    token1: 'FXRP', 
    dex: 'Enosys', 
    fee: '0.05%',
    vol: '$152K', 
    tvl: '$4.0M',
    note: 'Current DAO position - both track XRP'
  },
  { 
    name: 'FXRP/USD₮0', 
    addr: '0x88d46717b16619b37fa2dfd2f038defb4459f1f7', 
    d0: 6, d1: 6,
    weekPct: 10.9, 
    monthPct: 44.7, 
    token0: 'FXRP', 
    token1: 'USD₮0', 
    dex: 'Enosys', 
    fee: '0.05%',
    vol: '$815K', 
    tvl: '$2.6M',
    note: 'XRP/USD exposure - highest volume'
  },
  { 
    name: 'WFLR/FXRP', 
    addr: '0xb4cb11a84cfbd8f6336dc9417ac45c1f8e5b59e7', 
    d0: 18, d1: 6,
    weekPct: 10.8, 
    monthPct: 44.6, 
    token0: 'WFLR', 
    token1: 'FXRP', 
    dex: 'Enosys', 
    fee: '0.3%',
    vol: '$1.0M', 
    tvl: '$1.9M',
    note: 'Highest volume pool'
  },
];

async function main() {
  const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  
  console.log('🎯 **DAO LP DEPLOYMENT GUIDE**');
  console.log(`📅 ${timestamp}`);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  
  for (const p of POOLS) {
    const tick = await getPoolTick(p.addr);
    if (tick === null) {
      console.log(`\n❌ ${p.name}: Failed to fetch price`);
      continue;
    }
    
    const current = tickToPrice(tick, p.d0, p.d1);
    const weekLo = current * (1 - p.weekPct / 100);
    const weekHi = current * (1 + p.weekPct / 100);
    const monthLo = current * (1 - p.monthPct / 100);
    const monthHi = current * (1 + p.monthPct / 100);
    
    console.log('');
    console.log(`📌 **${p.name}** (${p.dex} ${p.fee})`);
    console.log(`   ${p.note}`);
    console.log(`   24h Vol: ${p.vol} | TVL: ${p.tvl}`);
    console.log('');
    console.log(`   💰 CURRENT: 1 ${p.token0} = ${current.toFixed(6)} ${p.token1}`);
    console.log('');
    console.log(`   ⚖️ **WEEKLY REBALANCE** (±${p.weekPct}%)`);
    console.log(`      Lower: ${weekLo.toFixed(6)} ${p.token1}`);
    console.log(`      Upper: ${weekHi.toFixed(6)} ${p.token1}`);
    console.log('');
    console.log(`   🏦 **MONTHLY REBALANCE** (±${p.monthPct}%)`);
    console.log(`      Lower: ${monthLo.toFixed(6)} ${p.token1}`);
    console.log(`      Upper: ${monthHi.toFixed(6)} ${p.token1}`);
    console.log('');
    console.log('───────────────────────────────────────────────────────────────');
  }
  
  console.log('');
  console.log('💡 **HOW TO DEPLOY:**');
  console.log('   1. Go to Enosys V3 → New Position');
  console.log('   2. Select the token pair (e.g., CDP/USD₮0)');
  console.log('   3. Enter the Lower price from above');
  console.log('   4. Enter the Upper price from above');
  console.log('   5. Enter your deposit amount');
  console.log('   6. Confirm transaction');
  console.log('');
  console.log('📊 Data: Live on-chain prices + 30-day historical volatility');
}

module.exports = { main, POOLS };

if (require.main === module) {
  main().catch(console.error);
}
