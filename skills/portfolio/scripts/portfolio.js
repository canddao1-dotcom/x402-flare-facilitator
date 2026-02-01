#!/usr/bin/env node
/**
 * Portfolio Aggregator - Unified DeFi Dashboard for Flare
 * Pulls token balances, LP positions, stability pools, yield vaults, staking
 */

const { ethers } = require('ethers');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const RPC_URL = 'https://flare-api.flare.network/ext/C/rpc';
const AGENT_WALLET = '0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A';
const DAO_TREASURY = '0xaa68bc4bab9a63958466f49f5a58c54a412d4906';

// Token addresses
const TOKENS = {
  WFLR:   { address: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d', decimals: 18 },
  sFLR:   { address: '0x12e605bc104e93B45e1aD99F9e555f659051c2BB', decimals: 18 },
  rFLR:   { address: '0x26d460c3Cf931Fb2014FA436a49e3Af08619810e', decimals: 18 },
  FXRP:   { address: '0xAd552A648C74D49E10027AB8a618A3ad4901c5bE', decimals: 6 },
  BANK:   { address: '0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059', decimals: 18 },
  USDT0:  { address: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', decimals: 6 },
  USDCe:  { address: '0xfbda5f676cb37624f28265a144a48b0d6e87d3b6', decimals: 6 },
  CDP:    { address: '0x6Cd3a5Ba46FA254D4d2E3C2B37350ae337E94a0F', decimals: 18 },
  stXRP:  { address: '0x4C18Ff3C89632c3Dd62E796c0aFA5c07c4c1B2b3', decimals: 6 },
  earnXRP:{ address: '0xe533e447fd7720b2f8654da2b1953efa06b60bfa', decimals: 6 },
  APS:    { address: '0xff56eb5b1a7faa972291117e5e9565da29bc808d', decimals: 18 },
};

// Protocol contracts
const CONTRACTS = {
  // Enosys V3
  enosysPositionManager: '0xd9770b1c7a6ccd33c75b5bcb1c0078f46be46657',
  enosysFactory: '0x17aa157ac8c54034381b840cb8f6bf7fc355f0de',
  
  // SparkDex V3.1
  sparkdexPositionManager: '0x8557372A4A38714526a4f95323E0Dea630020A02',
  sparkdexFactory: '0x8A1E01273E7E7b9B12eb7fE3f9E86e894269AD97',
  
  // Stability Pools (Enosys CDP)
  stabilityPoolFXRP: '0x2c817F7159c08d94f09764086330c96Bb3265A2f',
  stabilityPoolWFLR: '0x0Dd6daab4cB9A0ba6707Cf59DBfbc28cc33CA24A',
  
  // Upshift Vault
  upshiftFXRP: '0x373D7d201C8134D4a2f7b5c63560da217e3dEA28',
  
  // APS Staking
  apsStaking: '0x7eb8ceb0f64d934a31835b98eb4cbab3ca56df28',
  
  // Spectra PT tokens
  spectraPT_stXRP: '0x097Dd93Bf92bf9018fF194195dDfCFB2c359335e',
  spectraPT_sFLR: '0x14613BFc52F98af194F4e0b1D23fE538B54628f3',
  spectraYT_stXRP: '0x46f0C7b81128e031604eCb3e8A7E28dd3F8A50C9',
};

// V2 LP tokens to track
const V2_LP_TOKENS = [
  { 
    name: 'Enosys V2 BANK/WFLR',
    address: '0x5f29c8d049e47dd180c2b83e3560e8e271110335',
    token0: 'BANK',
    token1: 'WFLR',
  },
  { 
    name: 'SparkDex V2 BANK/WFLR',
    address: '0x0f574fc895c1abf82aeff334fa9d8ba43f866111',
    token0: 'BANK',
    token1: 'WFLR',
  },
];

// FTSO for prices
const FTSO_ADDRESS = '0xfa9368CFbee3b070d8552d8e75Cdc0fF72eFAC50';

// ═══════════════════════════════════════════════════════════════════════════
// ABIs (minimal)
// ═══════════════════════════════════════════════════════════════════════════

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

const POSITION_MANAGER_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
];

const POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
];

