#!/usr/bin/env node
/**
 * Test x402 Flare Facilitator verification
 * Creates a real EIP-3009 signature and sends to /verify
 */

import { createPublicClient, createWalletClient, http, parseAbi, encodePacked, keccak256 } from 'viem';
import { privateKeyToAccount, signTypedData } from 'viem/accounts';
import { flare } from 'viem/chains';
import crypto from 'crypto';

const RPC_URL = 'https://flare-api.flare.network/ext/C/rpc';
const USDT0_ADDRESS = '0xe7cd86e13AC4309349F30B3435a9d337750fC82D';
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'http://localhost:3402';

// Test wallet (our agent wallet)
const PRIVATE_KEY = process.env.TEST_PRIVATE_KEY || '0x9c3903f8551394752b1ed43c1472215e5ed6b67c99bd7d64ee6f12aacca08488';
const account = privateKeyToAccount(PRIVATE_KEY);

console.log('🧪 Testing x402 Flare Facilitator\n');
console.log(`Wallet: ${account.address}`);
console.log(`Facilitator: ${FACILITATOR_URL}\n`);

// Create clients
const publicClient = createPublicClient({
  chain: flare,
  transport: http(RPC_URL)
});

// Get token info
const tokenAbi = parseAbi([
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)'
]);

async function test() {
  // 1. Get token info
  console.log('1️⃣ Getting token info...');
  const [name, version, balance] = await Promise.all([
    publicClient.readContract({ address: USDT0_ADDRESS, abi: tokenAbi, functionName: 'name' }),
    publicClient.readContract({ address: USDT0_ADDRESS, abi: tokenAbi, functionName: 'version' }).catch(() => '1'),
    publicClient.readContract({ address: USDT0_ADDRESS, abi: tokenAbi, functionName: 'balanceOf', args: [account.address] })
  ]);
  
  console.log(`   Token: ${name}`);
  console.log(`   Version: ${version}`);
  console.log(`   Balance: ${Number(balance) / 1e6} USD₮0\n`);
  
  if (balance === 0n) {
    console.log('❌ No USD₮0 balance - cannot test');
    return;
  }
  
  // 2. Create EIP-3009 authorization
  console.log('2️⃣ Creating EIP-3009 authorization...');
  
  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: account.address,
    to: '0x0000000000000000000000000000000000000001', // Burn address for test
    value: 1n, // 0.000001 USD₮0 (minimal test amount)
    validAfter: BigInt(now - 60),
    validBefore: BigInt(now + 300),
    nonce: `0x${crypto.randomBytes(32).toString('hex')}`
  };
  
  console.log(`   From: ${authorization.from}`);
  console.log(`   To: ${authorization.to}`);
  console.log(`   Value: ${authorization.value} (0.000001 USD₮0)`);
  console.log(`   Valid: ${authorization.validAfter} - ${authorization.validBefore}\n`);
  
  // 3. Sign with EIP-712
  console.log('3️⃣ Signing authorization...');
  
  const domain = {
    name,
    version,
    chainId: 14,
    verifyingContract: USDT0_ADDRESS
  };
  
  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' }
    ]
  };
  
  const signature = await signTypedData({
    privateKey: PRIVATE_KEY,
    domain,
    types,
    primaryType: 'TransferWithAuthorization',
    message: authorization
  });
  
  console.log(`   Signature: ${signature.slice(0, 20)}...${signature.slice(-10)}\n`);
  
  // 4. Send to facilitator
  console.log('4️⃣ Sending to facilitator /verify...');
  
  const payload = {
    x402Version: 2,
    accepted: {
      scheme: 'exact',
      network: 'eip155:14',
      amount: authorization.value.toString(),
      asset: USDT0_ADDRESS,
      payTo: authorization.to,
      maxTimeoutSeconds: 300,
      extra: {
        assetTransferMethod: 'eip3009',
        name,
        version
      }
    },
    payload: {
      signature,
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
        nonce: authorization.nonce
      }
    }
  };
  
  try {
    const response = await fetch(`${FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    console.log('   Response:', JSON.stringify(result, null, 2));
    
    if (result.valid) {
      console.log('\n✅ VERIFICATION SUCCESSFUL!');
      if (result.bountyPaid) {
        console.log(`🎁 BOUNTY PAID: $${result.bountyPaid.amount} (tx: ${result.bountyPaid.txHash})`);
      }
    } else {
      console.log(`\n❌ Verification failed: ${result.error}`);
    }
  } catch (error) {
    console.log(`\n❌ Request failed: ${error.message}`);
  }
}

test().catch(console.error);
