#!/usr/bin/env node
/**
 * Bridge Monitor Daemon
 * 
 * Tracks pending bridges and alerts when delivery should be complete.
 * Polls every 30 seconds for pending bridges.
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PENDING_FILE = path.join(DATA_DIR, 'pending-bridges.json');
const HISTORY_FILE = path.join(DATA_DIR, 'bridge-history.json');
const ALERT_FILE = path.join(DATA_DIR, 'bridge-alert.json');

const FLARE_RPC = 'https://flare-api.flare.network/ext/C/rpc';
const HYPEREVM_RPC = 'https://rpc.hyperliquid.xyz';

// Expected delivery time in seconds
const EXPECTED_DELIVERY_SECS = 300; // 5 minutes
const POLL_INTERVAL_MS = 30000; // 30 seconds

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadPending() {
  try {
    if (fs.existsSync(PENDING_FILE)) {
      return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading pending:', e.message);
  }
  return [];
}

function savePending(pending) {
  fs.writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2));
}

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading history:', e.message);
  }
  return [];
}

function saveHistory(history) {
  // Keep last 100 entries
  const trimmed = history.slice(-100);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2));
}

function writeAlert(alert) {
  fs.writeFileSync(ALERT_FILE, JSON.stringify({ ...alert, read: false }, null, 2));
}

function clearAlert() {
  if (fs.existsSync(ALERT_FILE)) {
    fs.unlinkSync(ALERT_FILE);
  }
}

async function addBridge(txHash, token, amount, recipient, srcChain = 'flare', dstChain = 'hyperevm') {
  const provider = new ethers.JsonRpcProvider(FLARE_RPC);
  
  // Get tx timestamp
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) {
    console.log('TX not found or not confirmed yet');
    return;
  }
  
  const block = await provider.getBlock(receipt.blockNumber);
  const timestamp = block.timestamp;
  
  const bridge = {
    txHash,
    token,
    amount,
    recipient,
    srcChain,
    dstChain,
    timestamp,
    expectedDelivery: timestamp + EXPECTED_DELIVERY_SECS,
    status: 'pending',
    addedAt: Date.now()
  };
  
  const pending = loadPending();
  
  // Check if already exists
  if (pending.find(p => p.txHash === txHash)) {
    console.log('Bridge already tracked');
    return;
  }
  
  pending.push(bridge);
  savePending(pending);
  
  console.log('Bridge added to tracking:');
  console.log(JSON.stringify(bridge, null, 2));
  
  return bridge;
}

async function checkPendingBridges() {
  const pending = loadPending();
  if (pending.length === 0) return;
  
  const now = Math.floor(Date.now() / 1000);
  const history = loadHistory();
  const stillPending = [];
  
  for (const bridge of pending) {
    const elapsed = now - bridge.timestamp;
    const elapsedMin = Math.floor(elapsed / 60);
    
    if (now >= bridge.expectedDelivery) {
      // Should have arrived by now
      console.log(`[${new Date().toISOString()}] Bridge ${bridge.txHash.slice(0,10)}... should be delivered`);
      console.log(`  ${bridge.amount} ${bridge.token} → ${bridge.dstChain}`);
      console.log(`  Elapsed: ${elapsedMin} minutes`);
      
      // Write alert
      writeAlert({
        type: 'bridge_delivery',
        message: `Bridge likely delivered: ${bridge.amount} ${bridge.token} → ${bridge.dstChain}`,
        txHash: bridge.txHash,
        recipient: bridge.recipient,
        elapsed: elapsedMin,
        timestamp: Date.now()
      });
      
      // Move to history
      bridge.status = 'likely_delivered';
      bridge.deliveredAt = Date.now();
      history.push(bridge);
    } else {
      // Still waiting
      const remaining = Math.ceil((bridge.expectedDelivery - now) / 60);
      console.log(`[${new Date().toISOString()}] Bridge ${bridge.txHash.slice(0,10)}... waiting (~${remaining}min remaining)`);
      stillPending.push(bridge);
    }
  }
  
  savePending(stillPending);
  if (history.length > 0) {
    saveHistory(history);
  }
}

async function listPending() {
  const pending = loadPending();
  
  if (pending.length === 0) {
    console.log('No pending bridges');
    return;
  }
  
  console.log('=== Pending Bridges ===\n');
  
  const now = Math.floor(Date.now() / 1000);
  
  for (const bridge of pending) {
    const elapsed = Math.floor((now - bridge.timestamp) / 60);
    const remaining = Math.max(0, Math.ceil((bridge.expectedDelivery - now) / 60));
    
    console.log(`TX: ${bridge.txHash}`);
    console.log(`  ${bridge.amount} ${bridge.token} → ${bridge.dstChain}`);
    console.log(`  Recipient: ${bridge.recipient}`);
    console.log(`  Elapsed: ${elapsed}min, ETA: ${remaining}min`);
    console.log('');
  }
}

async function listHistory(limit = 10) {
  const history = loadHistory();
  
  if (history.length === 0) {
    console.log('No bridge history');
    return;
  }
  
  console.log('=== Bridge History ===\n');
  
  const recent = history.slice(-limit).reverse();
  
  for (const bridge of recent) {
    const date = new Date(bridge.deliveredAt || bridge.addedAt).toISOString();
    console.log(`${date.slice(0, 16)} | ${bridge.amount} ${bridge.token} → ${bridge.dstChain} | ${bridge.status}`);
    console.log(`  TX: ${bridge.txHash}`);
    console.log('');
  }
}

async function runDaemon() {
  console.log('=== Bridge Monitor Daemon ===');
  console.log(`Poll interval: ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`Expected delivery: ${EXPECTED_DELIVERY_SECS}s`);
  console.log('');
  
  // Initial check
  await checkPendingBridges();
  
  // Poll loop
  setInterval(async () => {
    try {
      await checkPendingBridges();
    } catch (e) {
      console.error('Poll error:', e.message);
    }
  }, POLL_INTERVAL_MS);
  
  // Keep alive
  process.on('SIGINT', () => {
    console.log('\nStopping daemon...');
    process.exit(0);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  
  switch (cmd) {
    case 'daemon':
    case 'start':
      await runDaemon();
      break;
      
    case 'add':
      if (args.length < 5) {
        console.log('Usage: bridge-monitor.js add <txHash> <token> <amount> <recipient>');
        return;
      }
      await addBridge(args[1], args[2], args[3], args[4]);
      break;
      
    case 'list':
    case 'pending':
      await listPending();
      break;
      
    case 'history':
      await listHistory(parseInt(args[1]) || 10);
      break;
      
    case 'check':
      await checkPendingBridges();
      break;
      
    case 'clear-alert':
      clearAlert();
      console.log('Alert cleared');
      break;
      
    default:
      console.log(`
Bridge Monitor

Commands:
  daemon/start           Run monitor daemon (foreground)
  add <tx> <token> <amt> <recipient>  Add bridge to tracking
  list/pending           List pending bridges
  history [n]            Show last n completed bridges
  check                  Check pending bridges now
  clear-alert            Clear delivery alert

Examples:
  bridge-monitor.js daemon
  bridge-monitor.js add 0x1df1... FXRP 6.73 0x0DFa...
  bridge-monitor.js list
`);
  }
}

main().catch(console.error);
