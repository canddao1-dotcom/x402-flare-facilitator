/**
 * Multi-Network Configuration
 * Supports: Flare, HyperEVM, Base
 */

const NETWORKS = {
  flare: {
    name: 'Flare',
    chainId: 14,
    rpc: 'https://flare-api.flare.network/ext/C/rpc',
    explorer: 'https://flarescan.com',
    nativeSymbol: 'FLR',
    wrappedNative: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d',
    tokens: {
      WFLR: { address: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d', decimals: 18 },
      BANK: { address: '0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059', decimals: 18 },
      FXRP: { address: '0xad552a648c74d49e10027ab8a618a3ad4901c5be', decimals: 6 },
      sFLR: { address: '0x12e605bc104e93B45e1aD99F9e555f659051c2BB', decimals: 18 },
      rFLR: { address: '0x26d460c3Cf931Fb2014FA436a49e3Af08619810e', decimals: 18 },
      USDT0: { address: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', decimals: 6 },
      'USDC.e': { address: '0xfbda5f676cb37624f28265a144a48b0d6e87d3b6', decimals: 6 },
      CDP: { address: '0x6Cd3a5Ba46FA254D4d2E3C2B37350ae337E94a0F', decimals: 18 },
      stXRP: { address: '0x4C18Ff3C89632c3Dd62E796c0aFA5c07c4c1B2b3', decimals: 6 },
      earnXRP: { address: '0xe533e447fd7720b2f8654da2b1953efa06b60bfa', decimals: 6 },
    }
  },
  
  hyperevm: {
    name: 'HyperEVM',
    chainId: 999,
    rpc: 'https://rpc.hyperliquid.xyz/evm',
    explorer: 'https://explorer.hyperliquid.xyz',
    nativeSymbol: 'HYPE',
    wrappedNative: null, // No wrapped HYPE yet
    tokens: {
      fXRP: { address: '0xd70659a6396285bf7214d7ea9673184e7c72e07e', decimals: 6 },
      USDT0: { address: '0x3cBFE5AD65574a89F4E24D553E40Fc7EA5Af0e19', decimals: 6 },
    }
  },
  
  base: {
    name: 'Base',
    chainId: 8453,
    rpc: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    nativeSymbol: 'ETH',
    wrappedNative: '0x4200000000000000000000000000000000000006', // WETH on Base
    tokens: {
      WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
      USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
      USDbC: { address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', decimals: 6 },
      DAI: { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18 },
      cbETH: { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', decimals: 18 },
      AERO: { address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', decimals: 18 },
    }
  }
};

// Aliases for convenience
const NETWORK_ALIASES = {
  flr: 'flare',
  hyper: 'hyperevm',
  hype: 'hyperevm',
  hl: 'hyperevm',
};

function getNetwork(nameOrAlias) {
  const key = NETWORK_ALIASES[nameOrAlias?.toLowerCase()] || nameOrAlias?.toLowerCase();
  return NETWORKS[key] || null;
}

function getNetworkByChainId(chainId) {
  return Object.values(NETWORKS).find(n => n.chainId === chainId) || null;
}

function listNetworks() {
  return Object.entries(NETWORKS).map(([key, net]) => ({
    key,
    name: net.name,
    chainId: net.chainId,
    nativeSymbol: net.nativeSymbol
  }));
}

function resolveToken(symbol, network) {
  const net = typeof network === 'string' ? getNetwork(network) : network;
  if (!net) return null;
  
  // Case-insensitive token lookup
  const upperSymbol = symbol.toUpperCase();
  for (const [name, token] of Object.entries(net.tokens)) {
    if (name.toUpperCase() === upperSymbol) {
      return { ...token, symbol: name };
    }
  }
  
  // Check if it's an address
  if (symbol.startsWith('0x')) {
    return { address: symbol, decimals: 18, symbol: 'UNKNOWN' };
  }
  
  return null;
}

module.exports = {
  NETWORKS,
  NETWORK_ALIASES,
  getNetwork,
  getNetworkByChainId,
  listNetworks,
  resolveToken,
  DEFAULT_NETWORK: 'flare'
};
