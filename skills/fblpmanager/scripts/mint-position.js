#!/usr/bin/env node
/**
 * Mint V3 LP Position
 * 
 * Creates a new concentrated liquidity position on Enosys or SparkDex V3.
 * 
 * Usage:
 *   node mint-position.js \
 *     --keystore <path> \
 *     --pool <address> \
 *     --tick-lower <tick> \
 *     --tick-upper <tick> \
 *     --amount0 <amount> \
 *     --amount1 <amount> \
 *     [--dex enosys|sparkdex] \
 *     [--dry-run]
 */

const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const readline = require('readline');
const { execSync } = require('child_process');

const RPC_URL = 'https://flare-api.flare.network/ext/C/rpc';
const CHAIN_ID = 14;
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
  'USDT0': { address: '0x0200C29006150606B650577BBE7B6248F58470c1', decimals: 6 },
};

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
  };
}

function rpcCall(method, params = []) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const url = new URL(RPC_URL);
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.error) reject(new Error(json.error.message));
          else resolve(json.result);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getPoolInfo(poolAddress) {
  // slot0
  const slot0 = await rpcCall('eth_call', [{ to: poolAddress, data: '0x3850c7bd' }, 'latest']);
  const sqrtPriceX96 = BigInt('0x' + slot0.slice(2, 66));
  const tickRaw = parseInt(slot0.slice(66, 130), 16);
  const tick = tickRaw > 0x7FFFFF ? tickRaw - 0x1000000 : tickRaw;
  
  // token0
  const t0 = await rpcCall('eth_call', [{ to: poolAddress, data: '0x0dfe1681' }, 'latest']);
  const token0 = '0x' + t0.slice(-40);
  
  // token1
  const t1 = await rpcCall('eth_call', [{ to: poolAddress, data: '0xd21220a7' }, 'latest']);
  const token1 = '0x' + t1.slice(-40);
  
  // fee
  const feeHex = await rpcCall('eth_call', [{ to: poolAddress, data: '0xddca3f43' }, 'latest']);
  const fee = parseInt(feeHex, 16);
  
  // tickSpacing
  const tsHex = await rpcCall('eth_call', [{ to: poolAddress, data: '0xd0c93a7c' }, 'latest']);
  const tickSpacing = parseInt(tsHex, 16);
  
  return { sqrtPriceX96, tick, token0, token1, fee, tickSpacing };
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

function parseUnits(value, decimals) {
  const [intPart, decPart = ''] = value.toString().split('.');
  const paddedDec = decPart.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(intPart + paddedDec);
}

function formatUnits(value, decimals) {
  const str = value.toString().padStart(decimals + 1, '0');
  const intPart = str.slice(0, -decimals) || '0';
  const decPart = str.slice(-decimals).replace(/0+$/, '');
  return decPart ? `${intPart}.${decPart}` : intPart;
}

async function getBalance(address, tokenAddress) {
  const data = '0x70a08231000000000000000000000000' + address.slice(2).toLowerCase();
  const result = await rpcCall('eth_call', [{ to: tokenAddress, data }, 'latest']);
  return BigInt(result || '0x0');
}

async function getAllowance(owner, spender, tokenAddress) {
  const ownerPadded = owner.slice(2).padStart(64, '0');
  const spenderPadded = spender.slice(2).padStart(64, '0');
  const data = '0xdd62ed3e' + ownerPadded + spenderPadded;
  const result = await rpcCall('eth_call', [{ to: tokenAddress, data }, 'latest']);
  return BigInt(result || '0x0');
}

// Keystore decryption
function deriveKey(password, salt, n, r, p, dkLen) {
  return crypto.scryptSync(password, salt, dkLen, { N: n, r, p });
}

function decryptKeystore(keystoreJson, password) {
  const ks = typeof keystoreJson === 'string' ? JSON.parse(keystoreJson) : keystoreJson;
  const kdfparams = ks.crypto.kdfparams;
  const salt = Buffer.from(kdfparams.salt, 'hex');
  const derivedKey = deriveKey(password, salt, kdfparams.n, kdfparams.r, kdfparams.p, kdfparams.dklen);
  
  const ciphertext = Buffer.from(ks.crypto.ciphertext, 'hex');
  const mac = crypto.createHash('sha3-256')
    .update(Buffer.concat([derivedKey.slice(16, 32), ciphertext]))
    .digest('hex');
  
  if (mac !== ks.crypto.mac) throw new Error('Invalid password');
  
  const decipher = crypto.createDecipheriv(
    ks.crypto.cipher,
    derivedKey.slice(0, 16),
    Buffer.from(ks.crypto.cipherparams.iv, 'hex')
  );
  
  const privateKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return '0x' + privateKey.toString('hex');
}

function getAddressFromPrivateKey(privateKey) {
  const { createPublicKey, createPrivateKey } = crypto;
  const keyObj = createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e0201010420', 'hex'),
      Buffer.from(privateKey.slice(2), 'hex'),
      Buffer.from('a00706052b8104000a', 'hex')
    ]),
    format: 'der',
    type: 'sec1'
  });
  const pubKey = createPublicKey(keyObj).export({ type: 'spki', format: 'der' });
  const pubKeyRaw = pubKey.slice(-65);
  const hash = crypto.createHash('sha3-256').update(pubKeyRaw.slice(1)).digest();
  return '0x' + hash.slice(-20).toString('hex');
}

