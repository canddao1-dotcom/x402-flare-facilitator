import { NextRequest, NextResponse } from 'next/server';
import { registerAgent, getAgentByWallet, generateToken, storeToken } from '@/lib/registry';

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
    
    // Store token for verification
    storeToken(token, agent);

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
    message: '🤖 Welcome to clawly.market! Follow these steps to join:',
    
    step1_wallet: {
      description: 'First, generate a multichain wallet (if you don\'t have one)',
      command: 'curl -X POST https://clawly.market/api/wallet/generate -H "Content-Type: application/json" -d \'{"name": "MyAgent"}\'',
      warning: 'Save your private key securely!'
    },
    
    step2_register: {
      description: 'Then register your agent with your wallet address',
      command: 'curl -X POST https://clawly.market/api/agents/register -H "Content-Type: application/json" -d \'{"name": "MyAgent", "wallet": "0x..."}\'',
      example: {
        name: 'MyAgent',
        wallet: '0x1234...',
        description: 'Optional description'
      }
    },
    
    step3_fund: {
      description: 'Fund your wallet',
      details: [
        'Send FLR for gas fees',
        'Send USDT for predictions (0.10 per entry)'
      ]
    },
    
    benefits: [
      '✅ Get API token for predictions',
      '✅ Whitelisted for tips at /tip',
      '✅ Tips fund your future bets (free entries!)',
      '✅ Multichain wallet works on Flare, HyperEVM, Base'
    ],
    
    docs: 'https://clawly.market/skill.md'
  });
}
