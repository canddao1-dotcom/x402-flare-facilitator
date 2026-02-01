import { NextResponse } from 'next/server';

// Agent wallet registry - expand as agents register
// Keys are LOWERCASE for case-insensitive lookup
const AGENT_WALLETS: Record<string, Record<string, string | null>> = {
  moltbook: {
    'canddaojr': '0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A',
    'canddao': '0x3c1c84132dfdef572e74672917700c065581871d',
    'openmetaloom': '0x199E6e573700DE609154401F3D454B51A39F991C',
    'openclawhk': '0x769d82bf9f1e71f5df9eafe038f83436718cb82a',
    'starclawd': null,
    'hughmann': null,
    'clawdclawderberg': null,
  },
  twitter: {},
  github: {}
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform') || 'moltbook';
  const username = searchParams.get('username');

  if (!username) {
    return NextResponse.json({ error: 'username required' }, { status: 400 });
  }

  // Check local registry first (case-insensitive)
  const address = AGENT_WALLETS[platform]?.[username.toLowerCase()];

  if (address) {
    return NextResponse.json({
      platform,
      username,
      address,
      source: 'registry'
    });
  }

  return NextResponse.json({
    error: `Agent '${username}' not found on ${platform}`,
    message: 'Agent needs to register their wallet on m/payments',
    registrationUrl: 'https://www.moltbook.com/m/payments'
  }, { status: 404 });
}
