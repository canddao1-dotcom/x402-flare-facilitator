#!/usr/bin/env node
/**
 * sFLR Arbitrage Tool
 * 
 * Monitor and execute sFLR arbitrage between Sceptre and DEXs.
 * Key feature: Detect zero-fee staking windows for profitable STAKE-SELL arb.
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Config
const RPC = process.env.FLARE_RPC || 'https://flare-api.flare.network/ext/C/rpc';
const provider = new ethers.JsonRpcProvider(RPC);

// Contracts
const SFLR = '0x12e605bc104e93B45e1aD99F9e555f659051c2BB';
const WFLR = '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d';
const SPARKDEX_ROUTER = '0x8a1E35F5c98C4E85B36B7B253222eE17773b2781';
const SPARKDEX_POOL = '0xc9baba3f36ccaa54675deecc327ec7eaa48cb97d';
const ENOSYS_POOL = '0x25b4f3930934f0a3cbb885c624ecee75a2917144';
const BLAZESWAP_PAIR = '0x3F50F880041521738fa88C46cDF7e0d8Eeb11Aa2';

// Fee thresholds
const NORMAL_FEE = 0.044;  // 4.4% normal staking fee
const FEE_TOLERANCE = 0.005;  // Consider <0.5% as "zero fee"

// On-chain fee checking
async function getOnChainFee() {
  const sflr = new ethers.Contract(SFLR, [
    'function buyInStakingFee() view returns (uint256)',
    'function pendingBuyInFees() view returns (uint256)',
    'function mintingPaused() view returns (bool)'
  ], provider);
  
  const [buyInFee, pendingFees, mintingPaused] = await Promise.all([
    sflr.buyInStakingFee(),
    sflr.pendingBuyInFees(),
    sflr.mintingPaused()
  ]);
  
  const feePercent = parseFloat(ethers.formatEther(buyInFee));
  const isZeroFee = buyInFee === 0n;
  
  return {
    feeRaw: buyInFee.toString(),
    feePercent,
    isZeroFee,
    pendingFees: parseFloat(ethers.formatEther(pendingFees)),
    mintingPaused
  };
}

// Data paths
const DATA_DIR = path.join(__dirname, '..', 'data');
const FEE_HISTORY_FILE = path.join(DATA_DIR, 'fee-history.json');
const ALERTS_FILE = path.join(DATA_DIR, 'alerts.json');

// ABIs
const sflrAbi = [
  'function getPooledFlrByShares(uint256) view returns (uint256)',
  'function getSharesByPooledFlr(uint256) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address, uint256) returns (bool)',
  'function allowance(address, address) view returns (uint256)',
  'function totalPooledFlr() view returns (uint256)',
  'function totalSupply() view returns (uint256)'
];

const poolAbi = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)',
  'function liquidity() view returns (uint128)'
];

const pairAbi = [
  'function getReserves() view returns (uint112, uint112, uint32)',
  'function token0() view returns (address)'
];

const routerAbi = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256)'
];

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function getSceptreRates() {
  const sflr = new ethers.Contract(SFLR, sflrAbi, provider);
  const oneEther = ethers.parseEther('1');
  
  const [redemption, staking, totalPooled, totalSupply] = await Promise.all([
    sflr.getPooledFlrByShares(oneEther),
    sflr.getSharesByPooledFlr(oneEther),
    sflr.totalPooledFlr(),
    sflr.totalSupply()
  ]);
  
  return {
    redemptionRate: parseFloat(ethers.formatEther(redemption)),
    stakingRate: parseFloat(ethers.formatEther(staking)),  // This is BEFORE fee
    totalStaked: parseFloat(ethers.formatEther(totalPooled)),
    totalSupply: parseFloat(ethers.formatEther(totalSupply))
  };
}

async function getV3PoolPrice(poolAddr) {
  try {
    const pool = new ethers.Contract(poolAddr, poolAbi, provider);
    const slot0 = await pool.slot0();
    
    const sqrtPriceX96 = slot0[0];
    const Q96 = BigInt(2) ** BigInt(96);
    const priceX192 = sqrtPriceX96 * sqrtPriceX96;
    const price = Number(priceX192) / Number(Q96 * Q96);
    
    return price;  // sFLR/WFLR (how much WFLR per sFLR)
  } catch(e) {
    return null;
  }
}

async function getBlazeswapPrice() {
  const pair = new ethers.Contract(BLAZESWAP_PAIR, pairAbi, provider);
  const [reserves, token0] = await Promise.all([pair.getReserves(), pair.token0()]);
  
  const [r0, r1] = reserves;
  const isSflrToken0 = token0.toLowerCase() === SFLR.toLowerCase();
  const sflrReserve = isSflrToken0 ? r0 : r1;
  const wflrReserve = isSflrToken0 ? r1 : r0;
  
  // Spot price
  return parseFloat(ethers.formatEther(wflrReserve)) / parseFloat(ethers.formatEther(sflrReserve));
}

async function getAllPrices() {
  const [sceptre, sparkPrice, enosysPrice, blazePrice] = await Promise.all([
    getSceptreRates(),
    getV3PoolPrice(SPARKDEX_POOL),
    getV3PoolPrice(ENOSYS_POOL),
    getBlazeswapPrice()
  ]);
  
  return {
    sceptre,
    dex: {
      sparkdex: { price: sparkPrice, fee: 0.0001 },
      enosys: { price: enosysPrice, fee: 0.0005 },
      blazeswap: { price: blazePrice, fee: 0.003 }
    }
  };
}

function loadFeeHistory() {
  if (fs.existsSync(FEE_HISTORY_FILE)) {
    return JSON.parse(fs.readFileSync(FEE_HISTORY_FILE, 'utf8'));
  }
  return [];
}

function saveFeeHistory(history) {
  fs.writeFileSync(FEE_HISTORY_FILE, JSON.stringify(history.slice(-1000), null, 2));
}

function saveAlert(alert) {
  fs.writeFileSync(ALERTS_FILE, JSON.stringify({ ...alert, read: false }, null, 2));
}

async function checkCurrentFee() {
  // To detect the fee, we'd need to do a small test stake
  // For now, we estimate based on historical pattern
  const history = loadFeeHistory();
  
  if (history.length > 0) {
    const last = history[history.length - 1];
    return {
      estimatedFee: last.fee,
      lastChecked: last.timestamp,
      isZeroFee: last.fee < FEE_TOLERANCE
    };
  }
  
  return {
    estimatedFee: NORMAL_FEE,
    lastChecked: null,
    isZeroFee: false
  };
}

async function recordFeeObservation(flrSent, sflrReceived) {
  const sceptre = await getSceptreRates();
  const expectedSflr = flrSent * sceptre.stakingRate;
  const actualFee = 1 - (sflrReceived / expectedSflr);
  
  const history = loadFeeHistory();
  history.push({
    timestamp: Date.now(),
    flrSent,
    sflrReceived,
    expectedSflr,
    fee: actualFee,
    isZeroFee: actualFee < FEE_TOLERANCE
  });
  saveFeeHistory(history);
  
  return actualFee;
}

async function status() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('              sFLR ARBITRAGE STATUS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const [prices, onChainFee] = await Promise.all([
    getAllPrices(),
    getOnChainFee()
  ]);
  
  const feeStatus = {
    estimatedFee: onChainFee.feePercent,
    isZeroFee: onChainFee.isZeroFee,
    pendingFees: onChainFee.pendingFees,
    mintingPaused: onChainFee.mintingPaused
  };
  
  console.log('📊 SCEPTRE RATES');
  console.log(`   Redemption: 1 sFLR = ${prices.sceptre.redemptionRate.toFixed(6)} FLR`);
  console.log(`   Staking:    1 FLR  = ${prices.sceptre.stakingRate.toFixed(6)} sFLR (before fee)`);
  console.log(`   TVL: ${(prices.sceptre.totalStaked / 1e9).toFixed(3)}B FLR\n`);
  
  console.log('💰 STAKING FEE STATUS (ON-CHAIN)');
  console.log(`   buyInStakingFee: ${(feeStatus.estimatedFee * 100).toFixed(2)}%`);
  console.log(`   Zero-fee window: ${feeStatus.isZeroFee ? '🟢 YES! STAKE-SELL IS PROFITABLE!' : '🔴 NO'}`);
  console.log(`   Pending fees: ${feeStatus.pendingFees.toLocaleString()} FLR`);
  console.log(`   Minting paused: ${feeStatus.mintingPaused ? '⚠️ YES' : 'No'}`);
  console.log();
  
  console.log('💱 DEX PRICES (sFLR → WFLR)');
  const dexes = [
    { name: 'SparkDex V3.1 (0.01%)', price: prices.dex.sparkdex.price },
    { name: 'Enosys V3 (0.05%)', price: prices.dex.enosys.price },
    { name: 'Blazeswap V2 (0.3%)', price: prices.dex.blazeswap.price }
  ];
  
  for (const dex of dexes) {
    if (dex.price) {
      const premium = ((dex.price / prices.sceptre.redemptionRate - 1) * 100).toFixed(2);
      console.log(`   ${dex.name.padEnd(25)} ${dex.price.toFixed(6)} (${premium > 0 ? '+' : ''}${premium}%)`);
    }
  }
  
  const bestDex = dexes.filter(d => d.price).reduce((a, b) => a.price > b.price ? a : b);
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                 ARB OPPORTUNITIES');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // STAKE-SELL calculation
  const currentFee = feeStatus.estimatedFee;
  const stakeSellNoFee = prices.sceptre.stakingRate * bestDex.price;
  const stakeSellWithCurrentFee = prices.sceptre.stakingRate * (1 - currentFee) * bestDex.price;
  
  console.log('🔄 STAKE-SELL (instant)');
  console.log(`   Best venue: ${bestDex.name}`);
  console.log(`   If ZERO FEE:  1 FLR → ${stakeSellNoFee.toFixed(6)} WFLR (${((stakeSellNoFee - 1) * 100).toFixed(2)}%)`);
  console.log(`   With ${(currentFee * 100).toFixed(1)}% fee: 1 FLR → ${stakeSellWithCurrentFee.toFixed(6)} WFLR (${((stakeSellWithCurrentFee - 1) * 100).toFixed(2)}%)`);
  
  if (feeStatus.isZeroFee && !feeStatus.mintingPaused) {
    console.log(`   Status: 🟢 PROFITABLE! ZERO FEE ACTIVE!`);
  } else if (feeStatus.mintingPaused) {
    console.log(`   Status: ⚠️ MINTING PAUSED - cannot stake`);
  } else {
    console.log(`   Status: ⚪ Wait for zero-fee window (fee = ${(currentFee * 100).toFixed(1)}%)`);
  }
  console.log();
  
  // BUY-REDEEM calculation
  const buyPrice = bestDex.price * (1 + 0.001);  // Slippage estimate
  const buyRedeemReturn = prices.sceptre.redemptionRate / buyPrice;
  const buyRedeemAPY = (buyRedeemReturn - 1) * (365 / 14.5) * 100;
  
  console.log('🔄 BUY-REDEEM (14.5 day wait)');
  console.log(`   Buy on DEX → Redeem on Sceptre`);
  console.log(`   Return: ${buyRedeemReturn.toFixed(6)} FLR per 1 FLR`);
  console.log(`   APY: ${buyRedeemAPY.toFixed(1)}%`);
  console.log(`   Status: ${buyRedeemAPY > 20 ? '🟢 Profitable' : '⚪ Need bigger discount'}\n`);
  
  console.log('═══════════════════════════════════════════════════════════\n');
  
  return { prices, feeStatus };
}

async function stakeSell(wallet, amount) {
  console.log(`\n🔄 Executing STAKE-SELL with ${amount} FLR...\n`);
  
  const sflr = new ethers.Contract(SFLR, sflrAbi, wallet);
  const wflr = new ethers.Contract(WFLR, ['function balanceOf(address) view returns (uint256)'], provider);
  
  // Get initial balances
  const sflrBefore = await sflr.balanceOf(wallet.address);
  const wflrBefore = await wflr.balanceOf(wallet.address);
  
  // Step 1: Stake FLR
  console.log('1️⃣ Staking FLR on Sceptre...');
  const stakeTx = await wallet.sendTransaction({
    to: SFLR,
    value: ethers.parseEther(amount.toString()),
    gasLimit: 300000
  });
  console.log(`   Tx: ${stakeTx.hash}`);
  await stakeTx.wait();
  
  const sflrAfterStake = await sflr.balanceOf(wallet.address);
  const sflrReceived = sflrAfterStake - sflrBefore;
  console.log(`   ✅ Received: ${ethers.formatEther(sflrReceived)} sFLR`);
  
  // Record the fee observation
  const observedFee = await recordFeeObservation(amount, parseFloat(ethers.formatEther(sflrReceived)));
  console.log(`   Fee observed: ${(observedFee * 100).toFixed(2)}%\n`);
  
  // Step 2: Approve SparkDex
  console.log('2️⃣ Approving SparkDex...');
  const allowance = await sflr.allowance(wallet.address, SPARKDEX_ROUTER);
  if (allowance < sflrReceived) {
    const approveTx = await sflr.approve(SPARKDEX_ROUTER, ethers.MaxUint256);
    await approveTx.wait();
    console.log('   ✅ Approved\n');
  } else {
    console.log('   Already approved\n');
  }
  
  // Step 3: Swap on SparkDex
  console.log('3️⃣ Swapping sFLR → WFLR on SparkDex V3.1...');
  const sparkRouter = new ethers.Contract(SPARKDEX_ROUTER, routerAbi, wallet);
  
  const sflrFloat = parseFloat(ethers.formatEther(sflrReceived));
  const minOut = ethers.parseEther((sflrFloat * 1.74).toFixed(18));  // Conservative min
  
  const swapTx = await sparkRouter.exactInputSingle({
    tokenIn: SFLR,
    tokenOut: WFLR,
    fee: 100,
    recipient: wallet.address,
    deadline: Math.floor(Date.now() / 1000) + 300,
    amountIn: sflrReceived,
    amountOutMinimum: minOut,
    sqrtPriceLimitX96: 0
  }, { gasLimit: 500000 });
  
  console.log(`   Tx: ${swapTx.hash}`);
  await swapTx.wait();
  
  const wflrAfter = await wflr.balanceOf(wallet.address);
  const wflrReceived = wflrAfter - wflrBefore;
  
  console.log(`   ✅ Received: ${ethers.formatEther(wflrReceived)} WFLR\n`);
  
  const netPnl = parseFloat(ethers.formatEther(wflrReceived)) - amount;
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                      RESULT');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`   FLR in:    ${amount}`);
  console.log(`   WFLR out:  ${parseFloat(ethers.formatEther(wflrReceived)).toFixed(6)}`);
  console.log(`   Net P&L:   ${netPnl >= 0 ? '+' : ''}${netPnl.toFixed(6)} (${((netPnl / amount) * 100).toFixed(2)}%)`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  return { wflrReceived: parseFloat(ethers.formatEther(wflrReceived)), netPnl, observedFee };
}

async function stake(wallet, amount) {
  console.log(`\n🔄 Staking ${amount} FLR on Sceptre...\n`);
  
  const sflr = new ethers.Contract(SFLR, sflrAbi, wallet);
  const sceptre = await getSceptreRates();
  
  // Get initial balance
  const sflrBefore = await sflr.balanceOf(wallet.address);
  const flrBefore = await provider.getBalance(wallet.address);
  
  console.log('BEFORE:');
  console.log(`  FLR:  ${parseFloat(ethers.formatEther(flrBefore)).toFixed(4)}`);
  console.log(`  sFLR: ${parseFloat(ethers.formatEther(sflrBefore)).toFixed(4)}\n`);
  
  console.log(`Expected (no fee): ${(amount * sceptre.stakingRate).toFixed(4)} sFLR`);
  console.log(`Expected (4.4% fee): ${(amount * sceptre.stakingRate * 0.956).toFixed(4)} sFLR\n`);
  
  // Stake by sending FLR directly to sFLR contract
  console.log('Sending FLR to sFLR contract...');
  const tx = await wallet.sendTransaction({
    to: SFLR,
    value: ethers.parseEther(amount.toString()),
    gasLimit: 300000
  });
  console.log(`Tx: ${tx.hash}`);
  
  const receipt = await tx.wait();
  console.log(`✅ Confirmed! Block: ${receipt.blockNumber}, Gas: ${receipt.gasUsed}\n`);
  
  // Get final balances
  const sflrAfter = await sflr.balanceOf(wallet.address);
  const flrAfter = await provider.getBalance(wallet.address);
  const sflrReceived = sflrAfter - sflrBefore;
  
  console.log('AFTER:');
  console.log(`  FLR:  ${parseFloat(ethers.formatEther(flrAfter)).toFixed(4)}`);
  console.log(`  sFLR: ${parseFloat(ethers.formatEther(sflrAfter)).toFixed(4)}\n`);
  
  // Calculate actual fee
  const expectedNoFee = amount * sceptre.stakingRate;
  const actualReceived = parseFloat(ethers.formatEther(sflrReceived));
  const observedFee = 1 - (actualReceived / expectedNoFee);
  
  // Record fee observation
  await recordFeeObservation(amount, actualReceived);
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                      RESULT');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  FLR staked:     ${amount}`);
  console.log(`  sFLR received:  ${actualReceived.toFixed(6)}`);
  console.log(`  Effective rate: ${(actualReceived / amount).toFixed(6)} sFLR/FLR`);
  console.log(`  Fee observed:   ${(observedFee * 100).toFixed(2)}%`);
  console.log(`  Fee window:     ${observedFee < FEE_TOLERANCE ? '🟢 ZERO FEE!' : '🔴 Normal fee'}`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  return { sflrReceived: actualReceived, observedFee, txHash: tx.hash };
}

async function requestRedeem(wallet, amount) {
  console.log(`\n🔄 Requesting unlock of ${amount} sFLR from Sceptre...`);
  
  const sflr = new ethers.Contract(SFLR, [
    'function balanceOf(address) view returns (uint256)',
    'function requestUnlock(uint256 shareAmount) external',
    'function getUnlockRequestCount(address) view returns (uint256)',
    'function getPooledFlrByShares(uint256) view returns (uint256)'
  ], wallet);
  
  const sflrBalance = await sflr.balanceOf(wallet.address);
  const amountWei = ethers.parseEther(amount.toString());
  
  console.log(`\nBEFORE:`);
  console.log(`  sFLR balance: ${parseFloat(ethers.formatEther(sflrBalance)).toFixed(4)}`);
  
  if (amountWei > sflrBalance) {
    console.log(`❌ Insufficient sFLR. Have ${ethers.formatEther(sflrBalance)}, need ${amount}`);
    return;
  }
  
  // Calculate expected FLR return
  const expectedFlr = await sflr.getPooledFlrByShares(amountWei);
  console.log(`  Expected FLR return: ${parseFloat(ethers.formatEther(expectedFlr)).toFixed(4)}`);
  console.log(`  Unstaking period: 14.5 days`);
  
  const countBefore = await sflr.getUnlockRequestCount(wallet.address);
  console.log(`  Current unlock requests: ${countBefore}`);
  
  console.log(`\nSending unlock request...`);
  const tx = await sflr.requestUnlock(amountWei);
  console.log(`Tx: ${tx.hash}`);
  
  const receipt = await tx.wait();
  console.log(`✅ Request confirmed! Block: ${receipt.blockNumber}, Gas: ${receipt.gasUsed}`);
  
  // Get new count to confirm
  const countAfter = await sflr.getUnlockRequestCount(wallet.address);
  const requestIndex = Number(countAfter) - 1;
  
  console.log(`\n📋 Unlock Request Created!`);
  console.log(`   Request index: ${requestIndex}`);
  console.log(`   Claimable in ~14.5 days`);
  
  // Save to file
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const requestsFile = path.join(dataDir, 'unlock-requests.json');
  let requests = [];
  if (fs.existsSync(requestsFile)) {
    requests = JSON.parse(fs.readFileSync(requestsFile, 'utf8'));
  }
  requests.push({
    index: requestIndex,
    amount: amount.toString(),
    expectedFlr: ethers.formatEther(expectedFlr),
    timestamp: new Date().toISOString(),
    claimableAfter: new Date(Date.now() + 14.5 * 24 * 60 * 60 * 1000).toISOString(),
    txHash: tx.hash
  });
  fs.writeFileSync(requestsFile, JSON.stringify(requests, null, 2));
  console.log(`   Saved to ${requestsFile}`);
  
  const newBalance = await sflr.balanceOf(wallet.address);
  console.log(`\nAFTER:`);
  console.log(`  sFLR balance: ${parseFloat(ethers.formatEther(newBalance)).toFixed(4)}`);
}

async function claimRedeem(wallet, requestId) {
  console.log(`\n🔄 Claiming withdrawal request #${requestId}...`);
  
  const sflr = new ethers.Contract(SFLR, [
    'function claimWithdrawal(uint256 requestId) external'
  ], wallet);
  
  const flrBefore = await provider.getBalance(wallet.address);
  console.log(`\nFLR before: ${parseFloat(ethers.formatEther(flrBefore)).toFixed(4)}`);
  
  console.log(`\nSending claim...`);
  const tx = await sflr.claimWithdrawal(requestId);
  console.log(`Tx: ${tx.hash}`);
  
  const receipt = await tx.wait();
  console.log(`✅ Claimed! Block: ${receipt.blockNumber}, Gas: ${receipt.gasUsed}`);
  
  const flrAfter = await provider.getBalance(wallet.address);
  const received = flrAfter - flrBefore + receipt.gasUsed * receipt.gasPrice;
  console.log(`\nFLR after: ${parseFloat(ethers.formatEther(flrAfter)).toFixed(4)}`);
  console.log(`FLR received: ~${parseFloat(ethers.formatEther(received)).toFixed(4)}`);
}

async function listRequests() {
  const dataDir = path.join(__dirname, '..', 'data');
  const requestsFile = path.join(dataDir, 'withdrawal-requests.json');
  
  if (!fs.existsSync(requestsFile)) {
    console.log('No pending withdrawal requests.');
    return;
  }
  
  const requests = JSON.parse(fs.readFileSync(requestsFile, 'utf8'));
  console.log('\n📋 PENDING WITHDRAWAL REQUESTS\n');
  
  for (const req of requests) {
    const claimable = new Date(req.claimableAfter);
    const now = new Date();
    const ready = now >= claimable;
    
    console.log(`  Request #${req.requestId}`);
    console.log(`    Amount: ${req.amount} sFLR → ~${req.expectedFlr} FLR`);
    console.log(`    Submitted: ${req.timestamp}`);
    console.log(`    Claimable: ${req.claimableAfter} ${ready ? '✅ READY' : '⏳'}`);
    console.log('');
  }
}

async function monitor() {
  console.log('Starting sFLR monitor...\n');
  console.log('Checking every 60 seconds for zero-fee windows and arb opportunities.\n');
  
  const check = async () => {
    try {
      const result = await status();
      
      // Alert if zero-fee window detected
      if (result.feeStatus.isZeroFee) {
        console.log('🚨 ZERO-FEE WINDOW DETECTED! STAKE-SELL is profitable!\n');
        saveAlert({
          type: 'ZERO_FEE_WINDOW',
          timestamp: Date.now(),
          message: 'Zero-fee staking window detected! STAKE-SELL arb is profitable.'
        });
      }
      
      // Alert if big DEX discount for BUY-REDEEM
      const prices = result.prices;
      const bestPrice = Math.max(
        prices.dex.sparkdex?.price || 0,
        prices.dex.enosys?.price || 0,
        prices.dex.blazeswap?.price || 0
      );
      const discount = (1 - bestPrice / prices.sceptre.redemptionRate) * 100;
      
      if (discount > 4.5) {
        console.log(`🚨 BIG DISCOUNT: ${discount.toFixed(2)}% - BUY-REDEEM profitable!\n`);
        saveAlert({
          type: 'BUY_REDEEM_OPPORTUNITY',
          timestamp: Date.now(),
          discount,
          message: `sFLR trading at ${discount.toFixed(2)}% discount - BUY-REDEEM profitable!`
        });
      }
    } catch(e) {
      console.error('Check failed:', e.message);
    }
  };
  
  await check();
  setInterval(check, 60000);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';
  
  if (command === 'status') {
    await status();
  } else if (command === 'check-fee') {
    const feeStatus = await checkCurrentFee();
    console.log('Fee Status:', feeStatus);
  } else if (command === 'stake-sell') {
    const amountIdx = args.indexOf('--amount');
    const amount = amountIdx !== -1 ? parseFloat(args[amountIdx + 1]) : 100;
    
    const keystoreIdx = args.indexOf('--keystore');
    if (keystoreIdx === -1) {
      // Try loading from env or default location
      const pkPath = '/home/node/clawd/skills/fblpmanager/data/clawd-wallet.json';
      if (fs.existsSync(pkPath)) {
        const walletData = JSON.parse(fs.readFileSync(pkPath, 'utf8'));
        const wallet = new ethers.Wallet(walletData.privateKey, provider);
        await stakeSell(wallet, amount);
      } else {
        console.log('Usage: sflr.js stake-sell --amount 100 --keystore <path>');
      }
    }
  } else if (command === 'stake') {
    const amountIdx = args.indexOf('--amount');
    const amount = amountIdx !== -1 ? parseFloat(args[amountIdx + 1]) : 100;
    
    const pkPath = '/home/node/clawd/skills/fblpmanager/data/clawd-wallet.json';
    if (fs.existsSync(pkPath)) {
      const walletData = JSON.parse(fs.readFileSync(pkPath, 'utf8'));
      const wallet = new ethers.Wallet(walletData.privateKey, provider);
      await stake(wallet, amount);
    } else {
      console.log('Wallet not found. Set up keystore first.');
    }
  } else if (command === 'monitor') {
    await monitor();
  } else if (command === 'redeem' || command === 'request-redeem') {
    const amountIdx = args.indexOf('--amount');
    const amount = amountIdx !== -1 ? parseFloat(args[amountIdx + 1]) : null;
    
    if (!amount) {
      console.log('Usage: sflr.js redeem --amount <sFLR>');
      return;
    }
    
    const pkPath = '/home/node/clawd/skills/fblpmanager/data/clawd-wallet.json';
    if (fs.existsSync(pkPath)) {
      const walletData = JSON.parse(fs.readFileSync(pkPath, 'utf8'));
      const wallet = new ethers.Wallet(walletData.privateKey, provider);
      await requestRedeem(wallet, amount);
    } else {
      console.log('Wallet not found. Set up keystore first.');
    }
  } else if (command === 'claim') {
    const idIdx = args.indexOf('--id');
    const requestId = idIdx !== -1 ? args[idIdx + 1] : null;
    
    if (!requestId) {
      console.log('Usage: sflr.js claim --id <requestId>');
      return;
    }
    
    const pkPath = '/home/node/clawd/skills/fblpmanager/data/clawd-wallet.json';
    if (fs.existsSync(pkPath)) {
      const walletData = JSON.parse(fs.readFileSync(pkPath, 'utf8'));
      const wallet = new ethers.Wallet(walletData.privateKey, provider);
      await claimRedeem(wallet, requestId);
    } else {
      console.log('Wallet not found. Set up keystore first.');
    }
  } else if (command === 'requests' || command === 'pending') {
    await listRequests();
  } else {
    console.log('sFLR Arbitrage Tool\n');
    console.log('Commands:');
    console.log('  status      - Check current rates and opportunities');
    console.log('  check-fee   - Check if currently in zero-fee window');
    console.log('  stake       - Stake FLR to get sFLR (--amount <FLR>)');
    console.log('  stake-sell  - Execute stake-sell arb (--amount <FLR>)');
    console.log('  redeem      - Request unstaking (--amount <sFLR>)');
    console.log('  claim       - Claim unstaked FLR (--id <requestId>)');
    console.log('  requests    - List pending withdrawal requests');
    console.log('  monitor     - Watch for opportunities (daemon mode)');
  }
}

main().catch(console.error);
