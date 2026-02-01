import { AgentSDK } from '../AgentSDK';
import { AgentSDKConfig } from '../types';

/**
 * Flare Network Configuration
 * 
 * x402 Facilitator (CanddaoJr):
 * - URL: https://agent-tips.vercel.app (deployed via Vercel)
 * - Relayer Contract: TBD (need to deploy A402 relayer on Flare)
 * - Domain: "A402" (matching x402 spec)
 * 
 * ERC-8004 Contracts: Not yet deployed on Flare
 * - IdentityRegistry: TBD
 * - ReputationRegistry: TBD
 * - ValidationRegistry: TBD
 * 
 * Supported Tokens for x402:
 * - USDT0: 0xe7cd86e13AC4309349F30B3435a9d337750fC82D (6 decimals)
 * - USDC.e: 0xfbda5f676cb37624f28265a144a48b0d6e87d3b6 (6 decimals)
 */

// Load .env if available
try {
  require('dotenv').config();
} catch (e) {}

// Our deployed facilitator
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL || 'https://agent-tips.vercel.app';

// Default to USDT0 on Flare
const DEFAULT_TOKEN = process.env.DEFAULT_TOKEN || '0xe7cd86e13AC4309349F30B3435a9d337750fC82D';

export const flareConfig: AgentSDKConfig = {
  privateKey: process.env.PRIVATE_KEY || process.env.AGENT_PRIVATE_KEY || undefined,
  defaultNetwork: 'flare',
  networks: {
    flare: {
      name: 'flare',
      chainId: 14,
      rpcUrl: 'https://flare-api.flare.network/ext/C/rpc',
      explorerUrl: 'https://flarescan.com',
      erc8004: {
        // Not yet deployed on Flare - need to deploy these contracts
        // identityRegistry: '0x...',
        // reputationRegistry: '0x...',
        // validationRegistry: '0x...',
      },
      x402: {
        facilitatorUrl: FACILITATOR_URL,
        defaultToken: DEFAULT_TOKEN,
        domainName: 'A402',
        domainVersion: '1',
        // verifyingContract: '0x...' // Need to deploy relayer contract on Flare
      },
    },
  },
};

// Base Network Configuration (for comparison)
export const baseConfig: AgentSDKConfig = {
  privateKey: process.env.PRIVATE_KEY || process.env.AGENT_PRIVATE_KEY || undefined,
  defaultNetwork: 'base',
  networks: {
    base: {
      name: 'base',
      chainId: 8453,
      rpcUrl: 'https://mainnet.base.org',
      explorerUrl: 'https://basescan.org',
      erc8004: {
        // Not yet deployed on Base
      },
      x402: {
        facilitatorUrl: FACILITATOR_URL,
        defaultToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
        domainName: 'A402',
        domainVersion: '1',
      },
    },
  },
};

export function createFlareSDK() {
  return new AgentSDK(flareConfig);
}

export function createBaseSDK() {
  return new AgentSDK(baseConfig);
}

// Combined multi-network config
export const multiNetworkConfig: AgentSDKConfig = {
  privateKey: process.env.PRIVATE_KEY || process.env.AGENT_PRIVATE_KEY || undefined,
  defaultNetwork: 'flare',
  networks: {
    ...flareConfig.networks,
    ...baseConfig.networks,
  },
};

export function createMultiNetworkSDK() {
  return new AgentSDK(multiNetworkConfig);
}
