#!/usr/bin/env node
/**
 * Mint V3 LP Position using ethers
 * 
 * Usage:
 *   node mint-v3.js \
 *     --keystore <path> \
 *     --pool <address> \
 *     --tick-lower <tick> \
 *     --tick-upper <tick> \
 *     --amount0 <amount> \
 *     --amount1 <amount> \
 *     [--dex enosys|sparkdex] \
 *     [--dry-run]
 */

const { ethers } = require('ethers');
const fs = require('fs');
const readline = require('readline');
const { execSync } = require('child_process');

const RPC_URL = 'https://flare-api.flare.network/ext/C/rpc';
const EXPLORER = 'https://flarescan.com';
const MEMORY_LOG = '/home/node/clawd/skills/memory/scripts/log.js';

// DEX Configurations
const DEX_CONFIGS = {
  enosys: {
    nftManager: '0xD9770b1C7A6ccd33C75b5bcB1c0078f46bE46657',
    factory: '0x17AA157AC8C54034381b840Cb8f6bf7Fc355f0de',
  },
  sparkdex: {
    nftManager: '0xbEEFA7FAb245B568183D5f67731487908630d801',
    factory: '0x8A2578d23d4C532cC9A98FaD91C0523f5efDE652',
  }
};

// Known tokens
const KNOWN_TOKENS = {
  'WFLR': { address: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d', decimals: 18 },
  'sFLR': { address: '0x12e605bc104e93B45e1aD99F9e555f659051c2BB', decimals: 18 },
  'SFLR': { address: '0x12e605bc104e93B45e1aD99F9e555f659051c2BB', decimals: 18 },
  'BANK': { address: '0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059', decimals: 18 },
  'FXRP': { address: '0xad552a648c74d49e10027ab8a618a3ad4901c5be', decimals: 6 },
  'USDT0': { address: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', decimals: 6 },
  'CDP': { address: '0x6Cd3a5Ba46FA254D4d2E3C2B37350ae337E94a0F', decimals: 18 },
};

// ABIs
const NFT_MANAGER_ABI = [
  'function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)'
];

const POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
  'function tickSpacing() view returns (int24)'
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)'
];

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : null;
  };
  return {
    keystore: get('--keystore'),
    pool: get('--pool'),
    tickLower: parseInt(get('--tick-lower')),
    tickUpper: parseInt(get('--tick-upper')),
    amount0: get('--amount0'),
    amount1: get('--amount1'),
    dex: get('--dex') || 'enosys',
    dryRun: args.includes('--dry-run'),
    yes: args.includes('--yes'),
    password: get('--password') || process.env.WALLET_PASSWORD,
  };
}

function findTokenSymbol(address) {
  const lower = address.toLowerCase();
  for (const [sym, info] of Object.entries(KNOWN_TOKENS)) {
    if (info.address.toLowerCase() === lower) return sym;
  }
  return address.slice(0, 8) + '...';
}

function getTokenDecimals(address) {
  const lower = address.toLowerCase();
  for (const info of Object.values(KNOWN_TOKENS)) {
    if (info.address.toLowerCase() === lower) return info.decimals;
  }
  return 18;
}