const STABILITY_POOL_ABI = [
  'function getCompoundedBoldDeposit(address) view returns (uint256)',
  'function getDepositorYieldGain(address) view returns (uint256)',
  'function getDepositorCollGain(address) view returns (uint256)',
];

const FTSO_ABI = [
  'function getCurrentPriceWithDecimals(string symbol) view returns (uint256 price, uint256 timestamp, uint256 decimals)',
];

const UPSHIFT_ABI = [
  'function convertToAssets(uint256 shares) view returns (uint256)',
];

const APS_STAKING_ABI = [
  'function stakedBalances(address) view returns (uint256)',
];

const RFLR_ABI = [
  'function getBalancesOf(address) view returns (uint256 wNatBalance, uint256 rNatBalance, uint256 lockedBalance)',
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  let targetAddress = AGENT_WALLET;
  let outputJson = false;
  let skipPrices = false;

  // Parse args
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') outputJson = true;
    else if (arg === '--no-prices') skipPrices = true;
    else if (arg === '--address' && args[i + 1]) targetAddress = args[++i];
    else if (arg === 'dao') targetAddress = DAO_TREASURY;
    else if (arg.startsWith('0x')) targetAddress = arg;
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  console.log(`\n📊 PORTFOLIO: ${targetAddress.slice(0, 6)}...${targetAddress.slice(-4)}`);
  console.log('═'.repeat(50));

  // Get prices first
  const prices = skipPrices ? {} : await getPrices(provider);
  
  // Gather all data in parallel
  const [tokens, lpPositions, stabilityPools, yieldVaults, staking, v2LPPositions] = await Promise.all([
    getTokenBalances(provider, targetAddress),
    getLPPositions(provider, targetAddress),
    getStabilityPoolPositions(provider, targetAddress),
    getYieldVaultPositions(provider, targetAddress),
    getStakingPositions(provider, targetAddress),
    getV2LPPositions(provider, targetAddress, prices),
  ]);

  // Calculate totals
  let totalUSD = 0;

  // ─────────────────────────────────────────────────────────────────────────
  // TOKEN BALANCES
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n💰 TOKENS');
  
  // Native FLR
  const flrBalance = await provider.getBalance(targetAddress);
  const flrFormatted = parseFloat(ethers.formatEther(flrBalance));
  const flrUSD = flrFormatted * (prices.FLR || 0);
  totalUSD += flrUSD;
  
  if (flrFormatted > 0.01) {
    console.log(`├─ FLR: ${formatNumber(flrFormatted)} ${prices.FLR ? `($${formatNumber(flrUSD, 2)})` : ''}`);
  }
  
  for (const [symbol, data] of Object.entries(tokens)) {
    if (data.balance > 0.01) {
      const usd = data.balance * (prices[symbol] || prices[data.priceKey] || 0);
      totalUSD += usd;
      console.log(`├─ ${symbol}: ${formatNumber(data.balance)} ${usd > 0.01 ? `($${formatNumber(usd, 2)})` : ''}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LP POSITIONS
  // ─────────────────────────────────────────────────────────────────────────
  if (lpPositions.length > 0) {
    console.log('\n🌊 LP POSITIONS');
    let totalLPValue = 0;
    
    for (const pos of lpPositions) {
      const statusIcon = pos.inRange ? '✅' : (pos.nearEdge ? '⚠️' : '❌');
      const statusText = pos.inRange ? 'IN RANGE' : (pos.nearEdge ? 'NEAR EDGE' : 'OUT OF RANGE');
      
      // Calculate position value
      const price0 = prices[pos.token0Symbol] || prices[getBaseToken(pos.token0Symbol)] || 0;
      const price1 = prices[pos.token1Symbol] || prices[getBaseToken(pos.token1Symbol)] || 0;
      const positionValue = (pos.amount0 || 0) * price0 + (pos.amount1 || 0) * price1;
      const feeValue = pos.fees0 * price0 + pos.fees1 * price1;
      const totalPosValue = positionValue + feeValue;
      
      totalLPValue += totalPosValue;
      totalUSD += totalPosValue;
      
      console.log(`├─ #${pos.tokenId} ${pos.token0Symbol}/${pos.token1Symbol} (${pos.dex})`);
      console.log(`│  ├─ Value: $${formatNumber(positionValue, 2)} (${formatNumber(pos.amount0 || 0, 4)} ${pos.token0Symbol} + ${formatNumber(pos.amount1 || 0, 4)} ${pos.token1Symbol})`);
      console.log(`│  ├─ Fees: $${formatNumber(feeValue, 2)} (${formatNumber(pos.fees0, 4)} ${pos.token0Symbol} + ${formatNumber(pos.fees1, 4)} ${pos.token1Symbol})`);
      console.log(`│  └─ Status: ${statusIcon} ${statusText}`);
    }
    
    console.log(`└─ TOTAL V3 LP VALUE: $${formatNumber(totalLPValue, 2)}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // V2 LP POSITIONS
  // ─────────────────────────────────────────────────────────────────────────
  if (v2LPPositions.length > 0) {
    console.log('\n🔷 V2 LP POSITIONS');
    let totalV2LPValue = 0;
    
    for (const pos of v2LPPositions) {
      totalV2LPValue += pos.valueUSD;
      totalUSD += pos.valueUSD;
      
      console.log(`├─ ${pos.name}`);
      console.log(`│  ├─ LP Tokens: ${formatNumber(pos.lpTokens, 4)}`);
      console.log(`│  ├─ Holdings: ${formatNumber(pos.amount0, 2)} ${pos.token0} + ${formatNumber(pos.amount1, 2)} ${pos.token1}`);
      console.log(`│  └─ Value: $${formatNumber(pos.valueUSD, 2)}`);
    }
    
    console.log(`└─ TOTAL V2 LP VALUE: $${formatNumber(totalV2LPValue, 2)}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STABILITY POOLS
  // ─────────────────────────────────────────────────────────────────────────
  const hasStabilityDeposits = Object.values(stabilityPools).some(p => p.deposited > 0.01);
  if (hasStabilityDeposits) {
    console.log('\n🏦 STABILITY POOLS');
    for (const [name, pool] of Object.entries(stabilityPools)) {
      if (pool.deposited > 0.01) {
        const depositUSD = pool.deposited * (prices.CDP || 1); // CDP ~= $1
        const yieldUSD = pool.yield * (prices.CDP || 1);
        const collUSD = pool.collateral * (prices[pool.collateralSymbol] || 0);
        totalUSD += depositUSD + yieldUSD + collUSD;
        
        console.log(`├─ ${name} Pool`);
        console.log(`│  ├─ Deposited: ${formatNumber(pool.deposited)} CDP ($${formatNumber(depositUSD, 2)})`);
        console.log(`│  ├─ Yield: ${formatNumber(pool.yield)} CDP ($${formatNumber(yieldUSD, 2)})`);
        console.log(`│  └─ Collateral: ${formatNumber(pool.collateral)} ${pool.collateralSymbol} ($${formatNumber(collUSD, 2)})`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // YIELD VAULTS
  // ─────────────────────────────────────────────────────────────────────────
  if (yieldVaults.upshift && yieldVaults.upshift.shares > 0.01) {
    console.log('\n📈 YIELD VAULTS');
    const vault = yieldVaults.upshift;
    const underlyingUSD = vault.underlying * (prices.XRP || 0);
    totalUSD += underlyingUSD;
    
    console.log(`└─ Upshift FXRP`);
    console.log(`   ├─ earnXRP: ${formatNumber(vault.shares)}`);
    console.log(`   └─ Value: ${formatNumber(vault.underlying)} FXRP ($${formatNumber(underlyingUSD, 2)})`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SPECTRA POSITIONS
  // ─────────────────────────────────────────────────────────────────────────
  if (yieldVaults.spectra && (yieldVaults.spectra.pt_stXRP > 0.01 || yieldVaults.spectra.pt_sFLR > 0.01)) {
    console.log('\n⚡ SPECTRA POSITIONS');
    const spectra = yieldVaults.spectra;
    if (spectra.pt_stXRP > 0.01) {
      const ptUSD = spectra.pt_stXRP * (prices.XRP || 0) * 0.95; // PT trades at discount
      totalUSD += ptUSD;
      console.log(`├─ PT-stXRP: ${formatNumber(spectra.pt_stXRP)} (~$${formatNumber(ptUSD, 2)})`);
    }
    if (spectra.yt_stXRP > 0.01) {
      console.log(`├─ YT-stXRP: ${formatNumber(spectra.yt_stXRP)}`);
    }
    if (spectra.pt_sFLR > 0.01) {
      const ptUSD = spectra.pt_sFLR * (prices.FLR || 0) * 0.95;
      totalUSD += ptUSD;
      console.log(`├─ PT-sFLR: ${formatNumber(spectra.pt_sFLR)} (~$${formatNumber(ptUSD, 2)})`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STAKING & VESTING
  // ─────────────────────────────────────────────────────────────────────────
  const hasStaking = staking.aps > 0.01 || staking.rflrTotal > 0.01;
  if (hasStaking) {
    console.log('\n🔒 STAKING & VESTING');
    if (staking.aps > 0.01) {
      console.log(`├─ APS Staked: ${formatNumber(staking.aps)}`);
    }
    if (staking.rflrTotal > 0.01) {
      console.log(`├─ rFLR Total: ${formatNumber(staking.rflrTotal)}`);
      const vestedUSD = staking.rflrVested * (prices.FLR || 0);
      totalUSD += vestedUSD;
      console.log(`│  ├─ Vested: ${formatNumber(staking.rflrVested)} ($${formatNumber(vestedUSD, 2)}) ✅ claimable`);
      console.log(`│  └─ Locked: ${formatNumber(staking.rflrLocked)} (unvested)`);
      
      // Show claimable WFLR if different from vested (indicates pending rewards)
      if (staking.rflrClaimableWFLR > 0.01) {
        const claimableUSD = staking.rflrClaimableWFLR * (prices.FLR || 0);
        console.log(`├─ WFLR Claimable: ${formatNumber(staking.rflrClaimableWFLR)} ($${formatNumber(claimableUSD, 2)})`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TOTAL
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(50));
  console.log(`💎 TOTAL VALUE: $${formatNumber(totalUSD, 2)}`);
  console.log('');

  if (outputJson) {
    console.log(JSON.stringify({ tokens, lpPositions, stabilityPools, yieldVaults, staking, totalUSD }, null, 2));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA FETCHERS
// ═══════════════════════════════════════════════════════════════════════════

async function getPrices(provider) {
  const FLARE_CONTRACT_REGISTRY = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';
  const prices = {};
  
  function getFeedId(feedName, category = '01') {
    const hexFeedName = Buffer.from(feedName).toString('hex');
    const paddedHex = (category + hexFeedName).padEnd(42, '0');
    return '0x' + paddedHex;
  }
  
  try {
    // Get FtsoV2 address from registry
    const registry = new ethers.Contract(FLARE_CONTRACT_REGISTRY, [
      'function getContractAddressByName(string _name) view returns (address)',
    ], provider);
    const ftsoV2Address = await registry.getContractAddressByName('FtsoV2');
    
    // FtsoV2 contract
    const ftsoV2 = new ethers.Contract(ftsoV2Address, [
      'function getFeedById(bytes21 _feedId) view returns (uint256 value, int8 decimals, uint64 timestamp)',
    ], provider);
    
    // Fetch FLR and XRP prices
    const symbols = ['FLR', 'XRP'];
    await Promise.all(symbols.map(async (symbol) => {
      try {
        const feedId = getFeedId(`${symbol}/USD`);
        const [value, decimals] = await ftsoV2.getFeedById(feedId);
        prices[symbol] = parseFloat(value.toString()) / Math.pow(10, Math.abs(Number(decimals)));
      } catch (e) {
        // Symbol not available
      }
    }));
  } catch (e) {
    console.error('Price fetch error:', e.message);
  }

  // Derived prices
  prices.WFLR = prices.FLR || 0;
  prices.sFLR = (prices.FLR || 0) * 1.05; // sFLR trades at ~5% premium
  prices.FXRP = prices.XRP || 0;
  prices.stXRP = (prices.XRP || 0) * 1.02; // stXRP slight premium
  prices.USDT = 1;
  prices.USDC = 1;
  prices.USDT0 = 1;
  prices.USDCe = 1;
  prices.CDP = 1; // Stablecoin

  // BANK price from V2 LP reserves (Enosys BANK/WFLR)
  try {
    const bankWflrPair = new ethers.Contract('0x5f29c8d049e47dd180c2b83e3560e8e271110335', [
      'function getReserves() view returns (uint112, uint112, uint32)',
    ], provider);
    const reserves = await bankWflrPair.getReserves();
    // BANK is token0, WFLR is token1 (both 18 decimals)
    const reserveBANK = parseFloat(ethers.formatEther(reserves[0]));
    const reserveWFLR = parseFloat(ethers.formatEther(reserves[1]));
    if (reserveBANK > 0) {
      prices.BANK = (reserveWFLR / reserveBANK) * (prices.FLR || 0);
    }
  } catch (e) {}

  return prices;
}

async function getTokenBalances(provider, address) {
  const balances = {};
  
  await Promise.all(Object.entries(TOKENS).map(async ([symbol, token]) => {
    try {
      const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
      const balance = await contract.balanceOf(address);
      const formatted = parseFloat(ethers.formatUnits(balance, token.decimals));
      
      // Map price keys
      let priceKey = symbol;
      if (symbol === 'USDT0') priceKey = 'USDT';
      if (symbol === 'USDCe') priceKey = 'USDC';
      if (symbol === 'FXRP' || symbol === 'stXRP' || symbol === 'earnXRP') priceKey = 'XRP';
      
      balances[symbol] = { balance: formatted, priceKey };
    } catch (e) {
      balances[symbol] = { balance: 0, priceKey: symbol };
    }
  }));
  
  return balances;
}

async function getLPPositions(provider, address) {
  const positions = [];
  
  // Check both DEXs
  const dexes = [
    { name: 'Enosys', manager: CONTRACTS.enosysPositionManager, factory: CONTRACTS.enosysFactory },
    { name: 'SparkDex', manager: CONTRACTS.sparkdexPositionManager, factory: CONTRACTS.sparkdexFactory },
  ];
  
  for (const dex of dexes) {
    try {
      const manager = new ethers.Contract(dex.manager, POSITION_MANAGER_ABI, provider);
      const balance = await manager.balanceOf(address);
      
      for (let i = 0; i < Number(balance); i++) {
        try {
          const tokenId = await manager.tokenOfOwnerByIndex(address, i);
          const pos = await manager.positions(tokenId);
          
          if (pos.liquidity > 0n) {
            // Get pool info
            const token0Symbol = getTokenSymbol(pos.token0);
            const token1Symbol = getTokenSymbol(pos.token1);
            
            // Get current tick from pool
            const poolAddress = await getPoolAddress(provider, dex.factory, pos.token0, pos.token1, pos.fee);
            let currentTick = 0;
            let inRange = true;
            let nearEdge = false;
            
            if (poolAddress) {
              try {
                const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
                const slot0 = await pool.slot0();
                currentTick = Number(slot0.tick);
                
                const tickLower = Number(pos.tickLower);
                const tickUpper = Number(pos.tickUpper);
                inRange = currentTick >= tickLower && currentTick <= tickUpper;
                
                // Near edge if within 10% of range bounds
                const range = tickUpper - tickLower;
                const edgeBuffer = range * 0.1;
                nearEdge = inRange && (
                  currentTick - tickLower < edgeBuffer ||
                  tickUpper - currentTick < edgeBuffer
                );
              } catch (e) {}
            }
            
            // Get decimals for fee tokens
            const decimals0 = getTokenDecimals(pos.token0);
            const decimals1 = getTokenDecimals(pos.token1);
            
            // Calculate token amounts from liquidity using V3 math
            const { amount0, amount1 } = calculateAmountsFromLiquidity(
              pos.liquidity,
              currentTick,
              Number(pos.tickLower),
              Number(pos.tickUpper)
            );
            
            positions.push({
              tokenId: tokenId.toString(),
              dex: dex.name,
              token0: pos.token0,
              token1: pos.token1,
              token0Symbol,
              token1Symbol,
              fee: Number(pos.fee),
              tickLower: Number(pos.tickLower),
              tickUpper: Number(pos.tickUpper),
              currentTick,
              liquidity: pos.liquidity.toString(),
              amount0: parseFloat(ethers.formatUnits(amount0, decimals0)),
              amount1: parseFloat(ethers.formatUnits(amount1, decimals1)),
              fees0: parseFloat(ethers.formatUnits(pos.tokensOwed0, decimals0)),
              fees1: parseFloat(ethers.formatUnits(pos.tokensOwed1, decimals1)),
              inRange,
              nearEdge,
            });
          }
        } catch (e) {}
      }
    } catch (e) {}
  }
  
  return positions;
}

async function getStabilityPoolPositions(provider, address) {
  const pools = {
    FXRP: { deposited: 0, yield: 0, collateral: 0, collateralSymbol: 'FXRP' },
    WFLR: { deposited: 0, yield: 0, collateral: 0, collateralSymbol: 'WFLR' },
  };
  
  // FXRP pool
  try {
    const fxrpPool = new ethers.Contract(CONTRACTS.stabilityPoolFXRP, STABILITY_POOL_ABI, provider);
    const [deposited, yieldGain, collGain] = await Promise.all([
      fxrpPool.getCompoundedBoldDeposit(address),
      fxrpPool.getDepositorYieldGain(address),
      fxrpPool.getDepositorCollGain(address),
    ]);
    pools.FXRP = {
      deposited: parseFloat(ethers.formatEther(deposited)),
      yield: parseFloat(ethers.formatEther(yieldGain)),
      collateral: parseFloat(ethers.formatUnits(collGain, 6)), // FXRP is 6 decimals
      collateralSymbol: 'FXRP',
    };
  } catch (e) {}
  
  // WFLR pool
  try {
    const wflrPool = new ethers.Contract(CONTRACTS.stabilityPoolWFLR, STABILITY_POOL_ABI, provider);
    const [deposited, yieldGain, collGain] = await Promise.all([
      wflrPool.getCompoundedBoldDeposit(address),
      wflrPool.getDepositorYieldGain(address),
      wflrPool.getDepositorCollGain(address),
    ]);
    pools.WFLR = {
      deposited: parseFloat(ethers.formatEther(deposited)),
      yield: parseFloat(ethers.formatEther(yieldGain)),
      collateral: parseFloat(ethers.formatEther(collGain)),
      collateralSymbol: 'WFLR',
    };
  } catch (e) {}
  
  return pools;
}

async function getYieldVaultPositions(provider, address) {
  const vaults = {
    upshift: { shares: 0, underlying: 0 },
    spectra: { pt_stXRP: 0, yt_stXRP: 0, pt_sFLR: 0 },
  };
  
  // Upshift FXRP vault
  try {
    const earnXRP = new ethers.Contract(TOKENS.earnXRP.address, ERC20_ABI, provider);
    const shares = await earnXRP.balanceOf(address);
    const sharesFormatted = parseFloat(ethers.formatUnits(shares, 6));
    
    if (sharesFormatted > 0) {
      const vault = new ethers.Contract(CONTRACTS.upshiftFXRP, UPSHIFT_ABI, provider);
      try {
        const underlying = await vault.convertToAssets(shares);
        vaults.upshift = {
          shares: sharesFormatted,
          underlying: parseFloat(ethers.formatUnits(underlying, 6)),
        };
      } catch (e) {
        // convertToAssets might not exist, use 1:1 approximation
        vaults.upshift = { shares: sharesFormatted, underlying: sharesFormatted };
      }
    }
  } catch (e) {}
  
  // Spectra PT/YT tokens
  try {
    const pt_stXRP = new ethers.Contract(CONTRACTS.spectraPT_stXRP, ERC20_ABI, provider);
    const balance = await pt_stXRP.balanceOf(address);
    vaults.spectra.pt_stXRP = parseFloat(ethers.formatUnits(balance, 6));
  } catch (e) {}
  
  try {
    const yt_stXRP = new ethers.Contract(CONTRACTS.spectraYT_stXRP, ERC20_ABI, provider);
    const balance = await yt_stXRP.balanceOf(address);
    vaults.spectra.yt_stXRP = parseFloat(ethers.formatUnits(balance, 6));
  } catch (e) {}
  
  try {
    const pt_sFLR = new ethers.Contract(CONTRACTS.spectraPT_sFLR, ERC20_ABI, provider);
    const balance = await pt_sFLR.balanceOf(address);
    vaults.spectra.pt_sFLR = parseFloat(ethers.formatEther(balance));
  } catch (e) {}
  
  return vaults;
}

async function getV2LPPositions(provider, address, prices) {
  const v2Positions = [];
  
  const pairAbi = [
    'function balanceOf(address) view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function getReserves() view returns (uint112, uint112, uint32)',
  ];
  
  for (const lp of V2_LP_TOKENS) {
    try {
      const pair = new ethers.Contract(lp.address, pairAbi, provider);
      const [balance, totalSupply, reserves] = await Promise.all([
        pair.balanceOf(address),
        pair.totalSupply(),
        pair.getReserves(),
      ]);
      
      if (balance > 0n) {
        const share = Number(balance) / Number(totalSupply);
        
        // Get token decimals (BANK=18, WFLR=18)
        const decimals0 = 18;
        const decimals1 = 18;
        
        const reserve0 = parseFloat(ethers.formatUnits(reserves[0], decimals0));
        const reserve1 = parseFloat(ethers.formatUnits(reserves[1], decimals1));
        
        const amount0 = reserve0 * share;
        const amount1 = reserve1 * share;
        
        // Price: BANK has no FTSO feed - estimate from LP ratio
        // In a 50/50 AMM, value of token0 ≈ value of token1
        const price1 = prices[lp.token1] || prices.FLR || 0;
        const wflrValue = amount1 * price1;
        
        // For AMM pools, total value ≈ 2x one side (since 50/50 balance)
        const valueUSD = wflrValue * 2;
        
        v2Positions.push({
          name: lp.name,
          lpTokens: parseFloat(ethers.formatEther(balance)),
          token0: lp.token0,
          token1: lp.token1,
          amount0,
          amount1,
          valueUSD,
        });
      }
    } catch (e) {}
  }
  
  return v2Positions;
}

async function getStakingPositions(provider, address) {
  const staking = { 
    aps: 0, 
    rflrTotal: 0,
    rflrVested: 0, 
    rflrLocked: 0,
    rflrClaimableWFLR: 0,  // wNatBalance from rFLR vesting
  };
  
  // APS staking
  try {
    const apsStaking = new ethers.Contract(CONTRACTS.apsStaking, APS_STAKING_ABI, provider);
    const staked = await apsStaking.stakedBalances(address);
    staking.aps = parseFloat(ethers.formatEther(staked));
  } catch (e) {}
  
  // rFLR vesting - full breakdown
  try {
    const rflr = new ethers.Contract(TOKENS.rFLR.address, [
      'function getBalancesOf(address) view returns (uint256 wNatBalance, uint256 rNatBalance, uint256 lockedBalance)',
    ], provider);
    const [wNat, rNat, locked] = await rflr.getBalancesOf(address);
    staking.rflrTotal = parseFloat(ethers.formatEther(rNat));
    staking.rflrVested = parseFloat(ethers.formatEther(rNat - locked));
    staking.rflrLocked = parseFloat(ethers.formatEther(locked));
    staking.rflrClaimableWFLR = parseFloat(ethers.formatEther(wNat));
  } catch (e) {
    // Address may not have rFLR account - that's OK
  }
  
  return staking;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getTokenSymbol(address) {
  const addr = address.toLowerCase();
  for (const [symbol, token] of Object.entries(TOKENS)) {
    if (token.address.toLowerCase() === addr) return symbol;
  }
  return addr.slice(0, 6);
}

function getTokenDecimals(address) {
  const addr = address.toLowerCase();
  for (const [, token] of Object.entries(TOKENS)) {
    if (token.address.toLowerCase() === addr) return token.decimals;
  }
  return 18;
}

async function getPoolAddress(provider, factory, token0, token1, fee) {
  try {
    const factoryContract = new ethers.Contract(factory, [
      'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)',
    ], provider);
    const pool = await factoryContract.getPool(token0, token1, fee);
    if (pool && pool !== ethers.ZeroAddress) return pool;
  } catch (e) {}
  return null;
}

function formatNumber(num, decimals = 2) {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
  return num.toFixed(decimals).replace(/\.?0+$/, '') || '0';
}

// V3 math: calculate token amounts from liquidity
function calculateAmountsFromLiquidity(liquidity, currentTick, tickLower, tickUpper) {
  const Q96 = 2n ** 96n;
  const liq = BigInt(liquidity.toString());
  
  const sqrtPriceCurrent = tickToSqrtPriceX96(currentTick);
  const sqrtPriceLower = tickToSqrtPriceX96(tickLower);
  const sqrtPriceUpper = tickToSqrtPriceX96(tickUpper);
  
  let amount0 = 0n;
  let amount1 = 0n;
  
  if (currentTick < tickLower) {
    // All in token0
    amount0 = liq * Q96 * (sqrtPriceUpper - sqrtPriceLower) / (sqrtPriceLower * sqrtPriceUpper);
  } else if (currentTick >= tickUpper) {
    // All in token1
    amount1 = liq * (sqrtPriceUpper - sqrtPriceLower) / Q96;
  } else {
    // Mixed
    amount0 = liq * Q96 * (sqrtPriceUpper - sqrtPriceCurrent) / (sqrtPriceCurrent * sqrtPriceUpper);
    amount1 = liq * (sqrtPriceCurrent - sqrtPriceLower) / Q96;
  }
  
  return { amount0, amount1 };
}

function tickToSqrtPriceX96(tick) {
  const absTick = Math.abs(tick);
  let ratio = 0x100000000000000000000000000000000n;
  
  if (absTick & 0x1) ratio = ratio * 0xfffcb933bd6fad37aa2d162d1a594001n >> 128n;
  if (absTick & 0x2) ratio = ratio * 0xfff97272373d413259a46990580e213an >> 128n;
  if (absTick & 0x4) ratio = ratio * 0xfff2e50f5f656932ef12357cf3c7fdccn >> 128n;
  if (absTick & 0x8) ratio = ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0n >> 128n;
  if (absTick & 0x10) ratio = ratio * 0xffcb9843d60f6159c9db58835c926644n >> 128n;
  if (absTick & 0x20) ratio = ratio * 0xff973b41fa98c081472e6896dfb254c0n >> 128n;
  if (absTick & 0x40) ratio = ratio * 0xff2ea16466c96a3843ec78b326b52861n >> 128n;
  if (absTick & 0x80) ratio = ratio * 0xfe5dee046a99a2a811c461f1969c3053n >> 128n;
  if (absTick & 0x100) ratio = ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4n >> 128n;
  if (absTick & 0x200) ratio = ratio * 0xf987a7253ac413176f2b074cf7815e54n >> 128n;
  if (absTick & 0x400) ratio = ratio * 0xf3392b0822b70005940c7a398e4b70f3n >> 128n;
  if (absTick & 0x800) ratio = ratio * 0xe7159475a2c29b7443b29c7fa6e889d9n >> 128n;
  if (absTick & 0x1000) ratio = ratio * 0xd097f3bdfd2022b8845ad8f792aa5825n >> 128n;
  if (absTick & 0x2000) ratio = ratio * 0xa9f746462d870fdf8a65dc1f90e061e5n >> 128n;
  if (absTick & 0x4000) ratio = ratio * 0x70d869a156d2a1b890bb3df62baf32f7n >> 128n;
  if (absTick & 0x8000) ratio = ratio * 0x31be135f97d08fd981231505542fcfa6n >> 128n;
  if (absTick & 0x10000) ratio = ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9n >> 128n;
  if (absTick & 0x20000) ratio = ratio * 0x5d6af8dedb81196699c329225ee604n >> 128n;
  if (absTick & 0x40000) ratio = ratio * 0x2216e584f5fa1ea926041bedfe98n >> 128n;
  if (absTick & 0x80000) ratio = ratio * 0x48a170391f7dc42444e8fa2n >> 128n;
  
  if (tick > 0) ratio = (2n ** 256n - 1n) / ratio;
  
  return ratio >> 32n;
}

// Run
main().catch(console.error);
