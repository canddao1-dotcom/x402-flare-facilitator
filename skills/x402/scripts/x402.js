#!/usr/bin/env node
/**
 * x402 Payment Client for Clawdbot
 * HTTP-native agent payments using the x402 protocol
 */

import { privateKeyToAccount } from 'viem/accounts';
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import { Wallet } from 'ethers';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'payment-history.json');

// Network configs (CAIP-2 format: eip155:chainId)
const NETWORKS = {
  base: { caip: 'eip155:8453', name: 'Base', explorer: 'https://basescan.org' },
  'base-sepolia': { caip: 'eip155:84532', name: 'Base Sepolia', explorer: 'https://sepolia.basescan.org' },
  ethereum: { caip: 'eip155:1', name: 'Ethereum', explorer: 'https://etherscan.io' },
  flare: { caip: 'eip155:14', name: 'Flare', explorer: 'https://flarescan.com' }
};

// Prompt for password
async function promptPassword(prompt = 'Enter keystore password: ') {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    process.stdout.write(prompt);
    rl.question('', answer => {
      rl.close();
      resolve(answer);
    });
  });
}

// Cached wallet account
let cachedAccount = null;
let keystorePathArg = null;

// Load wallet from keystore or env
async function loadWallet() {
  if (cachedAccount) return cachedAccount;
  
  // Try CLI keystore argument first
  if (keystorePathArg && fs.existsSync(keystorePathArg)) {
    const keystoreJson = fs.readFileSync(keystorePathArg, 'utf8');
    const password = await promptPassword('🔐 Enter keystore password: ');
    console.log('⏳ Decrypting keystore...');
    const wallet = await Wallet.fromEncryptedJson(keystoreJson, password);
    cachedAccount = privateKeyToAccount(wallet.privateKey);
    return cachedAccount;
  }
  
  // Try default keystore paths
  const defaultPaths = [
    '/home/node/clawd/.keystore/agent.json',
    process.env.KEYSTORE_PATH
  ].filter(Boolean);
  
  for (const kp of defaultPaths) {
    if (fs.existsSync(kp)) {
      try {
        const keystoreJson = fs.readFileSync(kp, 'utf8');
        // Check if it's an encrypted keystore (has crypto field)
        const parsed = JSON.parse(keystoreJson);
        if (parsed.crypto || parsed.Crypto) {
          const password = await promptPassword('🔐 Enter keystore password: ');
          console.log('⏳ Decrypting keystore...');
          const wallet = await Wallet.fromEncryptedJson(keystoreJson, password);
          cachedAccount = privateKeyToAccount(wallet.privateKey);
          return cachedAccount;
        }
        // Plain keystore with privateKey field
        if (parsed.privateKey) {
          cachedAccount = privateKeyToAccount(parsed.privateKey);
          return cachedAccount;
        }
      } catch (e) {
        // Continue to next option
      }
    }
  }
  
  // Try env vars
  const envKey = process.env.X402_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (envKey) {
    cachedAccount = privateKeyToAccount(envKey.startsWith('0x') ? envKey : `0x${envKey}`);
    return cachedAccount;
  }
  
  return null;
}

// Create x402-enabled fetch
async function createX402Fetch(networks = ['base']) {
  const account = await loadWallet();
  if (!account) {
    throw new Error('No wallet configured. Set PRIVATE_KEY, use --keystore <path>, or create keystore.');
  }
  
  // Create scheme registrations for requested networks
  const schemes = [];
  
  // Use wildcard for all EVM chains
  schemes.push({
    network: 'eip155:*',
    client: new ExactEvmScheme(account)
  });
  
  // Wrap native fetch with x402 payment handling
  return wrapFetchWithPaymentFromConfig(fetch, { schemes });
}

// Log payment to history
function logPayment(payment) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  let history = [];
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch (e) {
      history = [];
    }
  }
  
  history.push({
    ...payment,
    timestamp: new Date().toISOString()
  });
  
  // Keep last 100 payments
  if (history.length > 100) {
    history = history.slice(-100);
  }
  
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// Commands
async function status() {
  const account = await loadWallet();
  if (!account) {
    console.log('❌ No wallet configured');
    console.log('Options:');
    console.log('  --keystore <path>  Use encrypted keystore file');
    console.log('  PRIVATE_KEY env    Set private key in environment');
    return { ok: false, error: 'No wallet' };
  }
  
  console.log('🔐 x402 Payment Client Status\n');
  console.log(`Wallet: ${account.address}`);
  console.log('\nSupported networks (all EVM via wildcard):');
  for (const [name, config] of Object.entries(NETWORKS)) {
    console.log(`  - ${config.name} (${config.caip})`);
  }
  
  // Load history stats
  if (fs.existsSync(HISTORY_FILE)) {
    const history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    const total = history.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    console.log(`\n📊 Payment History:`);
    console.log(`  Total payments: ${history.length}`);
    console.log(`  Total spent: $${total.toFixed(4)}`);
  } else {
    console.log('\n📊 No payment history yet');
  }
  
  return { ok: true, address: account.address };
}

