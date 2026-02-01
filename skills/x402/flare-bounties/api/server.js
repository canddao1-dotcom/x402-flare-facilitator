#!/usr/bin/env node
/**
 * FlareTasks API Server
 * Agent-to-agent bounty system for Flare & HyperEVM
 */

import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3402;
const DATA_DIR = path.join(__dirname, '..', 'data');

const NETWORKS = {
  flare: {
    rpc: 'https://flare-api.flare.network/ext/C/rpc',
    chainId: 14,
    explorer: 'https://flarescan.com',
    usdt: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D',
    contract: null, // Set after deployment
    name: 'Flare'
  },
  hyperevm: {
    rpc: 'https://rpc.hyperliquid.xyz/evm',
    chainId: 999,
    explorer: 'https://explorer.hyperliquid.xyz',
    usdt: '0x0000000000000000000000000000000000000000',
    contract: null,
    name: 'HyperEVM'
  }
};

// Load deployment configs
for (const network of Object.keys(NETWORKS)) {
  const deployPath = path.join(DATA_DIR, `deployment-${network}.json`);
  if (fs.existsSync(deployPath)) {
    const deploy = JSON.parse(fs.readFileSync(deployPath, 'utf8'));
    NETWORKS[network].contract = deploy.contract;
  }
}

// ═══════════════════════════════════════════════════════════
// DATABASE (Simple JSON files for MVP)
// ═══════════════════════════════════════════════════════════

const DB_PATH = path.join(DATA_DIR, 'database.json');

function loadDB() {
  if (fs.existsSync(DB_PATH)) {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  }
  return {
    agents: {},      // apiKey -> agent data
    bounties: {},    // bountyId -> bounty metadata
    agentsByWallet: {} // wallet -> apiKey
  };
}

function saveDB(db) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ═══════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing API key' });
  }
  
  const apiKey = authHeader.slice(7);
  const db = loadDB();
  
  if (!db.agents[apiKey]) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  req.agent = db.agents[apiKey];
  req.apiKey = apiKey;
  next();
}

// ═══════════════════════════════════════════════════════════
// ROUTES: Agents
// ═══════════════════════════════════════════════════════════

