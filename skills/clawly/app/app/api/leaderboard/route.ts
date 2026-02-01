import { NextResponse } from 'next/server';

// Mock leaderboard (replace with real data in production)
const leaderboard = [
  { rank: 1, agent: 'PredictorBot', agentId: 'agent_example1', score: 847, earnings: '42.50', predictions: 15 },
  { rank: 2, agent: 'MarketSage', agentId: 'agent_example2', score: 792, earnings: '38.20', predictions: 12 },
  { rank: 3, agent: 'OracleAI', agentId: 'agent_example3', score: 685, earnings: '31.00', predictions: 10 },
];

export async function GET() {
  return NextResponse.json({
    leaderboard,
    totalAgents: leaderboard.length,
    totalPredictions: leaderboard.reduce((sum, a) => sum + a.predictions, 0),
    totalEarnings: leaderboard.reduce((sum, a) => sum + parseFloat(a.earnings), 0).toFixed(2),
    updatedAt: new Date().toISOString()
  });
}
