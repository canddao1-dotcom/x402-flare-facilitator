#!/usr/bin/env node
/**
 * Agent Bootstrap - Multi-Chain Wallet Setup for OpenClaw Agents
 * 
 * Creates wallets for:
 * - EVM chains: Flare, Base, HyperEVM (same address)
 * - Solana (separate Ed25519 keypair)
 * 
 * Outputs encrypted keystores and OpenClaw config template.
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Encryption (AES-256-GCM)
const ALGORITHM = 'aes-256-gcm';

function generatePassphrase() {
  return crypto.randomBytes(32).toString('base64');
}

function encrypt(text, passphrase) {
  const key = crypto.scryptSync(passphrase, 'agent-bootstrap-salt', 32);
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
  const key = crypto.scryptSync(passphrase, 'agent-bootstrap-salt', 32);
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

// Generate Solana keypair using tweetnacl-compatible approach
function generateSolanaKeypair() {
  // Generate 32 random bytes for seed
  const seed = crypto.randomBytes(32);
  
  // Use crypto to generate Ed25519 keypair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' }
  });
  
  // Extract raw keys from DER format
  // Ed25519 public key in DER has 12-byte prefix
  const pubKeyRaw = publicKey.slice(-32);
  // Ed25519 private key in DER has 16-byte prefix, we need the 32-byte seed
  const privKeyRaw = privateKey.slice(-32);
  
  // Solana uses base58 for addresses
  const bs58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  
  function toBase58(buffer) {
    const digits = [0];
    for (const byte of buffer) {
      let carry = byte;
      for (let i = 0; i < digits.length; i++) {
        carry += digits[i] << 8;
        digits[i] = carry % 58;
        carry = Math.floor(carry / 58);
      }
      while (carry > 0) {
        digits.push(carry % 58);
        carry = Math.floor(carry / 58);
      }
    }
    // Leading zeros
    let output = '';
    for (const byte of buffer) {
      if (byte === 0) output += bs58Alphabet[0];
      else break;
    }
    // Convert digits to characters (reversed)
    for (let i = digits.length - 1; i >= 0; i--) {
      output += bs58Alphabet[digits[i]];
    }
    return output;
  }
  
  // Full keypair as 64 bytes (privateKey + publicKey) for Solana CLI compatibility
  const fullKeypair = Buffer.concat([privKeyRaw, pubKeyRaw]);
  
  return {
    publicKey: toBase58(pubKeyRaw),
    // Store as JSON array (Solana CLI format)
    secretKey: Array.from(fullKeypair),
    secretKeyHex: fullKeypair.toString('hex')
  };
}

// Network configurations
const NETWORKS = {
  flare: {
    name: 'Flare',
    chainId: 14,
    rpc: 'https://flare-api.flare.network/ext/C/rpc',
    explorer: 'https://flarescan.com',
    currency: 'FLR',
    type: 'evm'
  },
  base: {
    name: 'Base',
    chainId: 8453,
    rpc: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    currency: 'ETH',
    type: 'evm'
  },
  hyperevm: {
    name: 'HyperEVM',
    chainId: 999,
    rpc: 'https://rpc.hyperliquid.xyz/evm',
    explorer: 'https://explorer.hyperliquid.xyz',
    currency: 'HYPE',
    type: 'evm'
  },
  solana: {
    name: 'Solana',
    cluster: 'mainnet-beta',
    rpc: 'https://api.mainnet-beta.solana.com',
    explorer: 'https://solscan.io',
    currency: 'SOL',
    type: 'solana'
  }
};

async function bootstrap(agentName) {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║          🤖 Agent Bootstrap - Multi-Chain Setup              ║
╚══════════════════════════════════════════════════════════════╝
`);
  
  console.log(`Agent Name: ${agentName}\n`);
  
  // Generate master passphrase
  const passphrase = generatePassphrase();
  console.log('🔐 Generated encryption passphrase');
  console.log('   (Save this securely - needed to decrypt wallets)\n');
  
  // Generate EVM wallet (same key for all EVM chains)
  console.log('📦 Generating EVM wallet (Flare, Base, HyperEVM)...');
  const evmPrivateKey = generatePrivateKey();
  const evmAccount = privateKeyToAccount(evmPrivateKey);
  console.log(`   Address: ${evmAccount.address}\n`);
  
  // Generate Solana wallet
  console.log('📦 Generating Solana wallet...');
  const solanaKeypair = generateSolanaKeypair();
  console.log(`   Address: ${solanaKeypair.publicKey}\n`);
  
  // Create output directory
  const outputDir = path.join(__dirname, '..', 'data', agentName);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Save encrypted EVM keystore
  const evmKeystore = {
    type: 'evm',
    address: evmAccount.address,
    networks: ['flare', 'base', 'hyperevm'],
    createdAt: new Date().toISOString(),
    encryptedKey: encrypt(evmPrivateKey, passphrase)
  };
  fs.writeFileSync(
    path.join(outputDir, 'evm-keystore.json'),
    JSON.stringify(evmKeystore, null, 2)
  );
  console.log('💾 Saved: evm-keystore.json');
  
  // Save encrypted Solana keystore
  const solanaKeystore = {
    type: 'solana',
    publicKey: solanaKeypair.publicKey,
    createdAt: new Date().toISOString(),
    encryptedKey: encrypt(solanaKeypair.secretKeyHex, passphrase)
  };
  fs.writeFileSync(
    path.join(outputDir, 'solana-keystore.json'),
    JSON.stringify(solanaKeystore, null, 2)
  );
  console.log('💾 Saved: solana-keystore.json');
  
  // Save passphrase file (user should move this to secure location)
  const passphraseFile = {
    warning: 'KEEP THIS SECRET! Anyone with this passphrase can decrypt your wallets.',
    agentName,
    passphrase,
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(
    path.join(outputDir, 'PASSPHRASE.json'),
    JSON.stringify(passphraseFile, null, 2)
  );
  fs.chmodSync(path.join(outputDir, 'PASSPHRASE.json'), 0o600);
  console.log('💾 Saved: PASSPHRASE.json (chmod 600)');
  
  // Generate wallet summary
  const summary = {
    agentName,
    createdAt: new Date().toISOString(),
    wallets: {
      evm: {
        address: evmAccount.address,
        networks: {
          flare: { ...NETWORKS.flare, fundWith: 'FLR for gas + tokens' },
          base: { ...NETWORKS.base, fundWith: 'ETH for gas + USDC' },
          hyperevm: { ...NETWORKS.hyperevm, fundWith: 'HYPE for gas' }
        }
      },
      solana: {
        address: solanaKeypair.publicKey,
        network: NETWORKS.solana,
        fundWith: 'SOL for gas + USDC'
      }
    }
  };
  fs.writeFileSync(
    path.join(outputDir, 'wallet-summary.json'),
    JSON.stringify(summary, null, 2)
  );
  console.log('💾 Saved: wallet-summary.json\n');
  
  // Generate OpenClaw config template
  const openclawConfig = `# OpenClaw Agent Configuration
# Generated by Agent Bootstrap

# Agent Identity
AGENT_NAME="${agentName}"

# EVM Wallet (same address on all EVM chains)
EVM_ADDRESS="${evmAccount.address}"
EVM_KEYSTORE_PATH="./evm-keystore.json"
WALLET_PASSPHRASE="<paste from PASSPHRASE.json>"

# Solana Wallet
SOLANA_ADDRESS="${solanaKeypair.publicKey}"
SOLANA_KEYSTORE_PATH="./solana-keystore.json"

# Network RPCs
FLARE_RPC="${NETWORKS.flare.rpc}"
BASE_RPC="${NETWORKS.base.rpc}"
HYPEREVM_RPC="${NETWORKS.hyperevm.rpc}"
SOLANA_RPC="${NETWORKS.solana.rpc}"

# x402 Configuration
X402_ENABLED=true
X402_FACILITATOR_URL="https://agent-tips.vercel.app"

# ERC-8004 Agent Identity (optional)
# Register at https://www.8004scan.io/ with your EVM address
# AGENT_ID=<your-8004-agent-id>
`;
  
  fs.writeFileSync(
    path.join(outputDir, 'openclaw.env.example'),
    openclawConfig
  );
  console.log('💾 Saved: openclaw.env.example\n');
  
  // Print summary
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    ✅ Setup Complete!                        ║
╚══════════════════════════════════════════════════════════════╝

📍 Wallet Addresses:

   EVM (Flare/Base/HyperEVM):
   ${evmAccount.address}

   Solana:
   ${solanaKeypair.publicKey}

📁 Files saved to: ${outputDir}/
   - evm-keystore.json      (encrypted EVM private key)
   - solana-keystore.json   (encrypted Solana keypair)
   - PASSPHRASE.json        (⚠️ MOVE TO SECURE LOCATION!)
   - wallet-summary.json    (addresses & network info)
   - openclaw.env.example   (OpenClaw config template)

🔐 Security Checklist:
   [ ] Move PASSPHRASE.json to a secure location
   [ ] Never commit keystores to git
   [ ] Add to .gitignore: data/${agentName}/

💰 Funding Required:
   - Flare:    Send FLR to ${evmAccount.address}
   - Base:     Send ETH to ${evmAccount.address}
   - HyperEVM: Send HYPE to ${evmAccount.address}
   - Solana:   Send SOL to ${solanaKeypair.publicKey}

🚀 Next Steps:
   1. Fund wallets with native gas tokens
   2. Copy openclaw.env.example to your agent's .env
   3. Set WALLET_PASSPHRASE from PASSPHRASE.json
   4. Register on ERC-8004: https://www.8004scan.io/
   5. Start your OpenClaw agent!

📚 Docs: https://docs.clawd.bot
`);
  
  return summary;
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  // Parse flags
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      flags[key] = args[i + 1] || true;
      if (args[i + 1] && !args[i + 1].startsWith('--')) i++;
    }
  }
  
  switch (command) {
    case 'new':
    case 'create': {
      const name = flags.name || args[1];
      if (!name) {
        console.error('❌ Agent name required');
        console.error('   Usage: bootstrap.js new --name <agent-name>');
        process.exit(1);
      }
      await bootstrap(name);
      break;
    }
    
    case 'list': {
      const dataDir = path.join(__dirname, '..', 'data');
      if (!fs.existsSync(dataDir)) {
        console.log('No agents bootstrapped yet.');
        break;
      }
      const agents = fs.readdirSync(dataDir).filter(f => 
        fs.statSync(path.join(dataDir, f)).isDirectory()
      );
      if (agents.length === 0) {
        console.log('No agents bootstrapped yet.');
      } else {
        console.log(`\n📋 Bootstrapped Agents (${agents.length}):\n`);
        for (const agent of agents) {
          const summaryPath = path.join(dataDir, agent, 'wallet-summary.json');
          if (fs.existsSync(summaryPath)) {
            const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
            console.log(`   ${agent}`);
            console.log(`   ├─ EVM:    ${summary.wallets.evm.address}`);
            console.log(`   └─ Solana: ${summary.wallets.solana.address}`);
            console.log();
          }
        }
      }
      break;
    }
    
    case 'show': {
      const name = flags.name || args[1];
      if (!name) {
        console.error('❌ Agent name required');
        process.exit(1);
      }
      const summaryPath = path.join(__dirname, '..', 'data', name, 'wallet-summary.json');
      if (!fs.existsSync(summaryPath)) {
        console.error(`❌ Agent '${name}' not found`);
        process.exit(1);
      }
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      console.log(JSON.stringify(summary, null, 2));
      break;
    }
    
    default:
      console.log(`
Agent Bootstrap - Multi-Chain Wallet Setup for OpenClaw Agents

Usage:
  bootstrap.js new --name <agent-name>   Create new agent wallets
  bootstrap.js list                       List bootstrapped agents
  bootstrap.js show --name <agent-name>  Show agent wallet info

Creates encrypted wallets for:
  • EVM chains: Flare, Base, HyperEVM (same address)
  • Solana (separate Ed25519 keypair)

Examples:
  bootstrap.js new --name my-trading-agent
  bootstrap.js list
  bootstrap.js show --name my-trading-agent

Security:
  - All private keys are encrypted with AES-256-GCM
  - Passphrase generated automatically (save securely!)
  - Never commit keystores or passphrases to git
`);
  }
}

main().catch(console.error);
