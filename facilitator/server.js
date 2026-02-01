#!/usr/bin/env node
/**
 * x402 Facilitator Server for Flare Network
 * 
 * Enables agent-to-agent payments on Flare using USD₮0
 * The facilitator pays gas - agents just sign authorizations
 */

import express from 'express';
import cors from 'cors';
import { createPublicClient, createWalletClient, http, parseAbi, verifyTypedData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { flare } from 'viem/chains';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Config
const PORT = process.env.X402_PORT || 3402;
const RPC_URL = process.env.FLARE_RPC || 'https://flare-api.flare.network/ext/C/rpc';
const USDT0_ADDRESS = '0xe7cd86e13AC4309349F30B3435a9d337750fC82D';

// EIP-3009 ABI for USD₮0
const EIP3009_ABI = parseAbi([
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
  'function authorizationState(address authorizer, bytes32 nonce) view returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function transfer(address to, uint256 amount) returns (bool)'
]);

// EIP-712 domain for USD₮0
const DOMAIN = {
  name: 'USD₮0',
  version: '1',
  chainId: 14,
  verifyingContract: USDT0_ADDRESS
};

// TransferWithAuthorization types
const TRANSFER_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' }
  ]
};

// Clients
const publicClient = createPublicClient({
  chain: flare,
  transport: http(RPC_URL)
});

let walletClient = null;
let facilitatorAccount = null;

// Load facilitator wallet (pays gas) - ENVIRONMENT VARIABLE ONLY
function loadFacilitatorWallet() {
  if (!process.env.FACILITATOR_PRIVATE_KEY) {
    console.error('❌ No facilitator wallet configured');
    console.error('Set FACILITATOR_PRIVATE_KEY environment variable');
    console.error('⚠️ NEVER store private keys in files within the repo!');
    process.exit(1);
  }
  
  facilitatorAccount = privateKeyToAccount(process.env.FACILITATOR_PRIVATE_KEY);
  
  walletClient = createWalletClient({
    account: facilitatorAccount,
    chain: flare,
    transport: http(RPC_URL)
  });
  
  console.log(`💳 Facilitator loaded: ${facilitatorAccount.address.slice(0,10)}...`);
}

