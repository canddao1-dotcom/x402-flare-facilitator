#!/usr/bin/env node
/**
 * Portfolio Analysis - Full DeFi Position Tracker
 * 
 * Tracks:
 * - Token balances (wallet)
 * - Upshift (earnXRP deposits)
 * - CDP Stability Pools (Enosys Loans)
 * - Spectra (PT/YT holdings)
 * - V3 LP positions
 * 
 * Usage:
 *   node analyze.js <address>
 *   node analyze.js <address> --json
 */

const { ethers } = require('ethers');

const RPC_URL = 'https://flare-api.flare.network/ext/C/rpc';

// Tokens to check
const TOKENS = {
  'WFLR': { address: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d', decimals: 18, priceKey: 'FLR' },
  'sFLR': { address: '0x12e605bc104e93B45e1aD99F9e555f659051c2BB', decimals: 18, priceKey: 'FLR' },
  'FXRP': { address: '0xAd552A648C74D49E10027AB8a618A3ad4901c5bE', decimals: 6, priceKey: 'XRP' },
  'stXRP': { address: '0x4C18Ff3C89632c3Dd62E796c0aFA5c07c4c1B2b3', decimals: 6, priceKey: 'XRP' },
  'USD₮0': { address: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', decimals: 6, priceKey: 'USD' },
  'USDC.e': { address: '0xfbda5f676cb37624f28265a144a48b0d6e87d3b6', decimals: 6, priceKey: 'USD' },
  'BANK': { address: '0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059', decimals: 18, priceKey: null },
  'CDP': { address: '0x6Cd3a5Ba46FA254D4d2E3C2B37350ae337E94a0F', decimals: 18, priceKey: 'USD' },
  // Upshift
  'earnXRP': { address: '0xe533e447fd7720b2f8654da2b1953efa06b60bfa', decimals: 6, priceKey: 'XRP' },
  // Spectra PT/YT (stXRP pool)
  'PT-stXRP': { address: '0x097Dd93Bf92bf9018fF194195dDfCFB2c359335e', decimals: 6, priceKey: 'XRP' },
  'YT-stXRP': { address: '0x46f0C7b81128e031604eCb3e8A7E28dd3F8A50C9', decimals: 6, priceKey: null },
  // Spectra (sFLR pool)
  'PT-sFLR': { address: '0x14613BFc52F98af194F4e0b1D23fE538B54628f3', decimals: 18, priceKey: 'FLR' },
};

// Protocol contracts
const PROTOCOLS = {
  upshift: {
    vault: '0x373D7d201C8134D4a2f7b5c63560da217e3dEA28',
    shareToken: '0xe533e447fd7720b2f8654da2b1953efa06b60bfa',
  },
  cdpFxrp: {
    stabilityPool: '0x2c817F7159c08d94f09764086330c96Bb3265A2f',
  },
  cdpWflr: {
    stabilityPool: '0x0Dd6daab4cB9A0ba6707Cf59DBfbc28cc33CA24A',
  },
};

// ABIs
const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];
const STABILITY_POOL_ABI = [
  'function getCompoundedBoldDeposit(address) view returns (uint256)',
  'function getDepositorYieldGain(address) view returns (uint256)',
  'function getDepositorCollGain(address) view returns (uint256)',
];
const V3_POSITION_MANAGER = '0xd9770b1c7a6ccd33c75b5bcb1c0078f46be46657';

let provider = null;
function getProvider() {
  if (!provider) provider = new ethers.JsonRpcProvider(RPC_URL);
  return provider;
}

// Simple price fetcher (hardcoded for now, can integrate FTSO later)
async function getPrices() {
  // Approximate prices - in production, fetch from FTSO
  return {
    FLR: 0.02,
    XRP: 2.20,
    USD: 1.00,
  };
}

async function getTokenBalance(tokenAddress, decimals, walletAddress) {
  const p = getProvider();
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, p);
  try {
    const balance = await contract.balanceOf(walletAddress);
    return Number(ethers.formatUnits(balance, decimals));
  } catch {
    return 0;
  }
}

async function getCDPPosition(spAddress, walletAddress, collDecimals) {
  const p = getProvider();
  const sp = new ethers.Contract(spAddress, STABILITY_POOL_ABI, p);
  try {
    const [deposit, yieldGain, collGain] = await Promise.all([
      sp.getCompoundedBoldDeposit(walletAddress),
      sp.getDepositorYieldGain(walletAddress),
      sp.getDepositorCollGain(walletAddress),
    ]);
    return {
      deposit: Number(ethers.formatUnits(deposit, 18)),
      yieldGain: Number(ethers.formatUnits(yieldGain, 18)),
      collGain: Number(ethers.formatUnits(collGain, collDecimals)),
    };
  } catch {
    return { deposit: 0, yieldGain: 0, collGain: 0 };
  }
}

async function getV3PositionCount(walletAddress) {
  const p = getProvider();
  const contract = new ethers.Contract(V3_POSITION_MANAGER, ERC20_ABI, p);
  try {
    return Number(await contract.balanceOf(walletAddress));
  } catch {
    return 0;
  }
}

