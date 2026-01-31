#!/usr/bin/env node
/**
 * x402 Bounty Whitelist Manager
 * 
 * Add/remove agents from the bounty whitelist.
 * Agents must post in m/payments on Moltbook to get whitelisted.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const WHITELIST_FILE = path.join(DATA_DIR, 'bounty-whitelist.json');
const CLAIMS_FILE = path.join(DATA_DIR, 'bounty-claims.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadWhitelist() {
  ensureDataDir();
  if (fs.existsSync(WHITELIST_FILE)) {
    return JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf8'));
  }
  return { agents: [] };
}

function saveWhitelist(data) {
  ensureDataDir();
  fs.writeFileSync(WHITELIST_FILE, JSON.stringify(data, null, 2));
}

function loadClaims() {
  if (fs.existsSync(CLAIMS_FILE)) {
    return JSON.parse(fs.readFileSync(CLAIMS_FILE, 'utf8'));
  }
  return { claims: [], totalPaid: '0' };
}

// Add agent to whitelist
function addAgent(address, moltbookAgent, moltbookPostUrl) {
  if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
    console.log('❌ Invalid address format');
    return false;
  }
  
  const data = loadWhitelist();
  
  // Check if already whitelisted
  if (data.agents.some(a => a.address.toLowerCase() === address.toLowerCase())) {
    console.log('⚠️ Address already whitelisted');
    return false;
  }
  
  data.agents.push({
    address: address.toLowerCase(),
    moltbookAgent,
    moltbookPostUrl,
    approvedAt: new Date().toISOString()
  });
  
  saveWhitelist(data);
  console.log(`✅ Whitelisted: ${address}`);
  console.log(`   Moltbook: @${moltbookAgent}`);
  console.log(`   Post: ${moltbookPostUrl || 'N/A'}`);
  return true;
}

// Remove agent from whitelist
function removeAgent(address) {
  const data = loadWhitelist();
  const before = data.agents.length;
  data.agents = data.agents.filter(a => a.address.toLowerCase() !== address.toLowerCase());
  
  if (data.agents.length < before) {
    saveWhitelist(data);
    console.log(`✅ Removed from whitelist: ${address}`);
    return true;
  } else {
    console.log('❌ Address not found in whitelist');
    return false;
  }
}

// Check agent status
function checkAgent(address) {
  const whitelist = loadWhitelist();
  const claims = loadClaims();
  
  const whitelisted = whitelist.agents.find(a => a.address.toLowerCase() === address.toLowerCase());
  const claimed = claims.claims.find(c => c.address.toLowerCase() === address.toLowerCase());
  
  console.log(`\n📋 Status for ${address}\n`);
  
  if (whitelisted) {
    console.log('✅ Whitelisted');
    console.log(`   Moltbook: @${whitelisted.moltbookAgent}`);
    console.log(`   Approved: ${whitelisted.approvedAt}`);
  } else {
    console.log('❌ NOT whitelisted');
  }
  
  if (claimed) {
    console.log('💰 Already claimed bounty');
    console.log(`   Tx: ${claimed.txHash}`);
    console.log(`   Date: ${claimed.timestamp}`);
  } else if (whitelisted) {
    console.log('🎁 Eligible to claim bounty!');
  }
}

// List all whitelisted agents
function listAgents() {
  const whitelist = loadWhitelist();
  const claims = loadClaims();
  
  console.log('\n📋 Whitelisted Agents\n');
  console.log('─'.repeat(80));
  console.log('Address                                    | Moltbook Agent     | Claimed');
  console.log('─'.repeat(80));
  
  for (const agent of whitelist.agents) {
    const claimed = claims.claims.some(c => c.address.toLowerCase() === agent.address.toLowerCase());
    console.log(`${agent.address} | @${(agent.moltbookAgent || 'unknown').padEnd(17)} | ${claimed ? '✅ Yes' : '❌ No'}`);
  }
  
  console.log('─'.repeat(80));
  console.log(`Total: ${whitelist.agents.length} whitelisted, ${claims.claims.length} claimed`);
}

// Show status
function status() {
  const whitelist = loadWhitelist();
  const claims = loadClaims();
  
  console.log(`
🎯 x402 Flare Bounty Whitelist Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Whitelisted:  ${whitelist.agents.length} agents
Claimed:      ${claims.claims.length} / 100
Remaining:    ${100 - claims.claims.length} bounties
Pool spent:   $${(Number(claims.totalPaid) / 1e6).toFixed(2)} USD₮0

Recent whitelist additions:
${whitelist.agents.slice(-5).map(a => `  @${a.moltbookAgent} - ${a.address.slice(0,10)}...`).join('\n') || '  None'}

Recent claims:
${claims.claims.slice(-5).map(c => `  @${c.moltbookAgent || 'unknown'} - $1 (${c.timestamp.split('T')[0]})`).join('\n') || '  None'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

// CLI
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'add':
    const address = args[1];
    const agent = args[2] || args[args.indexOf('--agent') + 1];
    const postUrl = args[3] || args[args.indexOf('--post') + 1];
    
    if (!address || !agent) {
      console.log('Usage: whitelist.js add <address> <moltbook-agent> [post-url]');
      console.log('Example: whitelist.js add 0x123... Starclawd https://moltbook.com/p/xyz');
      process.exit(1);
    }
    addAgent(address, agent, postUrl);
    break;
    
  case 'remove':
    if (!args[1]) {
      console.log('Usage: whitelist.js remove <address>');
      process.exit(1);
    }
    removeAgent(args[1]);
    break;
    
  case 'check':
    if (!args[1]) {
      console.log('Usage: whitelist.js check <address>');
      process.exit(1);
    }
    checkAgent(args[1]);
    break;
    
  case 'list':
    listAgents();
    break;
    
  case 'status':
    status();
    break;
    
  default:
    console.log(`
x402 Bounty Whitelist Manager

Commands:
  add <addr> <agent> [url]  Add agent to whitelist
  remove <address>          Remove from whitelist
  check <address>           Check agent status
  list                      List all whitelisted agents
  status                    Show overall status

Examples:
  node whitelist.js add 0x123... Starclawd https://moltbook.com/p/abc
  node whitelist.js check 0x123...
  node whitelist.js list
`);
}
