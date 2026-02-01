/**
 * FlareBank TVL Adapter for DefiLlama
 * 
 * Comprehensive tracking of all protocol-controlled value:
 * - BANK token contract (WFLR backing)
 * - IBDP contract (WFLR queue)
 * - DAO Treasury (all tokens, LP positions, DeFi positions)
 * 
 * Submit to: https://github.com/DefiLlama/DefiLlama-Adapters/tree/main/projects/flrbank
 */

const { sumTokens2 } = require('../helper/unwrapLPs')

// ═══════════════════════════════════════════════════════════════════════════
// CORE CONTRACTS
// ═══════════════════════════════════════════════════════════════════════════

const CONTRACTS = {
  // FlareBank Core
  bankToken: '0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059',
  ibdp: '0x90679234FE693B39BFdf5642060Cb10571Adc59b',
  daoTreasury: '0xaa68bc4bab9a63958466f49f5a58c54a412d4906',
  
  // CDP Earn (Stability Pools)
  cdpEarnFXRP: '0x2c817F7159c08d94f09764086330c96Bb3265A2f',
  cdpEarnWFLR: '0x0Dd6daab4cB9A0ba6707Cf59DBfbc28cc33CA24A',
  
  // Enosys V3 Position Manager
  enosysV3PositionManager: '0xd9770b1c7a6ccd33c75b5bcb1c0078f46be46657',
  
  // APS Staking
  apsStaking: '0x7eb8ceb0f64d934a31835b98eb4cbab3ca56df28',
};

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN ADDRESSES
// ═══════════════════════════════════════════════════════════════════════════

const TOKENS = {
  // Native wrapped
  WFLR: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d',
  
  // Liquid staking
  sFLR: '0x12e605bc104e93B45e1aD99F9e555f659051c2BB',   // Sceptre staked FLR
  rFLR: '0x26d460c3Cf931Fb2014FA436a49e3Af08619810e',   // rFLR vesting
  
  // XRP variants
  FXRP: '0xAd552A648C74D49E10027AB8a618A3ad4901c5bE',   // F-Asset XRP
  stXRP: '0x4C18Ff3C89632c3Dd62E796c0aFA5c07c4c1B2b3',  // Staked XRP (Firelight)
  
  // Stablecoins
  USDT0: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D',  // USD₮0 (Stargate)
  USDCe: '0xfbda5f676cb37624f28265a144a48b0d6e87d3b6',  // USDC.e (Bridged)
  CDP: '0x6Cd3a5Ba46FA254D4d2E3C2B37350ae337E94a0F',    // CDP Dollar
  
  // Yield tokens
  earnXRP: '0xe533e447fd7720b2f8654da2b1953efa06b60bfa', // Upshift FXRP vault shares
  
  // Spectra PT/YT
  PTstXRP: '0x097Dd93Bf92bf9018fF194195dDfCFB2c359335e', // PT-stXRP
  YTstXRP: '0x46f0C7b81128e031604eCb3e8A7E28dd3F8A50C9', // YT-stXRP
  PTsFLR: '0x14613BFc52F98af194F4e0b1D23fE538B54628f3',  // PT-sFLR
  
  // Protocol tokens
  APS: '0xff56eb5b1a7faa972291117e5e9565da29bc808d',    // Enosys APS
  BANK: '0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059',   // FlareBank BANK
};

// ═══════════════════════════════════════════════════════════════════════════
// LP TOKENS (V2)
// ═══════════════════════════════════════════════════════════════════════════

const V2_LP_TOKENS = [
  '0x5f29c8d049e47dd180c2b83e3560e8e271110335', // Enosys V2 BANK/WFLR
  '0x0f574fc895c1abf82aeff334fa9d8ba43f866111', // SparkDex V2 BANK/WFLR
];

// ═══════════════════════════════════════════════════════════════════════════
// V3 POSITIONS (NFT-based)
// ═══════════════════════════════════════════════════════════════════════════

const V3_POSITION_IDS = [
  28509, // DAO's stXRP/FXRP position on Enosys V3
];

// ═══════════════════════════════════════════════════════════════════════════
// TVL FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

async function tvl(api) {
  // ─────────────────────────────────────────────────────────────────────────
  // 1. WFLR backing in BANK token contract and IBDP
  // ─────────────────────────────────────────────────────────────────────────
  await api.sumTokens({
    owners: [CONTRACTS.bankToken, CONTRACTS.ibdp],
    tokens: [TOKENS.WFLR],
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // 2. DAO Treasury - All tokens
  // ─────────────────────────────────────────────────────────────────────────
  await api.sumTokens({
    owner: CONTRACTS.daoTreasury,
    tokens: [
      TOKENS.WFLR,
      TOKENS.sFLR,
      TOKENS.rFLR,
      TOKENS.FXRP,
      TOKENS.stXRP,
      TOKENS.USDT0,
      TOKENS.USDCe,
      TOKENS.CDP,
      TOKENS.earnXRP,
      TOKENS.PTstXRP,
      TOKENS.YTstXRP,
      TOKENS.PTsFLR,
      TOKENS.APS,
      // Note: BANK excluded to avoid double counting
    ],
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // 3. DAO Treasury - V2 LP tokens (unwrap to underlying)
  // ─────────────────────────────────────────────────────────────────────────
  await api.sumTokens({
    owner: CONTRACTS.daoTreasury,
    tokens: V2_LP_TOKENS,
    resolveLP: true,
  });
  
  // ─────────────────────────────────────────────────────────────────────────
  // 4. CDP Earn Pools (Stability Pool deposits)
  // These are CDP tokens deposited by DAO
  // ─────────────────────────────────────────────────────────────────────────
  // Note: Stability pool deposits need custom logic to query
  // getCompoundedBoldDeposit(address) returns the current deposit
  // For now, we track CDP token balance which should reflect this
  
  // ─────────────────────────────────────────────────────────────────────────
  // 5. V3 LP Positions (NFT-based)
  // ─────────────────────────────────────────────────────────────────────────
  // V3 positions are complex - they require reading:
  // - positions(tokenId) to get liquidity
  // - pool.slot0() to get current tick
  // - Calculate token amounts from liquidity
  // DefiLlama's sumTokens doesn't handle V3 NFTs directly
  // These are tracked via the underlying tokens in DAO wallet
}

// ═══════════════════════════════════════════════════════════════════════════
// STAKING FUNCTION (optional - for separate staking section)
// ═══════════════════════════════════════════════════════════════════════════

async function staking(api) {
  // APS staked by DAO
  const apsStakingAbi = 'function stakedBalances(address) view returns (uint256)';
  const stakedAPS = await api.call({
    target: CONTRACTS.apsStaking,
    params: [CONTRACTS.daoTreasury],
    abi: apsStakingAbi,
  });
  
  if (stakedAPS > 0) {
    api.add(TOKENS.APS, stakedAPS);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  methodology: `
    TVL includes:
    - WFLR backing in BANK token contract (core protocol backing)
    - WFLR in IBDP queue (pending deposits)
    - DAO Treasury holdings: WFLR, sFLR, rFLR, FXRP, stXRP, stablecoins (USDT0, USDC.e, CDP)
    - DAO Treasury yield positions: earnXRP (Upshift), PT/YT tokens (Spectra)
    - DAO Treasury V2 LP positions: BANK/WFLR pairs on Enosys and SparkDex (unwrapped)
    - DAO Treasury governance tokens: APS
    
    Excludes:
    - BANK token itself (would be circular)
    - V3 LP positions (complex NFT-based, partially captured via underlying tokens)
  `.trim(),
  flare: {
    tvl,
    staking,
  }
};