// Verify payment signature
async function verifyPayment(paymentPayload) {
  const { accepted, payload } = paymentPayload;
  const { authorization, signature } = payload;
  
  // Parse signature
  const sig = signature.startsWith('0x') ? signature : `0x${signature}`;
  const r = sig.slice(0, 66);
  const s = `0x${sig.slice(66, 130)}`;
  const v = parseInt(sig.slice(130, 132), 16);
  
  // Verify signature recovers to from address
  const message = {
    from: authorization.from,
    to: authorization.to,
    value: BigInt(authorization.value),
    validAfter: BigInt(authorization.validAfter),
    validBefore: BigInt(authorization.validBefore),
    nonce: authorization.nonce
  };
  
  try {
    // Get actual domain from contract
    const [name, version] = await Promise.all([
      publicClient.readContract({ address: USDT0_ADDRESS, abi: EIP3009_ABI, functionName: 'name' }),
      publicClient.readContract({ address: USDT0_ADDRESS, abi: EIP3009_ABI, functionName: 'version' }).catch(() => '1')
    ]);
    
    const domain = {
      name,
      version,
      chainId: 14,
      verifyingContract: USDT0_ADDRESS
    };
    
    const valid = await verifyTypedData({
      address: authorization.from,
      domain,
      types: TRANSFER_AUTH_TYPES,
      primaryType: 'TransferWithAuthorization',
      message,
      signature: sig
    });
    
    if (!valid) {
      return { valid: false, error: 'Invalid signature' };
    }
    
    // Check balance
    const balance = await publicClient.readContract({
      address: USDT0_ADDRESS,
      abi: EIP3009_ABI,
      functionName: 'balanceOf',
      args: [authorization.from]
    });
    
    if (balance < BigInt(authorization.value)) {
      return { valid: false, error: 'Insufficient balance' };
    }
    
    // Check nonce not used
    const nonceUsed = await publicClient.readContract({
      address: USDT0_ADDRESS,
      abi: EIP3009_ABI,
      functionName: 'authorizationState',
      args: [authorization.from, authorization.nonce]
    });
    
    if (nonceUsed) {
      return { valid: false, error: 'Nonce already used' };
    }
    
    // Check time validity
    const now = Math.floor(Date.now() / 1000);
    if (now < Number(authorization.validAfter)) {
      return { valid: false, error: 'Authorization not yet valid' };
    }
    if (now > Number(authorization.validBefore)) {
      return { valid: false, error: 'Authorization expired' };
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

// Settle payment on-chain
async function settlePayment(paymentPayload) {
  const { payload } = paymentPayload;
  const { authorization, signature } = payload;
  
  // Parse signature
  const sig = signature.startsWith('0x') ? signature : `0x${signature}`;
  const r = sig.slice(0, 66);
  const s = `0x${sig.slice(66, 130)}`;
  const v = parseInt(sig.slice(130, 132), 16);
  
  try {
    // Execute transferWithAuthorization
    const hash = await walletClient.writeContract({
      address: USDT0_ADDRESS,
      abi: EIP3009_ABI,
      functionName: 'transferWithAuthorization',
      args: [
        authorization.from,
        authorization.to,
        BigInt(authorization.value),
        BigInt(authorization.validAfter),
        BigInt(authorization.validBefore),
        authorization.nonce,
        v,
        r,
        s
      ]
    });
    
    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    return {
      success: true,
      txHash: hash,
      blockNumber: receipt.blockNumber.toString(),
      network: 'eip155:14',
      gasUsed: receipt.gasUsed.toString()
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Express app
const app = express();

// CORS - restrict to trusted origins
const ALLOWED_ORIGINS = [
  'https://tips.canddao.com',
  'https://agent-tips.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001'
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like curl, mobile apps)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());

// Rate limiting (simple in-memory)
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 30; // requests per window

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  if (!rateLimits.has(ip)) {
    rateLimits.set(ip, []);
  }
  
  const requests = rateLimits.get(ip).filter(t => t > windowStart);
  requests.push(now);
  rateLimits.set(ip, requests);
  
  if (requests.length > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  next();
}
app.use(rateLimit);

// Bounty tracking
const DATA_DIR = path.join(__dirname, '..', 'data');
const BOUNTY_FILE = path.join(DATA_DIR, 'bounty-claims.json');
const WHITELIST_FILE = path.join(DATA_DIR, 'bounty-whitelist.json');
const BOUNTY_AMOUNT = 1000000n; // $1 USD₮0 (6 decimals)
const MAX_BOUNTY_CLAIMS = 100;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadBountyClaims() {
  ensureDataDir();
  if (fs.existsSync(BOUNTY_FILE)) {
    return JSON.parse(fs.readFileSync(BOUNTY_FILE, 'utf8'));
  }
  return { claims: [], totalPaid: '0' };
}

function saveBountyClaims(data) {
  ensureDataDir();
  fs.writeFileSync(BOUNTY_FILE, JSON.stringify(data, null, 2));
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

function isWhitelisted(address) {
  const data = loadWhitelist();
  return data.agents.some(a => a.address.toLowerCase() === address.toLowerCase());
}

function hasClaimed(address) {
  const data = loadBountyClaims();
  return data.claims.some(c => c.address.toLowerCase() === address.toLowerCase());
}

function getWhitelistEntry(address) {
  const data = loadWhitelist();
  return data.agents.find(a => a.address.toLowerCase() === address.toLowerCase());
}

async function payBounty(toAddress) {
  // Check whitelist first!
  if (!isWhitelisted(toAddress)) {
    console.log(`⚠️ Address not whitelisted: ${toAddress.slice(0,10)}...`);
    return { error: 'not_whitelisted', message: 'Post in m/payments on Moltbook to get whitelisted!' };
  }
  
  if (hasClaimed(toAddress)) {
    return { error: 'already_claimed', message: 'Address already claimed bounty' };
  }
  
  const claimsData = loadBountyClaims();
  if (claimsData.claims.length >= MAX_BOUNTY_CLAIMS) {
    return { error: 'pool_exhausted', message: 'Bounty pool exhausted' };
  }
  
  try {
    const whitelistEntry = getWhitelistEntry(toAddress);
    
    const hash = await walletClient.writeContract({
      address: USDT0_ADDRESS,
      abi: EIP3009_ABI,
      functionName: 'transfer',
      args: [toAddress, BOUNTY_AMOUNT]
    });
    
    await publicClient.waitForTransactionReceipt({ hash });
    
    claimsData.claims.push({
      address: toAddress,
      moltbookAgent: whitelistEntry?.moltbookAgent || 'unknown',
      amount: BOUNTY_AMOUNT.toString(),
      txHash: hash,
      timestamp: new Date().toISOString()
    });
    claimsData.totalPaid = (BigInt(claimsData.totalPaid) + BOUNTY_AMOUNT).toString();
    saveBountyClaims(claimsData);
    
    console.log(`🎁 Bounty paid: $1 USD₮0 to ${toAddress.slice(0,10)}...`);
    return { amount: '1.000000', txHash: hash, moltbookAgent: whitelistEntry?.moltbookAgent };
  } catch (e) {
    console.error('Bounty payment failed:', e.message);
    return { error: 'payment_failed', message: e.message };
  }
}

// Redact address for public display
function redactAddress(addr) {
  if (!addr) return null;
  return `${addr.slice(0,6)}...${addr.slice(-4)}`;
}

// Health check
app.get('/', (req, res) => {
  const bountyData = loadBountyClaims();
  res.json({
    name: 'x402 Flare Facilitator',
    network: 'eip155:14',
    chain: 'Flare',
    asset: USDT0_ADDRESS,
    assetSymbol: 'USD₮0',
    status: 'operational',
    bounty: {
      active: true,
      amount: '$1 USD₮0',
      claimed: bountyData.claims.length,
      remaining: MAX_BOUNTY_CLAIMS - bountyData.claims.length
    }
  });
});

// Verify endpoint (pays bounty on first valid verification if whitelisted!)
app.post('/verify', async (req, res) => {
  try {
    const result = await verifyPayment(req.body);
    
    // Try to pay bounty on first successful verification
    if (result.valid && req.body?.payload?.authorization?.from) {
      const fromAddress = req.body.payload.authorization.from;
      
      if (!hasClaimed(fromAddress)) {
        const bountyResult = await payBounty(fromAddress);
        
        if (bountyResult?.error === 'not_whitelisted') {
          result.bountyEligible = false;
          result.bountyMessage = 'Post in m/payments on Moltbook with your wallet address to claim the $1 bounty!';
        } else if (bountyResult?.error) {
          result.bountyEligible = false;
          result.bountyMessage = bountyResult.message;
        } else if (bountyResult?.txHash) {
          result.bountyPaid = { amount: bountyResult.amount, txHash: bountyResult.txHash };
          console.log(`🎉 New agent connected: ${fromAddress.slice(0,10)}...`);
        }
      } else {
        result.bountyEligible = false;
        result.bountyMessage = 'Already claimed bounty';
      }
    }
    
    res.json(result);
  } catch (error) {
    res.status(400).json({ valid: false, error: error.message });
  }
});

// Settle endpoint
app.post('/settle', async (req, res) => {
  try {
    // Verify first
    const verification = await verifyPayment(req.body);
    if (!verification.valid) {
      return res.status(400).json({ success: false, error: verification.error });
    }
    
    // Settle
    const result = await settlePayment(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check whitelist status for an address (redacted for privacy)
app.get('/bounty/check/:address', (req, res) => {
  const address = req.params.address;
  const whitelisted = isWhitelisted(address);
  const claimed = hasClaimed(address);
  
  // Don't expose identity info - just eligibility status
  res.json({
    address: redactAddress(address),
    whitelisted,
    claimed,
    canClaim: whitelisted && !claimed
  });
});

// Bounty status endpoint
app.get('/bounty', async (req, res) => {
  const data = loadBountyClaims();
  const remaining = MAX_BOUNTY_CLAIMS - data.claims.length;
  
  // Get pool balance
  let poolBalance = '0';
  try {
    const bal = await publicClient.readContract({
      address: USDT0_ADDRESS,
      abi: EIP3009_ABI,
      functionName: 'balanceOf',
      args: [facilitatorAccount.address]
    });
    poolBalance = (Number(bal) / 1e6).toFixed(6);
  } catch (e) {}
  
  res.json({
    active: remaining > 0,
    bountyAmount: '$1 USD₮0',
    poolBalance: `$${poolBalance}`,
    claimed: data.claims.length,
    maxClaims: MAX_BOUNTY_CLAIMS,
    remaining,
    recentClaims: data.claims.slice(-10).map(c => ({
      address: redactAddress(c.address),
      timestamp: c.timestamp
    })),
    howToClaim: [
      '1. Get USD₮0 on Flare (any amount)',
      '2. Connect to this facilitator',
      '3. Send valid x402 payment verification',
      '4. Receive $1 USD₮0 bounty automatically!'
    ]
  });
});

// Payment requirements endpoint (what this facilitator accepts)
app.get('/requirements', (req, res) => {
  res.json({
    x402Version: 2,
    schemes: [{
      scheme: 'exact',
      network: 'eip155:14',
      asset: USDT0_ADDRESS,
      assetSymbol: 'USD₮0',
      assetDecimals: 6,
      extra: {
        assetTransferMethod: 'eip3009',
        name: 'USD₮0',
        version: '1'
      }
    }]
  });
});

// Start server
loadFacilitatorWallet();

app.listen(PORT, () => {
  console.log(`
🦞 x402 Flare Facilitator
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Network:     Flare (eip155:14)
Asset:       USD₮0
Method:      EIP-3009 (transferWithAuthorization)
Port:        ${PORT}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ready to process agent payments! 🚀
`);
});

export { verifyPayment, settlePayment };
