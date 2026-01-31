#!/usr/bin/env node
/**
 * Wallet Generation for AI Agents
 * 
 * Generate, manage, and export EVM wallets securely.
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, formatEther } from 'viem';
import { flare } from 'viem/chains';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'wallets');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Encryption helpers
const ALGORITHM = 'aes-256-gcm';

function getPassphrase() {
  return process.env.WALLET_PASSPHRASE || 'agent-wallet-default-key-change-me';
}

function encrypt(text, passphrase) {
  const key = crypto.scryptSync(passphrase, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    encrypted
  };
}

function decrypt(data, passphrase) {
  const key = crypto.scryptSync(passphrase, 'salt', 32);
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(data.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
  let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Wallet operations
function generateWallet(name) {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  
  const walletData = {
    name,
    address: account.address,
    createdAt: new Date().toISOString(),
    encryptedKey: encrypt(privateKey, getPassphrase())
  };
  
  const filePath = path.join(DATA_DIR, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(walletData, null, 2));
  
  return {
    name,
    address: account.address,
    filePath
  };
}

function loadWallet(name) {
  const filePath = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Wallet '${name}' not found`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getPrivateKey(name) {
  const wallet = loadWallet(name);
  return decrypt(wallet.encryptedKey, getPassphrase());
}

function listWallets() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
      return {
        name: data.name,
        address: data.address,
        createdAt: data.createdAt
      };
    });
}

async function getBalance(address) {
  const client = createPublicClient({
    chain: flare,
    transport: http()
  });
  
  const balance = await client.getBalance({ address });
  return formatEther(balance);
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  // Parse flags
  const flags = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      flags[key] = args[i + 1] || true;
      i++;
    }
  }
  
  switch (command) {
    case 'gen':
    case 'generate': {
      const name = flags.name || `wallet-${Date.now()}`;
      console.log(`🔑 Generating new wallet: ${name}`);
      const result = generateWallet(name);
      console.log(`✅ Wallet created!`);
      console.log(`   Name:    ${result.name}`);
      console.log(`   Address: ${result.address}`);
      console.log(`   File:    ${result.filePath}`);
      console.log(`\n⚠️  Fund this wallet with FLR for gas and tokens for payments.`);
      break;
    }
    
    case 'show': {
      const name = flags.name || 'default';
      try {
        const wallet = loadWallet(name);
        const balance = await getBalance(wallet.address);
        console.log(`📍 Wallet: ${wallet.name}`);
        console.log(`   Address: ${wallet.address}`);
        console.log(`   Balance: ${balance} FLR`);
        console.log(`   Created: ${wallet.createdAt}`);
      } catch (e) {
        console.error(`❌ ${e.message}`);
      }
      break;
    }
    
    case 'export': {
      const name = flags.name;
      if (!name) {
        console.error('❌ --name required for export');
        process.exit(1);
      }
      if (!flags.confirm) {
        console.error('⚠️  This will display the private key!');
        console.error('   Add --confirm to proceed.');
        process.exit(1);
      }
      try {
        const privateKey = getPrivateKey(name);
        const wallet = loadWallet(name);
        console.log(`🔐 Wallet: ${wallet.name}`);
        console.log(`   Address:     ${wallet.address}`);
        console.log(`   Private Key: ${privateKey}`);
        console.log(`\n⚠️  NEVER share this key! Anyone with it controls the wallet.`);
      } catch (e) {
        console.error(`❌ ${e.message}`);
      }
      break;
    }
    
    case 'list': {
      const wallets = listWallets();
      if (wallets.length === 0) {
        console.log('No wallets found. Generate one with: wallet.js gen --name <label>');
      } else {
        console.log(`📋 Wallets (${wallets.length}):\n`);
        for (const w of wallets) {
          console.log(`   ${w.name}`);
          console.log(`   └─ ${w.address}`);
          console.log();
        }
      }
      break;
    }
    
    case 'json': {
      // Machine-readable output
      const name = flags.name;
      if (name) {
        const wallet = loadWallet(name);
        const balance = await getBalance(wallet.address);
        console.log(JSON.stringify({ ...wallet, balance, encryptedKey: undefined }));
      } else {
        console.log(JSON.stringify(listWallets()));
      }
      break;
    }
    
    default:
      console.log(`
Wallet Gen - EVM Wallet Management for AI Agents

Usage:
  wallet.js gen [--name <label>]     Generate new wallet
  wallet.js show [--name <label>]    Show wallet address & balance
  wallet.js export --name <label> --confirm   Export private key (dangerous!)
  wallet.js list                     List all wallets
  wallet.js json [--name <label>]    JSON output for scripts

Environment:
  WALLET_PASSPHRASE  Encryption key for stored wallets

Examples:
  wallet.js gen --name my-agent
  wallet.js show --name my-agent
  wallet.js list
`);
  }
}

main().catch(console.error);