async function analyzeWallet(address) {
  const p = getProvider();
  const checksumAddress = ethers.getAddress(address);
  
  // Get prices
  const prices = await getPrices();
  
  // Get native balance
  const nativeBalance = Number(ethers.formatEther(await p.getBalance(checksumAddress)));
  
  // Get all token balances
  const tokenBalances = await Promise.all(
    Object.entries(TOKENS).map(async ([symbol, info]) => {
      const balance = await getTokenBalance(info.address, info.decimals, checksumAddress);
      const price = info.priceKey ? (prices[info.priceKey] || 0) : 0;
      return { symbol, balance, price, value: balance * price, ...info };
    })
  );
  
  // Get CDP positions
  const [cdpFxrp, cdpWflr] = await Promise.all([
    getCDPPosition(PROTOCOLS.cdpFxrp.stabilityPool, checksumAddress, 6),
    getCDPPosition(PROTOCOLS.cdpWflr.stabilityPool, checksumAddress, 18),
  ]);
  
  // Get V3 position count
  const v3Count = await getV3PositionCount(checksumAddress);
  
  // Build holdings
  const holdings = [];
  let totalValue = 0;
  
  // Native FLR
  if (nativeBalance > 0.001) {
    const value = nativeBalance * prices.FLR;
    totalValue += value;
    holdings.push({ symbol: 'FLR (native)', balance: nativeBalance, price: prices.FLR, value });
  }
  
  // Tokens
  for (const t of tokenBalances) {
    if (t.balance > 0.0001) {
      totalValue += t.value;
      holdings.push({ symbol: t.symbol, balance: t.balance, price: t.price, value: t.value });
    }
  }
  
  // Protocol positions
  const protocolPositions = [];
  
  // CDP FXRP pool
  if (cdpFxrp.deposit > 0.001 || cdpFxrp.yieldGain > 0.001 || cdpFxrp.collGain > 0.001) {
    const value = (cdpFxrp.deposit + cdpFxrp.yieldGain) * prices.USD + cdpFxrp.collGain * prices.XRP;
    totalValue += value;
    protocolPositions.push({
      protocol: 'Enosys CDP (FXRP Pool)',
      deposit: cdpFxrp.deposit,
      pendingYield: cdpFxrp.yieldGain,
      pendingColl: cdpFxrp.collGain,
      collSymbol: 'FXRP',
      value,
    });
  }
  
  // CDP WFLR pool
  if (cdpWflr.deposit > 0.001 || cdpWflr.yieldGain > 0.001 || cdpWflr.collGain > 0.001) {
    const value = (cdpWflr.deposit + cdpWflr.yieldGain) * prices.USD + cdpWflr.collGain * prices.FLR;
    totalValue += value;
    protocolPositions.push({
      protocol: 'Enosys CDP (WFLR Pool)',
      deposit: cdpWflr.deposit,
      pendingYield: cdpWflr.yieldGain,
      pendingColl: cdpWflr.collGain,
      collSymbol: 'WFLR',
      value,
    });
  }
  
  // Sort holdings by value
  holdings.sort((a, b) => b.value - a.value);
  
  return {
    address: checksumAddress,
    totalValue,
    v3PositionCount: v3Count,
    holdings,
    protocolPositions,
    prices,
  };
}

function formatNumber(n, decimals = 2) {
  if (n >= 1000000) return (n / 1000000).toFixed(decimals) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(decimals) + 'K';
  if (n < 0.01 && n > 0) return n.toFixed(6);
  return n.toFixed(decimals);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Default to agent wallet
    args.push('0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A');
  }
  
  const address = args[0];
  const jsonOutput = args.includes('--json');
  
  if (!ethers.isAddress(address)) {
    console.error('Invalid address:', address);
    process.exit(1);
  }
  
  const result = await analyzeWallet(address);
  
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('💼 PORTFOLIO ANALYSIS\n');
    console.log(`Address: ${result.address}`);
    console.log(`Total Value: $${formatNumber(result.totalValue)}`);
    console.log(`V3 LP Positions: ${result.v3PositionCount}`);
    
    console.log('\n📊 TOKEN HOLDINGS:\n');
    for (const h of result.holdings) {
      const balStr = formatNumber(h.balance, 4).padStart(14);
      const valStr = ('$' + formatNumber(h.value)).padStart(10);
      console.log(`${h.symbol.padEnd(12)} ${balStr} ${valStr}`);
    }
    
    if (result.protocolPositions.length > 0) {
      console.log('\n🏦 PROTOCOL POSITIONS:\n');
      for (const p of result.protocolPositions) {
        console.log(`${p.protocol}`);
        console.log(`  Deposited: ${formatNumber(p.deposit, 4)} CDP (~$${formatNumber(p.deposit)})`);
        if (p.pendingYield > 0.0001) {
          console.log(`  Pending Yield: +${formatNumber(p.pendingYield, 4)} CDP`);
        }
        if (p.pendingColl > 0.0001) {
          console.log(`  Pending Coll: +${formatNumber(p.pendingColl, 4)} ${p.collSymbol}`);
        }
        console.log(`  Value: $${formatNumber(p.value)}`);
        console.log('');
      }
    }
    
    console.log('💰 Prices: FLR=$' + result.prices.FLR + ', XRP=$' + result.prices.XRP);
  }
}

module.exports = { analyzeWallet };

if (require.main === module) {
  main().catch(e => { console.error('Error:', e.message); process.exit(1); });
}
