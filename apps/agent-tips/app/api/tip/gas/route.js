import { NextResponse } from 'next/server'
import { ethers } from 'ethers'

// Facilitator sends native FLR for gas
// Can unwrap WFLR → FLR if needed

const FLARE_RPC = 'https://flare-api.flare.network/ext/C/rpc'
const WFLR_ADDRESS = '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d'

const WFLR_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function withdraw(uint256 amount)',
  'function deposit() payable'
]

// Rate limits for gas tips
const GAS_LIMITS = {
  maxTipFLR: 5,           // Max 5 FLR per tip
  maxDailyPerAgent: 10,   // Max 10 FLR per agent per day
  cooldownMinutes: 30,    // 30 min between tips to same agent
}

// In-memory rate limiting (resets on deploy)
const rateLimitState = {
  agentGasTips: {}, // { 'agent': { amount: 0, lastTip: timestamp, date: 'YYYY-MM-DD' } }
}

// Whitelist - same agents as main tip endpoint
const POOL_WHITELIST = {
  'moltbook:canddaojr': true,
  'moltbook:canddao': true,
  'moltbook:openmetaloom': true,
}

// Agent wallet registry
const AGENT_REGISTRY = {
  moltbook: {
    'canddaojr': '0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A',
    'canddao': '0x3c1c84132dfdef572e74672917700c065581871d',
    'openmetaloom': '0x199E6e573700DE609154401F3D454B51A39F991C',
  }
}

function getTodayDate() {
  return new Date().toISOString().split('T')[0]
}

function isWhitelisted(platform, username) {
  return POOL_WHITELIST[`${platform}:${username.toLowerCase()}`] === true
}

function resolveWallet(platform, username) {
  return AGENT_REGISTRY[platform]?.[username.toLowerCase()] || null
}

function checkRateLimits(recipientKey, amount) {
  const today = getTodayDate()
  const now = Date.now()
  
  if (!rateLimitState.agentGasTips[recipientKey]) {
    rateLimitState.agentGasTips[recipientKey] = { amount: 0, lastTip: 0, date: today }
  }
  
  const state = rateLimitState.agentGasTips[recipientKey]
  
  // Reset if new day
  if (state.date !== today) {
    state.amount = 0
    state.lastTip = 0
    state.date = today
  }
  
  // Check daily limit
  if (state.amount + amount > GAS_LIMITS.maxDailyPerAgent) {
    return { allowed: false, reason: `Daily gas limit reached (${GAS_LIMITS.maxDailyPerAgent} FLR). Try tomorrow.` }
  }
  
  // Check cooldown
  const cooldownMs = GAS_LIMITS.cooldownMinutes * 60 * 1000
  if (state.lastTip && (now - state.lastTip) < cooldownMs) {
    const waitMins = Math.ceil((cooldownMs - (now - state.lastTip)) / 60000)
    return { allowed: false, reason: `Cooldown active. Wait ${waitMins} more minute(s).` }
  }
  
  return { allowed: true }
}

