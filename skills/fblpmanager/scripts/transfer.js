#!/usr/bin/env node
/**
 * Transfer tokens (FLR or any ERC20)
 * 
 * Usage: 
 *   node transfer.js <to> <amount> [token]
 *   node transfer.js <to> <amount> FLR          # Native FLR
 *   node transfer.js <to> <amount> WFLR         # WFLR token
 *   node transfer.js <to> <amount> 0x1234...    # Any ERC20 by address
 * 
 * Uses wallet from CLAWD_WALLET_KEY env or data/clawd-wallet.json
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const FLARE_RPC = process.env.FLARE_RPC || 'https://flare-api.flare.network/ext/C/rpc';

// Known tokens
const TOKENS = {
  'WFLR': '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d',
  'sFLR': '0x12e605bc104e93B45e1aD99F9e555f659051c2BB',
  'rFLR': '0x26d460c3Cf931Fb2014FA436a49e3Af08619810e',
  'BANK': '0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059',
  'FXRP': '0xAd552A648C74D49E10027AB8a618A3ad4901c5bE',
  'stXRP': '0x4C18Ff3C89632c3Dd62E796c0aFA5c07c4c1B2b3',
  'APS': '0xff56Eb5b1a7FAa972291117E5E9565Da29bc808d',
  'FLR': 'native'
};

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

async function getPrivateKey() {
  if (process.env.CLAWD_WALLET_KEY) {
    return process.env.CLAWD_WALLET_KEY;
  }
  
  const walletPath = path.join(__dirname, '../data/clawd-wallet.json');
  if (fs.existsSync(walletPath)) {
    const wallet = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
    return wallet.privateKey;
  }
  
  throw new Error('No wallet found. Set CLAWD_WALLET_KEY or create data/clawd-wallet.json');
}

function resolveToken(token) {
  if (!token || token.toUpperCase() === 'FLR') {
    return { address: 'native', symbol: 'FLR', decimals: 18 };
  }
  
  // Check known tokens
  const upper = token.toUpperCase();
  if (TOKENS[upper] && TOKENS[upper] !== 'native') {
    return { address: TOKENS[upper], symbol: upper, decimals: 18 };
  }
  
  // Check if it's an address
  if (token.startsWith('0x') && token.length === 42) {
    return { address: ethers.getAddress(token.toLowerCase()), symbol: 'UNKNOWN', decimals: null };
  }
  
  throw new Error(`Unknown token: ${token}. Use FLR, WFLR, sFLR, BANK, or a token address.`);
}

async function transfer(to, amount, tokenSymbol = 'FLR') {
  const privateKey = await getPrivateKey();
  const provider = new ethers.JsonRpcProvider(FLARE_RPC);
  const wallet = new ethers.Wallet(privateKey, provider);
  
  // Resolve recipient address
  const toAddress = ethers.getAddress(to.toLowerCase());
  
  // Resolve token
  let token = resolveToken(tokenSymbol);
  
  console.log('=== Transfer ===');
  console.log('From:', wallet.address);
  console.log('To:', toAddress);
  console.log('Amount:', amount);
  console.log('Token:', token.symbol, token.address === 'native' ? '(native)' : token.address);
  
  let txHash, blockNumber, gasUsed, balanceAfter;
  
  if (token.address === 'native') {
    // Native FLR transfer
    const balanceBefore = await provider.getBalance(wallet.address);
    console.log('\nBalance before:', ethers.formatEther(balanceBefore), 'FLR');
    
    const amountWei = ethers.parseEther(amount.toString());
    
    if (balanceBefore < amountWei) {
      throw new Error(`Insufficient FLR. Have ${ethers.formatEther(balanceBefore)}, need ${amount}`);
    }
    
    console.log('\nSending...');
    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: amountWei
    });
    console.log('Tx:', tx.hash);
    
    const receipt = await tx.wait();
    txHash = tx.hash;
    blockNumber = receipt.blockNumber;
    gasUsed = receipt.gasUsed.toString();
    
    balanceAfter = await provider.getBalance(wallet.address);
    console.log('Balance after:', ethers.formatEther(balanceAfter), 'FLR');
    
  } else {
    // ERC20 transfer
    const contract = new ethers.Contract(token.address, ERC20_ABI, wallet);
    
    // Get token info if needed
    if (token.decimals === null) {
      token.decimals = await contract.decimals();
      token.symbol = await contract.symbol();
    }
    
    const balanceBefore = await contract.balanceOf(wallet.address);
    console.log('\nBalance before:', ethers.formatUnits(balanceBefore, token.decimals), token.symbol);
    
    const amountWei = ethers.parseUnits(amount.toString(), token.decimals);
    
    if (balanceBefore < amountWei) {
      throw new Error(`Insufficient ${token.symbol}. Have ${ethers.formatUnits(balanceBefore, token.decimals)}, need ${amount}`);
    }
    
    console.log('\nSending...');
    const tx = await contract.transfer(toAddress, amountWei);
    console.log('Tx:', tx.hash);
    
    const receipt = await tx.wait();
    txHash = tx.hash;
    blockNumber = receipt.blockNumber;
    gasUsed = receipt.gasUsed.toString();
    
    balanceAfter = await contract.balanceOf(wallet.address);
    console.log('Balance after:', ethers.formatUnits(balanceAfter, token.decimals), token.symbol);
  }
  
  console.log('\nConfirmed! Block:', blockNumber);
  console.log('Gas used:', gasUsed);
  
  return {
    success: true,
    txHash,
    blockNumber,
    gasUsed,
    from: wallet.address,
    to: toAddress,
    amount,
    token: token.symbol
  };
}

async function main() {
  const to = process.argv[2];
  const amount = parseFloat(process.argv[3]);
  const token = process.argv[4] || 'FLR';
  
  if (!to || !amount || isNaN(amount) || amount <= 0) {
    console.log('Usage: node transfer.js <to> <amount> [token]');
    console.log('');
    console.log('Examples:');
    console.log('  node transfer.js 0x1234... 10 FLR      # Send 10 FLR');
    console.log('  node transfer.js 0x1234... 5 WFLR     # Send 5 WFLR');
    console.log('  node transfer.js 0x1234... 100 BANK   # Send 100 BANK');
    console.log('');
    console.log('Known tokens: FLR, WFLR, sFLR, rFLR, BANK, FXRP, stXRP, APS');
    console.log('Or use any ERC20 address.');
    process.exit(1);
  }
  
  try {
    const result = await transfer(to, amount, token);
    console.log('\n✅ Success!');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

module.exports = { transfer, TOKENS };

if (require.main === module) {
  main();
}
