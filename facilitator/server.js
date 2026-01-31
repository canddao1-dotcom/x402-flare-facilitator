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

// Load facilitator wallet (pays gas)
function loadFacilitatorWallet() {
  const keyPath = process.env.FACILITATOR_KEY_PATH || path.join(__dirname, 'facilitator-key.json');
  
  if (process.env.FACILITATOR_PRIVATE_KEY) {
    facilitatorAccount = privateKeyToAccount(process.env.FACILITATOR_PRIVATE_KEY);
  } else if (fs.existsSync(keyPath)) {
    const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    facilitatorAccount = privateKeyToAccount(key.privateKey);
  } else {
    console.error('❌ No facilitator wallet configured');
    console.error('Set FACILITATOR_PRIVATE_KEY or create facilitator-key.json');
    process.exit(1);
  }
  
  walletClient = createWalletClient({
    account: facilitatorAccount,
    chain: flare,
    transport: http(RPC_URL)
  });
  
  console.log(`💳 Facilitator wallet: ${facilitatorAccount.address}`);
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
app.use(cors());
app.use(express.json());

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
    console.log(`⚠️ Address not whitelisted: ${toAddress}`);
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
    
    console.log(`🎁 Bounty paid: $1 USD₮0 to ${toAddress} (${whitelistEntry?.moltbookAgent || 'unknown'}) tx: ${hash}`);
    return { amount: '1.000000', txHash: hash, moltbookAgent: whitelistEntry?.moltbookAgent };
  } catch (e) {
    console.error('Bounty payment failed:', e.message);
    return { error: 'payment_failed', message: e.message };
  }
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
    facilitator: facilitatorAccount?.address,
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
          result.bountyPaid = bountyResult;
          console.log(`🎉 New agent connected: ${fromAddress} (${bountyResult.moltbookAgent})`);
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

// Check whitelist status for an address
app.get('/bounty/check/:address', (req, res) => {
  const address = req.params.address;
  const whitelisted = isWhitelisted(address);
  const claimed = hasClaimed(address);
  const entry = getWhitelistEntry(address);
  
  res.json({
    address,
    whitelisted,
    claimed,
    moltbookAgent: entry?.moltbookAgent || null,
    approvedAt: entry?.approvedAt || null,
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
      address: c.address,
      txHash: c.txHash,
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
Asset:       USD₮0 (${USDT0_ADDRESS})
Method:      EIP-3009 (transferWithAuthorization)
Facilitator: ${facilitatorAccount.address}
Port:        ${PORT}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Endpoints:
  GET  /              Health check
  GET  /requirements  Payment requirements
  POST /verify        Verify payment signature
  POST /settle        Execute payment on-chain

Ready to process agent payments! 🚀
`);
});

export { verifyPayment, settlePayment };
