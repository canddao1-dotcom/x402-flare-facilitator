#!/usr/bin/env node
/**
 * Triangle Arbitrage Executor
 * 
 * Uses existing swap scripts for execution (they work!)
 * 
 * Usage:
 *   node arb-executor.js execute              # Execute pending alert
 *   node arb-executor.js execute --amount 50  # Override amount
 */

const { execSync } = require('child_process');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC_URL = 'https://flare-api.flare.network/ext/C/rpc';
const KEYSTORE_PATH = '/home/node/clawd/skills/fblpmanager/data/clawd-wallet.json';
const PENDING_ALERT_FILE = path.join(__dirname, '..', 'data', 'pending-alert.json');
const EXECUTED_LOG = path.join(__dirname, '..', 'data', 'executed.json');

// Swap script paths
const SWAP_SCRIPTS = {
  v3: '/home/node/clawd/skills/wallet/scripts/swap-v3.js',
  sparkdex: '/home/node/clawd/skills/wallet/scripts/swap-sparkdex.js',
  blazeswap: '/home/node/clawd/skills/wallet/scripts/swap-blazeswap.js',
};

// Token decimals
const DECIMALS = {
  WFLR: 18, sFLR: 18, rFLR: 18,
  FXRP: 6, stXRP: 6,
  USDT0: 6, USDCe: 6,
  CDP: 18, BANK: 18, APS: 18,
  WETH: 18, WBTC: 8,
};

// Normalize token symbol
function normalizeToken(token) {
  const map = {
    'sflr': 'SFLR', 'sFLR': 'SFLR',
    'rflr': 'RFLR', 'rFLR': 'RFLR', 
    'stxrp': 'STXRP', 'stXRP': 'STXRP',
    'usdt0': 'USDT0', 'usdce': 'USDCE',
  };
  const upper = token.toUpperCase();
  return map[token] || map[upper] || upper;
}

