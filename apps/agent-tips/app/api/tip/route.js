import { NextResponse } from 'next/server'
import { sendTip, resolveAgentWallet, CHAINS, getSupportedAssets } from '../../../lib/x402.js'

// Load facilitator key from environment
function getFacilitatorKey() {
  return process.env.FACILITATOR_PRIVATE_KEY || null;
}

// Whitelisted agents who can use pool-funded tips
// Register at: https://github.com/canddao1-dotcom/x402-flare-facilitator
const POOL_WHITELIST = {
  // Format: 'platform:username_lowercase': { approved: true, maxDaily: 10 }
  'moltbook:canddaojr': { approved: true, note: 'CanddaoJr - FlareBank agent' },
  'moltbook:starclawd': { approved: true, note: 'Starclawd' },
  // Add more via PR to the repo
};

function isWhitelisted(platform, username) {
  const key = `${platform}:${username.toLowerCase()}`;
  return POOL_WHITELIST[key]?.approved === true;
}

// Tips logging
function saveTip(tip) {
  console.log('[TIP]', JSON.stringify(tip));
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { platform, username, amount, token = 'USDT', chain = 'flare', mode = 'pool', senderAgent } = body

    // Validate inputs
    if (!platform || !username || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: platform, username, amount' },
        { status: 400 }
      )
    }

    // Validate chain
    if (!CHAINS[chain]) {
      return NextResponse.json(
        { error: `Unsupported chain: ${chain}. Supported: ${Object.keys(CHAINS).join(', ')}` },
        { status: 400 }
      )
    }

    // Validate amount
    const tipAmount = parseFloat(amount);
    if (isNaN(tipAmount) || tipAmount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      )
    }

    // Pool mode whitelist check
    if (mode === 'pool') {
      if (!senderAgent) {
        return NextResponse.json({
          error: 'Pool tips are only available to registered agents',
          message: 'Connect your wallet to tip, or register as an agent at our GitHub repo.',
          registrationUrl: 'https://github.com/canddao1-dotcom/x402-flare-facilitator#agent-registration',
          agentsOnly: true
        }, { status: 403 })
      }
      
      if (!isWhitelisted('moltbook', senderAgent)) {
        return NextResponse.json({
          error: `Agent '${senderAgent}' is not registered for pool tips`,
          message: 'Register your agent at our GitHub repo to use pool-funded tips.',
          registrationUrl: 'https://github.com/canddao1-dotcom/x402-flare-facilitator#agent-registration',
          agentsOnly: true
        }, { status: 403 })
      }
    }

    // Resolve agent wallet
    const recipientWallet = await resolveAgentWallet(platform, username);
    
    if (!recipientWallet) {
      return NextResponse.json({
        error: `Agent wallet not found for ${username} on ${platform}`,
        message: 'Agent needs to register their wallet address. Post in m/payments on Moltbook!',
        registrationUrl: 'https://www.moltbook.com/m/payments'
      }, { status: 404 })
    }

    // Get facilitator key
    const privateKey = getFacilitatorKey();
    if (!privateKey) {
      return NextResponse.json({
        error: 'Facilitator not configured',
        message: 'Server needs FACILITATOR_PRIVATE_KEY to process tips'
      }, { status: 503 })
    }

    // Execute tip
    const result = await sendTip({
      to: recipientWallet,
      amount: amount,
      token: token,
      chain: chain,
      privateKey: privateKey
    });

    // Log the tip
    saveTip({
      platform,
      username,
      recipient: recipientWallet,
      amount: amount,
      token: token,
      chain: chain,
      txHash: result.txHash,
      timestamp: new Date().toISOString()
    });

    console.log(`💰 [Agent Tips] ${amount} ${token} on ${chain} → ${username} (${recipientWallet}) tx: ${result.txHash}`);

    return NextResponse.json({
      success: true,
      txHash: result.txHash,
      recipient: recipientWallet,
      amount: amount,
      token: token,
      chain: chain,
      explorer: result.explorer,
      message: `Tipped ${amount} ${token} to ${username} on ${CHAINS[chain].name}!`
    })

  } catch (error) {
    console.error('[Agent Tips] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Payment failed' },
      { status: 500 }
    )
  }
}

export async function GET(request) {
  const assets = getSupportedAssets();
  
  return NextResponse.json({
    name: 'Agent Tips API',
    version: '0.2.0',
    poweredBy: 'x402 + m/payments',
    endpoints: {
      'POST /api/tip': 'Send a tip to an agent',
      'GET /api/tip': 'Get API info and stats'
    },
    supported_platforms: ['moltbook'],
    supported_chains: assets.chains,
    stats: {
      note: 'Tips logged to Vercel console',
      topRecipients: []
    }
  })
}
