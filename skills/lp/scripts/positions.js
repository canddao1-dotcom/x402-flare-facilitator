#!/usr/bin/env node
/**
 * View V3 LP Positions with Holdings and Accrued Fees
 * 
 * Usage:
 *   node positions.js --address 0x...
 *   node positions.js --position 34935
 */

const { ethers } = require('ethers');

const RPC_URL = 'https://flare-api.flare.network/ext/C/rpc';

const DEX_CONFIGS = {
  enosys: {
    nftManager: '0xD9770b1C7A6ccd33C75b5bcB1c0078f46bE46657',
    factory: '0x17AA157AC8C54034381b840Cb8f6bf7Fc355f0de',
  },
  sparkdex: {
    nftManager: '0xbEEFA7FAb245B568183D5f67731487908630d801',
    factory: '0xF528a5F7E0E2B395346d04E257fEA2Be65Ea3fA1',
  }
};

const KNOWN_TOKENS = {
  '0x1d80c49bbbcd1c0911346656b529df9e5c2f783d': { symbol: 'WFLR', decimals: 18 },
  '0x12e605bc104e93b45e1ad99f9e555f659051c2bb': { symbol: 'sFLR', decimals: 18 },
  '0xad552a648c74d49e10027ab8a618a3ad4901c5be': { symbol: 'FXRP', decimals: 6 },
  '0x96b41289d90444b8add57e6f265db5ae8651df29': { symbol: 'stXRP', decimals: 6 },
  '0xe7cd86e13ac4309349f30b3435a9d337750fc82d': { symbol: 'USDT0', decimals: 6 },
  '0x6cd3a5ba46fa254d4d2e3c2b37350ae337e94a0f': { symbol: 'CDP', decimals: 18 },
  '0x194726f6c2ae988f1ab5e1c943c17e591a6f6059': { symbol: 'BANK', decimals: 18 },
  '0xfbda5f676cb37624f28265a144a48b0d6e87d3b6': { symbol: 'USDC.e', decimals: 6 },
};

const NFT_MANAGER_ABI = [
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)'
];

const POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() view returns (address)',
  'function token1() view returns (address)'
];

const FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)'
];

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : null;
  };
  return {
    address: get('--address'),
    position: get('--position'),
    dex: get('--dex') || 'all',
  };
}

function getTokenInfo(address) {
  const lower = address.toLowerCase();
  return KNOWN_TOKENS[lower] || { symbol: address.slice(0, 8), decimals: 18 };
}

function formatUnits(value, decimals) {
  if (!value) return '0';
  const str = value.toString();
  if (str === '0') return '0';
  const padded = str.padStart(decimals + 1, '0');
  const intPart = padded.slice(0, -decimals) || '0';
  const decPart = padded.slice(-decimals).replace(/0+$/, '');
  return decPart ? `${intPart}.${decPart}` : intPart;
}

// Calculate token amounts from liquidity and tick range
function calculateAmounts(liquidity, tickLower, tickUpper, currentTick, sqrtPriceX96) {
  const Q96 = 2n ** 96n;
  const liq = BigInt(liquidity);
  
  // sqrt prices at tick boundaries
  const sqrtPriceLower = BigInt(Math.floor(Math.sqrt(1.0001 ** tickLower) * Number(Q96)));
  const sqrtPriceUpper = BigInt(Math.floor(Math.sqrt(1.0001 ** tickUpper) * Number(Q96)));
  const sqrtPriceCurrent = BigInt(sqrtPriceX96);
  
  let amount0 = 0n;
  let amount1 = 0n;
  
  if (currentTick < tickLower) {
    // Position is entirely in token0
    amount0 = liq * (sqrtPriceUpper - sqrtPriceLower) / (sqrtPriceLower * sqrtPriceUpper / Q96);
  } else if (currentTick >= tickUpper) {
    // Position is entirely in token1
    amount1 = liq * (sqrtPriceUpper - sqrtPriceLower) / Q96;
  } else {
    // Position is in range - has both tokens
    amount0 = liq * (sqrtPriceUpper - sqrtPriceCurrent) / (sqrtPriceCurrent * sqrtPriceUpper / Q96);
    amount1 = liq * (sqrtPriceCurrent - sqrtPriceLower) / Q96;
  }
  
  return { amount0, amount1 };
}

