/**
 * x402 Payment Integration for Agent Tips
 * 
 * Supports two modes:
 * 1. Facilitator-funded tips (facilitator pays from pool)
 * 2. User-signed tips (user signs EIP-3009, facilitator submits)
 */

import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { flare } from 'viem/chains';

// Chain configs
export const CHAINS = {
  flare: {
    id: 14,
    name: 'Flare',
    rpc: process.env.FLARE_RPC || 'https://flare-api.flare.network/ext/C/rpc',
    explorer: 'https://flarescan.com',
    viemChain: flare
  },
  hyperevm: {
    id: 999,
    name: 'HyperEVM',
    rpc: 'https://rpc.hyperliquid.xyz/evm',
    explorer: 'https://purrsec.com',
    viemChain: {
      id: 999,
      name: 'HyperEVM',
      network: 'hyperevm',
      nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
      rpcUrls: {
        default: { http: ['https://rpc.hyperliquid.xyz/evm'] },
        public: { http: ['https://rpc.hyperliquid.xyz/evm'] }
      }
    }
  }
};

// Token contracts by chain
export const TOKENS = {
  flare: {
    USDT: {
      address: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D',
      symbol: 'USD₮0',
      decimals: 6
    },
    WFLR: {
      address: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d',
      symbol: 'WFLR',
      decimals: 18
    },
    FXRP: {
      address: '0xAd552A648C74D49E10027AB8a618A3ad4901c5bE',
      symbol: 'FXRP',
      decimals: 6
    }
  },
  hyperevm: {
    USDT: {
      address: '0xUSDT_HYPEREVM', // TODO: Get actual address
      symbol: 'USDT',
      decimals: 6
    },
    FXRP: {
      address: '0xd70659a6396285bf7214d7ea9673184e7c72e07e',
      symbol: 'fXRP',
      decimals: 18
    },
    HYPE: {
      address: 'native',
      symbol: 'HYPE',
      decimals: 18
    }
  }
};

// Backwards compat - default to flare tokens
export const FLARE_TOKENS = TOKENS.flare;
export const HYPEREVM_TOKENS = TOKENS.hyperevm;

const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
]);

// Create client for a specific chain
function getPublicClient(chain = 'flare') {
  const chainConfig = CHAINS[chain];
  if (!chainConfig) throw new Error(`Unsupported chain: ${chain}`);
  
  return createPublicClient({
    chain: chainConfig.viemChain,
    transport: http(chainConfig.rpc)
  });
}

function getWalletClient(privateKey, chain = 'flare') {
  const chainConfig = CHAINS[chain];
  if (!chainConfig) throw new Error(`Unsupported chain: ${chain}`);
  
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: chainConfig.viemChain,
    transport: http(chainConfig.rpc)
  });
}

/**
 * Send tip from facilitator wallet
 * @param {Object} params
 * @param {string} params.to - Recipient address
 * @param {string} params.amount - Amount to send
 * @param {string} params.token - Token symbol (USDT, WFLR, FXRP, HYPE)
 * @param {string} params.chain - Chain name (flare, hyperevm)
 * @param {string} params.privateKey - Facilitator private key
 */
export async function sendTip({ to, amount, token = 'USDT', chain = 'flare', privateKey }) {
  if (!privateKey) {
    throw new Error('Facilitator private key required');
  }
  
  const chainConfig = CHAINS[chain];
  if (!chainConfig) {
    throw new Error(`Unsupported chain: ${chain}`);
  }
  
  const chainTokens = TOKENS[chain];
  if (!chainTokens) {
    throw new Error(`No tokens configured for chain: ${chain}`);
  }
  
  const tokenConfig = chainTokens[token];
  if (!tokenConfig) {
    throw new Error(`Unsupported token ${token} on ${chain}. Available: ${Object.keys(chainTokens).join(', ')}`);
  }
  
  const account = privateKeyToAccount(privateKey);
  const publicClient = getPublicClient(chain);
  const walletClient = getWalletClient(privateKey, chain);
  
  // Parse amount to token decimals
  const amountBigInt = BigInt(Math.floor(parseFloat(amount) * (10 ** tokenConfig.decimals)));
  
  let hash;
  
  if (tokenConfig.address === 'native') {
    // Native token transfer (HYPE on HyperEVM)
    hash = await walletClient.sendTransaction({
      to,
      value: amountBigInt
    });
  } else {
    // ERC20 transfer
    // Check balance first
    const balance = await publicClient.readContract({
      address: tokenConfig.address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account.address]
    });
    
    if (balance < amountBigInt) {
      throw new Error(`Insufficient ${token} balance on ${chain}. Have: ${Number(balance) / (10 ** tokenConfig.decimals)}, Need: ${amount}`);
    }
    
    // Execute transfer
    hash = await walletClient.writeContract({
      address: tokenConfig.address,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [to, amountBigInt]
    });
  }
  
  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  return {
    success: true,
    txHash: hash,
    from: account.address,
    to,
    amount,
    token,
    chain,
    explorer: `${chainConfig.explorer}/tx/${hash}`,
    blockNumber: receipt.blockNumber.toString()
  };
}

/**
 * Check facilitator balance
 */
export async function getFacilitatorBalance(address, token = 'USDT', chain = 'flare') {
  const chainTokens = TOKENS[chain];
  if (!chainTokens) return null;
  
  const tokenConfig = chainTokens[token];
  if (!tokenConfig) return null;
  
  const publicClient = getPublicClient(chain);
  
  let balance;
  if (tokenConfig.address === 'native') {
    balance = await publicClient.getBalance({ address });
  } else {
    balance = await publicClient.readContract({
      address: tokenConfig.address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address]
    });
  }
  
  return {
    token,
    chain,
    raw: balance.toString(),
    formatted: (Number(balance) / (10 ** tokenConfig.decimals)).toFixed(tokenConfig.decimals)
  };
}

/**
 * Get supported chains and tokens
 */
export function getSupportedAssets() {
  return {
    chains: Object.keys(CHAINS).map(c => ({
      id: CHAINS[c].id,
      name: CHAINS[c].name,
      tokens: Object.keys(TOKENS[c] || {})
    }))
  };
}

/**
 * Resolve agent wallet from various sources
 */
export async function resolveAgentWallet(platform, username) {
  // Hard-coded registry for now
  const REGISTRY = {
    moltbook: {
      'CanddaoJr': '0x0DFa93560e0DCfF78F7e3985826e42e53E9493cC',
      'canddao': '0x3c1c84132dfdef572e74672917700c065581871d',
      // Add more as agents register
    },
    twitter: {},
    github: {}
  };
  
  const wallet = REGISTRY[platform]?.[username];
  
  if (!wallet) {
    // TODO: Fetch from Moltbook API when available
    // const res = await fetch(`https://www.moltbook.com/api/v1/agents/${username}`);
    // const data = await res.json();
    // return data.wallet_address;
    return null;
  }
  
  return wallet;
}