async function fetchResource(url, options = {}) {
  const x402Fetch = createX402Fetch();
  
  console.log(`🌐 Fetching: ${url}`);
  console.log(`💳 Payment: Auto (all EVM chains supported)\n`);
  
  try {
    const response = await x402Fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {}
    });
    
    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      
      // Check if payment was made
      const paymentHeader = response.headers.get('PAYMENT-RESPONSE');
      if (paymentHeader) {
        console.log('✅ Payment successful!');
        try {
          const payment = decodePaymentResponseHeader(paymentHeader);
          console.log(`   Network: ${payment.network || 'unknown'}`);
          console.log(`   Amount: ${payment.value || 'unknown'}`);
          if (payment.txHash) console.log(`   Tx: ${payment.txHash}`);
          logPayment({ url, ...payment });
        } catch (e) {
          console.log('   (payment details unavailable)');
          logPayment({ url, paid: true });
        }
      }
      
      // Return response
      if (contentType.includes('application/json')) {
        const data = await response.json();
        console.log('\n📦 Response:');
        console.log(JSON.stringify(data, null, 2));
        return { ok: true, data };
      } else {
        const text = await response.text();
        console.log('\n📦 Response:');
        console.log(text.slice(0, 2000));
        return { ok: true, data: text };
      }
    } else {
      console.log(`❌ Request failed: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.log(text.slice(0, 500));
      return { ok: false, status: response.status, error: text };
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return { ok: false, error: error.message };
  }
}

async function quote(url) {
  console.log(`🔍 Getting payment quote for: ${url}\n`);
  
  try {
    // Make a request without payment to get 402 response
    const response = await fetch(url);
    
    if (response.status === 402) {
      const paymentRequired = response.headers.get('PAYMENT-REQUIRED');
      if (paymentRequired) {
        try {
          const requirements = JSON.parse(atob(paymentRequired));
          console.log('💰 Payment Required:');
          console.log(JSON.stringify(requirements, null, 2));
          return { ok: true, requirements };
        } catch (e) {
          console.log('402 returned but could not parse requirements');
          return { ok: false, error: 'Invalid payment requirements' };
        }
      } else {
        console.log('402 returned but no PAYMENT-REQUIRED header');
        return { ok: false, error: 'Missing payment header' };
      }
    } else if (response.ok) {
      console.log('✅ No payment required for this resource (free)');
      return { ok: true, free: true };
    } else {
      console.log(`Response: ${response.status} ${response.statusText}`);
      return { ok: false, status: response.status };
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return { ok: false, error: error.message };
  }
}

async function history() {
  if (!fs.existsSync(HISTORY_FILE)) {
    console.log('No payment history yet.');
    return { ok: true, payments: [] };
  }
  
  const payments = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  
  console.log('📜 Payment History\n');
  console.log('─'.repeat(60));
  
  for (const p of payments.slice(-20).reverse()) {
    console.log(`${p.timestamp}`);
    console.log(`  URL: ${p.url}`);
    if (p.value) console.log(`  Amount: ${p.value}`);
    if (p.network) console.log(`  Network: ${p.network}`);
    if (p.txHash) console.log(`  Tx: ${p.txHash}`);
    console.log('');
  }
  
  const total = payments.reduce((sum, p) => sum + (parseFloat(p.value) || 0), 0);
  console.log('─'.repeat(60));
  console.log(`Total: ${payments.length} payments`);
  
  return { ok: true, payments, count: payments.length };
}

// CLI
const args = process.argv.slice(2);
const command = args[0];

// Parse --keystore argument
const keystoreIdx = args.indexOf('--keystore');
if (keystoreIdx !== -1 && args[keystoreIdx + 1]) {
  keystorePathArg = args[keystoreIdx + 1];
}

switch (command) {
  case 'status':
    await status();
    break;
    
  case 'fetch':
  case 'pay':
    const urlIdx = args.indexOf('--url');
    const url = urlIdx !== -1 ? args[urlIdx + 1] : args[1];
    if (!url) {
      console.log('Usage: x402.js fetch --url <url>');
      process.exit(1);
    }
    await fetchResource(url);
    break;
    
  case 'quote':
    const quoteUrl = args[1] || args[args.indexOf('--url') + 1];
    if (!quoteUrl) {
      console.log('Usage: x402.js quote <url>');
      process.exit(1);
    }
    await quote(quoteUrl);
    break;
    
  case 'history':
    await history();
    break;
    
  default:
    console.log(`
x402 Payment Client - HTTP-native agent payments

Commands:
  status              Check wallet and payment status
  fetch --url <url>   Fetch resource (auto-pay if 402)
  quote <url>         Get payment quote without paying
  history             Show payment history

Examples:
  node x402.js status
  node x402.js fetch --url https://api.example.com/data
  node x402.js quote https://api.example.com/data

Supported: All EVM chains (Base, Ethereum, Flare, etc.)
Protocol: x402 v2 (exact scheme)
`);
}
