#!/usr/bin/env node
/**
 * sFLR Arb Executor
 * 
 * Executes sFLR arbitrage strategies:
 * 1. STAKE-SELL: Stake FLR → Sell sFLR on DEX (instant profit when premium exists)
 * 2. BUY-REDEEM: Buy sFLR on DEX → Request withdrawal (profit after 14.5 days)
 * 
 * Usage:
 *   node sflr-executor.js quote <amount> [strategy]
 *   node sflr-executor.js execute <amount> <strategy> --keystore <path>
 */

const { ethers } = require('ethers');
const fs = require('fs');
const readline = require('readline');

// Config
const RPC = process.env.FLARE_RPC || 'https://flare-api.flare.network/ext/C/rpc';
const provider = new ethers.JsonRpcProvider(RPC);

// Tokens
const SFLR = '0x12e605bc104e93B45e1aD99F9e555f659051c2BB';
const WFLR = '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d';

// Sceptre
const SCEPTRE_ROUTER = '0xEcB4b9c9C6d33b4C5B98041DCEc84258bB04d233';

// SparkDex V3.1 (best venue for sFLR)
const SPARKDEX_ROUTER = '0x987e43992354D27919e590268441c3e1CBdf22aF';
const SPARKDEX_POOL = '0xc9baba3f36ccaa54675deecc327ec7eaa48cb97d';

// ABIs
const sflrAbi = [
  'function getPooledFlrByShares(uint256) view returns (uint256)',
  'function getSharesByPooledFlr(uint256) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function requestWithdrawal(uint256 amount) returns (uint256)'
];

const wflrAbi = [
  'function balanceOf(address) view returns (uint256)',
  'function deposit() payable',
  'function withdraw(uint256)',
  'function approve(address, uint256) returns (bool)'
];

const sceptreRouterAbi = [
  'function stake() payable returns (uint256)'
];

const poolAbi = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)',
  'function token0() view returns (address)'
];

// SparkDex V3.1 SwapRouter interface
const sparkdexRouterAbi = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)'
];

async function loadWallet(keystorePath) {
  const keystore = JSON.parse(fs.readFileSync(keystorePath, 'utf8'));
  
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const password = await new Promise(resolve => {
    rl.question('Keystore password: ', answer => {
      rl.close();
      resolve(answer);
    });
  });
  
  const wallet = await ethers.Wallet.fromEncryptedJson(JSON.stringify(keystore), password);
  return wallet.connect(provider);
}

async function getPoolPrice() {
  const pool = new ethers.Contract(SPARKDEX_POOL, poolAbi, provider);
  const [slot0, token0] = await Promise.all([pool.slot0(), pool.token0()]);
  
  const sqrtPriceX96 = slot0[0];
  const Q96 = BigInt(2) ** BigInt(96);
  const priceX192 = sqrtPriceX96 * sqrtPriceX96;
  const priceRaw = Number(priceX192) / Number(Q96 * Q96);
  
  const isSflrToken0 = token0.toLowerCase() === SFLR.toLowerCase();
  return isSflrToken0 ? priceRaw : 1 / priceRaw;  // sFLR per WFLR
}

async function getSceptreRates() {
  const sflr = new ethers.Contract(SFLR, sflrAbi, provider);
  const oneEther = ethers.parseEther('1');
  
  const [redemption, staking] = await Promise.all([
    sflr.getPooledFlrByShares(oneEther),
    sflr.getSharesByPooledFlr(oneEther)
  ]);
  
  return {
    redemptionRate: parseFloat(ethers.formatEther(redemption)),
    stakingRate: parseFloat(ethers.formatEther(staking))
  };
}

async function quoteStakeSell(flrAmount) {
  const sflr = new ethers.Contract(SFLR, sflrAbi, provider);
  const flrWei = ethers.parseEther(flrAmount.toString());
  
  // Step 1: FLR → sFLR via Sceptre
  const sflrReceived = await sflr.getSharesByPooledFlr(flrWei);
  
  // Step 2: sFLR → WFLR via SparkDex (estimate using pool price)
  const poolPrice = await getPoolPrice();
  const sflrFloat = parseFloat(ethers.formatEther(sflrReceived));
  const wflrEstimate = sflrFloat * poolPrice * 0.9999;  // 0.01% fee
  
  const profit = wflrEstimate - flrAmount;
  const profitPct = (profit / flrAmount) * 100;
  
  return {
    flrIn: flrAmount,
    sflrReceived: sflrFloat,
    wflrOut: wflrEstimate,
    profit,
    profitPct,
    poolPrice
  };
}