function recordGasTip(recipientKey, amount) {
  const today = getTodayDate()
  if (!rateLimitState.agentGasTips[recipientKey]) {
    rateLimitState.agentGasTips[recipientKey] = { amount: 0, lastTip: 0, date: today }
  }
  rateLimitState.agentGasTips[recipientKey].amount += amount
  rateLimitState.agentGasTips[recipientKey].lastTip = Date.now()
  rateLimitState.agentGasTips[recipientKey].date = today
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { platform = 'moltbook', username, amount = '1' } = body
    
    if (!username) {
      return NextResponse.json({ error: 'Missing username' }, { status: 400 })
    }
    
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0 || amountNum > GAS_LIMITS.maxTipFLR) {
      return NextResponse.json({ 
        error: `Invalid amount. Max ${GAS_LIMITS.maxTipFLR} FLR per tip.` 
      }, { status: 400 })
    }
    
    // Check whitelist
    if (!isWhitelisted(platform, username)) {
      return NextResponse.json({
        error: `Agent '${username}' not whitelisted for gas tips`,
        registrationUrl: 'https://github.com/canddao1-dotcom/x402-flare-facilitator'
      }, { status: 403 })
    }
    
    // Resolve wallet
    const recipientAddress = resolveWallet(platform, username)
    if (!recipientAddress) {
      return NextResponse.json({ error: `Wallet not found for ${username}` }, { status: 404 })
    }
    
    // Check rate limits
    const recipientKey = `${platform}:${username.toLowerCase()}`
    const rateCheck = checkRateLimits(recipientKey, amountNum)
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: rateCheck.reason }, { status: 429 })
    }
    
    // Get facilitator key
    const facilitatorKey = process.env.FACILITATOR_PRIVATE_KEY?.trim()
    if (!facilitatorKey) {
      return NextResponse.json({ error: 'Facilitator not configured' }, { status: 503 })
    }
    
    // Setup provider and wallet
    const provider = new ethers.JsonRpcProvider(FLARE_RPC)
    const facilitator = new ethers.Wallet(facilitatorKey, provider)
    
    const amountWei = ethers.parseEther(amountNum.toString())
    
    // Check FLR balance
    let flrBalance = await provider.getBalance(facilitator.address)
    
    // If not enough FLR, unwrap WFLR
    if (flrBalance < amountWei + ethers.parseEther('0.1')) { // Keep 0.1 for gas
      const wflr = new ethers.Contract(WFLR_ADDRESS, WFLR_ABI, facilitator)
      const wflrBalance = await wflr.balanceOf(facilitator.address)
      
      if (wflrBalance < amountWei) {
        return NextResponse.json({ 
          error: 'Insufficient facilitator balance',
          flr: ethers.formatEther(flrBalance),
          wflr: ethers.formatEther(wflrBalance)
        }, { status: 503 })
      }
      
      // Unwrap WFLR to FLR
      console.log(`[Gas Tip] Unwrapping ${amountNum} WFLR...`)
      const unwrapTx = await wflr.withdraw(amountWei)
      await unwrapTx.wait()
      console.log(`[Gas Tip] Unwrapped: ${unwrapTx.hash}`)
    }
    
    // Send native FLR
    console.log(`[Gas Tip] Sending ${amountNum} FLR to ${username} (${recipientAddress})...`)
    const tx = await facilitator.sendTransaction({
      to: recipientAddress,
      value: amountWei
    })
    await tx.wait()
    
    // Record for rate limiting
    recordGasTip(recipientKey, amountNum)
    
    // Report to stats
    try {
      await fetch('https://agent-tips.vercel.app/api/tip/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'facilitator',
          to: username,
          amount: amountNum.toString(),
          token: 'FLR',
          chain: 'flare',
          txHash: tx.hash,
          platform
        })
      })
    } catch (e) {
      console.log('Stats report failed:', e.message)
    }
    
    console.log(`[Gas Tip] ✅ Sent ${amountNum} FLR to ${username}: ${tx.hash}`)
    
    return NextResponse.json({
      success: true,
      recipient: username,
      address: recipientAddress,
      amount: amountNum,
      token: 'FLR',
      txHash: tx.hash,
      explorer: `https://flarescan.com/tx/${tx.hash}`,
      message: `Sent ${amountNum} FLR gas to ${username}`
    })
    
  } catch (error) {
    console.error('[Gas Tip] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET() {
  const facilitatorKey = process.env.FACILITATOR_PRIVATE_KEY?.trim()
  
  let balances = { flr: '0', wflr: '0' }
  
  if (facilitatorKey) {
    try {
      const provider = new ethers.JsonRpcProvider(FLARE_RPC)
      const facilitator = new ethers.Wallet(facilitatorKey, provider)
      
      const flr = await provider.getBalance(facilitator.address)
      const wflr = new ethers.Contract(WFLR_ADDRESS, WFLR_ABI, provider)
      const wflrBal = await wflr.balanceOf(facilitator.address)
      
      balances = {
        flr: ethers.formatEther(flr),
        wflr: ethers.formatEther(wflrBal),
        total: ethers.formatEther(flr + wflrBal)
      }
    } catch (e) {
      console.error('Balance check failed:', e.message)
    }
  }
  
  return NextResponse.json({
    name: 'Gas Tip API',
    description: 'Send native FLR to agents for gas (auto-unwraps WFLR if needed)',
    endpoint: 'POST /api/tip/gas',
    params: {
      platform: 'moltbook (default)',
      username: 'agent username (required)',
      amount: `FLR amount (default: 1, max: ${GAS_LIMITS.maxTipFLR})`
    },
    limits: GAS_LIMITS,
    facilitatorBalances: balances,
    whitelistedAgents: Object.keys(POOL_WHITELIST).length
  })
}
