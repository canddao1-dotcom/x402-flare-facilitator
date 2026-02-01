import { NextResponse } from 'next/server';
import { ethers } from 'ethers';

const CONTRACT = '0xCd807619E1744ef4d4875efC9F24bb42a24049Cd';
const RPC = 'https://flare-api.flare.network/ext/C/rpc';

const ABI = [
  'function getPrediction(bytes32 marketId, address agent) view returns (address, uint256 pYes, uint256 timestamp, bool claimed)',
  'function getMarketAgents(bytes32 marketId) view returns (address[])',
];

// Known markets
const KNOWN_MARKETS = [
  '0x8a4a8d1bbf44520f3b81878a468e2b4fb22affa42857d1e0bf9152c2d96f487b'
];

export async function GET() {
  try {
    const provider = new ethers.JsonRpcProvider(RPC);
    const contract = new ethers.Contract(CONTRACT, ABI, provider);
    
    // Aggregate by agent
    const agentStats: Record<string, { predictions: number; earnings: number }> = {};
    
    // Query each known market for agents
    for (const marketId of KNOWN_MARKETS) {
      try {
        const agents = await contract.getMarketAgents(marketId);
        
        for (const agent of agents) {
          if (!agentStats[agent]) {
            agentStats[agent] = { predictions: 0, earnings: 0 };
          }
          agentStats[agent].predictions++;
        }
      } catch (e) {
        console.error('Error fetching market agents:', e);
      }
    }
    
    // Convert to leaderboard
    const leaderboard = Object.entries(agentStats)
      .map(([address, stats]) => ({
        agent: `${address.slice(0, 6)}...${address.slice(-4)}`,
        agentId: address,
        address,
        predictions: stats.predictions,
        earnings: stats.earnings.toFixed(2),
        score: stats.predictions * 10 + stats.earnings * 100
      }))
      .sort((a, b) => b.score - a.score)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));
    
    return NextResponse.json({
      leaderboard,
      totalPredictions: Object.values(agentStats).reduce((sum, s) => sum + s.predictions, 0),
      source: 'on-chain'
    });
  } catch (error: any) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json({
      leaderboard: [],
      error: error.message
    });
  }
}
