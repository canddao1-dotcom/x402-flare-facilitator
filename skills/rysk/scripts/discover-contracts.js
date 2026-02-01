#!/usr/bin/env node
/**
 * Rysk Contract Discovery
 * Attempts to find Rysk vault contracts on HyperEVM
 */

const { ethers } = require('ethers');

const HYPEREVM_RPC = 'https://rpc.hyperliquid.xyz/evm';
const FXRP_ADDRESS = '0xd70659a6396285bf7214d7ea9673184e7c72e07e';

// Known Rysk contract patterns to look for
const KNOWN_PATTERNS = {
  // Rysk V1 style vaults
  ryskV1: {
    methods: [
      'deposit(uint256)',
      'withdraw(uint256)', 
      'sellOption(uint256,uint256,uint256)',
    ]
  },
  // Generic option vault
  optionVault: {
    methods: [
      'underlying()',
      'strikeAsset()',
      'collateralAsset()'
    ]
  }
};

// Transfer event signature
const TRANSFER_EVENT = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
// Approval event signature  
const APPROVAL_EVENT = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';

async function findContracts() {
  const provider = new ethers.JsonRpcProvider(HYPEREVM_RPC, 999);
  
  console.log('🔍 Searching for Rysk contracts on HyperEVM...\n');
  
  // Get recent block
  const latestBlock = await provider.getBlockNumber();
  console.log('Latest block:', latestBlock);
  
  // Look for fXRP approval events (indicates vault interactions)
  console.log('\nSearching for fXRP approval events...');
  
  try {
    const fromBlock = Math.max(0, latestBlock - 100000); // Last ~100k blocks
    
    const approvalLogs = await provider.getLogs({
      address: FXRP_ADDRESS,
      topics: [APPROVAL_EVENT],
      fromBlock: fromBlock,
      toBlock: 'latest'
    });
    
    console.log('Found', approvalLogs.length, 'approval events');
    
    // Extract unique spender addresses
    const spenders = new Set();
    for (const log of approvalLogs) {
      if (log.topics[2]) {
        const spender = '0x' + log.topics[2].slice(26);
        spenders.add(spender.toLowerCase());
      }
    }
    
    console.log('\nUnique spenders (potential vaults):');
    for (const spender of spenders) {
      console.log(' -', spender);
      
      // Check if it's a contract
      const code = await provider.getCode(spender);
      if (code !== '0x') {
        console.log('   ✓ Contract detected');
        
        // Try to identify contract type
        const contract = new ethers.Contract(spender, [
          'function name() view returns (string)',
          'function symbol() view returns (string)',
          'function underlying() view returns (address)',
        ], provider);
        
        try {
          const name = await contract.name();
          console.log('   Name:', name);
        } catch (e) {}
        
        try {
          const underlying = await contract.underlying();
          console.log('   Underlying:', underlying);
          if (underlying.toLowerCase() === FXRP_ADDRESS.toLowerCase()) {
            console.log('   🎯 POTENTIAL RYSK VAULT FOR fXRP!');
          }
        } catch (e) {}
      }
    }
    
  } catch (error) {
    console.log('Error querying logs:', error.message);
  }
  
  // Look for fXRP transfer events to contracts
  console.log('\nSearching for fXRP transfers to contracts...');
  
  try {
    const fromBlock = Math.max(0, latestBlock - 50000);
    
    const transferLogs = await provider.getLogs({
      address: FXRP_ADDRESS,
      topics: [TRANSFER_EVENT],
      fromBlock: fromBlock,
      toBlock: 'latest'
    });
    
    console.log('Found', transferLogs.length, 'transfer events');
    
    // Find unique recipients that are contracts
    const recipients = new Map(); // address -> count
    for (const log of transferLogs) {
      if (log.topics[2]) {
        const to = '0x' + log.topics[2].slice(26);
        recipients.set(to.toLowerCase(), (recipients.get(to.toLowerCase()) || 0) + 1);
      }
    }
    
    // Sort by count and check top recipients
    const sorted = [...recipients.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    
    console.log('\nTop fXRP recipients:');
    for (const [addr, count] of sorted) {
      const code = await provider.getCode(addr);
      const isContract = code !== '0x';
      console.log(` - ${addr} (${count} transfers) ${isContract ? '📦 Contract' : '👤 EOA'}`);
    }
    
  } catch (error) {
    console.log('Error querying transfers:', error.message);
  }
  
  console.log('\n---');
  console.log('💡 To find Rysk contracts:');
  console.log('1. Check transactions on https://app.rysk.finance');
  console.log('2. Look at explorer: https://purrsec.com');
  console.log('3. Check Rysk docs for contract addresses');
}

findContracts().catch(console.error);
