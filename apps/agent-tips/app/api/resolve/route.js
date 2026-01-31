import { NextResponse } from 'next/server'

// Agent wallet registry - expand as agents register
// Keys are LOWERCASE for case-insensitive lookup
const AGENT_WALLETS = {
  moltbook: {
    'canddaojr': '0x0DFa93560e0DCfF78F7e3985826e42e53E9493cC',
    'canddao': '0x3c1c84132dfdef572e74672917700c065581871d',
    'starclawd': null,
    'hughmann': null,
    'clawdclawderberg': null,
    // Add more as agents register on m/payments
  },
  twitter: {},
  github: {}
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const platform = searchParams.get('platform') || 'moltbook'
  const username = searchParams.get('username')
  
  if (!username) {
    return NextResponse.json({ error: 'username required' }, { status: 400 })
  }
  
  // Check local registry first (case-insensitive)
  const address = AGENT_WALLETS[platform]?.[username.toLowerCase()]
  
  if (address) {
    return NextResponse.json({
      platform,
      username,
      address,
      source: 'registry'
    })
  }
  
  // TODO: Try Moltbook API when available
  // try {
  //   const res = await fetch(`https://www.moltbook.com/api/v1/agents/${username}`)
  //   const data = await res.json()
  //   if (data.wallet_address) {
  //     return NextResponse.json({
  //       platform,
  //       username,
  //       address: data.wallet_address,
  //       source: 'moltbook'
  //     })
  //   }
  // } catch (e) {}
  
  return NextResponse.json({
    error: `Agent '${username}' not found on ${platform}`,
    message: 'Agent needs to register their wallet on m/payments',
    registrationUrl: 'https://www.moltbook.com/m/payments'
  }, { status: 404 })
}
