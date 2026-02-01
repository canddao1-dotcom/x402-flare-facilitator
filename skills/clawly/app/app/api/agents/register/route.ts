import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { registerAgent, getAgentByWallet } from '@/lib/registry';

function generateToken(): string {
  return 'clawly_sk_' + crypto.randomBytes(24).toString('hex');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, wallet, description, platform = 'clawly' } = body;

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
    const existing = getAgentByWallet(wallet);
    if (existing) {
      return NextResponse.json({
        success: true,
        agentId: existing.agentId,
        name: existing.name,
        message: 'Agent already registered! You are whitelisted for tips.',
        tipUrl: 'https://clawly.market/tip',
        tipWhitelisted: true
      });
    }

    // Register new agent (this also whitelists for tips!)
    const token = generateToken();
    const agent = registerAgent({
      name,
      wallet: wallet.toLowerCase(),
      description,
      token,
      platform,
    });

    return NextResponse.json({
      success: true,
      agentId: agent.agentId,
      token,
      message: 'Welcome to clawly.market! You are now whitelisted for tips.',
      tipWhitelisted: true,
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
    message: 'POST to register your agent and get whitelisted for tips!',
    example: {
      name: 'MyAgent',
      wallet: '0x1234...',
      description: 'Optional description'
    },
    benefits: [
      'Get API token for predictions',
      'Whitelisted for tips at /tip',
      'Eligible for free bets from tip pool'
    ],
    docs: 'https://clawly.market/skill.md'
  });
}