async function promptPassword() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('Enter keystore password: ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function logToMemory(action, details, tx) {
  try {
    const detailsEscaped = details.replace(/"/g, '\\"');
    const cmd = `node "${MEMORY_LOG}" --type TX --action "${action}" --details "${detailsEscaped}"${tx ? ` --tx "${tx}"` : ''}`;
    execSync(cmd, { encoding: 'utf8' });
  } catch (e) {
    console.error('⚠️ Memory log failed:', e.message);
  }
}

async function main() {
  const args = parseArgs();
  
  // Validate
  if (!args.pool || isNaN(args.tickLower) || isNaN(args.tickUpper) || !args.amount0 || !args.amount1) {
    console.error(`
Usage: node mint-v3.js \\
  --pool <address> \\
  --tick-lower <tick> \\
  --tick-upper <tick> \\
  --amount0 <amount> \\
  --amount1 <amount> \\
  [--dex enosys|sparkdex] \\
  [--keystore <path>] \\
  [--dry-run]
`);
    process.exit(1);
  }
  
  const dexConfig = DEX_CONFIGS[args.dex.toLowerCase()];
  if (!dexConfig) {
    console.error('❌ Unknown DEX:', args.dex);
    process.exit(1);
  }
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  console.log('\n🔍 Fetching pool info...');
  const poolContract = new ethers.Contract(args.pool, POOL_ABI, provider);
  
  const [slot0, token0, token1, fee, tickSpacing] = await Promise.all([
    poolContract.slot0(),
    poolContract.token0(),
    poolContract.token1(),
    poolContract.fee(),
    poolContract.tickSpacing()
  ]);
  
  const currentTick = Number(slot0.tick);
  const token0Symbol = findTokenSymbol(token0);
  const token1Symbol = findTokenSymbol(token1);
  const dec0 = getTokenDecimals(token0);
  const dec1 = getTokenDecimals(token1);
  const ts = Number(tickSpacing);
  
  // Adjust ticks to tick spacing
  let tickLower = args.tickLower;
  let tickUpper = args.tickUpper;
  
  if (tickLower % ts !== 0) {
    tickLower = Math.floor(tickLower / ts) * ts;
    console.log(`⚠️  Adjusted tickLower to ${tickLower} (tick spacing: ${ts})`);
  }
  if (tickUpper % ts !== 0) {
    tickUpper = Math.ceil(tickUpper / ts) * ts;
    console.log(`⚠️  Adjusted tickUpper to ${tickUpper} (tick spacing: ${ts})`);
  }
  
  const amount0Desired = ethers.parseUnits(args.amount0, dec0);
  const amount1Desired = ethers.parseUnits(args.amount1, dec1);
  
  console.log('\n' + '━'.repeat(55));
  console.log('📊 MINT V3 LP POSITION');
  console.log('━'.repeat(55));
  console.log(`Pool:        ${args.pool}`);
  console.log(`DEX:         ${args.dex.toUpperCase()}`);
  console.log(`Pair:        ${token0Symbol}/${token1Symbol}`);
  console.log(`Fee:         ${Number(fee) / 10000}%`);
  console.log(`Current:     tick ${currentTick}`);
  console.log('');
  console.log(`Range:       ${tickLower} → ${tickUpper}`);
  
  // Calculate approximate % range
  const priceLower = Math.pow(1.0001, tickLower);
  const priceUpper = Math.pow(1.0001, tickUpper);
  const priceCurrent = Math.pow(1.0001, currentTick);
  const rangePctLower = ((priceCurrent - priceLower) / priceCurrent * 100).toFixed(1);
  const rangePctUpper = ((priceUpper - priceCurrent) / priceCurrent * 100).toFixed(1);
  console.log(`             -${rangePctLower}% / +${rangePctUpper}% from current`);
  console.log('');
  console.log(`Amount0:     ${args.amount0} ${token0Symbol}`);
  console.log(`Amount1:     ${args.amount1} ${token1Symbol}`);
  console.log('━'.repeat(55));
  
  // Check if in range
  if (currentTick < tickLower) {
    console.log('\n⚠️  Current tick BELOW range - only token1 will be deposited');
  } else if (currentTick > tickUpper) {
    console.log('\n⚠️  Current tick ABOVE range - only token0 will be deposited');
  } else {
    console.log('\n✅ Current tick is INSIDE range - both tokens will be deposited');
  }
  
  // Get wallet
  let wallet = null;
  let walletAddress = null;
  
  if (args.keystore) {
    try {
      const ks = fs.readFileSync(args.keystore, 'utf8');
      const parsed = JSON.parse(ks);
      walletAddress = parsed.address.toLowerCase();
      if (!walletAddress.startsWith('0x')) walletAddress = '0x' + walletAddress;
      console.log(`\nWallet:      ${walletAddress}`);
    } catch (e) {
      console.error('❌ Could not read keystore:', e.message);
      process.exit(1);
    }
    
    // Check balances
    const token0Contract = new ethers.Contract(token0, ERC20_ABI, provider);
    const token1Contract = new ethers.Contract(token1, ERC20_ABI, provider);
    
    const [bal0, bal1] = await Promise.all([
      token0Contract.balanceOf(walletAddress),
      token1Contract.balanceOf(walletAddress)
    ]);
    
    console.log(`Balance:     ${ethers.formatUnits(bal0, dec0)} ${token0Symbol}`);
    console.log(`             ${ethers.formatUnits(bal1, dec1)} ${token1Symbol}`);
    
    if (bal0 < amount0Desired) {
      console.log(`\n❌ Insufficient ${token0Symbol}: need ${args.amount0}, have ${ethers.formatUnits(bal0, dec0)}`);
      process.exit(1);
    }
    if (bal1 < amount1Desired) {
      console.log(`\n❌ Insufficient ${token1Symbol}: need ${args.amount1}, have ${ethers.formatUnits(bal1, dec1)}`);
      process.exit(1);
    }
    
    // Check allowances
    const [allow0, allow1] = await Promise.all([
      token0Contract.allowance(walletAddress, dexConfig.nftManager),
      token1Contract.allowance(walletAddress, dexConfig.nftManager)
    ]);
    
    const needApprove0 = allow0 < amount0Desired;
    const needApprove1 = allow1 < amount1Desired;
    
    if (needApprove0 || needApprove1) {
      console.log('\n📝 Approvals needed:');
      if (needApprove0) console.log(`   ${token0Symbol} → NFT Manager`);
      if (needApprove1) console.log(`   ${token1Symbol} → NFT Manager`);
    } else {
      console.log('\n✅ Token approvals OK');
    }
  }
  
  console.log('━'.repeat(55));
  
  if (args.dryRun) {
    console.log('\n📋 DRY RUN - No transaction sent');
    console.log('Remove --dry-run to execute');
    return;
  }
  
  if (!args.keystore) {
    console.error('\n❌ --keystore required for actual mint');
    process.exit(1);
  }
  
  // Load wallet
  console.log('\n🔐 Loading wallet...');
  
  try {
    const ks = fs.readFileSync(args.keystore, 'utf8');
    const parsed = JSON.parse(ks);
    
    // Check if it's a plain wallet (has privateKey) or encrypted keystore (has crypto)
    if (parsed.privateKey) {
      // Plain wallet file
      wallet = new ethers.Wallet(parsed.privateKey, provider);
      console.log('✅ Wallet loaded (plain)');
    } else if (parsed.crypto) {
      // Encrypted keystore
      const password = args.password || await promptPassword();
      wallet = await ethers.Wallet.fromEncryptedJson(ks, password);
      wallet = wallet.connect(provider);
      console.log('✅ Wallet loaded (encrypted)');
    } else {
      throw new Error('Unknown wallet format');
    }
  } catch (e) {
    console.error('❌ Failed to load wallet:', e.message);
    process.exit(1);
  }
  
  // Approve tokens if needed
  const token0Contract = new ethers.Contract(token0, ERC20_ABI, wallet);
  const token1Contract = new ethers.Contract(token1, ERC20_ABI, wallet);
  
  const allow0 = await token0Contract.allowance(walletAddress, dexConfig.nftManager);
  const allow1 = await token1Contract.allowance(walletAddress, dexConfig.nftManager);
  
  if (allow0 < amount0Desired) {
    console.log(`\n📝 Approving ${token0Symbol}...`);
    const tx = await token0Contract.approve(dexConfig.nftManager, ethers.MaxUint256);
    console.log(`   TX: ${tx.hash}`);
    await tx.wait();
    console.log(`   ✅ Approved`);
  }
  
  if (allow1 < amount1Desired) {
    console.log(`\n📝 Approving ${token1Symbol}...`);
    const tx = await token1Contract.approve(dexConfig.nftManager, ethers.MaxUint256);
    console.log(`   TX: ${tx.hash}`);
    await tx.wait();
    console.log(`   ✅ Approved`);
  }
  
  // Mint position
  console.log('\n💧 Minting position...');
  
  const nftManager = new ethers.Contract(dexConfig.nftManager, NFT_MANAGER_ABI, wallet);
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  
  const mintParams = {
    token0: token0,
    token1: token1,
    fee: fee,
    tickLower: tickLower,
    tickUpper: tickUpper,
    amount0Desired: amount0Desired,
    amount1Desired: amount1Desired,
    amount0Min: 0,
    amount1Min: 0,
    recipient: walletAddress,
    deadline: deadline
  };
  
  console.log('   Sending transaction...');
  const tx = await nftManager.mint(mintParams);
  console.log(`   TX: ${tx.hash}`);
  console.log(`   ${EXPLORER}/tx/${tx.hash}`);
  
  const receipt = await tx.wait();
  console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`);
  console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
  
  // Parse tokenId from logs
  let tokenId = null;
  for (const log of receipt.logs) {
    try {
      const parsed = nftManager.interface.parseLog({ topics: log.topics, data: log.data });
      if (parsed && parsed.name === 'IncreaseLiquidity') {
        tokenId = parsed.args.tokenId.toString();
        const liquidity = parsed.args.liquidity.toString();
        const amount0 = ethers.formatUnits(parsed.args.amount0, dec0);
        const amount1 = ethers.formatUnits(parsed.args.amount1, dec1);
        
        console.log('\n' + '━'.repeat(55));
        console.log('🎉 POSITION CREATED');
        console.log('━'.repeat(55));
        console.log(`Token ID:    #${tokenId}`);
        console.log(`Liquidity:   ${liquidity}`);
        console.log(`Deposited:   ${amount0} ${token0Symbol}`);
        console.log(`             ${amount1} ${token1Symbol}`);
        console.log('━'.repeat(55));
      }
    } catch (e) {
      // Not our event
    }
  }
  
  // Log to memory
  const details = `${token0Symbol}/${token1Symbol} #${tokenId || 'N/A'} range ${tickLower}-${tickUpper}`;
  logToMemory('LP_MINT', details, tx.hash);
  
  console.log('\n✅ Done!');
}

main().catch((e) => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
