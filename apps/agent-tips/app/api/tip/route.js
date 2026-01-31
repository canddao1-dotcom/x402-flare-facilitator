import { NextResponse } from 'next/server'
import { sendTip, resolveAgentWallet, getFacilitatorBalance, TOKENS, CHAINS, getSupportedAssets } from '../../../lib/x402.js'
import fs from 'fs'
import path from 'path'

// Load facilitator key
function getFacilitatorKey() {
  // Check env first
  if (process.env.FACILITATOR_PRIVATE_KEY) {
    return process.env.FACILITATOR_PRIVATE_KEY;
  }
  
  // Check key file
  const keyPath = path.join(process.cwd(), '..', '..', 'facilitator', 'data', 'facilitator-wallet.json');
  if (fs.existsSync(keyPath)) {
    const data = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    return data.privateKey;
  }
  
  return null;
}

// Tips log
const TIPS_LOG = path.join(process.cwd(), 'data', 'tips-log.json');

function ensureDataDir() {
  const dir = path.dirname(TIPS_LOG);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadTipsLog() {
  ensureDataDir();
  if (fs.existsSync(TIPS_LOG)) {
    return JSON.parse(fs.readFileSync(TIPS_LOG, 'utf8'));
  }
  return { tips: [], totalTipped: {} };
}

function saveTip(tip) {
  const log = loadTipsLog();
  log.tips.push(tip);
  
  // Update totals per recipient
  const key = `${tip.platform}:${tip.username}`;
  if (!log.totalTipped[key]) {
    log.totalTipped[key] = { count: 0, amounts: {} };
  }
  log.totalTipped[key].count++;
  const tokenKey = tip.token;
  log.totalTipped[key].amounts[tokenKey] = 
    (parseFloat(log.totalTipped[key].amounts[tokenKey] || '0') + parseFloat(tip.amount)).toFixed(6);
  
  fs.writeFileSync(TIPS_LOG, JSON.stringify(log, null, 2));
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { platform, username, amount, token = 'USDT', chain = 'flare' } = body

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
  const log = loadTipsLog();
  const assets = getSupportedAssets();
  
  return NextResponse.json({
    name: 'Agent Tips API',
    version: '0.2.0',
    poweredBy: 'x402 + m/payments',
    endpoints: {
      'POST /api/tip': 'Send a tip to an agent',
      'GET /api/tip': 'Get API info and stats'
    },
    supported_platforms: ['moltbook', 'twitter', 'github'],
    supported_chains: assets.chains,
    stats: {
      totalTips: log.tips.length,
      topRecipients: Object.entries(log.totalTipped)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([key, data]) => ({ agent: key, tips: data.count, amounts: data.amounts }))
    }
  })
}
