import { NextResponse } from 'next/server'
import { loadStats, persistTip } from '../../../../lib/stats.js'

// Report a wallet tip (called after successful on-chain tx)
// This endpoint is for external callers (wallet-mode tips from frontend)
export async function POST(request) {
  try {
    const body = await request.json()
    const { from, to, amount, token, chain, txHash, platform = 'moltbook' } = body

    if (!to || !amount || !token || !txHash) {
      return NextResponse.json(
        { error: 'Missing required fields: to, amount, token, txHash' },
        { status: 400 }
      )
    }

    const { saved, stats } = await persistTip({
      from,
      to,
      amount,
      token,
      chain,
      txHash,
      platform
    })

    console.log(`📊 [Tip Reported] ${amount} ${token} → ${to} (${txHash.slice(0,10)}...) saved=${saved}`)

    return NextResponse.json({
      success: true,
      recorded: saved,
      stats: {
        totalTipsSent: stats.totalTipsSent,
        totalAmountUSD: stats.totalAmountUSD.toFixed(2)
      }
    })

  } catch (error) {
    console.error('[Tip Report] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to record tip' },
      { status: 500 }
    )
  }
}

// Current token prices (updated 2026-01-31 from FTSO)
const TOKEN_PRICES = {
  'USDT': 1.0,
  'USDC': 1.0,
  'WFLR': 0.0095,
  'FLR': 0.0095,
  'FXRP': 1.65,
  'XRP': 1.65,
  'HYPE': 20,
}

// Get current stats
export async function GET() {
  const { data: stats } = await loadStats()
  
  // Build token totals array and recalculate USD from raw amounts
  let recalculatedUSD = 0;
  const tokenTotals = Object.entries(stats.byToken || {}).map(([token, data]) => {
    const amount = typeof data.amount === 'number' ? data.amount : parseFloat(data.amount) || 0;
    const price = TOKEN_PRICES[token.toUpperCase()] || 1.0;
    const usdValue = amount * price;
    recalculatedUSD += usdValue;
    
    return {
      token,
      count: data.count,
      amount: amount.toFixed(2),
      usdValue: usdValue.toFixed(2)
    };
  }).sort((a, b) => b.count - a.count)

  // Anonymize wallet addresses in byAgent (keep stats but hide address)
  const safeByAgent = {};
  let humanCount = 0;
  Object.entries(stats.byAgent || {}).forEach(([key, value]) => {
    if (key.startsWith('wallet:')) {
      humanCount++;
      safeByAgent[`human:anonymous${humanCount}`] = value;
    } else {
      safeByAgent[key] = value;
    }
  });
  
  // Mask wallet addresses in recentTips
  const safeTips = (stats.recentTips || []).slice(0, 10).map(tip => ({
    ...tip,
    from: tip.from?.startsWith('0x') ? 'Anonymous human' : tip.from
  }));

  return NextResponse.json({
    totalTipsSent: stats.totalTipsSent || 0,
    totalAmountUSD: recalculatedUSD.toFixed(2),
    byToken: tokenTotals,
    byAgent: safeByAgent,
    recentTips: safeTips
  })
}
