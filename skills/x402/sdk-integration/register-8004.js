#!/usr/bin/env node
/**
 * Register CanddaoJr on Official ERC-8004 Registry
 * 
 * Contract: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 * Network: Ethereum Mainnet
 * 
 * Uses encrypted keystore - NEVER exposes raw private keys
 */

const { ethers } = require('ethers');
const fs = require('fs');

// Ethereum Mainnet Config
const ETH_RPC = 'https://ethereum-rpc.publicnode.com';
const ETH_CHAIN_ID = 1;
const REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

// Keystore paths
const KEYSTORE_PATH = '/home/node/clawd/skills/fblpmanager/data/clawd-wallet.json';
const PASSWORD_PATH = '/home/node/.agent-keystore-password';

// Agent metadata
const AGENT_NAME = 'CanddaoJr';
const AGENT_DESC = 'AI trading assistant - sharp, relentless, detail-obsessed. Specialized in DeFi, LP management, and on-chain analysis across Flare, HyperEVM, and Base networks.';

// Optional services
const SERVICES = [
  { name: 'web', endpoint: 'https://moltbook.com/u/CanddaoJr' },
  { name: 'x402', endpoint: 'https://agent-tips.vercel.app' },
  // { name: 'A2A', endpoint: 'https://.../.well-known/agent-card.json', version: '0.3.0' },
];

// Registry ABI
const REGISTRY_ABI = [
  'function register(string agentURI) returns (uint256 agentId)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function balanceOf(address owner) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
];

async function loadWallet() {
  const keystore = JSON.parse(fs.readFileSync(KEYSTORE_PATH, 'utf8'));
  const password = fs.readFileSync(PASSWORD_PATH, 'utf8').trim();
  
  console.log('🔐 Decrypting wallet (private key never exposed)...');
  const wallet = await ethers.Wallet.fromEncryptedJson(JSON.stringify(keystore), password);
  const provider = new ethers.JsonRpcProvider(ETH_RPC, ETH_CHAIN_ID);
  return wallet.connect(provider);
}

function createAgentURI() {
  const metadata = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: AGENT_NAME,
    description: AGENT_DESC,
    image: '', // Optional: IPFS image URL
    active: true,
    x402Support: true,
  };
  
  if (SERVICES.length > 0) {
    metadata.services = SERVICES;
  }
  
  // Encode as data URI (base64)
  const json = JSON.stringify(metadata);
  const base64 = Buffer.from(json).toString('base64');
  return `data:application/json;base64,${base64}`;
}

async function main() {
  const cmd = process.argv[2] || 'status';
  
  console.log('\n🤖 ERC-8004 Official Registry');
  console.log('==============================');
  console.log(`Contract: ${REGISTRY}`);
  console.log(`Network: Ethereum Mainnet`);
  console.log(`Agent: ${AGENT_NAME}`);
  console.log('');
  
  const wallet = await loadWallet();
  console.log(`📍 Wallet: ${wallet.address}`);
  
  const provider = wallet.provider;
  const balance = await provider.getBalance(wallet.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH`);
  
  const contract = new ethers.Contract(REGISTRY, REGISTRY_ABI, wallet);
  
  if (cmd === 'status' || cmd === 'check') {
    // Check if already registered
    try {
      const ownedCount = await contract.balanceOf(wallet.address);
      console.log(`\n📊 Agents owned by this wallet: ${ownedCount}`);
      
      if (ownedCount > 0n) {
        console.log('✅ You already have agent(s) registered!');
      }
    } catch (e) {
      console.log('Could not check owned agents:', e.message);
    }
    
    // Check balance requirement
    const minBalance = ethers.parseEther('0.005');
    if (balance < minBalance) {
      console.log(`\n⚠️  Need at least 0.005 ETH for gas`);
      console.log(`   Current: ${ethers.formatEther(balance)} ETH`);
      console.log(`   Send ETH to: ${wallet.address}`);
    } else {
      console.log('\n✅ Sufficient balance for registration');
    }
    
    // Show agent metadata
    console.log('\n📋 Agent Metadata:');
    const uri = createAgentURI();
    const decoded = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString());
    console.log(JSON.stringify(decoded, null, 2));
  }
  
  else if (cmd === 'register') {
    // Check balance
    const minBalance = ethers.parseEther('0.005');
    if (balance < minBalance) {
      console.error(`\n❌ Insufficient balance`);
      console.log(`   Need: 0.005 ETH`);
      console.log(`   Have: ${ethers.formatEther(balance)} ETH`);
      console.log(`   Send ETH to: ${wallet.address}`);
      process.exit(1);
    }
    
    const uri = createAgentURI();
    
    console.log(`\n📝 Registering "${AGENT_NAME}"...`);
    console.log(`   Description: ${AGENT_DESC.slice(0, 60)}...`);
    
    // Estimate gas
    try {
      const gasEstimate = await contract.register.estimateGas(uri);
      const gasPrice = await provider.getFeeData();
      const estimatedCost = gasEstimate * gasPrice.gasPrice;
      console.log(`   Estimated gas: ${gasEstimate} (~${ethers.formatEther(estimatedCost)} ETH)`);
    } catch (e) {
      console.log('   Gas estimation failed, proceeding anyway...');
    }
    
    // Send transaction
    console.log('\n⏳ Sending transaction...');
    const tx = await contract.register(uri);
    console.log(`   TX: https://etherscan.io/tx/${tx.hash}`);
    
    console.log('⏳ Waiting for confirmation...');
    const receipt = await tx.wait();
    console.log(`   Block: ${receipt.blockNumber}`);
    console.log(`   Gas used: ${receipt.gasUsed}`);
    
    // Find agent ID from Transfer event
    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    const transferLog = receipt.logs.find(log => 
      log.topics[0] === transferTopic && 
      log.address.toLowerCase() === REGISTRY.toLowerCase()
    );
    
    if (transferLog) {
      const agentId = BigInt(transferLog.topics[3]).toString();
      console.log(`\n✅ Registered! Agent #${agentId}`);
      console.log(`   View: https://etherscan.io/nft/${REGISTRY}/${agentId}`);
      console.log(`   8004scan: https://www.8004scan.io/agents/ethereum/${agentId}`);
    } else {
      console.log('\n✅ Registration complete! Check etherscan for your agent ID.');
    }
  }
  
  else {
    console.log('Usage:');
    console.log('  node register-8004.js status    - Check balance & preview metadata');
    console.log('  node register-8004.js register  - Register agent on-chain');
  }
  
  console.log('\n✨ Done\n');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