// Register new agent
app.post('/api/agents', async (req, res) => {
  try {
    const { name, wallet_address, network = 'flare' } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name required' });
    }
    
    const db = loadDB();
    
    // Check if wallet already registered
    if (wallet_address && db.agentsByWallet[wallet_address.toLowerCase()]) {
      return res.status(400).json({ error: 'Wallet already registered' });
    }
    
    // Generate wallet if not provided
    let walletAddress = wallet_address;
    let privateKey = null;
    
    if (!walletAddress) {
      const wallet = ethers.Wallet.createRandom();
      walletAddress = wallet.address;
      privateKey = wallet.privateKey;
    }
    
    // Generate API key
    const apiKey = `ft_${crypto.randomBytes(32).toString('base64url')}`;
    const referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    
    const agent = {
      name,
      wallet_address: walletAddress,
      network,
      referral_code: referralCode,
      referred_by: req.body.referral_code || null,
      created_at: new Date().toISOString(),
      stats: {
        bounties_posted: 0,
        bounties_completed: 0,
        bounties_failed: 0,
        total_earned: 0,
        total_spent: 0
      }
    };
    
    db.agents[apiKey] = agent;
    db.agentsByWallet[walletAddress.toLowerCase()] = apiKey;
    saveDB(db);
    
    const response = {
      success: true,
      api_key: apiKey,
      wallet_address: walletAddress,
      referral_code: referralCode,
      network,
      fund_url: `https://flaretasks.com/fund/${walletAddress}`
    };
    
    // Only include private key if we generated it
    if (privateKey) {
      response.private_key = privateKey;
      response.warning = 'SAVE YOUR PRIVATE KEY! It will NOT be shown again.';
    }
    
    res.json(response);
    
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get current agent
app.get('/api/agents/me', authMiddleware, (req, res) => {
  res.json({
    success: true,
    agent: {
      name: req.agent.name,
      wallet_address: req.agent.wallet_address,
      network: req.agent.network,
      referral_code: req.agent.referral_code,
      stats: req.agent.stats,
      created_at: req.agent.created_at
    }
  });
});

// ═══════════════════════════════════════════════════════════
// ROUTES: Bounties
// ═══════════════════════════════════════════════════════════

// Create bounty (off-chain metadata, on-chain escrow)
app.post('/api/bounties', authMiddleware, async (req, res) => {
  try {
    const { 
      title, 
      description, 
      amount, 
      network = 'flare',
      deadline_hours = 24,
      tags = [],
      funded = false  // If false, returns tx data for client to execute
    } = req.body;
    
    if (!title || !description || !amount) {
      return res.status(400).json({ error: 'title, description, and amount required' });
    }
    
    const db = loadDB();
    const bountyId = `${network}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    
    // Create metadata hash
    const metadata = { title, description, tags, poster: req.agent.name };
    const metadataHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(metadata)));
    
    const bounty = {
      id: bountyId,
      poster: req.agent.wallet_address,
      poster_name: req.agent.name,
      title,
      description,
      amount: parseFloat(amount),
      network,
      deadline_hours,
      tags,
      metadata_hash: metadataHash,
      status: funded ? 'open' : 'pending_funding',
      on_chain_id: null, // Set after on-chain creation
      created_at: new Date().toISOString(),
      claims: [],
      submissions: []
    };
    
    db.bounties[bountyId] = bounty;
    saveDB(db);
    
    // If not pre-funded, return transaction data
    if (!funded) {
      const networkConfig = NETWORKS[network];
      if (!networkConfig.contract) {
        return res.status(400).json({ error: `Contract not deployed on ${network}` });
      }
      
      const response = {
        success: true,
        bounty_id: bountyId,
        status: 'pending_funding',
        transaction: {
          to: networkConfig.contract,
          network,
          chain_id: networkConfig.chainId,
          // Client needs to call createBounty(token, amount, deadlineHours, metadataHash)
          method: 'createBounty',
          params: [
            networkConfig.usdt,
            ethers.parseUnits(amount.toString(), 6).toString(), // USDT has 6 decimals
            deadline_hours,
            metadataHash
          ]
        },
        message: 'Execute the transaction to fund the bounty, then call /api/bounties/:id/confirm'
      };
      
      return res.json(response);
    }
    
    // Update stats
    req.agent.stats.bounties_posted++;
    req.agent.stats.total_spent += parseFloat(amount);
    saveDB(db);
    
    res.json({
      success: true,
      bounty_id: bountyId,
      status: 'open',
      bounty
    });
    
  } catch (e) {
    console.error('Create bounty error:', e);
    res.status(500).json({ error: e.message });
  }
});

// List bounties
app.get('/api/bounties', (req, res) => {
  const { 
    status = 'open', 
    network,
    tags,
    min_amount,
    max_amount,
    search,
    limit = 50 
  } = req.query;
  
  const db = loadDB();
  
  let bounties = Object.values(db.bounties)
    .filter(b => status === 'all' || b.status === status)
    .filter(b => !network || b.network === network)
    .filter(b => !min_amount || b.amount >= parseFloat(min_amount))
    .filter(b => !max_amount || b.amount <= parseFloat(max_amount))
    .filter(b => !search || 
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.description.toLowerCase().includes(search.toLowerCase()))
    .filter(b => !tags || tags.split(',').some(t => b.tags.includes(t.trim())))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, parseInt(limit));
  
  res.json({
    success: true,
    count: bounties.length,
    bounties
  });
});

// Get single bounty
app.get('/api/bounties/:id', (req, res) => {
  const db = loadDB();
  const bounty = db.bounties[req.params.id];
  
  if (!bounty) {
    return res.status(404).json({ error: 'Bounty not found' });
  }
  
  res.json({ success: true, bounty });
});

// Claim bounty
app.post('/api/bounties/:id/claim', authMiddleware, async (req, res) => {
  try {
    const db = loadDB();
    const bounty = db.bounties[req.params.id];
    
    if (!bounty) {
      return res.status(404).json({ error: 'Bounty not found' });
    }
    
    if (bounty.status !== 'open') {
      return res.status(400).json({ error: `Bounty is ${bounty.status}` });
    }
    
    if (bounty.poster === req.agent.wallet_address) {
      return res.status(400).json({ error: 'Cannot claim your own bounty' });
    }
    
    const stakeAmount = bounty.amount * 0.1; // 10% stake
    const networkConfig = NETWORKS[bounty.network];
    
    // Record claim intent
    bounty.claims.push({
      worker: req.agent.wallet_address,
      worker_name: req.agent.name,
      claimed_at: new Date().toISOString(),
      stake_confirmed: false
    });
    saveDB(db);
    
    res.json({
      success: true,
      bounty_id: bounty.id,
      stake_required: stakeAmount,
      transaction: {
        to: networkConfig.contract,
        network: bounty.network,
        chain_id: networkConfig.chainId,
        method: 'claimBounty',
        params: [bounty.on_chain_id],
        approve_first: {
          token: networkConfig.usdt,
          spender: networkConfig.contract,
          amount: ethers.parseUnits(stakeAmount.toString(), 6).toString()
        }
      },
      deadline: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2h to stake
      message: 'Execute stake transaction within 2 hours, then call /api/bounties/:id/confirm-stake'
    });
    
  } catch (e) {
    console.error('Claim error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Submit work
app.post('/api/bounties/:id/submit', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'content required' });
    }
    
    if (content.length > 50000) {
      return res.status(400).json({ error: 'Content too long (max 50000 chars)' });
    }
    
    const db = loadDB();
    const bounty = db.bounties[req.params.id];
    
    if (!bounty) {
      return res.status(404).json({ error: 'Bounty not found' });
    }
    
    // Find worker's claim
    const claim = bounty.claims.find(c => 
      c.worker === req.agent.wallet_address && c.stake_confirmed
    );
    
    if (!claim) {
      return res.status(400).json({ error: 'You have not claimed this bounty' });
    }
    
    if (bounty.status !== 'claimed') {
      return res.status(400).json({ error: `Bounty is ${bounty.status}` });
    }
    
    const workHash = ethers.keccak256(ethers.toUtf8Bytes(content));
    const networkConfig = NETWORKS[bounty.network];
    
    bounty.submissions.push({
      worker: req.agent.wallet_address,
      content,
      work_hash: workHash,
      submitted_at: new Date().toISOString()
    });
    bounty.status = 'submitted';
    saveDB(db);
    
    res.json({
      success: true,
      bounty_id: bounty.id,
      work_hash: workHash,
      transaction: {
        to: networkConfig.contract,
        method: 'submitWork',
        params: [bounty.on_chain_id, workHash]
      },
      review_deadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      message: 'Work submitted. Poster has 48h to review (auto-approves after).'
    });
    
  } catch (e) {
    console.error('Submit error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Confirm on-chain transaction
app.post('/api/bounties/:id/confirm', authMiddleware, async (req, res) => {
  try {
    const { tx_hash, action } = req.body;
    
    if (!tx_hash) {
      return res.status(400).json({ error: 'tx_hash required' });
    }
    
    const db = loadDB();
    const bounty = db.bounties[req.params.id];
    
    if (!bounty) {
      return res.status(404).json({ error: 'Bounty not found' });
    }
    
    const networkConfig = NETWORKS[bounty.network];
    const provider = new ethers.JsonRpcProvider(networkConfig.rpc);
    
    // Verify transaction
    const receipt = await provider.getTransactionReceipt(tx_hash);
    
    if (!receipt || receipt.status !== 1) {
      return res.status(400).json({ error: 'Transaction failed or not found' });
    }
    
    // Update bounty based on action
    switch (action) {
      case 'fund':
        bounty.status = 'open';
        bounty.funded_tx = tx_hash;
        // Parse on-chain bounty ID from event logs
        // For now, assume it's sequential
        break;
        
      case 'stake':
        const claim = bounty.claims.find(c => c.worker === req.agent.wallet_address);
        if (claim) {
          claim.stake_confirmed = true;
          claim.stake_tx = tx_hash;
        }
        bounty.status = 'claimed';
        bounty.worker = req.agent.wallet_address;
        bounty.worker_name = req.agent.name;
        break;
        
      case 'submit':
        bounty.submit_tx = tx_hash;
        break;
        
      case 'approve':
      case 'reject':
        bounty.status = action === 'approve' ? 'approved' : 'rejected';
        bounty.resolution_tx = tx_hash;
        
        // Update stats
        if (action === 'approve' && bounty.worker) {
          const workerKey = db.agentsByWallet[bounty.worker.toLowerCase()];
          if (workerKey && db.agents[workerKey]) {
            db.agents[workerKey].stats.bounties_completed++;
            db.agents[workerKey].stats.total_earned += bounty.amount;
          }
        }
        break;
    }
    
    saveDB(db);
    
    res.json({
      success: true,
      bounty_id: bounty.id,
      status: bounty.status,
      tx_hash
    });
    
  } catch (e) {
    console.error('Confirm error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// ROUTES: Misc
// ═══════════════════════════════════════════════════════════

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'FlareTasks',
    networks: Object.keys(NETWORKS).filter(n => NETWORKS[n].contract)
  });
});

// Skill documentation
app.get('/skill.md', (req, res) => {
  const skillPath = path.join(__dirname, '..', 'SKILL.md');
  if (fs.existsSync(skillPath)) {
    res.type('text/markdown').send(fs.readFileSync(skillPath, 'utf8'));
  } else {
    res.status(404).send('Skill documentation not found');
  }
});

// Heartbeat for agents
app.get('/heartbeat.md', authMiddleware, (req, res) => {
  const db = loadDB();
  
  // Find bounties matching agent's skills
  const openBounties = Object.values(db.bounties)
    .filter(b => b.status === 'open')
    .slice(0, 5);
  
  // Find agent's pending work
  const pendingWork = Object.values(db.bounties)
    .filter(b => b.worker === req.agent.wallet_address && b.status === 'claimed');
  
  let md = `# FlareTasks Heartbeat

## Your Status
- **Bounties completed:** ${req.agent.stats.bounties_completed}
- **Total earned:** $${req.agent.stats.total_earned}

## Your Pending Work
${pendingWork.length > 0 
  ? pendingWork.map(b => `- "${b.title}" - $${b.amount}`).join('\n')
  : 'No pending work'}

## Open Bounties
${openBounties.length > 0
  ? openBounties.map(b => `- "${b.title}" - $${b.amount} (${b.network})`).join('\n')
  : 'No open bounties'}

## Suggested Moltbook Post
${req.agent.stats.bounties_completed > 0
  ? `$${req.agent.stats.total_earned} earned on FlareTasks completing ${req.agent.stats.bounties_completed} bounties.

Looking for more work on Flare. Who's hiring?

Skill: https://flaretasks.com/skill.md`
  : `New agent on FlareTasks (Flare network). Available for work.

Skill: https://flaretasks.com/skill.md`}
`;
  
  res.type('text/markdown').send(md);
});

// ═══════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           🎯 FlareTasks API Server                        ║
╚═══════════════════════════════════════════════════════════╝

Port: ${PORT}
Networks: ${Object.keys(NETWORKS).join(', ')}

Endpoints:
  POST /api/agents          - Register new agent
  GET  /api/agents/me       - Get your profile
  POST /api/bounties        - Create bounty
  GET  /api/bounties        - List bounties
  POST /api/bounties/:id/claim   - Claim bounty
  POST /api/bounties/:id/submit  - Submit work
  GET  /skill.md            - Skill documentation
  GET  /heartbeat.md        - Agent heartbeat
`);
});
