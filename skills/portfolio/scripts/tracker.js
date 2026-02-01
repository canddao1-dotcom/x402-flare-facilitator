#!/usr/bin/env node
/**
 * Portfolio Tracker - Lightweight performance tracking
 * Saves minimal snapshots for performance comparison
 * 
 * Usage:
 *   node tracker.js track [address]     # Save snapshot
 *   node tracker.js history [address]   # Show recent history
 *   node tracker.js compare 7d [address] # Compare to N days ago
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC_URL = 'https://flare-api.flare.network/ext/C/rpc';
const AGENT_WALLET = '0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A';
const DAO_TREASURY = '0xaa68bc4bab9a63958466f49f5a58c54a412d4906';
const DATA_DIR = path.join(__dirname, '../data');

// Contracts for reward tracking
const CONTRACTS = {
  stabilityPoolFXRP: '0x2c817F7159c08d94f09764086330c96Bb3265A2f',
  stabilityPoolWFLR: '0x0Dd6daab4cB9A0ba6707Cf59DBfbc28cc33CA24A',
  enosysPositionManager: '0xd9770b1c7a6ccd33c75b5bcb1c0078f46be46657',
  rFLR: '0x26d460c3Cf931Fb2014FA436a49e3Af08619810e',
};

const TOKENS = {
  // Core tokens
  WFLR:    { address: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d', decimals: 18 },
  sFLR:    { address: '0x12e605bc104e93B45e1aD99F9e555f659051c2BB', decimals: 18 },
  rFLR:    { address: '0x26d460c3Cf931Fb2014FA436a49e3Af08619810e', decimals: 18 },
  FXRP:    { address: '0xAd552A648C74D49E10027AB8a618A3ad4901c5bE', decimals: 6 },
  stXRP:   { address: '0x4C18Ff3C89632c3Dd62E796c0aFA5c07c4c1B2b3', decimals: 6 },
  BANK:    { address: '0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059', decimals: 18 },
  // Stablecoins
  CDP:     { address: '0x6Cd3a5Ba46FA254D4d2E3C2B37350ae337E94a0F', decimals: 18 },
  USDT0:   { address: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', decimals: 6 },
  USDCe:   { address: '0xfbda5f676cb37624f28265a144a48b0d6e87d3b6', decimals: 6 },
  // Upshift vault
  earnXRP: { address: '0xe533e447fd7720b2f8654da2b1953efa06b60bfa', decimals: 6 },
  // Spectra PT/YT
  'PT-stXRP': { address: '0x097Dd93Bf92bf9018fF194195dDfCFB2c359335e', decimals: 6 },
  'YT-stXRP': { address: '0x46f0C7b81128e031604eCb3e8A7E28dd3F8A50C9', decimals: 6 },
  'PT-sFLR':  { address: '0x14613BFc52F98af194F4e0b1D23fE538B54628f3', decimals: 18 },
};

// V2 LP tokens to track
const V2_LP_TOKENS = {
  'Enosys-BANK/WFLR': { 
    address: '0x5f29c8d049e47dd180c2b83e3560e8e271110335',
    token0: 'BANK', token1: 'WFLR'
  },
  'SparkDex-BANK/WFLR': { 
    address: '0x0f574fc895c1abf82aeff334fa9d8ba43f866111',
    token0: 'BANK', token1: 'WFLR'
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'track';
  
  let address = AGENT_WALLET;
  for (const arg of args) {
    if (arg === 'dao') address = DAO_TREASURY;
    else if (arg.startsWith('0x')) address = arg;
  }
  
  const snapshotFile = getSnapshotFile(address);
  
  switch (command) {
    case 'track':
      await trackSnapshot(address, snapshotFile);
      break;
    case 'history':
      showHistory(snapshotFile);
      break;
    case 'compare':
      const period = args[1] || '7d';
      compareSnapshot(snapshotFile, period);
      break;
    default:
      console.log('Usage: tracker.js [track|history|compare] [address]');
  }
}

function getSnapshotFile(address) {
  const shortAddr = address.slice(0, 8).toLowerCase();
  return path.join(DATA_DIR, `snapshots-${shortAddr}.jsonl`);
}

// ═══════════════════════════════════════════════════════════════════════════
// TRACK - Save current snapshot
// ═══════════════════════════════════════════════════════════════════════════

async function trackSnapshot(address, snapshotFile) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  console.log(`📸 Taking snapshot for ${address.slice(0, 6)}...${address.slice(-4)}`);
  
  // Get prices first (needed for V2 LP calc)
  const prices = await getPrices(provider);
  
  // Batch remaining calls
  const [balances, rewards, lpPositions, v2LPPositions] = await Promise.all([
    getBalances(provider, address),
    getRewards(provider, address),
    getLPPositions(provider, address),
    getV2LPPositions(provider, address, prices),
  ]);
  
  // Calculate total USD
  let totalUSD = balances.FLR * (prices.FLR || 0);
  for (const [token, amount] of Object.entries(balances)) {
    if (token !== 'FLR') {
      const price = prices[token] || prices[getBaseToken(token)] || 0;
      totalUSD += amount * price;
    }
  }
  
  // Add stability pool deposits (CDP ~$1)
  totalUSD += (rewards.stabilityDepositFXRP || 0) * 1;
  totalUSD += (rewards.stabilityDepositWFLR || 0) * 1;
  
  // Add pending rewards value
  totalUSD += rewards.stabilityYield * 1; // CDP ~$1
  totalUSD += rewards.stabilityCollFXRP * (prices.XRP || 0);
  totalUSD += rewards.stabilityCollWFLR * (prices.FLR || 0);
  totalUSD += rewards.rflrVested * (prices.FLR || 0);
  
  // Add V3 LP position values
  let lpV3ValueUSD = 0;
  for (const pos of lpPositions.positions) {
    const price0 = prices[pos.token0] || prices[getBaseToken(pos.token0)] || 0;
    const price1 = prices[pos.token1] || prices[getBaseToken(pos.token1)] || 0;
    lpV3ValueUSD += pos.amount0 * price0 + pos.amount1 * price1;
  }
  totalUSD += lpV3ValueUSD;
  lpPositions.totalValueUSD = Math.round(lpV3ValueUSD * 100) / 100;
  
  // Add V2 LP position values
  totalUSD += v2LPPositions.totalValueUSD;
  
  const snapshot = {
    ts: Date.now(),
    date: new Date().toISOString().split('T')[0],
    address: address.toLowerCase(),
    totalUSD: Math.round(totalUSD * 100) / 100,
    balances,
    rewards,
    lpPositions,      // V3
    v2LPPositions,    // V2
    prices: { FLR: prices.FLR, XRP: prices.XRP },
  };
  
  // Append to file
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(snapshotFile, JSON.stringify(snapshot) + '\n');
  
  const totalLPValue = lpV3ValueUSD + v2LPPositions.totalValueUSD;
  console.log(`✅ Snapshot saved`);
  console.log(`   Total: $${formatNum(totalUSD)}`);
  console.log(`   V3 LPs: ${lpPositions.count} ($${formatNum(lpV3ValueUSD)})`);
  console.log(`   V2 LPs: ${v2LPPositions.positions.length} ($${formatNum(v2LPPositions.totalValueUSD)})`);
  console.log(`   Stability Pools: $${formatNum((rewards.stabilityDepositFXRP || 0) + (rewards.stabilityDepositWFLR || 0))}`);
  console.log(`   Rewards pending: ${formatNum(rewards.stabilityYield)} CDP, ${formatNum(rewards.stabilityCollFXRP)} FXRP, ${formatNum(rewards.stabilityCollWFLR)} WFLR`);
}

// ═══════════════════════════════════════════════════════════════════════════
// HISTORY - Show recent snapshots
// ═══════════════════════════════════════════════════════════════════════════

function showHistory(snapshotFile) {
  if (!fs.existsSync(snapshotFile)) {
    console.log('No snapshots yet. Run: tracker.js track');
    return;
  }
  
  const lines = fs.readFileSync(snapshotFile, 'utf8').trim().split('\n');
  const snapshots = lines.slice(-14).map(l => JSON.parse(l)); // Last 14 days
  
  console.log('\n📈 PORTFOLIO HISTORY');
  console.log('═'.repeat(50));
  console.log('Date       │ Total USD  │ Δ Day    │ Rewards');
  console.log('───────────┼────────────┼──────────┼─────────');
  
  let prev = null;
  for (const snap of snapshots) {
    const delta = prev ? snap.totalUSD - prev.totalUSD : 0;
    const deltaStr = delta >= 0 ? `+$${formatNum(delta)}` : `-$${formatNum(Math.abs(delta))}`;
    const rewardsTotal = (snap.rewards?.stabilityYield || 0) + 
                        (snap.rewards?.stabilityCollFXRP || 0) * (snap.prices?.XRP || 0) +
                        (snap.rewards?.stabilityCollWFLR || 0) * (snap.prices?.FLR || 0);
    
    console.log(`${snap.date} │ $${formatNum(snap.totalUSD).padStart(9)} │ ${deltaStr.padStart(8)} │ $${formatNum(rewardsTotal)}`);
    prev = snap;
  }
  
  // Summary
  if (snapshots.length >= 2) {
    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const totalChange = last.totalUSD - first.totalUSD;
    const pctChange = ((totalChange / first.totalUSD) * 100).toFixed(2);
    
    console.log('───────────┴────────────┴──────────┴─────────');
    console.log(`Period: ${first.date} → ${last.date}`);
    console.log(`Change: ${totalChange >= 0 ? '+' : ''}$${formatNum(totalChange)} (${pctChange}%)`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPARE - Compare to N days ago
// ═══════════════════════════════════════════════════════════════════════════

function compareSnapshot(snapshotFile, period) {
  if (!fs.existsSync(snapshotFile)) {
    console.log('No snapshots yet. Run: tracker.js track');
    return;
  }
  
  const days = parseInt(period) || 7;
  const targetDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const targetDateStr = targetDate.toISOString().split('T')[0];
  
  const lines = fs.readFileSync(snapshotFile, 'utf8').trim().split('\n');
  const snapshots = lines.map(l => JSON.parse(l));
  
  // Find closest snapshot to target date
  const oldSnap = snapshots.find(s => s.date >= targetDateStr) || snapshots[0];
  const newSnap = snapshots[snapshots.length - 1];
  
  if (!oldSnap || !newSnap) {
    console.log('Not enough data for comparison');
    return;
  }
  
  console.log(`\n📊 COMPARISON: ${oldSnap.date} → ${newSnap.date}`);
  console.log('═'.repeat(50));
  
  // Total value change
  const totalDelta = newSnap.totalUSD - oldSnap.totalUSD;
  const totalPct = ((totalDelta / oldSnap.totalUSD) * 100).toFixed(2);
  console.log(`\n💰 Total Value`);
  console.log(`   ${formatNum(oldSnap.totalUSD)} → ${formatNum(newSnap.totalUSD)}`);
  console.log(`   Change: ${totalDelta >= 0 ? '+' : ''}$${formatNum(totalDelta)} (${totalPct}%)`);
  
  // Balance changes
  console.log(`\n📦 Token Balances`);
  const allTokens = new Set([...Object.keys(oldSnap.balances || {}), ...Object.keys(newSnap.balances || {})]);
  for (const token of allTokens) {
    const oldBal = oldSnap.balances?.[token] || 0;
    const newBal = newSnap.balances?.[token] || 0;
    const delta = newBal - oldBal;
    if (Math.abs(delta) > 0.01) {
      const sign = delta >= 0 ? '+' : '';
      console.log(`   ${token.padEnd(8)} ${formatNum(oldBal)} → ${formatNum(newBal)} (${sign}${formatNum(delta)})`);
    }
  }
  
  // Rewards comparison
  console.log(`\n🎁 Rewards Accumulated`);
  const oldRewards = oldSnap.rewards || {};
  const newRewards = newSnap.rewards || {};
  
  const yieldDelta = (newRewards.stabilityYield || 0) - (oldRewards.stabilityYield || 0);
  const collFXRPDelta = (newRewards.stabilityCollFXRP || 0) - (oldRewards.stabilityCollFXRP || 0);
  const collWFLRDelta = (newRewards.stabilityCollWFLR || 0) - (oldRewards.stabilityCollWFLR || 0);
  
  if (yieldDelta > 0.01) console.log(`   CDP Yield:     +${formatNum(yieldDelta)}`);
  if (collFXRPDelta > 0.01) console.log(`   FXRP Coll:     +${formatNum(collFXRPDelta)}`);
  if (collWFLRDelta > 0.01) console.log(`   WFLR Coll:     +${formatNum(collWFLRDelta)}`);
  
  // LP fees
  const oldFees = oldSnap.lpFees || {};
  const newFees = newSnap.lpFees || {};
  const feeDelta0 = (newFees.total0 || 0) - (oldFees.total0 || 0);
  const feeDelta1 = (newFees.total1 || 0) - (oldFees.total1 || 0);
  
  if (feeDelta0 > 0.0001 || feeDelta1 > 0.0001) {
    console.log(`\n🌊 LP Fees Earned`);
    if (feeDelta0 > 0.0001) console.log(`   Token0: +${formatNum(feeDelta0, 6)}`);
    if (feeDelta1 > 0.0001) console.log(`   Token1: +${formatNum(feeDelta1, 6)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA FETCHERS (Lightweight)
// ═══════════════════════════════════════════════════════════════════════════

async function getPrices(provider) {
  const REGISTRY = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';
  const prices = { FLR: 0, XRP: 0 };
  
  try {
    const registry = new ethers.Contract(REGISTRY, [
      'function getContractAddressByName(string) view returns (address)',
    ], provider);
    const ftsoAddr = await registry.getContractAddressByName('FtsoV2');
    const ftso = new ethers.Contract(ftsoAddr, [
      'function getFeedById(bytes21) view returns (uint256, int8, uint64)',
    ], provider);
    
    const getFeedId = (sym) => '0x' + ('01' + Buffer.from(`${sym}/USD`).toString('hex')).padEnd(42, '0');
    
    const [[flrVal, flrDec], [xrpVal, xrpDec]] = await Promise.all([
      ftso.getFeedById(getFeedId('FLR')),
      ftso.getFeedById(getFeedId('XRP')),
    ]);
    
    prices.FLR = parseFloat(flrVal.toString()) / Math.pow(10, Math.abs(Number(flrDec)));
    prices.XRP = parseFloat(xrpVal.toString()) / Math.pow(10, Math.abs(Number(xrpDec)));
  } catch (e) {}
  
  // Stablecoins
  prices.USD = 1;
  
  return prices;
}

async function getBalances(provider, address) {
  const balances = {};
  
  // Native FLR
  const flrBal = await provider.getBalance(address);
  balances.FLR = parseFloat(ethers.formatEther(flrBal));
  
  // Key tokens only
  await Promise.all(Object.entries(TOKENS).map(async ([sym, token]) => {
    try {
      const c = new ethers.Contract(token.address, ['function balanceOf(address) view returns (uint256)'], provider);
      const bal = await c.balanceOf(address);
      balances[sym] = parseFloat(ethers.formatUnits(bal, token.decimals));
    } catch (e) {
      balances[sym] = 0;
    }
  }));
  
  return balances;
}

async function getRewards(provider, address) {
  const rewards = {
    stabilityYield: 0,
    stabilityCollFXRP: 0,
    stabilityCollWFLR: 0,
    stabilityDepositFXRP: 0,  // Deposited CDP in FXRP pool
    stabilityDepositWFLR: 0,  // Deposited CDP in WFLR pool
    rflrVested: 0,
  };
  
  const spAbi = [
    'function getCompoundedBoldDeposit(address) view returns (uint256)',
    'function getDepositorYieldGain(address) view returns (uint256)',
    'function getDepositorCollGain(address) view returns (uint256)',
  ];
  
  try {
    const fxrpPool = new ethers.Contract(CONTRACTS.stabilityPoolFXRP, spAbi, provider);
    const [deposit1, yield1, coll1] = await Promise.all([
      fxrpPool.getCompoundedBoldDeposit(address),
      fxrpPool.getDepositorYieldGain(address),
      fxrpPool.getDepositorCollGain(address),
    ]);
    rewards.stabilityDepositFXRP = parseFloat(ethers.formatEther(deposit1));
    rewards.stabilityYield += parseFloat(ethers.formatEther(yield1));
    rewards.stabilityCollFXRP = parseFloat(ethers.formatUnits(coll1, 6));
  } catch (e) {}
  
  try {
    const wflrPool = new ethers.Contract(CONTRACTS.stabilityPoolWFLR, spAbi, provider);
    const [deposit2, yield2, coll2] = await Promise.all([
      wflrPool.getCompoundedBoldDeposit(address),
      wflrPool.getDepositorYieldGain(address),
      wflrPool.getDepositorCollGain(address),
    ]);
    rewards.stabilityDepositWFLR = parseFloat(ethers.formatEther(deposit2));
    rewards.stabilityYield += parseFloat(ethers.formatEther(yield2));
    rewards.stabilityCollWFLR = parseFloat(ethers.formatEther(coll2));
  } catch (e) {}
  
  try {
    const rflr = new ethers.Contract(CONTRACTS.rFLR, [
      'function getBalancesOf(address) view returns (uint256, uint256, uint256)',
    ], provider);
    const [, rNat, locked] = await rflr.getBalancesOf(address);
    rewards.rflrVested = parseFloat(ethers.formatEther(rNat - locked));
  } catch (e) {}
  
  return rewards;
}

async function getLPPositions(provider, address) {
  const lps = { count: 0, totalValueUSD: 0, positions: [] };
  
  const FACTORY = '0x17aa157ac8c54034381b840cb8f6bf7fc355f0de';
  
  try {
    const manager = new ethers.Contract(CONTRACTS.enosysPositionManager, [
      'function balanceOf(address) view returns (uint256)',
      'function tokenOfOwnerByIndex(address, uint256) view returns (uint256)',
      'function positions(uint256) view returns (uint96, address, address, address, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128)',
    ], provider);
    
    const factory = new ethers.Contract(FACTORY, [
      'function getPool(address, address, uint24) view returns (address)',
    ], provider);
    
    const balance = await manager.balanceOf(address);
    lps.count = Number(balance);
    
    for (let i = 0; i < Math.min(Number(balance), 10); i++) {
      try {
        const tokenId = await manager.tokenOfOwnerByIndex(address, i);
        const pos = await manager.positions(tokenId);
        
        // pos[7] = liquidity, pos[2] = token0, pos[3] = token1, pos[4] = fee
        // pos[5] = tickLower, pos[6] = tickUpper, pos[10] = tokensOwed0, pos[11] = tokensOwed1
        const liquidity = pos[7];
        const token0 = pos[2];
        const token1 = pos[3];
        const fee = pos[4];
        const tickLower = Number(pos[5]);
        const tickUpper = Number(pos[6]);
        
        if (liquidity > 0n) {
          // Get current tick from pool
          const poolAddr = await factory.getPool(token0, token1, fee);
          const pool = new ethers.Contract(poolAddr, [
            'function slot0() view returns (uint160, int24, uint16, uint16, uint16, uint8, bool)',
          ], provider);
          const slot0 = await pool.slot0();
          const currentTick = Number(slot0[1]);
          
          // Calculate token amounts from liquidity
          const { amount0, amount1 } = getAmountsFromLiquidity(
            liquidity, currentTick, tickLower, tickUpper
          );
          
          const decimals0 = getDecimals(token0);
          const decimals1 = getDecimals(token1);
          
          const amt0 = parseFloat(ethers.formatUnits(amount0, decimals0));
          const amt1 = parseFloat(ethers.formatUnits(amount1, decimals1));
          
          lps.positions.push({
            id: tokenId.toString(),
            token0: getSymbol(token0),
            token1: getSymbol(token1),
            amount0: amt0,
            amount1: amt1,
            inRange: currentTick >= tickLower && currentTick <= tickUpper,
          });
        }
      } catch (e) {}
    }
  } catch (e) {}
  
  return lps;
}

// Calculate token amounts from V3 liquidity
function getAmountsFromLiquidity(liquidity, currentTick, tickLower, tickUpper) {
  const Q96 = 2n ** 96n;
  
  const sqrtPriceCurrent = tickToSqrtPrice(currentTick);
  const sqrtPriceLower = tickToSqrtPrice(tickLower);
  const sqrtPriceUpper = tickToSqrtPrice(tickUpper);
  
  let amount0 = 0n;
  let amount1 = 0n;
  
  if (currentTick < tickLower) {
    // All in token0
    amount0 = (liquidity * Q96 * (sqrtPriceUpper - sqrtPriceLower)) / (sqrtPriceLower * sqrtPriceUpper);
  } else if (currentTick >= tickUpper) {
    // All in token1
    amount1 = liquidity * (sqrtPriceUpper - sqrtPriceLower) / Q96;
  } else {
    // Mixed
    amount0 = (liquidity * Q96 * (sqrtPriceUpper - sqrtPriceCurrent)) / (sqrtPriceCurrent * sqrtPriceUpper);
    amount1 = liquidity * (sqrtPriceCurrent - sqrtPriceLower) / Q96;
  }
  
  return { amount0, amount1 };
}

function tickToSqrtPrice(tick) {
  // sqrtPrice = 1.0001^(tick/2) * 2^96
  const absTick = Math.abs(tick);
  let ratio = absTick & 0x1 ? 0xfffcb933bd6fad37aa2d162d1a594001n : 0x100000000000000000000000000000000n;
  if (absTick & 0x2) ratio = (ratio * 0xfff97272373d413259a46990580e213an) >> 128n;
  if (absTick & 0x4) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n;
  if (absTick & 0x8) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n;
  if (absTick & 0x10) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644n) >> 128n;
  if (absTick & 0x20) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n;
  if (absTick & 0x40) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n;
  if (absTick & 0x80) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n;
  if (absTick & 0x100) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n;
  if (absTick & 0x200) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n;
  if (absTick & 0x400) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n;
  if (absTick & 0x800) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n;
  if (absTick & 0x1000) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n;
  if (absTick & 0x2000) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n;
  if (absTick & 0x4000) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n;
  if (absTick & 0x8000) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6n) >> 128n;
  if (absTick & 0x10000) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n;
  if (absTick & 0x20000) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604n) >> 128n;
  if (absTick & 0x40000) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98n) >> 128n;
  if (absTick & 0x80000) ratio = (ratio * 0x48a170391f7dc42444e8fa2n) >> 128n;
  
  if (tick > 0) ratio = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn / ratio;
  
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

function getDecimals(addr) {
  const map = {
    '0x1d80c49bbbcd1c0911346656b529df9e5c2f783d': 18, // WFLR
    '0x12e605bc104e93b45e1ad99f9e555f659051c2bb': 18, // sFLR
    '0xad552a648c74d49e10027ab8a618a3ad4901c5be': 6,  // FXRP
    '0xe7cd86e13ac4309349f30b3435a9d337750fc82d': 6,  // USDT0
    '0x6cd3a5ba46fa254d4d2e3c2b37350ae337e94a0f': 18, // CDP
    '0x4c18ff3c89632c3dd62e796c0afa5c07c4c1b2b3': 6,  // stXRP
  };
  return map[addr.toLowerCase()] || 18;
}

function getSymbol(addr) {
  const map = {
    '0x1d80c49bbbcd1c0911346656b529df9e5c2f783d': 'WFLR',
    '0x12e605bc104e93b45e1ad99f9e555f659051c2bb': 'sFLR',
    '0xad552a648c74d49e10027ab8a618a3ad4901c5be': 'FXRP',
    '0xe7cd86e13ac4309349f30b3435a9d337750fc82d': 'USDT0',
    '0x6cd3a5ba46fa254d4d2e3c2b37350ae337e94a0f': 'CDP',
    '0x4c18ff3c89632c3dd62e796c0afa5c07c4c1b2b3': 'stXRP',
    '0x194726f6c2ae988f1ab5e1c943c17e591a6f6059': 'BANK',
  };
  return map[addr.toLowerCase()] || addr.slice(0, 6);
}

async function getV2LPPositions(provider, address, prices) {
  const v2lps = { positions: [], totalValueUSD: 0 };
  
  const pairAbi = [
    'function balanceOf(address) view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function getReserves() view returns (uint112, uint112, uint32)',
    'function token0() view returns (address)',
    'function token1() view returns (address)',
  ];
  
  for (const [name, lp] of Object.entries(V2_LP_TOKENS)) {
    try {
      const pair = new ethers.Contract(lp.address, pairAbi, provider);
      const [balance, totalSupply, reserves] = await Promise.all([
        pair.balanceOf(address),
        pair.totalSupply(),
        pair.getReserves(),
      ]);
      
      if (balance > 0n) {
        const share = Number(balance) / Number(totalSupply);
        
        // Get token decimals
        const decimals0 = lp.token0 === 'BANK' ? 18 : (TOKENS[lp.token0]?.decimals || 18);
        const decimals1 = lp.token1 === 'WFLR' ? 18 : (TOKENS[lp.token1]?.decimals || 18);
        
        const reserve0 = parseFloat(ethers.formatUnits(reserves[0], decimals0));
        const reserve1 = parseFloat(ethers.formatUnits(reserves[1], decimals1));
        
        const myAmount0 = reserve0 * share;
        const myAmount1 = reserve1 * share;
        
        // Price BANK as 0 for now (no FTSO feed), WFLR has price
        const price0 = prices[lp.token0] || 0;
        const price1 = prices[lp.token1] || prices.FLR || 0;
        
        const valueUSD = myAmount0 * price0 + myAmount1 * price1;
        v2lps.totalValueUSD += valueUSD;
        
        v2lps.positions.push({
          name,
          lpTokens: parseFloat(ethers.formatEther(balance)),
          token0: lp.token0,
          token1: lp.token1,
          amount0: myAmount0,
          amount1: myAmount1,
          valueUSD,
        });
      }
    } catch (e) {}
  }
  
  return v2lps;
}

function getBaseToken(token) {
  const map = { 
    WFLR: 'FLR', 
    sFLR: 'FLR', 
    rFLR: 'FLR',
    FXRP: 'XRP', 
    stXRP: 'XRP', 
    earnXRP: 'XRP',
    'PT-stXRP': 'XRP',  // PT trades at ~95% of underlying
    'YT-stXRP': 'XRP',  // YT has yield value
    'PT-sFLR': 'FLR',
    CDP: 'USD',
    USDT0: 'USD',
    USDCe: 'USD',
  };
  return map[token] || token;
}

function formatNum(n, dec = 2) {
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(2) + 'K';
  return n.toFixed(dec).replace(/\.?0+$/, '') || '0';
}

main().catch(console.error);
