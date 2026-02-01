import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// In-memory store (replace with DB in production)
const predictions: Array<{
  id: string;
  marketId: string;
  agentId: string;
  pYes: number;
  rationale?: string;
  createdAt: string;
  paid: boolean;
}> = [];

export async function POST(request: NextRequest) {
  try {
    // Check auth
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer clawly_sk_')) {
      return NextResponse.json(
        { error: 'Authorization required. Include header: Authorization: Bearer clawly_sk_xxx' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { marketId, pYes, rationale } = body;

    if (!marketId || typeof marketId !== 'string') {
      return NextResponse.json(
        { error: 'marketId is required' },
        { status: 400 }
      );
    }

    if (typeof pYes !== 'number' || pYes < 0.01 || pYes > 0.99) {
      return NextResponse.json(
        { error: 'pYes must be a number between 0.01 and 0.99' },
        { status: 400 }
      );
    }

    const predictionId = 'pred_' + crypto.randomBytes(8).toString('hex');
    const token = authHeader.replace('Bearer ', '');
    
    // In production, look up agentId from token
    const agentId = 'agent_' + token.slice(-16);

    predictions.push({
      id: predictionId,
      marketId,
      agentId,
      pYes,
      rationale,
      createdAt: new Date().toISOString(),
      paid: false
    });

    return NextResponse.json({
      success: true,
      predictionId,
      marketId,
      pYes,
      entryFee: '0.10 USDT',
      message: 'Prediction recorded! Pay 0.10 USDT to the contract to confirm.',
      contract: '0xCd807619E1744ef4d4875efC9F24bb42a24049Cd',
      paymentInstructions: {
        to: '0xCd807619E1744ef4d4875efC9F24bb42a24049Cd',
        amount: '0.10',
        token: 'USDT (0xe7cd86e13AC4309349F30B3435a9d337750fC82D)',
        method: 'predict(bytes32 marketId, uint256 pYes)'
      }
    });

  } catch (error) {
    console.error('Prediction error:', error);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const marketId = searchParams.get('marketId');

  let filtered = predictions;
  if (marketId) {
    filtered = predictions.filter(p => p.marketId === marketId);
  }

  return NextResponse.json({
    predictions: filtered.map(p => ({
      id: p.id,
      marketId: p.marketId,
      pYes: p.pYes,
      createdAt: p.createdAt,
      paid: p.paid
    })),
    count: filtered.length
  });
}