// Execute a single swap leg using existing scripts
function executeLeg(step, amountIn, slippage = 3) {
  const from = normalizeToken(step.from);
  const to = normalizeToken(step.to);
  const dex = step.dex.toLowerCase();
  
  let script, args;
  
  if (dex.includes('blaze')) {
    // Blazeswap V2
    script = SWAP_SCRIPTS.blazeswap;
    args = `swap --keystore ${KEYSTORE_PATH} --from ${from} --to ${to} --amount ${amountIn} --slippage ${slippage}`;
  } else if (dex.includes('spark')) {
    // SparkDex V3.1
    script = SWAP_SCRIPTS.sparkdex;
    args = `swap --keystore ${KEYSTORE_PATH} --from ${from} --to ${to} --amount ${amountIn} --fee ${step.fee} --slippage ${slippage}`;
  } else {
    // Enosys V3 (default)
    script = SWAP_SCRIPTS.v3;
    args = `swap --keystore ${KEYSTORE_PATH} --from ${from} --to ${to} --amount ${amountIn} --fee ${step.fee} --slippage ${slippage}`;
  }
  
  console.log(`\n   🔄 ${from} → ${to} via ${dex}`);
  console.log(`      Amount: ${amountIn}`);
  console.log(`      Script: node ${path.basename(script)} ${args.split('--keystore')[0]}...`);
  
  try {
    const output = execSync(`node ${script} ${args}`, { 
      encoding: 'utf8',
      timeout: 120000,
      cwd: '/home/node/clawd'
    });
    console.log(output);
    
    // Extract tx hash from output
    const txMatch = output.match(/Tx: (0x[a-fA-F0-9]{64})/);
    return {
      success: true,
      hash: txMatch ? txMatch[1] : null,
      output
    };
  } catch (error) {
    console.error(`      ❌ Failed: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// Get current token balance
async function getBalance(provider, wallet, token) {
  const tokenAddr = {
    WFLR: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d',
    SFLR: '0x12e605bc104e93B45e1aD99F9e555f659051c2BB',
    FXRP: '0xAd552A648C74D49E10027AB8a618A3ad4901c5bE',
    USDT0: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D',
    USDCE: '0xfbda5f676cb37624f28265a144a48b0d6e87d3b6',
  }[token.toUpperCase()];
  
  if (!tokenAddr) return 0n;
  
  const contract = new ethers.Contract(tokenAddr, [
    'function balanceOf(address) view returns (uint256)'
  ], provider);
  
  return await contract.balanceOf(wallet);
}

// Execute full triangle
async function executeTriangle(alert, overrideAmount = null) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const keystore = JSON.parse(fs.readFileSync(KEYSTORE_PATH, 'utf8'));
  const wallet = new ethers.Wallet(keystore.privateKey, provider);
  const walletAddr = wallet.address;
  
  const route = alert.route;
  const startToken = normalizeToken(route[0].from);
  const startAmount = overrideAmount || 100;
  const decimals = DECIMALS[startToken] || 18;
  
  console.log(`\n📊 Triangle Arbitrage Execution`);
  console.log(`   Wallet: ${walletAddr}`);
  console.log(`   Path: ${alert.path.join(' → ')}`);
  console.log(`   Amount: ${startAmount} ${startToken}`);
  console.log(`   Expected profit: ${alert.profit.toFixed(2)}%`);
  
  // Check starting balance
  const startBalance = await getBalance(provider, walletAddr, startToken);
  const startBalanceFormatted = parseFloat(ethers.formatUnits(startBalance, decimals));
  console.log(`   Balance: ${startBalanceFormatted.toFixed(4)} ${startToken}`);
  
  if (startBalanceFormatted < startAmount) {
    throw new Error(`Insufficient balance: have ${startBalanceFormatted}, need ${startAmount}`);
  }
  
  // Execute each leg
  const results = [];
  let currentAmount = startAmount;
  
  for (let i = 0; i < route.length; i++) {
    const step = route[i];
    const toToken = normalizeToken(step.to);
    const toDecimals = DECIMALS[toToken] || 18;
    
    // Get balance before
    const beforeBal = await getBalance(provider, walletAddr, toToken);
    
    // Execute swap
    const result = executeLeg(step, currentAmount, 3);
    results.push(result);
    
    if (!result.success) {
      throw new Error(`Leg ${i + 1} failed: ${result.error}`);
    }
    
    // Get balance after to determine actual output
    await new Promise(r => setTimeout(r, 2000)); // Wait for state
    const afterBal = await getBalance(provider, walletAddr, toToken);
    const received = afterBal - beforeBal;
    currentAmount = parseFloat(ethers.formatUnits(received, toDecimals));
    
    console.log(`      ✅ Received: ${currentAmount.toFixed(6)} ${toToken}`);
  }
  
  // Calculate actual profit
  const profit = currentAmount - startAmount;
  const profitPct = (profit / startAmount) * 100;
  
  console.log(`\n🎉 Triangle Complete!`);
  console.log(`   Started: ${startAmount} ${startToken}`);
  console.log(`   Ended: ${currentAmount.toFixed(6)} ${startToken}`);
  console.log(`   Profit: ${profit.toFixed(6)} ${startToken} (${profitPct.toFixed(2)}%)`);
  
  return {
    success: true,
    results,
    startAmount,
    endAmount: currentAmount,
    profit,
    profitPct
  };
}

// Execute from alert file
async function executeAlert(overrideAmount = null) {
  if (!fs.existsSync(PENDING_ALERT_FILE)) {
    console.log('No pending alert file found');
    return null;
  }
  
  const alert = JSON.parse(fs.readFileSync(PENDING_ALERT_FILE, 'utf8'));
  
  if (alert.read) {
    console.log('Alert already processed');
    return null;
  }
  
  console.log(`\n🚨 Processing Alert`);
  console.log(`   Time: ${new Date(alert.timestamp).toISOString()}`);
  console.log(`   Expected Profit: ${alert.profit.toFixed(2)}%`);
  console.log(`   Path: ${alert.path.join(' → ')}`);
  
  // Mark as read immediately
  alert.read = true;
  fs.writeFileSync(PENDING_ALERT_FILE, JSON.stringify(alert, null, 2));
  
  try {
    const result = await executeTriangle(alert, overrideAmount);
    
    // Log success
    const log = {
      timestamp: Date.now(),
      alert,
      result: {
        success: true,
        profitPct: result.profitPct,
        txHashes: result.results.map(r => r.hash).filter(Boolean)
      }
    };
    appendLog(log);
    
    // Delete alert on success
    fs.unlinkSync(PENDING_ALERT_FILE);
    
    return result;
  } catch (error) {
    console.error(`\n❌ Execution failed: ${error.message}`);
    
    // Log failure
    const log = {
      timestamp: Date.now(),
      alert,
      result: { success: false, error: error.message }
    };
    appendLog(log);
    
    throw error;
  }
}

function appendLog(log) {
  let logs = [];
  if (fs.existsSync(EXECUTED_LOG)) {
    logs = JSON.parse(fs.readFileSync(EXECUTED_LOG, 'utf8'));
  }
  logs.push(log);
  // Keep last 100 entries
  if (logs.length > 100) logs = logs.slice(-100);
  fs.writeFileSync(EXECUTED_LOG, JSON.stringify(logs, null, 2));
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Triangle Arbitrage Executor
===========================

Uses existing swap scripts for reliable execution.

Commands:
  execute                    Execute pending alert (100 WFLR default)
  execute --amount <N>       Execute with custom amount

Examples:
  node arb-executor.js execute
  node arb-executor.js execute --amount 50

Alert File: ${PENDING_ALERT_FILE}
Log File: ${EXECUTED_LOG}
`);
    return;
  }
  
  if (args[0] === 'execute') {
    const amountIdx = args.indexOf('--amount');
    const amount = amountIdx !== -1 ? parseFloat(args[amountIdx + 1]) : null;
    await executeAlert(amount);
  } else {
    console.error(`Unknown command: ${args[0]}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  });
}
