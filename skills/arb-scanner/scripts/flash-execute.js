#!/usr/bin/env node
/**
 * Execute flash arbitrage via FlashArb contract
 * 
 * Usage:
 *   node flash-execute.js --pool <addr> --token <addr> --amount <n> --mid <addr> --router1 <addr> --fee1 <n> --router2 <addr> --fee2 <n>
 *   node flash-execute.js --auto   # Execute pending alert automatically
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC_URL = 'https://flare-api.flare.network/ext/C/rpc';
const KEYSTORE_PATH = '/home/node/clawd/skills/fblpmanager/data/clawd-wallet.json';
const DEPLOYMENT_PATH = path.join(__dirname, '..', 'contracts', 'deployment.json');
const PENDING_ALERT_FILE = path.join(__dirname, '..', 'data', 'pending-alert.json');

// Routers
const ENOSYS_ROUTER = '0x5FD34090E9b195d8482Ad3CC63dB078534F1b113';
const SPARK_ROUTER = '0x8a1E35F5c98C4E85B36B7B253222eE17773b2781';

// Common tokens
const TOKENS = {
  WFLR:  '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d',
  sFLR:  '0x12e605bc104e93B45e1aD99F9e555f659051c2BB',
  FXRP:  '0xAd552A648C74D49E10027AB8a618A3ad4901c5bE',
  USDT0: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D',
  USDCe: '0xfbda5f676cb37624f28265a144a48b0d6e87d3b6',
};

// V3 Pool addresses (flash borrow sources)
const POOLS = {
  'WFLR/FXRP_3000': '0xb4CB11a84CFbd8F6336Dc9417aC45c1F8E5B59E7',
  'WFLR/USDT0_3000': '0x619369b93f68BB97dD7e685BA592381F2D5B884d',
  'WFLR/sFLR_3000': '0x46Ff03Da3081e5976eEFF542Cdaa6453D2dD1286',
};

const FLASHARB_ABI = [
  'function executeArb((address flashPool, address tokenBorrow, uint256 borrowAmount, address router1, address tokenMid, uint24 fee1, address router2, uint24 fee2, uint256 minProfit) params)',
  'function approveToken(address token, address router)',
  'function withdraw(address token)',
  'function owner() view returns (address)'
];

async function loadContract() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const keystore = JSON.parse(fs.readFileSync(KEYSTORE_PATH, 'utf8'));
  const wallet = new ethers.Wallet(keystore.privateKey, provider);
  
  const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, 'utf8'));
  const contract = new ethers.Contract(deployment.address, FLASHARB_ABI, wallet);
  
  return { contract, wallet, provider };
}

async function executeFlashArb(params) {
  const { contract, wallet } = await loadContract();
  
  console.log('\n📊 Flash Arbitrage');
  console.log('   Contract:', await contract.getAddress());
  console.log('   Wallet:', wallet.address);
  console.log('   Borrow:', ethers.formatEther(params.borrowAmount), 'tokens');
  console.log('   Min profit:', ethers.formatEther(params.minProfit));
  
  console.log('\n🔄 Executing flash arb...');
  
  try {
    const tx = await contract.executeArb(params, {
      gasLimit: 1000000 // Higher limit for complex tx
    });
    console.log('   Tx:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('   ✅ Success! Block:', receipt.blockNumber);
    console.log('   Gas used:', receipt.gasUsed.toString());
    
    // Check for ArbExecuted event
    for (const log of receipt.logs) {
      // Parse events...
    }
    
    return { success: true, hash: receipt.hash };
  } catch (e) {
    if (e.message.includes('Insufficient profit')) {
      console.log('   ⚠️ Reverted: No profit available (this is safe!)');
    } else {
      console.log('   ❌ Error:', e.message.slice(0, 100));
    }
    return { success: false, error: e.message };
  }
}

async function approveTokens() {
  const { contract } = await loadContract();
  
  console.log('Approving tokens...');
  
  for (const [name, addr] of Object.entries(TOKENS)) {
    console.log(`  ${name}...`);
    try {
      let tx = await contract.approveToken(addr, ENOSYS_ROUTER);
      await tx.wait();
      tx = await contract.approveToken(addr, SPARK_ROUTER);
      await tx.wait();
      console.log(`    ✅ Approved`);
    } catch (e) {
      console.log(`    ❌ ${e.message.slice(0, 50)}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.length === 0) {
    console.log(`
Flash Arbitrage Executor
========================

Commands:
  --approve              Approve all tokens for routers
  --test                 Test with minimal amounts
  --execute <params>     Execute specific arb

Example:
  node flash-execute.js --approve
  node flash-execute.js --test

Contract: ${JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, 'utf8')).address}
`);
    return;
  }
  
  if (args.includes('--approve')) {
    await approveTokens();
    return;
  }
  
  if (args.includes('--test')) {
    // Test with small amount: Borrow WFLR, swap to FXRP on Enosys, back on SparkDex
    const params = {
      flashPool: POOLS['WFLR/FXRP_3000'],
      tokenBorrow: TOKENS.WFLR,
      borrowAmount: ethers.parseEther('10'), // Small test
      router1: ENOSYS_ROUTER,
      tokenMid: TOKENS.FXRP,
      fee1: 3000,
      router2: SPARK_ROUTER,
      fee2: 3000,
      minProfit: 0 // Allow any profit for test
    };
    
    await executeFlashArb(params);
    return;
  }
}

module.exports = { executeFlashArb, loadContract };

if (require.main === module) {
  main().catch(console.error);
}
