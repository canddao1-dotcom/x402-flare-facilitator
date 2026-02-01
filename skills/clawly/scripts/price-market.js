#!/usr/bin/env node
/**
 * CLI for ClawlyPriceMarketV3 interactions
 * 
 * Usage:
 *   node price-market.js create FLR 0.015 ABOVE 3600 1
 *   node price-market.js predict <marketId> 65
 *   node price-market.js resolve <marketId>
 *   node price-market.js claim <marketId>
 *   node price-market.js market <marketId>
 *   node price-market.js price <marketId>
 *   node price-market.js list
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Load deployment
const deployment = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../deployments/flare-price-v3.json'))
);

const CONTRACT = deployment.contract;
const USDT = deployment.usdt;
const RPC = 'https://flare-api.flare.network/ext/C/rpc';

const ABI = [
  'function createPriceMarket(string symbol, uint256 targetPrice, int8 targetDecimals, uint8 direction, uint256 settlementTime, uint256 seedAmount) external',
  'function predict(bytes32 marketId, uint256 pYes) external',
  'function resolve(bytes32 marketId) external',
  'function claim(bytes32 marketId) external',
  'function getMarket(bytes32 marketId) external view returns (string symbol, uint256 targetPrice, uint8 direction, uint256 settlementTime, uint256 potAmount, uint256 predictionCount, bool resolved, bool outcome, uint256 settledPrice)',
  'function getCurrentPrice(bytes32 marketId) external view returns (uint256 price, int8 decimals, uint64 timestamp)',
  'function canResolve(bytes32 marketId) external view returns (bool)',
  'function allMarkets(uint256) external view returns (bytes32)',
  'function feedIds(string) external view returns (bytes21)',
  'event PriceMarketCreated(bytes32 indexed marketId, string symbol, uint256 targetPrice, uint8 direction, uint256 settlementTime)'
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)'
];

async function getProvider() {
  return new ethers.JsonRpcProvider(RPC);
}

async function getSigner() {
  const provider = await getProvider();
  const key = process.env.PRIVATE_KEY;
  if (!key) throw new Error('Set PRIVATE_KEY env var');
  return new ethers.Wallet(key, provider);
}

async function create(symbol, targetPrice, direction, durationSeconds, seedAmount) {
  const signer = await getSigner();
  const contract = new ethers.Contract(CONTRACT, ABI, signer);
  const usdt = new ethers.Contract(USDT, ERC20_ABI, signer);
  
  const dirEnum = direction.toUpperCase() === 'ABOVE' ? 0 : 1;
  const settlementTime = Math.floor(Date.now() / 1000) + parseInt(durationSeconds);
  const seedWei = ethers.parseUnits(seedAmount.toString(), 6);
  const priceWei = Math.floor(parseFloat(targetPrice) * 1e7); // FTSO uses 7 decimals
  
  console.log(`Creating ${symbol} ${direction} $${targetPrice} market...`);
  console.log(`Settlement: ${new Date(settlementTime * 1000).toISOString()}`);
  console.log(`Seed: ${seedAmount} USDT`);
  
  // Approve USDT
  const allowance = await usdt.allowance(signer.address, CONTRACT);
  if (allowance < seedWei) {
    console.log('Approving USDT...');
    const approveTx = await usdt.approve(CONTRACT, ethers.MaxUint256);
    await approveTx.wait();
  }
  
  // Create market
  const tx = await contract.createPriceMarket(
    symbol,
    priceWei,
    7, // FTSO decimals
    dirEnum,
    settlementTime,
    seedWei
  );
  
  console.log('Tx:', tx.hash);
  const receipt = await tx.wait();
  
  // Get market ID from event
  const event = receipt.logs.find(l => {
    try {
      return contract.interface.parseLog(l)?.name === 'PriceMarketCreated';
    } catch { return false; }
  });
  
  if (event) {
    const parsed = contract.interface.parseLog(event);
    console.log('✅ Market created!');
    console.log('Market ID:', parsed.args.marketId);
  }
}

async function predict(marketId, pYes) {
  const signer = await getSigner();
  const contract = new ethers.Contract(CONTRACT, ABI, signer);
  const usdt = new ethers.Contract(USDT, ERC20_ABI, signer);
  
  const entryFee = ethers.parseUnits('0.1', 6);
  
  // Approve
  const allowance = await usdt.allowance(signer.address, CONTRACT);
  if (allowance < entryFee) {
    console.log('Approving USDT...');
    const approveTx = await usdt.approve(CONTRACT, ethers.MaxUint256);
    await approveTx.wait();
  }
  
  console.log(`Predicting ${pYes}% YES on market ${marketId.slice(0, 10)}...`);
  const tx = await contract.predict(marketId, pYes);
  console.log('Tx:', tx.hash);
  await tx.wait();
  console.log('✅ Prediction submitted!');
}

async function resolve(marketId) {
  const signer = await getSigner();
  const contract = new ethers.Contract(CONTRACT, ABI, signer);
  
  const canResolve = await contract.canResolve(marketId);
  if (!canResolve) {
    console.log('❌ Cannot resolve yet (not past settlement time or already resolved)');
    return;
  }
  
  console.log('Resolving market...');
  const tx = await contract.resolve(marketId);
  console.log('Tx:', tx.hash);
  await tx.wait();
  console.log('✅ Market resolved!');
}

async function claim(marketId) {
  const signer = await getSigner();
  const contract = new ethers.Contract(CONTRACT, ABI, signer);
  
  console.log('Claiming payout...');
  const tx = await contract.claim(marketId);
  console.log('Tx:', tx.hash);
  await tx.wait();
  console.log('✅ Claimed!');
}

async function viewMarket(marketId) {
  const provider = await getProvider();
  const contract = new ethers.Contract(CONTRACT, ABI, provider);
  
  const m = await contract.getMarket(marketId);
  
  console.log('=== Market ===');
  console.log('ID:', marketId);
  console.log('Symbol:', m.symbol);
  console.log('Target:', Number(m.targetPrice) / 1e7, 'USD');
  console.log('Direction:', m.direction === 0n ? 'ABOVE' : 'BELOW');
  console.log('Settlement:', new Date(Number(m.settlementTime) * 1000).toISOString());
  console.log('Pot:', ethers.formatUnits(m.potAmount, 6), 'USDT');
  console.log('Predictions:', m.predictionCount.toString());
  console.log('Resolved:', m.resolved);
  if (m.resolved) {
    console.log('Outcome:', m.outcome ? 'YES' : 'NO');
    console.log('Settled Price:', Number(m.settledPrice) / 1e7, 'USD');
  }
}

async function getPrice(marketId) {
  const provider = await getProvider();
  const contract = new ethers.Contract(CONTRACT, ABI, provider);
  
  const [price, decimals, timestamp] = await contract.getCurrentPrice(marketId);
  
  console.log('Current FTSO Price:');
  console.log('  Price:', Number(price) / Math.pow(10, Number(decimals)), 'USD');
  console.log('  Raw:', price.toString());
  console.log('  Decimals:', decimals.toString());
  console.log('  Timestamp:', new Date(Number(timestamp) * 1000).toISOString());
}

async function listMarkets() {
  const provider = await getProvider();
  const contract = new ethers.Contract(CONTRACT, ABI, provider);
  
  console.log('=== Price Markets ===');
  console.log('Contract:', CONTRACT);
  
  let i = 0;
  while (true) {
    try {
      const marketId = await contract.allMarkets(i);
      const m = await contract.getMarket(marketId);
      
      console.log(`\n[${i}] ${m.symbol} ${m.direction === 0n ? '>' : '<'} $${(Number(m.targetPrice) / 1e7).toFixed(6)}`);
      console.log(`    ID: ${marketId.slice(0, 20)}...`);
      console.log(`    Pot: ${ethers.formatUnits(m.potAmount, 6)} USDT | Preds: ${m.predictionCount}`);
      console.log(`    Status: ${m.resolved ? (m.outcome ? 'YES ✓' : 'NO ✗') : 'Active'}`);
      
      i++;
    } catch {
      break;
    }
  }
  
  if (i === 0) {
    console.log('No markets found.');
  } else {
    console.log(`\nTotal: ${i} markets`);
  }
}

// CLI
const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'create':
    // create FLR 0.015 ABOVE 3600 1
    create(args[0], args[1], args[2], args[3], args[4]).catch(console.error);
    break;
  case 'predict':
    predict(args[0], parseInt(args[1])).catch(console.error);
    break;
  case 'resolve':
    resolve(args[0]).catch(console.error);
    break;
  case 'claim':
    claim(args[0]).catch(console.error);
    break;
  case 'market':
    viewMarket(args[0]).catch(console.error);
    break;
  case 'price':
    getPrice(args[0]).catch(console.error);
    break;
  case 'list':
    listMarkets().catch(console.error);
    break;
  default:
    console.log(`
Clawly Price Market CLI

Usage:
  create <symbol> <targetPrice> <ABOVE|BELOW> <durationSeconds> <seedUSDT>
  predict <marketId> <pYes 1-99>
  resolve <marketId>
  claim <marketId>
  market <marketId>
  price <marketId>
  list

Examples:
  node price-market.js create FLR 0.015 ABOVE 3600 1
  node price-market.js predict 0x123... 65
  node price-market.js resolve 0x123...
  node price-market.js list
`);
}
