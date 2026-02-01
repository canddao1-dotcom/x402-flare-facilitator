/**
 * Agent Onboarding API
 * 
 * Handles starter fund requests for new agents.
 * POST /api/onboard - Request starter funds
 * GET /api/onboard - Check onboarding status
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Onboard queue file (persisted)
const QUEUE_FILE = process.env.ONBOARD_QUEUE_FILE || '/tmp/onboard-queue.json';
const ONBOARDED_FILE = process.env.ONBOARDED_FILE || '/tmp/onboarded-agents.json';

// Starter fund limits
const STARTER_AMOUNT = '1'; // 1 USDT
const MAX_STARTER_PER_WALLET = 1; // One-time only

function loadQueue() {
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
    }
  } catch (e) {}
  return { pending: [], processed: [] };
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

function loadOnboarded() {
  try {
    if (fs.existsSync(ONBOARDED_FILE)) {
      return JSON.parse(fs.readFileSync(ONBOARDED_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveOnboarded(data) {
  fs.writeFileSync(ONBOARDED_FILE, JSON.stringify(data, null, 2));
}

// POST - Submit onboarding request
export async function POST(request) {
  try {
    const body = await request.json();
    
    const {
      agentName,
      agentId,
      evmAddress,
      solanaAddress,
      description,
      requestType
    } = body;
    
    // Validate required fields
    if (!agentName || !evmAddress) {
      return NextResponse.json(
        { error: 'agentName and evmAddress required' },
        { status: 400 }
      );
    }
    
    // Normalize address
    const normalizedAddress = evmAddress.toLowerCase();
    
    // Check if already onboarded
    const onboarded = loadOnboarded();
    if (onboarded[normalizedAddress]) {
      return NextResponse.json({
        error: 'Wallet already received starter funds',
        previousRequest: onboarded[normalizedAddress]
      }, { status: 400 });
    }
    
    // Check if already in queue
    const queue = loadQueue();
    const existingPending = queue.pending.find(
      r => r.evmAddress.toLowerCase() === normalizedAddress
    );
    
    if (existingPending) {
      return NextResponse.json({
        queued: true,
        message: 'Request already in queue',
        position: queue.pending.indexOf(existingPending) + 1,
        submittedAt: existingPending.submittedAt
      });
    }
    
    // Add to queue
    const request_record = {
      id: `onboard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agentName,
      agentId: agentId || agentName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      evmAddress,
      solanaAddress,
      description,
      requestType: requestType || 'starter_funds',
      amount: STARTER_AMOUNT,
      token: 'USDT',
      network: 'flare',
      submittedAt: new Date().toISOString(),
      status: 'pending',
      ip: request.headers.get('x-forwarded-for') || 'unknown'
    };
    
    queue.pending.push(request_record);
    saveQueue(queue);
    
    return NextResponse.json({
      queued: true,
      message: `Welcome ${agentName}! Your starter funds request has been queued.`,
      requestId: request_record.id,
      position: queue.pending.length,
      amount: STARTER_AMOUNT,
      token: 'USDT',
      network: 'flare',
      note: 'Requests are processed periodically. You\'ll receive funds to your EVM address shortly.'
    });
    
  } catch (e) {
    console.error('Onboard error:', e);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Check onboarding status or queue
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  const requestId = searchParams.get('id');
  
  const queue = loadQueue();
  const onboarded = loadOnboarded();
  
  // Check specific request
  if (requestId) {
    const pending = queue.pending.find(r => r.id === requestId);
    if (pending) {
      return NextResponse.json({
        status: 'pending',
        position: queue.pending.indexOf(pending) + 1,
        request: {
          ...pending,
          ip: undefined // Don't expose IP
        }
      });
    }
    
    const processed = queue.processed.find(r => r.id === requestId);
    if (processed) {
      return NextResponse.json({
        status: processed.status,
        request: {
          ...processed,
          ip: undefined
        }
      });
    }
    
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }
  
  // Check by address
  if (address) {
    const normalized = address.toLowerCase();
    
    if (onboarded[normalized]) {
      return NextResponse.json({
        onboarded: true,
        ...onboarded[normalized]
      });
    }
    
    const pending = queue.pending.find(
      r => r.evmAddress.toLowerCase() === normalized
    );
    
    if (pending) {
      return NextResponse.json({
        onboarded: false,
        queued: true,
        position: queue.pending.indexOf(pending) + 1,
        submittedAt: pending.submittedAt
      });
    }
    
    return NextResponse.json({
      onboarded: false,
      queued: false,
      eligible: true,
      message: 'Address eligible for starter funds'
    });
  }
  
  // Return queue stats (no sensitive data)
  return NextResponse.json({
    endpoint: '/api/onboard',
    description: 'Agent onboarding - request starter funds',
    stats: {
      pendingRequests: queue.pending.length,
      processedTotal: queue.processed.length,
      onboardedAgents: Object.keys(onboarded).length
    },
    starterFunds: {
      amount: STARTER_AMOUNT,
      token: 'USDT',
      network: 'Flare',
      limit: `${MAX_STARTER_PER_WALLET} per wallet`
    },
    usage: {
      POST: {
        body: {
          agentName: 'string (required)',
          evmAddress: 'string (required)',
          agentId: 'string (optional)',
          solanaAddress: 'string (optional)',
          description: 'string (optional)'
        }
      },
      GET: {
        params: {
          address: 'Check status by wallet address',
          id: 'Check status by request ID'
        }
      }
    }
  });
}
