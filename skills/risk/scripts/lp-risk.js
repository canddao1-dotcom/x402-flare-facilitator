#!/usr/bin/env node
/**
 * LP Position Risk Analysis
 * Calculate risk metrics for V3 LP positions
 */

const { ethers } = require('/home/node/clawd/skills/fblpmanager/node_modules/ethers');

const RPC_URL = 'https://flare-api.flare.network/ext/C/rpc';
const POSITION_MANAGER = '0xd9770b1c7a6ccd33c75b5bcb1c0078f46be46657';

// Our positions
const POSITIONS = [
  { id: 28509, name: 'DAO stXRP/FXRP', pool: '0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770', owner: 'DAO' },
  { id: 34935, name: 'sFLR/WFLR', pool: '0x25b4f3930934f0a3cbb885c624ecee75a2917144', owner: 'Agent' },
  { id: 34936, name: 'CDP/USDT0', pool: '0x975f0369d31f1dd79abf057ad369ae7d5b9f6fb4', owner: 'Agent' },
  { id: 34937, name: 'WFLR/FXRP', pool: '0xb4cb11a84cfbd8f6336dc9417ac45c1f8e5b59e7', owner: 'Agent' },
  { id: 34938, name: 'WFLR/USDT0', pool: '0x3c2a7b76795e58829faaa034486d417dd0155162', owner: 'Agent' },
  { id: 34964, name: 'WFLR/FXRP (Large)', pool: '0xb4cb11a84cfbd8f6336dc9417ac45c1f8e5b59e7', owner: 'Agent' },
  { id: 34965, name: 'sFLR/WFLR (Large)', pool: '0x25b4f3930934f0a3cbb885c624ecee75a2917144', owner: 'Agent' },
];

let provider = null;

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(RPC_URL);
  }
  return provider;
}

async function getPositionData(positionId) {
  const p = getProvider();
  const abi = ['function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)'];
  const contract = new ethers.Contract(POSITION_MANAGER, abi, p);
  const pos = await contract.positions(positionId);
  return {
    tickLower: Number(pos.tickLower),
    tickUpper: Number(pos.tickUpper),
    liquidity: pos.liquidity.toString(),
    fee: Number(pos.fee)
  };
}

async function getCurrentTick(poolAddress) {
  const p = getProvider();
  const abi = ['function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'];
  const contract = new ethers.Contract(poolAddress, abi, p);
  const slot0 = await contract.slot0();
  return Number(slot0.tick);
}

function calculateRiskMetrics(currentTick, tickLower, tickUpper) {
  const range = tickUpper - tickLower;
  const positionInRange = currentTick - tickLower;
  const percentPosition = (positionInRange / range) * 100;
  
  // Check if in range
  const inRange = currentTick >= tickLower && currentTick <= tickUpper;
  
  // Distance to edges
  const distToLower = currentTick - tickLower;
  const distToUpper = tickUpper - currentTick;
  const minEdgeDist = Math.min(distToLower, distToUpper);
  const edgeProximityPct = (minEdgeDist / range) * 100;
  
  // Risk level
  let riskLevel, riskEmoji;
  if (!inRange) {
    riskLevel = 'CRITICAL';
    riskEmoji = '🔴';
  } else if (edgeProximityPct < 10) {
    riskLevel = 'HIGH';
    riskEmoji = '🟠';
  } else if (edgeProximityPct < 20) {
    riskLevel = 'MEDIUM';
    riskEmoji = '🟡';
  } else {
    riskLevel = 'LOW';
    riskEmoji = '🟢';
  }
  
  // Concentration (tighter range = higher concentration)
  const concentration = range < 500 ? 'HIGH' : range < 1000 ? 'MEDIUM' : 'LOW';
  
  // Rebalance urgency score (0-100)
  let urgencyScore = 0;
  if (!inRange) urgencyScore = 100;
  else if (edgeProximityPct < 5) urgencyScore = 90;
  else if (edgeProximityPct < 10) urgencyScore = 70;
  else if (edgeProximityPct < 15) urgencyScore = 50;
  else if (edgeProximityPct < 20) urgencyScore = 30;
  else urgencyScore = 10;
  
  return {
    inRange,
    percentPosition: percentPosition.toFixed(1),
    edgeProximityPct: edgeProximityPct.toFixed(1),
    riskLevel,
    riskEmoji,
    concentration,
    urgencyScore,
    range,
    currentTick,
    tickLower,
    tickUpper
  };
}

