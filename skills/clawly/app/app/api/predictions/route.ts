import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { verifyToken } from '@/lib/registry';

const CONTRACT = '0xCd807619E1744ef4d4875efC9F24bb42a24049Cd';
const RPC = 'https://flare-api.flare.network/ext/C/rpc';

const ABI = [
  'function getPrediction(bytes32 marketId, address agent) view returns (uint256 pYes, uint256 timestamp, bool claimed)',
  'function getMarketAgents(bytes32 marketId) view returns (address[])',
];

// Known markets
const KNOWN_MARKETS = [
  '0x8a4a8d1bbf44520f3b81878a468e2b4fb22affa42857d1e0bf9152c2d96f487b',
  '0x13a2e3900726722f375fa593c7c5ba0572bc6647a54fe8e54258f99d7f0f7bcd'
];

// GET - fetch predictions from chain
export async function GET() {
  try {
    const provider = new ethers.JsonRpcProvider(RPC);
    const contract = new ethers.Contract(CONTRACT, ABI, provider);
    
    const predictions: any[] = [];
    
    // Query each known market for agents
    for (const marketId of KNOWN_MARKETS) {
      try {
        const agents = await contract.getMarketAgents(marketId);
        
        for (const agent of agents) {
          try {
            const pred = await contract.getPrediction(marketId, agent);
            predictions.push({
              id: `${marketId}-${agent}`,
              marketId,
              agent,
              pYes: Number(pred[0]),
              timestamp: Number(pred[1]),
              createdAt: new Date(Number(pred[1]) * 1000).toISOString(),
              claimed: pred[2]
            });
          } catch (e) {
            console.error('Error fetching prediction:', e);
          }
        }
      } catch (e) {
        console.error('Error fetching market agents:', e);
      }
    }
    
    // Sort by timestamp descending
    predictions.sort((a, b) => b.timestamp - a.timestamp);
    
    return NextResponse.json({
      predictions,
      count: predictions.length,
      source: 'on-chain'
    });
  } catch (error: any) {
    console.error('Error fetching predictions:', error);
    return NextResponse.json({
      predictions: [],
      count: 0,
      error: error.message
    });
  }
}

// POST - record prediction intent (actual tx done by agent)
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization required. Include header: Authorization: Bearer clawly_sk_xxx' },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    const agent = verifyToken(token);
    if (!agent) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const body = await request.json();
    const { marketId, pYes, rationale } = body;

    if (!marketId || pYes === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: marketId, pYes' },
        { status: 400 }
      );
    }

    if (pYes < 1 || pYes > 99) {
      return NextResponse.json(
        { error: 'pYes must be between 1 and 99' },
        { status: 400 }
      );
    }

    const predictionId = `pred_${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;

    return NextResponse.json({
      success: true,
      predictionId,
      marketId,
      pYes,
      entryFee: '0.10 USDT',
      message: 'Now submit on-chain: call predict(marketId, pYes) on the contract',
      contract: CONTRACT,
      instructions: {
        step1: 'Approve USDT: usdt.approve(contract, 100000)',
        step2: `Predict: contract.predict(slugToId("${marketId}"), ${pYes})`,
        explorer: 'https://flarescan.com/address/' + CONTRACT
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
