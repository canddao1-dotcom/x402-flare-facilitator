#!/usr/bin/env node
/**
 * Check bridge delivery status on HyperEVM
 */

const { ethers } = require('ethers');

const HYPEREVM_RPC = 'https://rpc.hyperliquid.xyz';
const FLARE_RPC = 'https://flare-api.flare.network/ext/C/rpc';

// Token addresses on HyperEVM (bridged versions)
const HYPEREVM_TOKENS = {
  FXRP: null, // Will be discovered or configured
};

// Flare token addresses
const FLARE_TOKENS = {
  FXRP: '0xAd552A648C74D49E10027AB8a618A3ad4901c5bE'
};

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)'
];

async function checkHyperEVMBalance(address) {
  const provider = new ethers.JsonRpcProvider(HYPEREVM_RPC);
  
  console.log('=== HyperEVM Balances ===');
  console.log('Address:', address);
  console.log('RPC:', HYPEREVM_RPC);
  
  // Check native HYPE balance
  try {
    const hypeBalance = await provider.getBalance(address);
    console.log('\nHYPE (native):', ethers.formatEther(hypeBalance));
  } catch (e) {
    console.log('Error checking HYPE:', e.message);
  }
  
  // Try to find FXRP on HyperEVM by checking common token patterns
  // The bridged token address might be deterministic based on the OFT
  console.log('\nSearching for bridged FXRP...');
  
  // Check the LayerZero scan for the destination token
  console.log('Check LayerZero scan for token delivery confirmation');
  
  return { checked: true };
}

async function checkFlareBalance(address, token = 'FXRP') {
  const provider = new ethers.JsonRpcProvider(FLARE_RPC);
  const tokenAddr = FLARE_TOKENS[token.toUpperCase()];
  
  if (!tokenAddr) {
    console.log('Unknown token:', token);
    return;
  }
  
  const contract = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
  const balance = await contract.balanceOf(address);
  const decimals = await contract.decimals();
  
  console.log(`${token} on Flare:`, ethers.formatUnits(balance, decimals));
  return balance;
}

async function checkBridgeTx(txHash) {
  const provider = new ethers.JsonRpcProvider(FLARE_RPC);
  
  console.log('=== Bridge TX Status ===');
  console.log('TX:', txHash);
  
  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    
    if (!receipt) {
      console.log('Status: Pending (not yet mined)');
      return { status: 'pending' };
    }
    
    if (receipt.status === 0) {
      console.log('Status: FAILED');
      return { status: 'failed' };
    }
    
    console.log('Status: Confirmed on Flare');
    console.log('Block:', receipt.blockNumber);
    console.log('Gas Used:', receipt.gasUsed.toString());
    
    // Parse logs to find LayerZero message
    const lzEndpoint = '0x1a44076050125825900e736c501f859c50fE728c'.toLowerCase();
    const lzLogs = receipt.logs.filter(l => l.address.toLowerCase() === lzEndpoint);
    
    if (lzLogs.length > 0) {
      console.log('\nLayerZero message sent!');
      console.log('LZ Logs:', lzLogs.length);
      
      // The message should arrive on HyperEVM within 1-5 minutes
      const block = await provider.getBlock(receipt.blockNumber);
      const txTime = new Date(block.timestamp * 1000);
      const now = new Date();
      const elapsed = Math.floor((now - txTime) / 1000 / 60);
      
      console.log('TX Time:', txTime.toISOString());
      console.log('Elapsed:', elapsed, 'minutes');
      
      if (elapsed < 5) {
        console.log('\n⏳ Bridge in progress (usually 1-5 min)');
        return { status: 'bridging', elapsed };
      } else {
        console.log('\n✅ Should have arrived by now');
        console.log('Check HyperEVM balance or LayerZero scan');
        return { status: 'likely_delivered', elapsed };
      }
    }
    
    return { status: 'confirmed', receipt };
  } catch (e) {
    console.log('Error:', e.message);
    return { status: 'error', error: e.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  
  switch (cmd) {
    case 'hyperevm':
    case 'dest':
      const addr = args[1];
      if (!addr) {
        console.log('Usage: check-delivery.js hyperevm <address>');
        return;
      }
      await checkHyperEVMBalance(addr);
      break;
      
    case 'flare':
    case 'source':
      const flareAddr = args[1];
      const token = args[2] || 'FXRP';
      if (!flareAddr) {
        console.log('Usage: check-delivery.js flare <address> [token]');
        return;
      }
      await checkFlareBalance(flareAddr, token);
      break;
      
    case 'tx':
      const txHash = args[1];
      if (!txHash) {
        console.log('Usage: check-delivery.js tx <txHash>');
        return;
      }
      await checkBridgeTx(txHash);
      break;
      
    default:
      console.log(`
Bridge Delivery Checker

Commands:
  hyperevm <address>     Check balances on HyperEVM
  flare <address>        Check balances on Flare
  tx <txHash>            Check bridge transaction status

Examples:
  check-delivery.js tx 0x1df1d092...
  check-delivery.js hyperevm 0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A
`);
  }
}

main().catch(console.error);
