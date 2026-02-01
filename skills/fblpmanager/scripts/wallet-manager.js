#!/usr/bin/env node
/**
 * Wallet Manager for FlareBank LP Operations
 * 
 * Handles:
 * - Wallet generation (creates new keypairs)
 * - Wallet import (from private key)
 * - Balance checking
 * - Transaction signing and broadcasting
 * 
 * Based on ai-miguel wallet management patterns
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const FLARE_RPC = process.env.FLARE_RPC || 'https://flare-api.flare.network/ext/C/rpc';
const WALLET_FILE = process.env.WALLET_FILE || path.join(__dirname, '../data/wallets.json.enc');
const ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY; // 32-byte hex key

// ERC20 ABI for balance checks
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)'
];

// NFT Position Manager ABI (Uniswap V3 style)
const NFT_MANAGER_ABI = [
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function collect(tuple(uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max) params) returns (uint256 amount0, uint256 amount1)',
  'function decreaseLiquidity(tuple(uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline) params) returns (uint256 amount0, uint256 amount1)',
  'function increaseLiquidity(tuple(uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline) params) returns (uint128 liquidity, uint256 amount0, uint256 amount1)',
  'function mint(tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
  'function ownerOf(uint256 tokenId) view returns (address)'
];

class WalletManager {
  constructor(rpcUrl = FLARE_RPC) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallets = new Map(); // name -> { address, privateKey }
  }

  /**
   * Generate a new wallet
   * @returns {object} { address, privateKey, mnemonic }
   */
  generateWallet() {
    const wallet = ethers.Wallet.createRandom();
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic?.phrase || null
    };
  }

  /**
   * Import wallet from private key
   * @param {string} privateKey 
   * @returns {object} { address, privateKey }
   */
  importFromPrivateKey(privateKey) {
    const wallet = new ethers.Wallet(privateKey);
    return {
      address: wallet.address,
      privateKey: privateKey
    };
  }

  /**
   * Import wallet from mnemonic
   * @param {string} mnemonic 
   * @param {number} index - derivation index
   * @returns {object} { address, privateKey }
   */
  importFromMnemonic(mnemonic, index = 0) {
    const path = `m/44'/60'/0'/0/${index}`;
    const wallet = ethers.Wallet.fromPhrase(mnemonic).derivePath(path);
    return {
      address: wallet.address,
      privateKey: wallet.privateKey
    };
  }

  /**
   * Get signer for a wallet
   * @param {string} privateKey 
   * @returns {ethers.Wallet}
   */
  getSigner(privateKey) {
    return new ethers.Wallet(privateKey, this.provider);
  }

  /**
   * Get native FLR balance
   * @param {string} address 
   * @returns {Promise<string>} balance in FLR
   */
  async getNativeBalance(address) {
    const balance = await this.provider.getBalance(address);
    return ethers.formatEther(balance);
  }

  /**
   * Get ERC20 token balance
   * @param {string} tokenAddress 
   * @param {string} walletAddress 
   * @returns {Promise<object>} { balance, symbol, decimals }
   */
  async getTokenBalance(tokenAddress, walletAddress) {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    const [balance, decimals, symbol] = await Promise.all([
      contract.balanceOf(walletAddress),
      contract.decimals(),
      contract.symbol()
    ]);
    return {
      raw: balance,
      formatted: ethers.formatUnits(balance, decimals),
      symbol,
      decimals
    };
  }

  /**
   * Get all relevant balances for an address
   * @param {string} address 
   * @param {Array<{address: string, symbol: string}>} tokens 
   * @returns {Promise<object>}
   */
  async getAllBalances(address, tokens = []) {
    const balances = {
      native: await this.getNativeBalance(address),
      tokens: {}
    };

    for (const token of tokens) {
      try {
        const balance = await this.getTokenBalance(token.address, address);
        balances.tokens[token.symbol] = balance.formatted;
      } catch (e) {
        balances.tokens[token.symbol] = 'error';
      }
    }

    return balances;
  }

  /**
   * Approve token spending
   * @param {string} privateKey 
   * @param {string} tokenAddress 
   * @param {string} spenderAddress 
   * @param {string} amount - in token units (or 'max')
   * @returns {Promise<object>} transaction receipt
   */
  async approveToken(privateKey, tokenAddress, spenderAddress, amount = 'max') {
    const signer = this.getSigner(privateKey);
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    
    const approveAmount = amount === 'max' 
      ? ethers.MaxUint256 
      : ethers.parseUnits(amount, await contract.decimals());
    
    const tx = await contract.approve(spenderAddress, approveAmount);
    return tx.wait();
  }

  /**
   * Encrypt wallet data
   * @param {object} data 
   * @param {string} key - 32-byte hex encryption key
   * @returns {string} encrypted data
   */
  static encryptData(data, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return JSON.stringify({
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      data: encrypted
    });
  }

  /**
   * Decrypt wallet data
   * @param {string} encryptedStr 
   * @param {string} key 
   * @returns {object}
   */
  static decryptData(encryptedStr, key) {
    const { iv, authTag, data } = JSON.parse(encryptedStr);
    
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm', 
      Buffer.from(key, 'hex'), 
      Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  /**
   * Save wallets to encrypted file
   * @param {string} filepath 
   * @param {string} encryptionKey 
   */
  saveWallets(filepath = WALLET_FILE, encryptionKey = ENCRYPTION_KEY) {
    if (!encryptionKey) {
      throw new Error('Encryption key required to save wallets');
    }

    const data = Object.fromEntries(this.wallets);
    const encrypted = WalletManager.encryptData(data, encryptionKey);
    
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, encrypted, 'utf8');
  }

  /**
   * Load wallets from encrypted file
   * @param {string} filepath 
   * @param {string} encryptionKey 
   */
  loadWallets(filepath = WALLET_FILE, encryptionKey = ENCRYPTION_KEY) {
    if (!encryptionKey) {
      throw new Error('Encryption key required to load wallets');
    }

    if (!fs.existsSync(filepath)) {
      return;
    }

    const encrypted = fs.readFileSync(filepath, 'utf8');
    const data = WalletManager.decryptData(encrypted, encryptionKey);
    this.wallets = new Map(Object.entries(data));
  }

  /**
   * Add a named wallet
   * @param {string} name 
   * @param {string} address 
   * @param {string} privateKey 
   */
  addWallet(name, address, privateKey) {
    this.wallets.set(name, { address, privateKey });
  }

  /**
   * Get wallet by name
   * @param {string} name 
   * @returns {object|null}
   */
  getWallet(name) {
    return this.wallets.get(name) || null;
  }

  /**
   * List all wallet names and addresses (no private keys)
   * @returns {Array<{name: string, address: string}>}
   */
  listWallets() {
    return Array.from(this.wallets.entries()).map(([name, wallet]) => ({
      name,
      address: wallet.address
    }));
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const manager = new WalletManager();

  switch (command) {
    case 'generate': {
      const wallet = manager.generateWallet();
      console.log(JSON.stringify({
        action: 'generate',
        address: wallet.address,
        privateKey: wallet.privateKey,
        mnemonic: wallet.mnemonic
      }, null, 2));
      break;
    }

    case 'import': {
      const privateKey = args[1];
      if (!privateKey) {
        console.error('Usage: wallet-manager.js import <privateKey>');
        process.exit(1);
      }
      const wallet = manager.importFromPrivateKey(privateKey);
      console.log(JSON.stringify({
        action: 'import',
        address: wallet.address
      }, null, 2));
      break;
    }

    case 'balance': {
      const address = args[1];
      if (!address) {
        console.error('Usage: wallet-manager.js balance <address>');
        process.exit(1);
      }

      // Common Flare tokens
      const tokens = [
        { address: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d', symbol: 'WFLR' },
        { address: '0x12e605bc104e93B45e1aD99F9e555f659051c2BB', symbol: 'sFLR' },
        { address: '0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059', symbol: 'BANK' }
      ];

      const balances = await manager.getAllBalances(address, tokens);
      console.log(JSON.stringify({
        action: 'balance',
        address,
        ...balances
      }, null, 2));
      break;
    }

    case 'help':
    default:
      console.log(`
Wallet Manager for FlareBank LP Operations

Commands:
  generate              Generate a new wallet
  import <privateKey>   Import wallet from private key
  balance <address>     Check balances for an address

Environment Variables:
  FLARE_RPC                 RPC endpoint (default: Flare mainnet)
  WALLET_FILE              Encrypted wallet storage path
  WALLET_ENCRYPTION_KEY    32-byte hex key for encryption
      `);
  }
}

// Export for use as module
module.exports = { WalletManager, ERC20_ABI, NFT_MANAGER_ABI };

// Run CLI if executed directly
if (require.main === module) {
  main().catch(console.error);
}
