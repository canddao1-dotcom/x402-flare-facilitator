/**
 * Agent Registration API
 * 
 * Agents register here to receive tips. Once approved, they can:
 * - Receive tips from the facilitator pool
 * - Send tips to other registered agents
 * 
 * This is the ONLY way to become eligible for facilitator-funded tips.
 * Funds ONLY leave the facilitator via approved tips to registered agents.
 * 
 * POST /api/register - Submit registration request
 * GET /api/register - Check registration status / list registered agents
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Persistent storage paths
const DATA_DIR = process.env.DATA_DIR || '/tmp/agent-tips';
const REGISTRY_FILE = path.join(DATA_DIR, 'agent-registry.json');
const PENDING_FILE = path.join(DATA_DIR, 'pending-registrations.json');

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Load approved agent registry
function loadRegistry() {
  ensureDataDir();
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading registry:', e);
  }
  return { agents: {}, version: 1 };
}

function saveRegistry(registry) {
  ensureDataDir();
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
}

// Load pending registrations
function loadPending() {
  ensureDataDir();
  try {
    if (fs.existsSync(PENDING_FILE)) {
      return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    }
  } catch (e) {}
  return { pending: [] };
}

function savePending(data) {
  ensureDataDir();
  fs.writeFileSync(PENDING_FILE, JSON.stringify(data, null, 2));
}

// Generate agent key (platform:username)
function getAgentKey(platform, username) {
  return `${platform.toLowerCase()}:${username.toLowerCase()}`;
}

// POST - Submit registration request
export async function POST(request) {
  try {
    const body = await request.json();
    
    const {
      platform,       // e.g., 'moltbook', 'twitter', 'discord'
      username,       // username on that platform
      evmAddress,     // wallet to receive tips
      description,    // what the agent does
      proofUrl        // link proving ownership (profile URL, etc)
    } = body;
    
    // Validate required fields
    if (!platform || !username || !evmAddress) {
      return NextResponse.json({
        error: 'Missing required fields',
        required: ['platform', 'username', 'evmAddress'],
        optional: ['description', 'proofUrl']
      }, { status: 400 });
    }
    
    // Validate EVM address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(evmAddress)) {
      return NextResponse.json({
        error: 'Invalid EVM address format'
      }, { status: 400 });
    }
    
    const agentKey = getAgentKey(platform, username);
    const normalizedAddress = evmAddress.toLowerCase();
    
    // Check if already registered
    const registry = loadRegistry();
    if (registry.agents[agentKey]) {
      return NextResponse.json({
        error: 'Agent already registered',
        agent: {
          platform,
          username,
          address: registry.agents[agentKey].evmAddress,
          registeredAt: registry.agents[agentKey].registeredAt
        }
      }, { status: 400 });
    }
    
    // Check if already pending
    const pending = loadPending();
    const existingPending = pending.pending.find(r => r.agentKey === agentKey);
    
    if (existingPending) {
      return NextResponse.json({
        status: 'pending',
        message: 'Registration already submitted and pending approval',
        submittedAt: existingPending.submittedAt,
        agentKey
      });
    }
    
    // Check if address already used by another agent
    const existingWithAddress = Object.entries(registry.agents).find(
      ([_, agent]) => agent.evmAddress.toLowerCase() === normalizedAddress
    );
    
    if (existingWithAddress) {
      return NextResponse.json({
        error: 'This wallet is already registered to another agent',
        existingAgent: existingWithAddress[0]
      }, { status: 400 });
    }
    
    // Create registration request
    const registration = {
      id: `reg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agentKey,
      platform,
      username,
      evmAddress: normalizedAddress,
      description: description || '',
      proofUrl: proofUrl || '',
      submittedAt: new Date().toISOString(),
      status: 'pending'
    };
    
    pending.pending.push(registration);
    savePending(pending);
    
    return NextResponse.json({
      status: 'pending',
      message: `Registration submitted for ${platform}:${username}`,
      registrationId: registration.id,
      agentKey,
      note: 'Once approved, you will be able to receive tips from the facilitator pool.',
      whatHappensNext: [
        '1. Admin reviews your registration',
        '2. On approval, your agent is added to the registry',
        '3. You can then receive tips via /api/tip',
        '4. Funds ONLY leave facilitator as tips to registered agents'
      ]
    });
    
  } catch (e) {
    console.error('Registration error:', e);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Check registration status or list agents
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform');
  const username = searchParams.get('username');
  const address = searchParams.get('address');
  const listAll = searchParams.get('list') === 'true';
  const listPending = searchParams.get('pending') === 'true';
  
  const registry = loadRegistry();
  const pending = loadPending();
  
  // Check specific agent by platform:username
  if (platform && username) {
    const agentKey = getAgentKey(platform, username);
    
    // Check if approved
    if (registry.agents[agentKey]) {
      const agent = registry.agents[agentKey];
      return NextResponse.json({
        registered: true,
        approved: true,
        agent: {
          platform: agent.platform,
          username: agent.username,
          evmAddress: agent.evmAddress,
          registeredAt: agent.registeredAt,
          description: agent.description
        },
        canReceiveTips: true
      });
    }
    
    // Check if pending
    const pendingReg = pending.pending.find(r => r.agentKey === agentKey);
    if (pendingReg) {
      return NextResponse.json({
        registered: false,
        pending: true,
        submittedAt: pendingReg.submittedAt,
        canReceiveTips: false
      });
    }
    
    return NextResponse.json({
      registered: false,
      pending: false,
      canReceiveTips: false,
      message: 'Agent not registered. Submit a POST request to register.'
    });
  }
  
  // Check by address
  if (address) {
    const normalized = address.toLowerCase();
    
    const agentEntry = Object.entries(registry.agents).find(
      ([_, agent]) => agent.evmAddress.toLowerCase() === normalized
    );
    
    if (agentEntry) {
      const [agentKey, agent] = agentEntry;
      return NextResponse.json({
        registered: true,
        agentKey,
        agent: {
          platform: agent.platform,
          username: agent.username,
          evmAddress: agent.evmAddress,
          registeredAt: agent.registeredAt
        },
        canReceiveTips: true
      });
    }
    
    const pendingReg = pending.pending.find(
      r => r.evmAddress.toLowerCase() === normalized
    );
    
    if (pendingReg) {
      return NextResponse.json({
        registered: false,
        pending: true,
        agentKey: pendingReg.agentKey,
        submittedAt: pendingReg.submittedAt,
        canReceiveTips: false
      });
    }
    
    return NextResponse.json({
      registered: false,
      pending: false,
      canReceiveTips: false
    });
  }
  
  // List all registered agents
  if (listAll) {
    const agents = Object.entries(registry.agents).map(([key, agent]) => ({
      agentKey: key,
      platform: agent.platform,
      username: agent.username,
      evmAddress: agent.evmAddress,
      registeredAt: agent.registeredAt,
      description: agent.description
    }));
    
    return NextResponse.json({
      count: agents.length,
      agents
    });
  }
  
  // List pending (admin only - could add auth)
  if (listPending) {
    return NextResponse.json({
      count: pending.pending.length,
      pending: pending.pending.map(r => ({
        id: r.id,
        agentKey: r.agentKey,
        platform: r.platform,
        username: r.username,
        evmAddress: r.evmAddress,
        submittedAt: r.submittedAt,
        proofUrl: r.proofUrl
      }))
    });
  }
  
  // Default: return API info
  return NextResponse.json({
    endpoint: '/api/register',
    description: 'Agent registration - register to receive tips',
    howItWorks: [
      '1. POST to register your agent (platform, username, evmAddress)',
      '2. Wait for approval',
      '3. Once approved, you can receive tips from the facilitator pool',
      '4. Funds ONLY leave facilitator via tips to registered agents'
    ],
    stats: {
      registeredAgents: Object.keys(registry.agents).length,
      pendingRegistrations: pending.pending.length
    },
    usage: {
      POST: {
        body: {
          platform: 'string (required) - e.g., moltbook, twitter',
          username: 'string (required) - your username',
          evmAddress: 'string (required) - wallet to receive tips',
          description: 'string (optional) - what your agent does',
          proofUrl: 'string (optional) - link proving ownership'
        }
      },
      GET: {
        params: {
          'platform&username': 'Check specific agent status',
          'address': 'Check by wallet address',
          'list=true': 'List all registered agents',
          'pending=true': 'List pending registrations (admin)'
        }
      }
    }
  });
}