async function getPositionDetails(provider, nftManager, tokenId, dexName) {
  const contract = new ethers.Contract(nftManager, NFT_MANAGER_ABI, provider);
  
  try {
    const pos = await contract.positions(tokenId);
    const owner = await contract.ownerOf(tokenId);
    
    const token0Info = getTokenInfo(pos.token0);
    const token1Info = getTokenInfo(pos.token1);
    
    // Get pool address and current tick
    const factory = new ethers.Contract(
      dexName === 'sparkdex' ? DEX_CONFIGS.sparkdex.factory : DEX_CONFIGS.enosys.factory,
      FACTORY_ABI,
      provider
    );
    
    let currentTick = null;
    let inRange = null;
    let sqrtPriceX96 = null;
    let amount0 = '0';
    let amount1 = '0';
    
    try {
      const poolAddr = await factory.getPool(pos.token0, pos.token1, pos.fee);
      if (poolAddr && poolAddr !== ethers.ZeroAddress) {
        const pool = new ethers.Contract(poolAddr, POOL_ABI, provider);
        const slot0 = await pool.slot0();
        currentTick = Number(slot0.tick);
        sqrtPriceX96 = slot0.sqrtPriceX96;
        inRange = currentTick >= Number(pos.tickLower) && currentTick <= Number(pos.tickUpper);
        
        // Calculate token amounts
        if (pos.liquidity > 0n) {
          const amounts = calculateAmounts(
            pos.liquidity,
            Number(pos.tickLower),
            Number(pos.tickUpper),
            currentTick,
            sqrtPriceX96
          );
          amount0 = formatUnits(amounts.amount0, token0Info.decimals);
          amount1 = formatUnits(amounts.amount1, token1Info.decimals);
        }
      }
    } catch (e) {
      console.error('Pool error:', e.message);
    }
    
    return {
      tokenId: Number(tokenId),
      owner,
      dex: dexName,
      token0: pos.token0,
      token1: pos.token1,
      token0Symbol: token0Info.symbol,
      token1Symbol: token1Info.symbol,
      token0Decimals: token0Info.decimals,
      token1Decimals: token1Info.decimals,
      fee: Number(pos.fee),
      tickLower: Number(pos.tickLower),
      tickUpper: Number(pos.tickUpper),
      currentTick,
      inRange,
      liquidity: pos.liquidity.toString(),
      // Holdings
      amount0,
      amount1,
      // Accrued fees
      tokensOwed0: formatUnits(pos.tokensOwed0, token0Info.decimals),
      tokensOwed1: formatUnits(pos.tokensOwed1, token1Info.decimals),
    };
  } catch (e) {
    return null;
  }
}

async function getPositionsForAddress(provider, address) {
  const positions = [];
  
  for (const [dexName, config] of Object.entries(DEX_CONFIGS)) {
    const contract = new ethers.Contract(config.nftManager, NFT_MANAGER_ABI, provider);
    
    try {
      const balance = await contract.balanceOf(address);
      
      for (let i = 0; i < Number(balance); i++) {
        const tokenId = await contract.tokenOfOwnerByIndex(address, i);
        const details = await getPositionDetails(provider, config.nftManager, tokenId, dexName);
        
        if (details && BigInt(details.liquidity) > 0n) {
          positions.push(details);
        }
      }
    } catch (e) {
      // No positions on this DEX
    }
  }
  
  return positions;
}

async function main() {
  const args = parseArgs();
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  if (args.position) {
    // Single position lookup
    const tokenId = parseInt(args.position);
    console.log(`\n🔍 Looking up position #${tokenId}...\n`);
    
    for (const [dexName, config] of Object.entries(DEX_CONFIGS)) {
      const details = await getPositionDetails(provider, config.nftManager, tokenId, dexName);
      if (details) {
        printPosition(details);
        return;
      }
    }
    
    console.log('Position not found');
    return;
  }
  
  if (!args.address) {
    console.error('Usage: node positions.js --address 0x... | --position <id>');
    process.exit(1);
  }
  
  console.log(`\n🔍 Scanning positions for ${args.address}...\n`);
  
  const positions = await getPositionsForAddress(provider, args.address);
  
  if (positions.length === 0) {
    console.log('No V3 positions found');
    return;
  }
  
  console.log(`Found ${positions.length} position(s):\n`);
  
  for (const pos of positions) {
    printPosition(pos);
  }
}

function printPosition(pos) {
  const rangeStatus = pos.inRange === null ? '❓' : pos.inRange ? '🟢' : '🔴';
  const hasRewards = parseFloat(pos.tokensOwed0) > 0 || parseFloat(pos.tokensOwed1) > 0;
  
  // Calculate position % in range
  let positionPct = '';
  if (pos.currentTick !== null && pos.inRange) {
    const range = pos.tickUpper - pos.tickLower;
    const fromLower = pos.currentTick - pos.tickLower;
    const pct = (fromLower / range * 100).toFixed(1);
    positionPct = `${pct}%`;
  }
  
  console.log('━'.repeat(60));
  console.log(`${rangeStatus} Position #${pos.tokenId}`);
  console.log('━'.repeat(60));
  console.log(`DEX:         ${pos.dex.toUpperCase()}`);
  console.log(`Pair:        ${pos.token0Symbol}/${pos.token1Symbol}`);
  console.log(`Fee Tier:    ${pos.fee / 10000}%`);
  console.log(`Range:       ${pos.tickLower} → ${pos.tickUpper}`);
  if (pos.currentTick !== null) {
    const status = pos.inRange ? `✅ IN RANGE (${positionPct})` : '❌ OUT OF RANGE';
    console.log(`Current:     tick ${pos.currentTick} ${status}`);
  }
  console.log('');
  console.log(`💰 Holdings:`);
  console.log(`   ${parseFloat(pos.amount0).toFixed(6)} ${pos.token0Symbol}`);
  console.log(`   ${parseFloat(pos.amount1).toFixed(6)} ${pos.token1Symbol}`);
  console.log('');
  console.log(`🎁 Pending Rewards (claimable):`);
  console.log(`   ${pos.tokensOwed0} ${pos.token0Symbol}`);
  console.log(`   ${pos.tokensOwed1} ${pos.token1Symbol}`);
  if (hasRewards) {
    console.log(`   💰 Rewards ready to collect!`);
  } else {
    console.log(`   (Fees accrue as trades pass through your range)`);
  }
  console.log('');
}

main().catch(console.error);
