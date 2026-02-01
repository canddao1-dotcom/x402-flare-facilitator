import { NextResponse } from 'next/server';
import { resolveWallet, getAgentByName } from '@/lib/registry';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform') || 'clawly';
  const username = searchParams.get('username');

  if (!username) {
    return NextResponse.json({ error: 'username required' }, { status: 400 });
  }

  // Check shared registry (includes both seed agents and runtime registrations)
  const address = resolveWallet(platform, username);
  const agent = getAgentByName(username);

  if (address && agent) {
    return NextResponse.json({
      platform: agent.platform || platform,
      username: agent.name,
      address,
      agentId: agent.agentId,
      source: 'registry'
    });
  }

  return NextResponse.json({
    error: `Agent '${username}' not found`,
    message: 'Register at /api/agents/register to get whitelisted for tips',
    registrationUrl: 'https://clawly.market/api/agents/register'
  }, { status: 404 });
}