async function signAndSend(privateKey, to, data, value = '0x0') {
  const from = getAddressFromPrivateKey(privateKey);
  
  const nonce = await rpcCall('eth_getTransactionCount', [from, 'latest']);
  const gasPrice = await rpcCall('eth_gasPrice', []);
  
  const estimateData = { from, to, data, value };
  let gasLimit;
  try {
    gasLimit = await rpcCall('eth_estimateGas', [estimateData]);
    gasLimit = '0x' + (BigInt(gasLimit) * 130n / 100n).toString(16); // +30% buffer
  } catch (e) {
    gasLimit = '0x' + (500000).toString(16); // fallback
  }
  
  const txData = {
    nonce,
    gasPrice,
    gasLimit,
    to,
    value,
    data,
    chainId: CHAIN_ID
  };
  
  // Sign transaction (RLP encoding)
  const { keccak256 } = await import('./keccak.mjs').catch(() => {
    // Fallback: use ethers if available
    throw new Error('Need keccak256 for signing. Use ethers or install keccak module.');
  });
  
  // For now, use a simpler approach via shell
  throw new Error('Direct signing not implemented. Use wallet-manager.js');
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
    const cmd = `node "${MEMORY_LOG}" --type TX --action "${action}" --details "${details}"${tx ? ` --tx "${tx}"` : ''}`;
    execSync(cmd, { encoding: 'utf8' });
  } catch (e) {
    // Ignore logging errors
  }
}

