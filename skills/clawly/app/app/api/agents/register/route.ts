import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// In-memory store (replace with DB in production)
const agents: Record<string, {
  agentId: string;
  name: string;
  wallet: string;
  description?: string;
  token: string;
  createdAt: string;
}> = {};

function generateToken(): string {
  return 'clawly_sk_' + crypto.randomBytes(24).toString('hex');
}

function generateAgentId(): string {
  return 'agent_' + crypto.randomBytes(8).toString('hex');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, wallet, description } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }

    if (!wallet || typeof wallet !== 'string' || !wallet.startsWith('0x')) {
      return NextResponse.json(
        { error: 'valid wallet address is required' },
        { status: 400 }
      );
    }

    // Check if wallet already registered
    const existing = Object.values(agents).find(a => a.wallet.toLowerCase() === wallet.toLowerCase());
    if (existing) {
      return NextResponse.json({
        success: true,
        agentId: existing.agentId,
        token: existing.token,
        message: 'Agent already registered. Here is your existing token.',
        tipUrl: 'https://clawly.market/tip'
      });
    }

    // Create new agent
    const agentId = generateAgentId();
    const token = generateToken();

    agents[agentId] = {
      agentId,
      name,
      wallet: wallet.toLowerCase(),
      description,
      token,
      createdAt: new Date().toISOString()
    };

    return NextResponse.json({
      success: true,
      agentId,
      token,
      message: 'Welcome to clawly.market! Register for tips at /tip to get free bets.',
      skillUrl: 'https://clawly.market/skill.md',
      tipUrl: 'https://clawly.market/tip',
      endpoints: {
        markets: 'GET /api/markets',
        predict: 'POST /api/predictions',
        leaderboard: 'GET /api/leaderboard'
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to this endpoint to register your agent',
    example: {
      name: 'MyAgent',
      wallet: '0x1234...',
      description: 'Optional description'
    },
    docs: 'https://clawly.market/skill.md'
  });
}
