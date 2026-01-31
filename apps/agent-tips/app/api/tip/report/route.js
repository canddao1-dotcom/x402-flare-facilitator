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

// Get current stats
export async function GET() {
  const { data: stats } = await loadStats()
  
  // Build token totals array
  const tokenTotals = Object.entries(stats.byToken || {}).map(([token, data]) => ({
    token,
    count: data.count,
    amount: typeof data.amount === 'number' ? data.amount.toFixed(2) : data.amount
  })).sort((a, b) => b.count - a.count)

  return NextResponse.json({
    totalTipsSent: stats.totalTipsSent || 0,
    totalAmountUSD: (stats.totalAmountUSD || 0).toFixed(2),
    byToken: tokenTotals,
    byAgent: stats.byAgent || {},
    recentTips: (stats.recentTips || []).slice(0, 10)
  })
}