async function main() {
  const args = parseArgs();
  
  // Validate
  if (!args.pool || isNaN(args.tickLower) || isNaN(args.tickUpper) || !args.amount0 || !args.amount1) {
    console.error(`
Usage: node mint-position.js \\
  --pool <address> \\
  --tick-lower <tick> \\
  --tick-upper <tick> \\
  --amount0 <amount> \\
  --amount1 <amount> \\
  [--dex enosys|sparkdex] \\
  [--keystore <path>] \\
  [--dry-run]

Example:
  node mint-position.js \\
    --pool 0x25b4f3930934f0a3cbb885c624ecee75a2917144 \\
    --tick-lower 5280 \\
    --tick-upper 5870 \\
    --amount0 100 \\
    --amount1 175 \\
    --dex enosys \\
    --dry-run
`);
    process.exit(1);
  }
  
  const dexConfig = DEX_CONFIGS[args.dex.toLowerCase()];
  if (!dexConfig) {
    console.error('❌ Unknown DEX:', args.dex);
    process.exit(1);
  }
  
  console.log('\n🔍 Fetching pool info...');
  const pool = await getPoolInfo(args.pool);
  
  const token0Symbol = findTokenSymbol(pool.token0);
  const token1Symbol = findTokenSymbol(pool.token1);
  const dec0 = getTokenDecimals(pool.token0);
  const dec1 = getTokenDecimals(pool.token1);
  
  const amount0Wei = parseUnits(args.amount0, dec0);
  const amount1Wei = parseUnits(args.amount1, dec1);
  
  // Validate tick range
  if (args.tickLower % pool.tickSpacing !== 0 || args.tickUpper % pool.tickSpacing !== 0) {
    console.log(`⚠️  Adjusting ticks to tick spacing (${pool.tickSpacing})`);
    args.tickLower = Math.floor(args.tickLower / pool.tickSpacing) * pool.tickSpacing;
    args.tickUpper = Math.ceil(args.tickUpper / pool.tickSpacing) * pool.tickSpacing;
  }
  
  console.log('\n' + '━'.repeat(55));
  console.log('📊 MINT LP POSITION');
  console.log('━'.repeat(55));
  console.log(`Pool:        ${args.pool}`);
  console.log(`DEX:         ${args.dex.toUpperCase()}`);
  console.log(`Pair:        ${token0Symbol}/${token1Symbol}`);
  console.log(`Fee:         ${pool.fee / 10000}%`);
  console.log(`Current:     tick ${pool.tick}`);
  console.log('');
  console.log(`Range:       ${args.tickLower} → ${args.tickUpper}`);
  console.log(`             ±${((args.tickUpper - args.tickLower) / 2 * 0.01).toFixed(1)}% from center`);
  console.log('');
  console.log(`Amount0:     ${args.amount0} ${token0Symbol}`);
  console.log(`Amount1:     ${args.amount1} ${token1Symbol}`);
  console.log('━'.repeat(55));
  
  // Check if current tick is in range
  if (pool.tick < args.tickLower || pool.tick > args.tickUpper) {
    console.log('\n⚠️  WARNING: Current tick is OUTSIDE your range!');
    console.log('   Position will be single-sided (only one token deposited)');
  }
  
  // Get wallet address
  let fromAddress = null;
  if (args.keystore) {
    try {
      const ks = JSON.parse(fs.readFileSync(args.keystore, 'utf8'));
      fromAddress = '0x' + ks.address.toLowerCase();
    } catch (e) {
      console.error('❌ Could not read keystore');
      process.exit(1);
    }
  }
  
  if (fromAddress) {
    console.log(`\nWallet:      ${fromAddress}`);
    
    // Check balances
    const bal0 = await getBalance(fromAddress, pool.token0);
    const bal1 = await getBalance(fromAddress, pool.token1);
    
    console.log(`Balance:     ${formatUnits(bal0, dec0)} ${token0Symbol}`);
    console.log(`             ${formatUnits(bal1, dec1)} ${token1Symbol}`);
    
    if (bal0 < amount0Wei) {
      console.log(`\n❌ Insufficient ${token0Symbol}: need ${args.amount0}, have ${formatUnits(bal0, dec0)}`);
      process.exit(1);
    }
    if (bal1 < amount1Wei) {
      console.log(`\n❌ Insufficient ${token1Symbol}: need ${args.amount1}, have ${formatUnits(bal1, dec1)}`);
      process.exit(1);
    }
    
    // Check allowances
    const allow0 = await getAllowance(fromAddress, dexConfig.nftManager, pool.token0);
    const allow1 = await getAllowance(fromAddress, dexConfig.nftManager, pool.token1);
    
    const needApprove0 = allow0 < amount0Wei;
    const needApprove1 = allow1 < amount1Wei;
    
    if (needApprove0 || needApprove1) {
      console.log('\n📝 Approvals needed:');
      if (needApprove0) console.log(`   ${token0Symbol} → NFT Manager`);
      if (needApprove1) console.log(`   ${token1Symbol} → NFT Manager`);
    }
  }
  
  console.log('━'.repeat(55));
  
  if (args.dryRun) {
    console.log('\n📋 DRY RUN - No transaction sent');
    console.log('\nTo execute, remove --dry-run and add --keystore <path>');
    
    // Output the calldata that would be used
    console.log('\n--- MINT CALLDATA ---');
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const recipient = fromAddress || '0x0000000000000000000000000000000000000000';
    
    // mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, 
    //       uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min,
    //       address recipient, uint256 deadline))
    // selector: 0x88316456
    console.log('NFT Manager:', dexConfig.nftManager);
    console.log('Function: mint(MintParams)');
    console.log('Params:');
    console.log(`  token0: ${pool.token0}`);
    console.log(`  token1: ${pool.token1}`);
    console.log(`  fee: ${pool.fee}`);
    console.log(`  tickLower: ${args.tickLower}`);
    console.log(`  tickUpper: ${args.tickUpper}`);
    console.log(`  amount0Desired: ${amount0Wei.toString()}`);
    console.log(`  amount1Desired: ${amount1Wei.toString()}`);
    console.log(`  amount0Min: 0`);
    console.log(`  amount1Min: 0`);
    console.log(`  recipient: ${recipient}`);
    console.log(`  deadline: ${deadline}`);
    
    return;
  }
  
  if (!args.keystore) {
    console.error('\n❌ --keystore required for actual mint');
    process.exit(1);
  }
  
  // Execute mint using ethers via wallet-manager
  console.log('\n🔐 Loading wallet...');
  const password = await promptPassword();
  
  try {
    const ks = fs.readFileSync(args.keystore, 'utf8');
    const privateKey = decryptKeystore(ks, password);
    
    // Use the LPOperations module for minting
    const { LPOperations } = require('./lp-operations');
    const ops = new LPOperations();
    
    // First approve tokens
    console.log('\n📝 Approving tokens...');
    
    // For simplicity, use direct calls via exec to the approve script
    const approveScript = '/home/node/clawd/skills/wallet/scripts/approve-token.js';
    
    const allow0 = await getAllowance(fromAddress, dexConfig.nftManager, pool.token0);
    const allow1 = await getAllowance(fromAddress, dexConfig.nftManager, pool.token1);
    
    if (allow0 < amount0Wei) {
      console.log(`Approving ${token0Symbol}...`);
      execSync(`node "${approveScript}" --keystore "${args.keystore}" --token "${pool.token0}" --spender "${dexConfig.nftManager}" --amount unlimited --yes`, {
        input: password + '\n',
        encoding: 'utf8'
      });
    }
    
    if (allow1 < amount1Wei) {
      console.log(`Approving ${token1Symbol}...`);
      execSync(`node "${approveScript}" --keystore "${args.keystore}" --token "${pool.token1}" --spender "${dexConfig.nftManager}" --amount unlimited --yes`, {
        input: password + '\n',
        encoding: 'utf8'
      });
    }
    
    console.log('\n💧 Minting position...');
    
    // Call mint via ethers (need to integrate with wallet-manager)
    // For now, output instructions
    console.log('⚠️  Direct mint execution requires ethers integration.');
    console.log('   Please run manually using cast or ethers script.');
    
    // Log intent to memory
    logToMemory('LP_MINT_PREPARED', `${token0Symbol}/${token1Symbol} range ${args.tickLower}-${args.tickUpper}`, null);
    
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

main().catch(console.error);