async function quoteBuyRedeem(flrAmount) {
  const sflr = new ethers.Contract(SFLR, sflrAbi, provider);
  
  // Step 1: WFLR → sFLR via SparkDex
  const poolPrice = await getPoolPrice();
  const sflrEstimate = (flrAmount / poolPrice) * 0.9999;  // 0.01% fee
  
  // Step 2: sFLR → FLR via Sceptre redemption
  const sflrWei = ethers.parseEther(sflrEstimate.toString());
  const flrRedeemed = await sflr.getPooledFlrByShares(sflrWei);
  const flrRedeemedFloat = parseFloat(ethers.formatEther(flrRedeemed));
  
  const profit = flrRedeemedFloat - flrAmount;
  const profitPct = (profit / flrAmount) * 100;
  const apy = profitPct * (365 / 14.5);
  
  return {
    flrIn: flrAmount,
    sflrBought: sflrEstimate,
    flrRedeemed: flrRedeemedFloat,
    profit,
    profitPct,
    apy,
    waitDays: 14.5
  };
}

async function executeStakeSell(wallet, flrAmount, slippagePct = 0.5) {
  console.log('\n🔄 Executing STAKE-SELL arb...\n');
  
  const flrWei = ethers.parseEther(flrAmount.toString());
  
  // Check FLR balance
  const balance = await provider.getBalance(wallet.address);
  if (balance < flrWei) {
    throw new Error(`Insufficient FLR. Have: ${ethers.formatEther(balance)}, Need: ${flrAmount}`);
  }
  
  // Step 1: Stake FLR on Sceptre
  console.log(`1️⃣ Staking ${flrAmount} FLR on Sceptre...`);
  const sceptreRouter = new ethers.Contract(SCEPTRE_ROUTER, sceptreRouterAbi, wallet);
  
  const stakeTx = await sceptreRouter.stake({ value: flrWei });
  console.log(`   Tx: ${stakeTx.hash}`);
  const stakeReceipt = await stakeTx.wait();
  console.log(`   ✅ Staked! Gas: ${stakeReceipt.gasUsed.toString()}`);
  
  // Get sFLR balance
  const sflrContract = new ethers.Contract(SFLR, sflrAbi, wallet);
  const sflrBalance = await sflrContract.balanceOf(wallet.address);
  console.log(`   Received: ${ethers.formatEther(sflrBalance)} sFLR\n`);
  
  // Step 2: Approve SparkDex router
  console.log('2️⃣ Approving SparkDex router...');
  const allowance = await sflrContract.allowance(wallet.address, SPARKDEX_ROUTER);
  if (allowance < sflrBalance) {
    const approveTx = await sflrContract.approve(SPARKDEX_ROUTER, ethers.MaxUint256);
    await approveTx.wait();
    console.log('   ✅ Approved\n');
  } else {
    console.log('   Already approved\n');
  }
  
  // Step 3: Swap sFLR → WFLR on SparkDex
  console.log(`3️⃣ Swapping ${ethers.formatEther(sflrBalance)} sFLR → WFLR on SparkDex V3.1...`);
  
  const poolPrice = await getPoolPrice();
  const expectedOut = parseFloat(ethers.formatEther(sflrBalance)) * poolPrice;
  const minOut = expectedOut * (1 - slippagePct / 100);
  const minOutWei = ethers.parseEther(minOut.toFixed(18));
  
  const sparkRouter = new ethers.Contract(SPARKDEX_ROUTER, sparkdexRouterAbi, wallet);
  
  const swapParams = {
    tokenIn: SFLR,
    tokenOut: WFLR,
    fee: 100,  // 0.01%
    recipient: wallet.address,
    deadline: Math.floor(Date.now() / 1000) + 300,  // 5 min
    amountIn: sflrBalance,
    amountOutMinimum: minOutWei,
    sqrtPriceLimitX96: 0
  };
  
  const swapTx = await sparkRouter.exactInputSingle(swapParams);
  console.log(`   Tx: ${swapTx.hash}`);
  const swapReceipt = await swapTx.wait();
  console.log(`   ✅ Swapped! Gas: ${swapReceipt.gasUsed.toString()}\n`);
  
  // Check final WFLR balance
  const wflr = new ethers.Contract(WFLR, wflrAbi, provider);
  const wflrBalance = await wflr.balanceOf(wallet.address);
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                    RESULT');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`   Input:   ${flrAmount} FLR`);
  console.log(`   Output:  ${ethers.formatEther(wflrBalance)} WFLR`);
  console.log(`   Profit:  ${(parseFloat(ethers.formatEther(wflrBalance)) - flrAmount).toFixed(6)} WFLR`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  return {
    input: flrAmount,
    output: parseFloat(ethers.formatEther(wflrBalance)),
    txHashes: [stakeTx.hash, swapTx.hash]
  };
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'quote') {
    const amount = parseFloat(args[1]) || 100;
    const strategy = args[2] || 'both';
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('              sFLR ARB QUOTE');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    const rates = await getSceptreRates();
    console.log(`📊 Sceptre Rates:`);
    console.log(`   Stake:  1 FLR → ${rates.stakingRate.toFixed(6)} sFLR`);
    console.log(`   Redeem: 1 sFLR → ${rates.redemptionRate.toFixed(6)} FLR\n`);
    
    if (strategy === 'stake-sell' || strategy === 'both') {
      const quote = await quoteStakeSell(amount);
      console.log(`💰 STAKE-SELL (${amount} FLR):`);
      console.log(`   ${quote.flrIn} FLR → ${quote.sflrReceived.toFixed(4)} sFLR → ${quote.wflrOut.toFixed(4)} WFLR`);
      console.log(`   Profit: ${quote.profit >= 0 ? '+' : ''}${quote.profit.toFixed(4)} WFLR (${quote.profitPct >= 0 ? '+' : ''}${quote.profitPct.toFixed(3)}%)`);
      console.log(`   Status: ${quote.profitPct > 0.1 ? '🟢 Profitable' : '⚪ Not profitable'}\n`);
    }
    
    if (strategy === 'buy-redeem' || strategy === 'both') {
      const quote = await quoteBuyRedeem(amount);
      console.log(`💰 BUY-REDEEM (${amount} FLR):`);
      console.log(`   ${quote.flrIn} FLR → ${quote.sflrBought.toFixed(4)} sFLR → ${quote.flrRedeemed.toFixed(4)} FLR`);
      console.log(`   Profit: ${quote.profit >= 0 ? '+' : ''}${quote.profit.toFixed(4)} FLR (${quote.profitPct >= 0 ? '+' : ''}${quote.profitPct.toFixed(3)}%)`);
      console.log(`   APY: ${quote.apy.toFixed(1)}% (over ${quote.waitDays} days)`);
      console.log(`   Status: ${quote.apy > 20 ? '🟢 Profitable' : '⚪ Not profitable (need >20% APY)'}\n`);
    }
    
  } else if (command === 'execute') {
    const amount = parseFloat(args[1]);
    const strategy = args[2];
    const keystoreIdx = args.indexOf('--keystore');
    const keystorePath = keystoreIdx !== -1 ? args[keystoreIdx + 1] : null;
    
    if (!amount || !strategy || !keystorePath) {
      console.log('Usage: sflr-executor.js execute <amount> <stake-sell|buy-redeem> --keystore <path>');
      process.exit(1);
    }
    
    const wallet = await loadWallet(keystorePath);
    console.log(`\n🔑 Wallet: ${wallet.address}\n`);
    
    if (strategy === 'stake-sell') {
      // Get quote first
      const quote = await quoteStakeSell(amount);
      console.log(`Quote: ${amount} FLR → ${quote.wflrOut.toFixed(4)} WFLR (${quote.profitPct >= 0 ? '+' : ''}${quote.profitPct.toFixed(3)}%)`);
      
      if (quote.profitPct < 0) {
        console.log('\n⚠️  Warning: This trade is not profitable at current prices!');
      }
      
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const confirm = await new Promise(resolve => {
        rl.question('\nProceed? (yes/no): ', answer => {
          rl.close();
          resolve(answer.toLowerCase() === 'yes');
        });
      });
      
      if (confirm) {
        await executeStakeSell(wallet, amount);
      } else {
        console.log('Cancelled');
      }
    } else if (strategy === 'buy-redeem') {
      console.log('BUY-REDEEM execution not yet implemented');
      console.log('(Requires: swap WFLR→sFLR, then call requestWithdrawal)');
    }
    
  } else {
    console.log('sFLR Arb Executor\n');
    console.log('Usage:');
    console.log('  node sflr-executor.js quote <amount> [stake-sell|buy-redeem|both]');
    console.log('  node sflr-executor.js execute <amount> <stake-sell|buy-redeem> --keystore <path>\n');
    console.log('Examples:');
    console.log('  node sflr-executor.js quote 1000');
    console.log('  node sflr-executor.js quote 1000 stake-sell');
    console.log('  node sflr-executor.js execute 1000 stake-sell --keystore wallet.json');
  }
}

main().catch(console.error);
