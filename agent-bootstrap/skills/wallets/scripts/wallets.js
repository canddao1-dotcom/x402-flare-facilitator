#!/usr/bin/env node
/**
 * Wallets Skill - Multi-chain wallet management for agents
 * 
 * Commands: balance, send, receive, setup, export
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Colors
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bright: '\x1b[1m'
};

// Network configs
const NETWORKS = {
  flare: {
    name: 'Flare',
    chainId: 14,
    rpc: process.env.FLARE_RPC || 'https://flare-api.flare.network/ext/C/rpc',
    explorer: 'https://flarescan.com',
    currency: 'FLR',
    decimals: 18
  },
  base: {
    name: 'Base',
    chainId: 8453,
    rpc: process.env.BASE_RPC || 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    currency: 'ETH',
    decimals: 18
  },
  hyperevm: {
    name: 'HyperEVM',
    chainId: 999,
    rpc: process.env.HYPEREVM_RPC || 'https://rpc.hyperliquid.xyz/evm',
    explorer: 'https://explorer.hyperliquid.xyz',
    currency: 'HYPE',
    decimals: 18
  },
  solana: {
    name: 'Solana',
    rpc: process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com',
    explorer: 'https://solscan.io',
    currency: 'SOL',
    decimals: 9
  }
};

// Token configs (Flare)
const TOKENS = {
  WFLR: { address: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d', decimals: 18, network: 'flare' },
  'USD₮0': { address: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', decimals: 6, network: 'flare' },
  USDT: { address: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', decimals: 6, network: 'flare' },
  FXRP: { address: '0xAd552A648C74D49E10027AB8a618A3ad4901c5bE', decimals: 6, network: 'flare' },
  sFLR: { address: '0x12e605bc104e93B45e1aD99F9e555f659051c2BB', decimals: 18, network: 'flare' },
  rFLR: { address: '0x26d460c3Cf931Fb2014FA436a49e3Af08619810e', decimals: 18, network: 'flare' }
};

// Encryption helpers
const ALGORITHM = 'aes-256-gcm';

function decrypt(data, passphrase) {
  const key = crypto.scryptSync(passphrase, 'agent-bootstrap-salt', 32);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(data.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
  let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function encrypt(text, passphrase) {
  const key = crypto.scryptSync(passphrase, 'agent-bootstrap-salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return { iv: iv.toString('hex'), authTag: authTag.toString('hex'), encrypted };
}

// Load wallet from keystore
function loadWallet() {
  const keystorePath = process.env.WALLET_KEYSTORE_PATH;
  const passphrase = process.env.WALLET_PASSPHRASE;
  
  if (!keystorePath || !passphrase) {
    throw new Error('WALLET_KEYSTORE_PATH and WALLET_PASSPHRASE required');
  }
  
  const evmKeystorePath = path.join(keystorePath, 'evm-keystore.json');
  const solKeystorePath = path.join(keystorePath, 'solana-keystore.json');
  const summaryPath = path.join(keystorePath, 'wallet-summary.json');
  
  if (!fs.existsSync(evmKeystorePath)) {
    throw new Error(`EVM keystore not found: ${evmKeystorePath}`);
  }
  
  const evmKeystore = JSON.parse(fs.readFileSync(evmKeystorePath, 'utf8'));
  const evmPrivateKey = decrypt(evmKeystore, passphrase);
  
  let solanaKeypair = null;
  if (fs.existsSync(solKeystorePath)) {
    const solKeystore = JSON.parse(fs.readFileSync(solKeystorePath, 'utf8'));
    solanaKeypair = decrypt(solKeystore, passphrase);
  }
  
  let summary = null;
  if (fs.existsSync(summaryPath)) {
    summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  }
  
  return {
    evmPrivateKey,
    evmAddress: summary?.wallets?.evm?.address || deriveEvmAddress(evmPrivateKey),
    solanaKeypair,
    solanaAddress: summary?.wallets?.solana?.address,
    summary
  };
}

// Derive EVM address from private key
function deriveEvmAddress(privateKey) {
  // Simple derivation - in production use viem
  const { privateKeyToAccount } = require('viem/accounts');
  return privateKeyToAccount(privateKey).address;
}

// RPC helpers
async function rpcCall(rpc, method, params) {
  const response = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

async function getEvmBalance(rpc, address) {
  try {
    const result = await rpcCall(rpc, 'eth_getBalance', [address, 'latest']);
    return BigInt(result);
  } catch (e) {
    return null;
  }
}

async function getTokenBalance(rpc, tokenAddress, walletAddress) {
  try {
    // balanceOf(address)
    const data = '0x70a08231000000000000000000000000' + walletAddress.slice(2).toLowerCase();
    const result = await rpcCall(rpc, 'eth_call', [{ to: tokenAddress, data }, 'latest']);
    return BigInt(result);
  } catch (e) {
    return null;
  }
}

async function getSolanaBalance(rpc, address) {
  try {
    const response = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] })
    });
    const data = await response.json();
    return BigInt(data.result?.value || 0);
  } catch (e) {
    return null;
  }
}

function formatBalance(balance, decimals, symbol = '') {
  if (balance === null) return `${c.red}error${c.reset}`;
  if (balance === 0n) return `0 ${symbol}`.trim();
  
  const divisor = 10n ** BigInt(decimals);
  const whole = balance / divisor;
  const frac = balance % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4);
  const formatted = `${whole}.${fracStr}`.replace(/\.?0+$/, '') || '0';
  return `${formatted} ${symbol}`.trim();
}

// Commands
async function balanceCommand(options) {
  console.log(`\n${c.cyan}💰 Wallet Balances${c.reset}`);
  console.log(`${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);
  
  let wallet;
  try {
    wallet = loadWallet();
  } catch (e) {
    // No wallet configured - show setup instructions
    console.log(`${c.yellow}No wallet configured.${c.reset}`);
    console.log(`\nRun: ${c.cyan}wallets.js setup --name "YourAgent"${c.reset}`);
    console.log(`Or set: WALLET_KEYSTORE_PATH and WALLET_PASSPHRASE\n`);
    return;
  }
  
  const evmAddress = wallet.evmAddress;
  console.log(`${c.dim}EVM Address:${c.reset} ${evmAddress}`);
  if (wallet.solanaAddress) {
    console.log(`${c.dim}Solana:${c.reset}      ${wallet.solanaAddress}`);
  }
  console.log('');
  
  // EVM balances
  const networkFilter = options.network?.toLowerCase();
  
  for (const [key, network] of Object.entries(NETWORKS)) {
    if (key === 'solana') continue;
    if (networkFilter && key !== networkFilter) continue;
    
    const balance = await getEvmBalance(network.rpc, evmAddress);
    const formatted = formatBalance(balance, network.decimals, network.currency);
    const status = balance && balance > 0n ? '✅' : '⚪';
    console.log(`${status} ${network.name.padEnd(10)} ${formatted}`);
  }
  
  // Token balances (Flare only for now)
  if (!networkFilter || networkFilter === 'flare') {
    console.log(`\n${c.dim}Tokens (Flare):${c.reset}`);
    
    const flareRpc = NETWORKS.flare.rpc;
    for (const [symbol, token] of Object.entries(TOKENS)) {
      if (symbol === 'USDT') continue; // Alias
      const balance = await getTokenBalance(flareRpc, token.address, evmAddress);
      if (balance && balance > 0n) {
        const formatted = formatBalance(balance, token.decimals, symbol);
        console.log(`   ${formatted}`);
      }
    }
  }
  
  // Solana balance
  if (wallet.solanaAddress && (!networkFilter || networkFilter === 'solana')) {
    console.log('');
    const solBalance = await getSolanaBalance(NETWORKS.solana.rpc, wallet.solanaAddress);
    const formatted = formatBalance(solBalance, 9, 'SOL');
    const status = solBalance && solBalance > 0n ? '✅' : '⚪';
    console.log(`${status} Solana     ${formatted}`);
  }
  
  console.log('');
}

async function receiveCommand(options) {
  console.log(`\n${c.cyan}📥 Receive Addresses${c.reset}`);
  console.log(`${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);
  
  let wallet;
  try {
    wallet = loadWallet();
  } catch (e) {
    console.log(`${c.yellow}No wallet configured.${c.reset}`);
    console.log(`\nRun: ${c.cyan}wallets.js setup --name "YourAgent"${c.reset}\n`);
    return;
  }
  
  const evmAddress = wallet.evmAddress;
  const networkFilter = options.network?.toLowerCase();
  
  console.log(`${c.bright}EVM Address (Flare/Base/HyperEVM):${c.reset}`);
  console.log(`${c.cyan}${evmAddress}${c.reset}\n`);
  
  if (!networkFilter || networkFilter === 'flare') {
    console.log(`${c.dim}Flare Explorer:${c.reset}`);
    console.log(`${NETWORKS.flare.explorer}/address/${evmAddress}\n`);
  }
  
  if (!networkFilter || networkFilter === 'base') {
    console.log(`${c.dim}Base Explorer:${c.reset}`);
    console.log(`${NETWORKS.base.explorer}/address/${evmAddress}\n`);
  }
  
  if (!networkFilter || networkFilter === 'hyperevm') {
    console.log(`${c.dim}HyperEVM Explorer:${c.reset}`);
    console.log(`${NETWORKS.hyperevm.explorer}/address/${evmAddress}\n`);
  }
  
  if (wallet.solanaAddress && (!networkFilter || networkFilter === 'solana')) {
    console.log(`${c.bright}Solana Address:${c.reset}`);
    console.log(`${c.cyan}${wallet.solanaAddress}${c.reset}\n`);
    console.log(`${c.dim}Solana Explorer:${c.reset}`);
    console.log(`${NETWORKS.solana.explorer}/account/${wallet.solanaAddress}\n`);
  }
}

async function sendCommand(options) {
  const { to, amount, network, token, confirm } = options;
  
  if (!to || !amount) {
    console.log(`${c.red}Error: --to and --amount required${c.reset}`);
    console.log(`\nUsage: wallets.js send --to 0x... --amount 10 --network flare [--token USDT] --confirm`);
    return;
  }
  
  // Validate address
  if (!to.match(/^0x[a-fA-F0-9]{40}$/)) {
    console.log(`${c.red}Error: Invalid address format${c.reset}`);
    return;
  }
  
  const networkKey = (network || 'flare').toLowerCase();
  const networkConfig = NETWORKS[networkKey];
  
  if (!networkConfig || networkKey === 'solana') {
    console.log(`${c.red}Error: Unsupported network${c.reset}`);
    console.log(`Supported: flare, base, hyperevm`);
    return;
  }
  
  let wallet;
  try {
    wallet = loadWallet();
  } catch (e) {
    console.log(`${c.red}Error: ${e.message}${c.reset}`);
    return;
  }
  
  // Parse amount
  const tokenConfig = token ? TOKENS[token.toUpperCase()] : null;
  const decimals = tokenConfig?.decimals || networkConfig.decimals;
  const symbol = tokenConfig ? token.toUpperCase() : networkConfig.currency;
  
  const amountFloat = parseFloat(amount);
  if (isNaN(amountFloat) || amountFloat <= 0) {
    console.log(`${c.red}Error: Invalid amount${c.reset}`);
    return;
  }
  
  const amountWei = BigInt(Math.floor(amountFloat * (10 ** decimals)));
  
  // Check balance
  let balance;
  if (tokenConfig) {
    balance = await getTokenBalance(networkConfig.rpc, tokenConfig.address, wallet.evmAddress);
  } else {
    balance = await getEvmBalance(networkConfig.rpc, wallet.evmAddress);
  }
  
  if (balance === null) {
    console.log(`${c.red}Error: Could not check balance${c.reset}`);
    return;
  }
  
  if (balance < amountWei) {
    console.log(`${c.red}Error: Insufficient balance${c.reset}`);
    console.log(`Available: ${formatBalance(balance, decimals, symbol)}`);
    console.log(`Required:  ${amount} ${symbol}`);
    return;
  }
  
  // Show confirmation
  console.log(`\n${c.cyan}📤 Send Confirmation${c.reset}`);
  console.log(`${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);
  console.log(`${c.bright}Amount:${c.reset}  ${amount} ${symbol}`);
  console.log(`${c.bright}To:${c.reset}      ${to}`);
  console.log(`${c.bright}Network:${c.reset} ${networkConfig.name}`);
  console.log(`${c.bright}From:${c.reset}    ${wallet.evmAddress}`);
  console.log(`\n${c.dim}Balance: ${formatBalance(balance, decimals, symbol)}${c.reset}`);
  
  if (!confirm) {
    console.log(`\n${c.yellow}⚠️  Add --confirm to execute this transaction${c.reset}\n`);
    return;
  }
  
  // Execute transaction
  console.log(`\n${c.cyan}Sending...${c.reset}`);
  
  try {
    // Dynamic import viem
    const { createWalletClient, http, parseEther, parseUnits } = await import('viem');
    const { privateKeyToAccount } = await import('viem/accounts');
    
    const account = privateKeyToAccount(wallet.evmPrivateKey);
    
    const client = createWalletClient({
      account,
      chain: { id: networkConfig.chainId, name: networkConfig.name },
      transport: http(networkConfig.rpc)
    });
    
    let hash;
    
    if (tokenConfig) {
      // ERC20 transfer
      const data = '0xa9059cbb' + 
        to.slice(2).toLowerCase().padStart(64, '0') +
        amountWei.toString(16).padStart(64, '0');
      
      hash = await client.sendTransaction({
        to: tokenConfig.address,
        data,
        chain: { id: networkConfig.chainId }
      });
    } else {
      // Native transfer
      hash = await client.sendTransaction({
        to,
        value: amountWei,
        chain: { id: networkConfig.chainId }
      });
    }
    
    console.log(`${c.green}✅ Transaction sent!${c.reset}`);
    console.log(`${c.dim}Hash: ${hash}${c.reset}`);
    console.log(`\n${networkConfig.explorer}/tx/${hash}\n`);
    
  } catch (e) {
    console.log(`${c.red}❌ Transaction failed: ${e.message}${c.reset}`);
  }
}

async function setupCommand(options) {
  const { name, import: importKey } = options;
  
  if (!name) {
    console.log(`${c.red}Error: --name required${c.reset}`);
    console.log(`\nUsage: wallets.js setup --name "MyAgent"`);
    return;
  }
  
  console.log(`\n${c.cyan}🔐 Wallet Setup${c.reset}`);
  console.log(`${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);
  
  // Use bootstrap script
  const bootstrapPath = path.join(__dirname, '..', '..', '..', 'scripts', 'bootstrap.js');
  
  if (fs.existsSync(bootstrapPath)) {
    console.log(`Running bootstrap for "${name}"...\n`);
    const { execSync } = await import('child_process');
    
    try {
      execSync(`node "${bootstrapPath}" new --name "${name}"`, { stdio: 'inherit' });
    } catch (e) {
      console.log(`${c.red}Setup failed${c.reset}`);
    }
  } else {
    console.log(`${c.yellow}Bootstrap script not found.${c.reset}`);
    console.log(`Run the wizard instead: node scripts/wizard.js`);
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const getFlag = (name) => {
    const idx = args.indexOf(`--${name}`);
    if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
      return args[idx + 1];
    }
    return null;
  };
  
  const hasFlag = (name) => args.includes(`--${name}`);
  
  const options = {
    network: getFlag('network'),
    token: getFlag('token'),
    to: getFlag('to'),
    amount: getFlag('amount'),
    name: getFlag('name'),
    import: getFlag('import'),
    confirm: hasFlag('confirm'),
    format: getFlag('format')
  };
  
  try {
    switch (command) {
      case 'balance':
      case 'balances':
        await balanceCommand(options);
        break;
        
      case 'receive':
      case 'address':
      case 'addresses':
        await receiveCommand(options);
        break;
        
      case 'send':
      case 'transfer':
        await sendCommand(options);
        break;
        
      case 'setup':
      case 'create':
      case 'new':
        await setupCommand(options);
        break;
        
      default:
        console.log(`
${c.cyan}💰 Wallets - Multi-chain wallet management${c.reset}

${c.bright}Commands:${c.reset}
  balance              Check balances across all chains
  receive              Show addresses to receive tokens
  send                 Send tokens (requires --confirm)
  setup                Create new wallet

${c.bright}Options:${c.reset}
  --network <name>     Filter by network (flare, base, hyperevm, solana)
  --token <symbol>     Token for send (USDT, FXRP, sFLR, etc.)
  --to <address>       Recipient address (send)
  --amount <number>    Amount to send
  --confirm            Confirm transaction execution
  --name <name>        Agent name (setup)

${c.bright}Examples:${c.reset}
  wallets.js balance
  wallets.js balance --network flare
  wallets.js receive
  wallets.js send --to 0x... --amount 10 --network flare --confirm
  wallets.js send --to 0x... --amount 100 --token USDT --confirm
  wallets.js setup --name "MyAgent"

${c.bright}Environment:${c.reset}
  WALLET_KEYSTORE_PATH   Path to keystore directory
  WALLET_PASSPHRASE      Passphrase to decrypt wallet
`);
    }
  } catch (e) {
    console.error(`\n${c.red}Error: ${e.message}${c.reset}`);
    if (process.env.DEBUG) console.error(e.stack);
    process.exit(1);
  }
}

main();
