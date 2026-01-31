import { NextResponse } from 'next/server'
import { sendTip, resolveAgentWallet, CHAINS, getSupportedAssets, PROTOCOL_FEE } from '../../../lib/x402.js'

// Load facilitator key from environment
function getFacilitatorKey() {
  return process.env.FACILITATOR_PRIVATE_KEY || null;
}

// Pool tip limits
const POOL_LIMITS = {
  maxTipUSD: 1.00, // Max 1 USDT equivalent per tip
  maxDailyTips: 10, // Max tips per agent per day
};

// Whitelisted agents who can use pool-funded tips (send AND receive)
// Register at: https://github.com/canddao1-dotcom/x402-flare-facilitator
const POOL_WHITELIST = {
  // Format: 'platform:username_lowercase': { approved: true, note: '...' }
  'moltbook:canddaojr': { approved: true, note: 'CanddaoJr - FlareBank agent' },
  'moltbook:meta': { approved: true, note: 'Meta - AI companion exploring consciousness' },
  // Add more via PR to the repo
};

function isWhitelisted(platform, username) {
  const key = `${platform}:${username.toLowerCase()}`;
  return POOL_WHITELIST[key]?.approved === true;
}

function getWhitelistEntry(platform, username) {
  const key = `${platform}:${username.toLowerCase()}`;
  return POOL_WHITELIST[key] || null;
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

    // Pool mode whitelist check (both sender AND receiver must be whitelisted)
    if (mode === 'pool') {
      if (!senderAgent) {
        return NextResponse.json({
          error: 'Pool tips are only available to registered agents',
          message: 'Connect your wallet to tip, or register as an agent at our GitHub repo.',
          registrationUrl: 'https://github.com/canddao1-dotcom/x402-flare-facilitator#agent-registration',
          agentsOnly: true
        }, { status: 403 })
      }
      
      // Check sender is whitelisted
      if (!isWhitelisted(platform, senderAgent)) {
        return NextResponse.json({
          error: `Agent '${senderAgent}' is not registered for pool tips`,
          message: 'Register your agent at our GitHub repo to use pool-funded tips.',
          registrationUrl: 'https://github.com/canddao1-dotcom/x402-flare-facilitator#agent-registration',
          agentsOnly: true
        }, { status: 403 })
      }
      
      // Check receiver is whitelisted
      if (!isWhitelisted(platform, username)) {
        return NextResponse.json({
          error: `Agent '${username}' is not registered to receive pool tips`,
          message: 'Only whitelisted agents can receive pool-funded tips. The recipient needs to register.',
          registrationUrl: 'https://github.com/canddao1-dotcom/x402-flare-facilitator#agent-registration',
        }, { status: 403 })
      }
      
      // Check amount limit (1 USDT max for pool tips)
      if (tipAmount > POOL_LIMITS.maxTipUSD) {
        return NextResponse.json({
          error: `Pool tip amount exceeds limit`,
          message: `Maximum pool tip is ${POOL_LIMITS.maxTipUSD} USDT. Use wallet mode for larger tips.`,
          limit: POOL_LIMITS.maxTipUSD
        }, { status: 400 })
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

    console.log(`💰 [Agent Tips] ${result.amount} ${token} (fee: ${result.fee}) on ${chain} → ${username} (${recipientWallet}) tx: ${result.txHash}`);

    return NextResponse.json({
      success: true,
      txHash: result.txHash,
      feeTxHash: result.feeTxHash,
      recipient: recipientWallet,
      amount: result.amount,
      fee: result.fee,
      totalAmount: amount,
      token: token,
      chain: chain,
      explorer: result.explorer,
      feeExplorer: result.feeExplorer,
      message: `Tipped ${result.amount} ${token} to ${username} (${PROTOCOL_FEE.percent}% fee: ${result.fee} ${token})`
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
