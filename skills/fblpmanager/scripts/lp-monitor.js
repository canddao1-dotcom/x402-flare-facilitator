#!/usr/bin/env node
/**
 * V3 LP Position Monitor
 * Checks if positions are in range and outputs status
 */

const https = require('https');

const RPC = 'https://flare-api.flare.network/ext/C/rpc';
const ENOSYS_POSITION_MGR = '0xd9770b1c7a6ccd33c75b5bcb1c0078f46be46657';

// Positions to monitor (add more as needed)
// NOTE: Agent positions #34935-34965 were withdrawn (0 liquidity)
const POSITIONS = [
  { id: 28509, name: 'DAO stXRP/FXRP', pool: '0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770' },
];

// Token info
const TOKENS = {
  '0x1d80c49bbbcd1c0911346656b529df9e5c2f783d': { symbol: 'WFLR', decimals: 18 },
  '0x12e605bc104e93b45e1ad99f9e555f659051c2bb': { symbol: 'sFLR', decimals: 18 },
  '0xad552a648c74d49e10027ab8a618a3ad4901c5be': { symbol: 'FXRP', decimals: 6 },
  '0x96b41289d90444b8add57e6f265db5ae8651df29': { symbol: 'stXRP', decimals: 6 },
  '0x4c18ff3c89632c3dd62e796c0afa5c07c4c1b2b3': { symbol: 'XRP', decimals: 6 },
  '0xe7cd86e13ac4309349f30b3435a9d337750fc82d': { symbol: 'USDT0', decimals: 6 },
  '0x6cd3a5ba46fa254d4d2e3c2b37350ae337e94a0f': { symbol: 'CDP', decimals: 18 },
};

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

function parseSignedInt(hex) {
  const val = BigInt('0x' + hex);
  if (val >= BigInt('0x8000000000000000000000000000000000000000000000000000000000000000')) {
    return Number(val - BigInt('0x10000000000000000000000000000000000000000000000000000000000000000'));
  }
  return Number(val);
}

async function getPoolTick(pool) {
  const r = await rpcCall(pool, '0x3850c7bd'); // slot0()
  if (r.error || !r.result) return null;
  const data = r.result.slice(2);
  return parseSignedInt(data.slice(64, 128));
}

async function getPosition(posId) {
  const data = '0x99fbab88' + posId.toString(16).padStart(64, '0');
  const r = await rpcCall(ENOSYS_POSITION_MGR, data);
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

// Calculate tick from price (approximate)
function priceToTick(price) {
  return Math.floor(Math.log(price) / Math.log(1.0001));
}

// Calculate price from tick
function tickToPrice(tick) {
  return Math.pow(1.0001, tick);
}

async function checkPositions() {
  const results = [];
  
  for (const pos of POSITIONS) {
    const [position, currentTick] = await Promise.all([
      getPosition(pos.id),
      getPoolTick(pos.pool)
    ]);
    
    if (!position || currentTick === null) {
      results.push({ ...pos, error: 'Failed to fetch data' });
      continue;
    }
    
    const t0 = TOKENS[position.token0.toLowerCase()]?.symbol || position.token0.slice(0, 8);
    const t1 = TOKENS[position.token1.toLowerCase()]?.symbol || position.token1.slice(0, 8);
    
    const inRange = currentTick >= position.tickLower && currentTick <= position.tickUpper;
    const rangeWidth = position.tickUpper - position.tickLower;
    
    // Distance from edges (as percentage of range)
    const distFromLower = currentTick - position.tickLower;
    const distFromUpper = position.tickUpper - currentTick;
    const positionInRange = (distFromLower / rangeWidth * 100).toFixed(1);
    
    // Price at current tick vs range bounds
    const currentPrice = tickToPrice(currentTick);
    const lowerPrice = tickToPrice(position.tickLower);
    const upperPrice = tickToPrice(position.tickUpper);
    
    results.push({
      id: pos.id,
      name: pos.name,
      pair: `${t0}/${t1}`,
      fee: position.fee / 10000,
      currentTick,
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
      inRange,
      positionInRange: parseFloat(positionInRange),
      currentPrice,
      lowerPrice,
      upperPrice,
      liquidity: position.liquidity
    });
  }
  
  return results;
}

async function main() {
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
  
  console.log(`🔍 V3 LP POSITION CHECK`);
  console.log(`📅 ${timestamp}\n`);
  
  const results = await checkPositions();
  
  let allInRange = true;
  
  for (const r of results) {
    if (r.error) {
      console.log(`❌ ${r.name}: ${r.error}`);
      allInRange = false;
      continue;
    }
    
    const rangeEmoji = r.inRange ? '✅' : '⚠️';
    const status = r.inRange ? 'IN RANGE' : 'OUT OF RANGE';
    
    console.log(`${rangeEmoji} **${r.name}** (#${r.id})`);
    console.log(`   Pair: ${r.pair} (${r.fee}% fee)`);
    console.log(`   Current Tick: ${r.currentTick}`);
    console.log(`   Range: ${r.tickLower} ↔ ${r.tickUpper}`);
    console.log(`   Position: ${r.positionInRange}% from lower bound`);
    console.log(`   Status: **${status}**`);
    console.log('');
    
    if (!r.inRange) allInRange = false;
  }
  
  // Summary
  if (allInRange) {
    console.log('✅ All positions in range');
  } else {
    console.log('⚠️ ACTION NEEDED: Some positions out of range!');
  }
  
  return { results, allInRange };
}

// Export for use as module
module.exports = { checkPositions, main };

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}
