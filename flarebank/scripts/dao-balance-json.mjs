#!/usr/bin/env node
/**
 * FlareBank DAO Treasury - JSON Output
 * For programmatic access and monitoring
 */

import { ethers } from 'ethers';

const RPC = 'https://flare-api.flare.network/ext/C/rpc';
const DAO = '0xaa68bc4bab9a63958466f49f5a58c54a412d4906';

const TOKENS = {
  WFLR: { address: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d', decimals: 18 },
  BANK: { address: '0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059', decimals: 18 },
  FXRP: { address: '0xad552a648c74d49e10027ab8a618a3ad4901c5be', decimals: 6 },
  sFLR: { address: '0x12e605bc104e93B45e1aD99F9e555f659051c2BB', decimals: 18 },
  APS:  { address: '0xff56eb5b1a7faa972291117e5e9565da29bc808d', decimals: 18 },
  stXRP: { address: '0x4c18ff3c89632c3dd62e796c0afa5c07c4c1b2b3', decimals: 6 },
};

const V2_POOLS = {
  'enosys_bank_wflr': '0x5f29c8d049e47dd180c2b83e3560e8e271110335',
  'sparkdex_bank_wflr': '0x0f574fc895c1abf82aeff334fa9d8ba43f866111',
};

const V3_POSITION_MANAGER = '0xd9770b1c7a6ccd33c75b5bcb1c0078f46be46657';
const V3_POSITION_ID = 28509;
const V3_POOL = '0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770';

const CDP_POOLS = {
  FXRP: { address: '0x2c817F7159c08d94f09764086330c96Bb3265A2f', collDecimals: 6 },
  WFLR: { address: '0x0Dd6daab4cB9A0ba6707Cf59DBfbc28cc33CA24A', collDecimals: 18 },
};

const APS_STAKING = '0x7eb8ceb0f64d934a31835b98eb4cbab3ca56df28';

const SEL = {
  balanceOf: '0x70a08231',
  totalSupply: '0x18160ddd',
  getReserves: '0x0902f1ac',
  positions: '0x99fbab88',
  slot0: '0x3850c7bd',
  getCompoundedBoldDeposit: '0x065f566d',
  getDepositorYieldGain: '0xdaed0a9b',
  getDepositorCollGain: '0x47ea8354',
};

async function rpcCall(to, data) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [{ to, data }, 'latest'], id: 1 }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function getNativeBalance(addr) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [addr, 'latest'], id: 1 }),
  });
  return (await res.json()).result;
}

function encAddr(addr) { return addr.toLowerCase().replace('0x', '').padStart(64, '0'); }
function encUint(n) { return BigInt(n).toString(16).padStart(64, '0'); }

async function main() {
  const result = {
    timestamp: new Date().toISOString(),
    dao: DAO,
    wallet: {},
    v2LP: {},
    v3LP: {},
    cdpPools: {},
    staking: {},
  };

  // Wallet balances
  const nativeFLR = await getNativeBalance(DAO);
  result.wallet.FLR = parseFloat(ethers.formatUnits(BigInt(nativeFLR), 18));
  
  for (const [name, token] of Object.entries(TOKENS)) {
    const hex = await rpcCall(token.address, SEL.balanceOf + encAddr(DAO));
    result.wallet[name] = parseFloat(ethers.formatUnits(BigInt(hex), token.decimals));
  }

  // V2 LP positions
  for (const [name, addr] of Object.entries(V2_POOLS)) {
    const [balHex, supplyHex, reservesHex] = await Promise.all([
      rpcCall(addr, SEL.balanceOf + encAddr(DAO)),
      rpcCall(addr, SEL.totalSupply),
      rpcCall(addr, SEL.getReserves),
    ]);
    const bal = BigInt(balHex);
    const supply = BigInt(supplyHex);
    const r0 = BigInt('0x' + reservesHex.slice(2, 66));
    const r1 = BigInt('0x' + reservesHex.slice(66, 130));
    result.v2LP[name] = {
      lpTokens: parseFloat(ethers.formatUnits(bal, 18)),
      poolShare: Number(bal) / Number(supply),
      underlyingBANK: parseFloat(ethers.formatUnits(r0 * bal / supply, 18)),
      underlyingWFLR: parseFloat(ethers.formatUnits(r1 * bal / supply, 18)),
    };
  }

  // V3 position
  const posData = await rpcCall(V3_POSITION_MANAGER, SEL.positions + encUint(V3_POSITION_ID));
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const pos = abiCoder.decode(
    ['uint96', 'address', 'address', 'address', 'uint24', 'int24', 'int24', 'uint128', 'uint256', 'uint256', 'uint128', 'uint128'],
    posData
  );
  const tickLower = Number(pos[5]);
  const tickUpper = Number(pos[6]);
  const liquidity = pos[7];

  const slot0Data = await rpcCall(V3_POOL, SEL.slot0);
  const slot0 = abiCoder.decode(['uint160', 'int24', 'uint16', 'uint16', 'uint16', 'uint8', 'bool'], slot0Data);
  const sqrtPriceX96 = slot0[0];
  const currentTick = Number(slot0[1]);

  const Q96 = 2n ** 96n;
  const getSqrtRatio = (tick) => BigInt(Math.floor(Math.sqrt(Math.pow(1.0001, tick)) * Number(Q96)));
  const sqrtLower = getSqrtRatio(tickLower);
  const sqrtUpper = getSqrtRatio(tickUpper);
  const sqrtCurrent = sqrtPriceX96;

  let amount0 = 0n, amount1 = 0n;
  if (currentTick < tickLower) {
    amount0 = liquidity * (sqrtUpper - sqrtLower) / (sqrtLower * sqrtUpper / Q96);
  } else if (currentTick >= tickUpper) {
    amount1 = liquidity * (sqrtUpper - sqrtLower) / Q96;
  } else {
    amount0 = liquidity * (sqrtUpper - sqrtCurrent) / (sqrtCurrent * sqrtUpper / Q96);
    amount1 = liquidity * (sqrtCurrent - sqrtLower) / Q96;
  }

  result.v3LP = {
    positionId: V3_POSITION_ID,
    stXRP: parseFloat(ethers.formatUnits(amount0, 6)),
    FXRP: parseFloat(ethers.formatUnits(amount1, 6)),
    tickLower,
    tickUpper,
    currentTick,
    liquidity: liquidity.toString(),
  };

  // CDP pools
  for (const [name, pool] of Object.entries(CDP_POOLS)) {
    const enc = encAddr(DAO);
    const [depHex, yieldHex, collHex] = await Promise.all([
      rpcCall(pool.address, SEL.getCompoundedBoldDeposit + enc),
      rpcCall(pool.address, SEL.getDepositorYieldGain + enc),
      rpcCall(pool.address, SEL.getDepositorCollGain + enc),
    ]);
    result.cdpPools[name] = {
      cdpDeposit: parseFloat(ethers.formatUnits(BigInt(depHex), 18)),
      pendingCDP: parseFloat(ethers.formatUnits(BigInt(yieldHex), 18)),
      pendingColl: parseFloat(ethers.formatUnits(BigInt(collHex), pool.collDecimals)),
    };
  }

  // APS staking
  const apsHex = await rpcCall(APS_STAKING, SEL.balanceOf + encAddr(DAO));
  result.staking.APS = parseFloat(ethers.formatUnits(BigInt(apsHex), 18));

  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
