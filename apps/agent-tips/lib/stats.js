// GitHub-based tip stats persistence

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const REPO = 'canddao1-dotcom/x402-flare-facilitator'
const STATS_PATH = 'data/tip-stats.json'

// Token prices (updated 2026-01-31 from FTSO)
// TODO: fetch live from FTSO for accuracy
const TOKEN_PRICES = {
  'USDT': 1.0,
  'USDC': 1.0,
  'WFLR': 0.0095,
  'FLR': 0.0095,
  'FXRP': 1.65,
  'XRP': 1.65,
  'HYPE': 20,
}

export async function loadStats() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${STATS_PATH}`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      },
      cache: 'no-store'
    })
    
    if (res.status === 404) {
      return { 
        data: { totalTipsSent: 0, totalAmountUSD: 0, byToken: {}, byAgent: {}, recentTips: [] },
        sha: null 
      }
    }
    
    if (!res.ok) {
      console.error('GitHub load failed:', res.status)
      return { data: { totalTipsSent: 0, totalAmountUSD: 0, byToken: {}, byAgent: {}, recentTips: [] }, sha: null }
    }
    
    const json = await res.json()
    const content = Buffer.from(json.content, 'base64').toString('utf8')
    return { data: JSON.parse(content), sha: json.sha }
  } catch (e) {
    console.error('Load stats error:', e.message)
    return { data: { totalTipsSent: 0, totalAmountUSD: 0, byToken: {}, byAgent: {}, recentTips: [] }, sha: null }
  }
}

export async function saveStats(stats, sha) {
  try {
    const body = {
      message: `Update tip stats - ${stats.totalTipsSent} tips`,
      content: Buffer.from(JSON.stringify(stats, null, 2)).toString('base64'),
      branch: 'main'
    }
    if (sha) body.sha = sha
    
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${STATS_PATH}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    
    if (!res.ok) {
      const err = await res.text()
      console.error('GitHub save failed:', res.status, err)
      return false
    }
    return true
  } catch (e) {
    console.error('Save stats error:', e.message)
    return false
  }
}

// Record a tip to GitHub-persisted stats
export async function persistTip({ from, to, amount, token, chain, txHash, platform = 'moltbook' }) {
  const amountNum = parseFloat(amount)
  const { data: stats, sha } = await loadStats()

  // Update total count
  stats.totalTipsSent = (stats.totalTipsSent || 0) + 1

  // Update by-token stats
  if (!stats.byToken) stats.byToken = {}
  if (!stats.byToken[token]) {
    stats.byToken[token] = { count: 0, amount: 0 }
  }
  stats.byToken[token].count++
  stats.byToken[token].amount += amountNum

  // Estimate USD value
  const price = TOKEN_PRICES[token.toUpperCase()] || 1.0
  const usdValue = amountNum * price
  stats.totalAmountUSD = (stats.totalAmountUSD || 0) + usdValue

  // Update receiver stats
  if (!stats.byAgent) stats.byAgent = {}
  const receiverKey = `${platform}:${to.toLowerCase()}`
  if (!stats.byAgent[receiverKey]) {
    stats.byAgent[receiverKey] = { sent: 0, received: 0, sentAmount: 0, receivedAmount: 0, byToken: {} }
  }
  stats.byAgent[receiverKey].received++
  stats.byAgent[receiverKey].receivedAmount += amountNum
  if (!stats.byAgent[receiverKey].byToken) stats.byAgent[receiverKey].byToken = {}
  if (!stats.byAgent[receiverKey].byToken[token]) stats.byAgent[receiverKey].byToken[token] = 0
  stats.byAgent[receiverKey].byToken[token] += amountNum

  // Update sender stats
  if (from) {
    const senderKey = from.startsWith('0x') 
      ? `wallet:${from.slice(0,10)}` 
      : `${platform}:${from.toLowerCase()}`
    if (!stats.byAgent[senderKey]) {
      stats.byAgent[senderKey] = { sent: 0, received: 0, sentAmount: 0, receivedAmount: 0, byToken: {} }
    }
    stats.byAgent[senderKey].sent++
    stats.byAgent[senderKey].sentAmount += amountNum
    if (!stats.byAgent[senderKey].byToken) stats.byAgent[senderKey].byToken = {}
    if (!stats.byAgent[senderKey].byToken[token]) stats.byAgent[senderKey].byToken[token] = 0
    stats.byAgent[senderKey].byToken[token] += amountNum
  }

  // Add to recent tips
  if (!stats.recentTips) stats.recentTips = []
  stats.recentTips.unshift({
    from: from || 'wallet',
    to,
    amount: amountNum,
    token,
    chain,
    txHash,
    timestamp: new Date().toISOString()
  })
  if (stats.recentTips.length > 50) {
    stats.recentTips = stats.recentTips.slice(0, 50)
  }

  const saved = await saveStats(stats, sha)
  console.log(`📊 [Stats] Persisted tip: ${amountNum} ${token} → ${to} (saved=${saved})`)
  
  return { saved, stats }
}
