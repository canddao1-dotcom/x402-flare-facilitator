#!/usr/bin/env node
/**
 * x402 Flare Bounty System
 * 
 * $100 USD₮0 bounty pool for agents who successfully connect
 * and request payment via x402 on Flare.
 * 
 * Bounty: $1 USD₮0 per successful first connection (max 100 agents)
 */

import { createPublicClient, createWalletClient, http, formatUnits, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { flare } from 'viem/chains';
import { Wallet } from 'ethers';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const CLAIMS_FILE = path.join(DATA_DIR, 'bounty-claims.json');

// Config
const RPC_URL = 'https://flare-api.flare.network/ext/C/rpc';
const USDT0_ADDRESS = '0xe7cd86e13AC4309349F30B3435a9d337750fC82D';
const BOUNTY_AMOUNT = parseUnits('1', 6); // $1 USD₮0 per claim
const MAX_CLAIMS = 100; // Total bounty pool: $100

// ERC20 ABI
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

// Public client
const publicClient = createPublicClient({
  chain: flare,
  transport: http(RPC_URL)
});

// Load claims database
function loadClaims() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(CLAIMS_FILE)) {
    return JSON.parse(fs.readFileSync(CLAIMS_FILE, 'utf8'));
  }
  return { claims: [], totalPaid: '0' };
}

// Save claims
function saveClaims(data) {
  fs.writeFileSync(CLAIMS_FILE, JSON.stringify(data, null, 2));
}

// Check if address already claimed
function hasClaimed(address) {
  const data = loadClaims();
  return data.claims.some(c => c.address.toLowerCase() === address.toLowerCase());
}

// Get bounty status
async function status() {
  const data = loadClaims();
  const remaining = MAX_CLAIMS - data.claims.length;
  
  // Check pool balance
  const balance = await publicClient.readContract({
    address: USDT0_ADDRESS,
    abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }],
    functionName: 'balanceOf',
    args: [process.env.BOUNTY_WALLET || '0x0DFa93560e0DCfF78F7e3985826e42e53E9493cC']
  });
  
  console.log(`
🎯 x402 Flare Bounty Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Bounty:        $1 USD₮0 per first connection
Pool:          $${formatUnits(balance, 6)} USD₮0 available
Claims:        ${data.claims.length} / ${MAX_CLAIMS}
Remaining:     ${remaining} slots

How to claim:
1. Connect to Flare x402 facilitator
2. Send valid payment request
3. Receive $1 USD₮0 bounty automatically

Facilitator:   http://localhost:3402
Network:       Flare (eip155:14)
Asset:         USD₮0

Recent claims:
${data.claims.slice(-5).map(c => `  ${c.timestamp} - ${c.address.slice(0,10)}... ($${formatUnits(c.amount, 6)})`).join('\n') || '  None yet'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
  
  return {
    poolBalance: formatUnits(balance, 6),
    claims: data.claims.length,
    maxClaims: MAX_CLAIMS,
    remaining
  };
}

// Process bounty claim
async function processClaim(agentAddress, walletClient) {
  // Validate address
  if (!agentAddress || !agentAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
    return { success: false, error: 'Invalid address' };
  }
  
  // Check if already claimed
  if (hasClaimed(agentAddress)) {
    return { success: false, error: 'Address already claimed bounty' };
  }
  
  // Check remaining slots
  const data = loadClaims();
  if (data.claims.length >= MAX_CLAIMS) {
    return { success: false, error: 'Bounty pool exhausted' };
  }
  
  try {
    // Send bounty
    const hash = await walletClient.writeContract({
      address: USDT0_ADDRESS,
      abi: [{ name: 'transfer', type: 'function', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }],
      functionName: 'transfer',
      args: [agentAddress, BOUNTY_AMOUNT]
    });
    
    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    // Record claim
    data.claims.push({
      address: agentAddress,
      amount: BOUNTY_AMOUNT.toString(),
      txHash: hash,
      timestamp: new Date().toISOString()
    });
    data.totalPaid = (BigInt(data.totalPaid) + BOUNTY_AMOUNT).toString();
    saveClaims(data);
    
    console.log(`✅ Bounty paid: $1 USD₮0 to ${agentAddress}`);
    console.log(`   Tx: ${hash}`);
    
    return {
      success: true,
      amount: '1.000000',
      txHash: hash,
      remaining: MAX_CLAIMS - data.claims.length
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// List all claims
function listClaims() {
  const data = loadClaims();
  console.log('\n📋 All Bounty Claims\n');
  console.log('Address                                      | Amount    | Tx Hash');
  console.log('─'.repeat(80));
  
  for (const claim of data.claims) {
    console.log(`${claim.address} | $${formatUnits(claim.amount, 6)} | ${claim.txHash.slice(0,20)}...`);
  }
  
  console.log('─'.repeat(80));
  console.log(`Total: ${data.claims.length} claims, $${formatUnits(data.totalPaid, 6)} paid`);
}

// CLI
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'status':
    await status();
    break;
    
  case 'list':
    listClaims();
    break;
    
  case 'check':
    const addr = args[1];
    if (!addr) {
      console.log('Usage: bounty.js check <address>');
      process.exit(1);
    }
    console.log(hasClaimed(addr) ? '✅ Address has claimed' : '❌ Address has NOT claimed');
    break;
    
  default:
    console.log(`
x402 Flare Bounty System

Commands:
  status          Show bounty pool status
  list            List all claims
  check <addr>    Check if address has claimed

The bounty is paid automatically when agents connect to the facilitator.
`);
}

export { processClaim, hasClaimed, status };
