#!/usr/bin/env node
/**
 * Rysk Finance - Covered Calls on HyperEVM
 * Sell covered calls on fXRP to earn volatility premium
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// HyperEVM Configuration
const HYPEREVM_RPC = 'https://rpc.hyperliquid.xyz/evm';
const HYPEREVM_CHAIN_ID = 999;

// Token addresses on HyperEVM
const TOKENS = {
  fXRP: {
    address: '0xd70659a6396285bf7214d7ea9673184e7c72e07e',
    decimals: 6,
    symbol: 'fXRP'
  },
  USDT0: {
    address: '0x3cBFE5AD65574a89F4E24D553E40Fc7EA5Af0e19', // TODO: Verify
    decimals: 6,
    symbol: 'USDT0'
  }
};

// Rysk API endpoint (discovered from app)
const RYSK_API = 'https://api.rysk.finance';
const RYSK_APP = 'https://app.rysk.finance';

// ERC20 ABI for token operations
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

// Covered Call Vault ABI (typical pattern - will need verification)
const VAULT_ABI = [
  'function deposit(uint256 amount) external',
  'function withdraw(uint256 shares) external',
  'function getQuote(uint256 amount, uint256 strike, uint256 expiry) view returns (uint256 premium)',
  'function sellCall(uint256 amount, uint256 strike, uint256 expiry, uint256 minPremium) external returns (uint256)',
  'function positions(address user) view returns (tuple(uint256 amount, uint256 strike, uint256 expiry, uint256 premium)[])',
  'function settle(uint256 positionId) external'
];

class RyskClient {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(HYPEREVM_RPC, HYPEREVM_CHAIN_ID);
    this.wallet = null;
  }

  async loadWallet(keystorePath) {
    if (!keystorePath) {
      throw new Error('Keystore path required for transactions');
    }
    
    const keystore = JSON.parse(fs.readFileSync(keystorePath, 'utf8'));
    const password = await this.promptPassword();
    this.wallet = await ethers.Wallet.fromEncryptedJson(JSON.stringify(keystore), password);
    this.wallet = this.wallet.connect(this.provider);
    return this.wallet.address;
  }

  async promptPassword() {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      rl.question('Enter keystore password: ', (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  async getBalance(address) {
    const fxrp = new ethers.Contract(TOKENS.fXRP.address, ERC20_ABI, this.provider);
    const balance = await fxrp.balanceOf(address);
    return ethers.formatUnits(balance, TOKENS.fXRP.decimals);
  }

  async getHypeBalance(address) {
    const balance = await this.provider.getBalance(address);
    return ethers.formatEther(balance);
  }

  async status(address) {
    console.log('\n📊 Rysk Finance Status\n');
    console.log('Network: HyperEVM (Chain 999)');
    console.log('RPC:', HYPEREVM_RPC);
    console.log('');
    
    if (address) {
      const fxrpBalance = await this.getBalance(address);
      const hypeBalance = await this.getHypeBalance(address);
      
      console.log('Wallet:', address);
      console.log('fXRP Balance:', fxrpBalance, 'fXRP');
      console.log('HYPE Balance:', hypeBalance, 'HYPE');
    }
    
    console.log('\n📈 fXRP Covered Call Vault:');
    console.log('Min APR: 4.00%');
    console.log('Max APR: 89.93%');
    console.log('Settlement: USDT0');
    console.log('');
    console.log('🔗 App: https://app.rysk.finance/earn/999/fXRP/fXRP/USDT0/call/');
    
    // Try to fetch current XRP price
    try {
      const priceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd');
      const priceData = await priceRes.json();
      if (priceData.ripple?.usd) {
        console.log('\n💰 Current XRP Price: $' + priceData.ripple.usd.toFixed(4));
      }
    } catch (e) {
      // Price fetch failed, ignore
    }
  }

  async quote(amount, strike, expiry) {
    console.log('\n📝 Quote Request\n');
    console.log('Amount:', amount, 'fXRP');
    console.log('Strike:', '$' + strike);
    console.log('Expiry:', expiry);
    
    // Parse expiry to days
    const expiryDays = parseInt(expiry.replace('d', ''));
    
    // Fetch current XRP price
    let currentPrice = 0;
    try {
      const priceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd');
      const priceData = await priceRes.json();
      currentPrice = priceData.ripple?.usd || 0;
    } catch (e) {
      console.log('⚠️ Could not fetch current price');
    }
    
    if (currentPrice > 0) {
      console.log('\nCurrent XRP Price: $' + currentPrice.toFixed(4));
      const otmPercent = ((strike - currentPrice) / currentPrice * 100).toFixed(1);
      console.log('Strike Distance:', otmPercent + '% OTM');
    }
    
    // Estimate premium based on typical options pricing
    // This is a rough estimate - actual quote comes from RFQ
    const impliedVol = 0.8; // ~80% IV typical for crypto
    const timeToExpiry = expiryDays / 365;
    const moneyness = currentPrice > 0 ? strike / currentPrice : 1;
    
    // Simplified Black-Scholes approximation for ATM options
    const atPremiumPct = impliedVol * Math.sqrt(timeToExpiry) * 0.4;
    
    // Adjust for moneyness (OTM = lower premium)
    let premiumPct = atPremiumPct;
    if (moneyness > 1) {
      // OTM call - reduce premium
      premiumPct = atPremiumPct * Math.exp(-0.5 * Math.pow((moneyness - 1) / (impliedVol * Math.sqrt(timeToExpiry)), 2));
    }
    
    const estimatedPremium = amount * currentPrice * premiumPct;
    const annualizedAPR = (premiumPct / timeToExpiry * 100).toFixed(1);
    
    console.log('\n📊 Estimated Quote (actual via RFQ):');
    console.log('Premium:', '$' + estimatedPremium.toFixed(2), `(~${(premiumPct * 100).toFixed(2)}%)`);
    console.log('Annualized APR:', annualizedAPR + '%');
    console.log('');
    console.log('⚠️ This is an estimate. Actual premium determined by RFQ auction.');
    console.log('🔗 Get real quote: https://app.rysk.finance/earn/999/fXRP/fXRP/USDT0/call/');
  }

  async positions(address) {
    console.log('\n📋 Positions for', address || 'wallet', '\n');
    console.log('⚠️ Position tracking requires Rysk contract integration.');
    console.log('Check positions at: https://app.rysk.finance/dashboard/');
    
    // TODO: Once we have the vault contract address, we can query positions
    // const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, this.provider);
    // const userPositions = await vault.positions(address);
  }

  async sell(keystorePath, amount, strike, expiry) {
    console.log('\n🔐 Loading wallet...');
    const address = await this.loadWallet(keystorePath);
    console.log('Address:', address);
    
    // Check fXRP balance
    const balance = await this.getBalance(address);
    console.log('fXRP Balance:', balance);
    
    if (parseFloat(balance) < parseFloat(amount)) {
      console.log('\n❌ Insufficient fXRP balance');
      console.log('Need:', amount, 'fXRP');
      console.log('Have:', balance, 'fXRP');
      return;
    }
    
    console.log('\n⚠️ Direct contract interaction not yet implemented.');
    console.log('');
    console.log('To sell covered calls:');
    console.log('1. Go to: https://app.rysk.finance/earn/999/fXRP/fXRP/USDT0/call/');
    console.log('2. Connect your wallet');
    console.log('3. Select strike price and expiry');
    console.log('4. Enter amount:', amount, 'fXRP');
    console.log('5. Review quote and execute');
    
    // TODO: Implement once we have verified contract addresses
    // 1. Approve fXRP spending to vault
    // 2. Call vault.sellCall(amount, strike, expiry, minPremium)
  }

  async settle(keystorePath) {
    console.log('\n🔐 Loading wallet...');
    const address = await this.loadWallet(keystorePath);
    console.log('Address:', address);
    
    console.log('\n⚠️ Settlement requires Rysk contract integration.');
    console.log('Settle positions at: https://app.rysk.finance/dashboard/');
    
    // TODO: Implement once we have verified contract addresses
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const client = new RyskClient();
  
  // Parse flags
  const getFlag = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : null;
  };
  
  const keystorePath = getFlag('keystore');
  const amount = getFlag('amount');
  const strike = getFlag('strike');
  const expiry = getFlag('expiry') || '7d';
  const address = getFlag('address') || process.env.WALLET_ADDRESS;
  
  try {
    switch (command) {
      case 'status':
        await client.status(address);
        break;
        
      case 'quote':
        if (!amount || !strike) {
          console.log('Usage: rysk.js quote --amount <fXRP> --strike <USD> [--expiry 7d]');
          process.exit(1);
        }
        await client.quote(parseFloat(amount), parseFloat(strike), expiry);
        break;
        
      case 'positions':
        await client.positions(address);
        break;
        
      case 'sell':
        if (!keystorePath || !amount || !strike) {
          console.log('Usage: rysk.js sell --keystore <path> --amount <fXRP> --strike <USD> [--expiry 7d]');
          process.exit(1);
        }
        await client.sell(keystorePath, amount, strike, expiry);
        break;
        
      case 'settle':
        if (!keystorePath) {
          console.log('Usage: rysk.js settle --keystore <path>');
          process.exit(1);
        }
        await client.settle(keystorePath);
        break;
        
      default:
        console.log(`
Rysk Finance - Covered Calls on HyperEVM

Commands:
  status              Show vault status and balances
  quote               Get premium quote for covered call
  positions           List your positions
  sell                Deposit fXRP and sell covered call
  settle              Settle expired positions

Options:
  --keystore <path>   Path to encrypted keystore
  --amount <fXRP>     Amount of fXRP
  --strike <USD>      Strike price in USD
  --expiry <period>   Expiry (7d, 14d, 30d)
  --address <addr>    Wallet address for read-only queries

Examples:
  node rysk.js status --address 0x...
  node rysk.js quote --amount 1000 --strike 2.5 --expiry 7d
  node rysk.js sell --keystore ./keystore.json --amount 1000 --strike 2.5
`);
    }
  } catch (error) {
    console.error('Error:', error.message);
    if (process.env.DEBUG) console.error(error);
    process.exit(1);
  }
}

main();
