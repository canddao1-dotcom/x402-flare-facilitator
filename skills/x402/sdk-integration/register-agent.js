#!/usr/bin/env node
/**
 * Register CanddaoJr in ERC-8004 Identity Registry
 * 
 * Uses encrypted keystore - NEVER exposes raw private keys
 * Network: Avalanche Fuji Testnet (official ERC-8004 deployment)
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Fuji Testnet Config
const FUJI_RPC = 'https://api.avax-test.network/ext/bc/C/rpc';
const FUJI_CHAIN_ID = 43113;
const IDENTITY_REGISTRY = '0x96eF5c6941d5f8dfB4a39F44E9238b85F01F4d29';
const REGISTRATION_FEE = ethers.parseEther('0.005'); // 0.005 AVAX

// Keystore paths
const KEYSTORE_PATH = '/home/node/clawd/skills/fblpmanager/data/clawd-wallet.json';
const PASSWORD_PATH = '/home/node/.agent-keystore-password';

// Agent details
const AGENT_DOMAIN = 'canddao-jr';
const AGENT_CARD_URI = 'ipfs://bafkreigxzp3vqwvqgqwq7qwpqrqsqtquruvwxyz123456789abcdefghijk'; // Placeholder - will update after IPFS upload

// IdentityRegistry ABI (minimal)
const IDENTITY_ABI = [
  'function newAgent(string domain, string agentCardURI) payable returns (uint256)',
  'function getAgent(uint256 tokenId) view returns (uint256 id, string domain, address owner, string metadataURI)',
  'function resolveByDomain(string domain) view returns (uint256 tokenId, address owner, string agentCardURI)',
  'function isDomainAvailable(string domain) view returns (bool)',
  'function getAgentCount() view returns (uint256)',
  'event AgentRegistered(uint256 indexed tokenId, string domain, address indexed owner, string agentCardURI)'
];

async function loadWallet() {
  const keystore = JSON.parse(fs.readFileSync(KEYSTORE_PATH, 'utf8'));
  const password = fs.readFileSync(PASSWORD_PATH, 'utf8').trim();
  
  console.log('🔐 Decrypting wallet (never exposing private key)...');
  const wallet = await ethers.Wallet.fromEncryptedJson(JSON.stringify(keystore), password);
  const provider = new ethers.JsonRpcProvider(FUJI_RPC, FUJI_CHAIN_ID);
  return wallet.connect(provider);
}

async function checkBalance(wallet) {
  const balance = await wallet.provider.getBalance(wallet.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} AVAX`);
  
  if (balance < REGISTRATION_FEE) {
    console.log('\n⚠️  Insufficient AVAX for registration fee (0.005 AVAX)');
    console.log('Get testnet AVAX from: https://faucet.avax.network/');
    console.log(`Address: ${wallet.address}`);
    return false;
  }
  return true;
}

async function checkDomainAvailable(contract, domain) {
  const available = await contract.isDomainAvailable(domain);
  if (!available) {
    // Check if we own it
    try {
      const info = await contract.resolveByDomain(domain);
      console.log(`\n📋 Domain "${domain}" already registered:`);
      console.log(`   Token ID: ${info[0]}`);
      console.log(`   Owner: ${info[1]}`);
      console.log(`   URI: ${info[2]}`);
      return { available: false, owned: true, info };
    } catch {
      return { available: false, owned: false };
    }
  }
  return { available: true };
}

async function main() {
  const cmd = process.argv[2] || 'status';
  
  console.log('\n🤖 ERC-8004 Agent Registration');
  console.log('================================');
  console.log(`Network: Avalanche Fuji Testnet`);
  console.log(`Registry: ${IDENTITY_REGISTRY}`);
  console.log(`Domain: ${AGENT_DOMAIN}`);
  console.log('');
  
  const wallet = await loadWallet();
  console.log(`📍 Wallet: ${wallet.address}`);
  
  const contract = new ethers.Contract(IDENTITY_REGISTRY, IDENTITY_ABI, wallet);
  
  if (cmd === 'status' || cmd === 'check') {
    // Check status
    await checkBalance(wallet);
    
    const count = await contract.getAgentCount();
    console.log(`\n📊 Total registered agents: ${count}`);
    
    const domainStatus = await checkDomainAvailable(contract, AGENT_DOMAIN);
    if (domainStatus.available) {
      console.log(`\n✅ Domain "${AGENT_DOMAIN}" is available!`);
    }
  }
  
  else if (cmd === 'register') {
    // Register agent
    const hasBalance = await checkBalance(wallet);
    if (!hasBalance) {
      process.exit(1);
    }
    
    const domainStatus = await checkDomainAvailable(contract, AGENT_DOMAIN);
    if (!domainStatus.available) {
      if (domainStatus.owned) {
        console.log('\n✅ Already registered! Nothing to do.');
      } else {
        console.log('\n❌ Domain taken by someone else.');
      }
      process.exit(0);
    }
    
    // Use provided URI or default
    const agentCardURI = process.argv[3] || AGENT_CARD_URI;
    
    console.log(`\n📝 Registering agent...`);
    console.log(`   Domain: ${AGENT_DOMAIN}`);
    console.log(`   URI: ${agentCardURI}`);
    console.log(`   Fee: 0.005 AVAX`);
    
    try {
      const tx = await contract.newAgent(AGENT_DOMAIN, agentCardURI, {
        value: REGISTRATION_FEE
      });
      
      console.log(`\n⏳ Transaction submitted: ${tx.hash}`);
      console.log('   Waiting for confirmation...');
      
      const receipt = await tx.wait();
      console.log(`\n✅ Agent registered!`);
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   Gas used: ${receipt.gasUsed}`);
      
      // Get the token ID from logs
      const event = receipt.logs.find(log => {
        try {
          const parsed = contract.interface.parseLog(log);
          return parsed?.name === 'AgentRegistered';
        } catch { return false; }
      });
      
      if (event) {
        const parsed = contract.interface.parseLog(event);
        console.log(`\n🎉 Agent Token ID: ${parsed.args[0]}`);
      }
      
      // Verify registration
      const info = await contract.resolveByDomain(AGENT_DOMAIN);
      console.log(`\n📋 Verified registration:`);
      console.log(`   Token ID: ${info[0]}`);
      console.log(`   Owner: ${info[1]}`);
      console.log(`   URI: ${info[2]}`);
      
    } catch (error) {
      console.error('\n❌ Registration failed:', error.message);
      if (error.message.includes('insufficient funds')) {
        console.log('\nGet testnet AVAX from: https://faucet.avax.network/');
      }
      process.exit(1);
    }
  }
  
  else {
    console.log('Usage:');
    console.log('  node register-agent.js status    - Check domain availability');
    console.log('  node register-agent.js register  - Register agent');
    console.log('  node register-agent.js register <ipfs-uri>  - Register with custom URI');
  }
  
  console.log('\n✨ Done\n');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
