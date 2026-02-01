#!/usr/bin/env node
/**
 * Verify Agent Wallet Setup
 * 
 * Checks balances across all chains and validates keystores.
 */

import { createPublicClient, http, formatEther, formatUnits } from 'viem';
import { flare } from 'viem/chains';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Network configs
const NETWORKS = {
  flare: {
    name: 'Flare',
    chainId: 14,
    rpc: 'https://flare-api.flare.network/ext/C/rpc',
    explorer: 'https://flarescan.com',
    currency: 'FLR',
    decimals: 18
  },
  base: {
    name: 'Base',
    chainId: 8453,
    rpc: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    currency: 'ETH',
    decimals: 18
  },
  hyperevm: {
    name: 'HyperEVM',
    chainId: 999,
    rpc: 'https://rpc.hyperliquid.xyz/evm',
    explorer: 'https://explorer.hyperliquid.xyz',
    currency: 'HYPE',
    decimals: 18
  }
};

async function getEvmBalance(rpc, address) {
  try {
    const response = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBalance',
        params: [address, 'latest']
      })
    });
    const data = await response.json();
    if (data.result) {
      return BigInt(data.result);
    }
    return 0n;
  } catch (e) {
    return null; // Network error
  }
}

async function getSolanaBalance(address) {
  try {
    const response = await fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [address]
      })
    });
    const data = await response.json();
    if (data.result?.value !== undefined) {
      return BigInt(data.result.value);
    }
    return 0n;
  } catch (e) {
    return null;
  }
}

function formatBalance(balance, decimals) {
  if (balance === null) return '❌ Network error';
  if (balance === 0n) return '0';
  const divisor = 10n ** BigInt(decimals);
  const whole = balance / divisor;
  const frac = balance % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4);
  return `${whole}.${fracStr}`.replace(/\.?0+$/, '') || '0';
}

async function verify(agentName) {
  const dataDir = path.join(__dirname, '..', 'data', agentName);
  
  if (!fs.existsSync(dataDir)) {
    console.error(`❌ Agent '${agentName}' not found`);
    process.exit(1);
  }
  
  const summaryPath = path.join(dataDir, 'wallet-summary.json');
  if (!fs.existsSync(summaryPath)) {
    console.error(`❌ wallet-summary.json not found for '${agentName}'`);
    process.exit(1);
  }
  
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              🔍 Agent Wallet Verification                    ║
╚══════════════════════════════════════════════════════════════╝

Agent: ${agentName}
Created: ${summary.createdAt}
`);

  // Check EVM balances
  const evmAddress = summary.wallets.evm.address;
  console.log(`📍 EVM Address: ${evmAddress}\n`);
  
  for (const [network, config] of Object.entries(NETWORKS)) {
    const balance = await getEvmBalance(config.rpc, evmAddress);
    const formatted = formatBalance(balance, config.decimals);
    const status = balance && balance > 0n ? '✅' : '⚠️';
    console.log(`   ${status} ${config.name.padEnd(10)} ${formatted} ${config.currency}`);
  }
  
  // Check Solana balance
  const solAddress = summary.wallets.solana.address;
  console.log(`\n📍 Solana Address: ${solAddress}\n`);
  
  const solBalance = await getSolanaBalance(solAddress);
  const solFormatted = formatBalance(solBalance, 9);
  const solStatus = solBalance && solBalance > 0n ? '✅' : '⚠️';
  console.log(`   ${solStatus} Solana     ${solFormatted} SOL`);
  
  // Check keystore files
  console.log('\n📁 Keystore Files:\n');
  
  const evmKeystore = path.join(dataDir, 'evm-keystore.json');
  const solKeystore = path.join(dataDir, 'solana-keystore.json');
  const passFile = path.join(dataDir, 'PASSPHRASE.json');
  
  console.log(`   ${fs.existsSync(evmKeystore) ? '✅' : '❌'} evm-keystore.json`);
  console.log(`   ${fs.existsSync(solKeystore) ? '✅' : '❌'} solana-keystore.json`);
  console.log(`   ${fs.existsSync(passFile) ? '⚠️  PASSPHRASE.json (move to secure location!)' : '✅ PASSPHRASE.json (moved)'}`);
  
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                      Funding Links                           ║
╚══════════════════════════════════════════════════════════════╝

   Flare:    ${NETWORKS.flare.explorer}/address/${evmAddress}
   Base:     ${NETWORKS.base.explorer}/address/${evmAddress}
   HyperEVM: ${NETWORKS.hyperevm.explorer}/address/${evmAddress}
   Solana:   https://solscan.io/account/${solAddress}
`);
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const agentName = args[0] || args.find(a => a.startsWith('--name='))?.split('=')[1];
  
  if (!agentName) {
    console.error('Usage: verify.js <agent-name>');
    process.exit(1);
  }
  
  await verify(agentName.replace('--name=', ''));
}

main().catch(console.error);
