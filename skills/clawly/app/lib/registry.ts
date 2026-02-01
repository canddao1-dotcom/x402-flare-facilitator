// Shared agent registry for both prediction market and tipping
// In production, this would be a database or Vercel KV

export interface Agent {
  agentId: string;
  name: string;
  wallet: string;
  description?: string;
  token: string;
  createdAt: string;
  platform: string;
}

// Pre-registered agents (from m/payments)
const SEED_AGENTS: Record<string, Agent> = {
  'canddaojr': {
    agentId: 'agent_canddaojr',
    name: 'CanddaoJr',
    wallet: '0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A',
    token: 'seed',
    createdAt: '2026-01-01T00:00:00Z',
    platform: 'moltbook'
  },
  'canddao': {
    agentId: 'agent_canddao',
    name: 'canddao',
    wallet: '0x3c1c84132dfdef572e74672917700c065581871d',
    token: 'seed',
    createdAt: '2026-01-01T00:00:00Z',
    platform: 'moltbook'
  },
  'openmetaloom': {
    agentId: 'agent_openmetaloom',
    name: 'OpenMetaLoom',
    wallet: '0x199E6e573700DE609154401F3D454B51A39F991C',
    token: 'seed',
    createdAt: '2026-01-01T00:00:00Z',
    platform: 'moltbook'
  },
  'openclawhk': {
    agentId: 'agent_openclawhk',
    name: 'OpenClawHK',
    wallet: '0x769d82bf9f1e71f5df9eafe038f83436718cb82a',
    token: 'seed',
    createdAt: '2026-01-01T00:00:00Z',
    platform: 'moltbook'
  },
};

// Runtime registry (adds to seed agents)
const runtimeAgents: Record<string, Agent> = {};

export function registerAgent(agent: Omit<Agent, 'agentId' | 'createdAt'>): Agent {
  const agentId = 'agent_' + Math.random().toString(36).slice(2, 18);
  const fullAgent: Agent = {
    ...agent,
    agentId,
    createdAt: new Date().toISOString(),
  };
  
  // Store by lowercase name for lookup
  const key = agent.name.toLowerCase();
  runtimeAgents[key] = fullAgent;
  
  return fullAgent;
}

export function getAgentByName(name: string): Agent | null {
  const key = name.toLowerCase();
  return runtimeAgents[key] || SEED_AGENTS[key] || null;
}

export function getAgentByWallet(wallet: string): Agent | null {
  const lowerWallet = wallet.toLowerCase();
  
  // Check runtime agents
  for (const agent of Object.values(runtimeAgents)) {
    if (agent.wallet.toLowerCase() === lowerWallet) {
      return agent;
    }
  }
  
  // Check seed agents
  for (const agent of Object.values(SEED_AGENTS)) {
    if (agent.wallet.toLowerCase() === lowerWallet) {
      return agent;
    }
  }
  
  return null;
}

export function resolveWallet(platform: string, username: string): string | null {
  const agent = getAgentByName(username);
  if (agent) {
    return agent.wallet;
  }
  return null;
}

export function getAllAgents(): Agent[] {
  return [...Object.values(SEED_AGENTS), ...Object.values(runtimeAgents)];
}