async function analyzeAllPositions() {
  const results = [];
  
  for (const pos of POSITIONS) {
    try {
      const [posData, currentTick] = await Promise.all([
        getPositionData(pos.id),
        getCurrentTick(pos.pool)
      ]);
      
      const metrics = calculateRiskMetrics(currentTick, posData.tickLower, posData.tickUpper);
      
      results.push({
        id: pos.id,
        name: pos.name,
        owner: pos.owner,
        ...metrics,
        fee: posData.fee,
        hasLiquidity: BigInt(posData.liquidity) > 0n
      });
    } catch (e) {
      results.push({
        id: pos.id,
        name: pos.name,
        owner: pos.owner,
        error: e.message
      });
    }
  }
  
  return results;
}

function calculatePortfolioRisk(positions) {
  const validPositions = positions.filter(p => !p.error);
  
  // Out of range ratio
  const outOfRange = validPositions.filter(p => !p.inRange).length;
  const outOfRangeRatio = (outOfRange / validPositions.length) * 100;
  
  // Average urgency
  const avgUrgency = validPositions.reduce((sum, p) => sum + p.urgencyScore, 0) / validPositions.length;
  
  // Positions by risk level
  const byRisk = {
    CRITICAL: validPositions.filter(p => p.riskLevel === 'CRITICAL').length,
    HIGH: validPositions.filter(p => p.riskLevel === 'HIGH').length,
    MEDIUM: validPositions.filter(p => p.riskLevel === 'MEDIUM').length,
    LOW: validPositions.filter(p => p.riskLevel === 'LOW').length
  };
  
  // Overall risk
  let overallRisk = 'LOW';
  if (byRisk.CRITICAL > 0) overallRisk = 'CRITICAL';
  else if (byRisk.HIGH > 1) overallRisk = 'HIGH';
  else if (byRisk.HIGH > 0 || byRisk.MEDIUM > 2) overallRisk = 'MEDIUM';
  
  return {
    totalPositions: validPositions.length,
    outOfRangeRatio: outOfRangeRatio.toFixed(1),
    avgUrgency: avgUrgency.toFixed(0),
    byRisk,
    overallRisk
  };
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  
  console.log('🔍 Analyzing LP position risk...\n');
  
  const positions = await analyzeAllPositions();
  const portfolioRisk = calculatePortfolioRisk(positions);
  
  if (jsonOutput) {
    console.log(JSON.stringify({ positions, portfolio: portfolioRisk }, null, 2));
    return;
  }
  
  // Portfolio summary
  console.log('📊 PORTFOLIO RISK SUMMARY');
  console.log('━'.repeat(50));
  console.log(`Overall Risk: ${portfolioRisk.overallRisk}`);
  console.log(`Positions: ${portfolioRisk.totalPositions} total`);
  console.log(`Out of Range: ${portfolioRisk.outOfRangeRatio}%`);
  console.log(`Avg Urgency: ${portfolioRisk.avgUrgency}/100`);
  console.log(`Risk Distribution: 🔴${portfolioRisk.byRisk.CRITICAL} 🟠${portfolioRisk.byRisk.HIGH} 🟡${portfolioRisk.byRisk.MEDIUM} 🟢${portfolioRisk.byRisk.LOW}`);
  console.log('');
  
  // Sort by urgency
  positions.sort((a, b) => (b.urgencyScore || 0) - (a.urgencyScore || 0));
  
  console.log('📈 POSITION RISK DETAILS');
  console.log('━'.repeat(50));
  
  for (const p of positions) {
    if (p.error) {
      console.log(`❓ ${p.name} (#${p.id}): Error - ${p.error}`);
      continue;
    }
    
    console.log(`${p.riskEmoji} ${p.name} (#${p.id}) [${p.owner}]`);
    console.log(`   Status: ${p.inRange ? 'IN RANGE' : 'OUT OF RANGE'} at ${p.percentPosition}%`);
    console.log(`   Edge Proximity: ${p.edgeProximityPct}% | Concentration: ${p.concentration}`);
    console.log(`   Urgency: ${p.urgencyScore}/100 | Risk: ${p.riskLevel}`);
    console.log('');
  }
  
  // Recommendations
  console.log('💡 RECOMMENDATIONS');
  console.log('━'.repeat(50));
  
  const needsAction = positions.filter(p => p.urgencyScore >= 50);
  if (needsAction.length === 0) {
    console.log('✅ All positions healthy. No immediate action needed.');
  } else {
    for (const p of needsAction) {
      if (p.urgencyScore >= 90) {
        console.log(`🚨 ${p.name}: Rebalance immediately (${p.inRange ? 'near edge' : 'out of range'})`);
      } else if (p.urgencyScore >= 70) {
        console.log(`⚠️  ${p.name}: Rebalance soon (${p.edgeProximityPct}% from edge)`);
      } else {
        console.log(`👀 ${p.name}: Monitor closely (${p.edgeProximityPct}% from edge)`);
      }
    }
  }
}

module.exports = { analyzeAllPositions, calculateRiskMetrics, calculatePortfolioRisk };

if (require.main === module) {
  main().catch(e => { console.error('Error:', e.message); process.exit(1); });
}
