#!/usr/bin/env node
/**
 * LP Position Monitor Daemon
 * 
 * Runs continuously, checks positions every 15 minutes.
 * Only triggers AI report when position goes out of range.
 */

const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

const RPC_URL = 'https://flare-api.flare.network/ext/C/rpc';
const POSITION_MANAGER = '0xd9770b1c7a6ccd33c75b5bcb1c0078f46be46657';
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const CRON_JOB_ID = 'c282b11d-c3f8-4358-9ec9-fdbf9b76088d';
const TELEGRAM_ALERT = true; // Send alerts to FlareBank Telegram group
const FLAREBANK_GROUP_ID = '-1002180702192';

const POSITIONS = [
  { id: 28509, name: 'DAO stXRP/FXRP', pool: '0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770' },
  { id: 34935, name: 'Agent sFLR/WFLR', pool: '0x25b4f3930934f0a3cbb885c624ecee75a2917144' },
  { id: 34936, name: 'Agent CDP/USDT0', pool: '0x975f0369d31f1dd79abf057ad369ae7d5b9f6fb4' },
  { id: 34937, name: 'Agent WFLR/FXRP', pool: '0xb4cb11a84cfbd8f6336dc9417ac45c1f8e5b59e7' },
  { id: 34938, name: 'Agent WFLR/USDT0', pool: '0x3c2a7b76795e58829faaa034486d417dd0155162' },
  { id: 34964, name: 'Agent WFLR/FXRP (Large)', pool: '0xb4cb11a84cfbd8f6336dc9417ac45c1f8e5b59e7' },
  { id: 34965, name: 'Agent sFLR/WFLR (Large)', pool: '0x25b4f3930934f0a3cbb885c624ecee75a2917144' },
];

const NEAR_EDGE_PERCENT = 10;

// Track last alert to avoid spam
let lastAlertTime = 0;
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown between alerts

async function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function rpcCall(method, params) {
  const result = await fetchJSON(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  if (result.error) throw new Error(result.error.message);
  return result.result;
}

async function getPositionData(positionId) {
  const data = '0x99fbab88' + positionId.toString(16).padStart(64, '0');
  const result = await rpcCall('eth_call', [{ to: POSITION_MANAGER, data }, 'latest']);
  const hex = result.slice(2);
  const tickLowerHex = hex.slice(320, 384);
  const tickUpperHex = hex.slice(384, 448);
  
  let tickLower = BigInt('0x' + tickLowerHex);
  let tickUpper = BigInt('0x' + tickUpperHex);
  const MAX_INT256 = BigInt('0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  if (tickLower > MAX_INT256) tickLower = tickLower - BigInt('0x10000000000000000000000000000000000000000000000000000000000000000');
  if (tickUpper > MAX_INT256) tickUpper = tickUpper - BigInt('0x10000000000000000000000000000000000000000000000000000000000000000');
  
  return { tickLower: Number(tickLower), tickUpper: Number(tickUpper) };
}

async function getCurrentTick(poolAddress) {
  const result = await rpcCall('eth_call', [{ to: poolAddress, data: '0x3850c7bd' }, 'latest']);
  const hex = result.slice(2);
  // slot0 returns: sqrtPriceX96 (uint160), tick (int24), ...
  // tick is in the second 32-byte word, sign-extended to 256 bits
  const tickHex = hex.slice(64, 128);
  // Parse as BigInt to handle large numbers, then convert to signed int24
  const tickBigInt = BigInt('0x' + tickHex);
  const MAX_INT256 = BigInt('0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  let tick;
  if (tickBigInt > MAX_INT256) {
    // Negative number - convert from two's complement
    tick = Number(tickBigInt - BigInt('0x10000000000000000000000000000000000000000000000000000000000000000'));
  } else {
    tick = Number(tickBigInt);
  }
  return tick;
}

function getPositionStatus(currentTick, tickLower, tickUpper) {
  if (currentTick < tickLower || currentTick > tickUpper) {
    return { status: 'OUT_OF_RANGE', emoji: '🔴', healthy: false };
  }
  const range = tickUpper - tickLower;
  const positionInRange = currentTick - tickLower;
  const percentFromLower = (positionInRange / range) * 100;
  if (percentFromLower < NEAR_EDGE_PERCENT || percentFromLower > (100 - NEAR_EDGE_PERCENT)) {
    return { status: 'NEAR_EDGE', emoji: '🟡', healthy: false, percent: percentFromLower.toFixed(1) };
  }
  return { status: 'HEALTHY', emoji: '🟢', healthy: true, percent: percentFromLower.toFixed(1) };
}

async function triggerCronJob() {
  const gatewayUrl = process.env.CLAWDBOT_GATEWAY_URL || 'http://localhost:18789';
  try {
    const result = await fetchJSON(`${gatewayUrl}/api/cron/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: CRON_JOB_ID, force: true })
    });
    console.log(`  → Triggered cron job: ${JSON.stringify(result)}`);
    return true;
  } catch (e) {
    console.error(`  → Failed to trigger: ${e.message}`);
    return false;
  }
}

async function sendTelegramAlert(positionResults) {
  if (!TELEGRAM_ALERT) return;
  
  try {
    // Build alert message
    const outOfRange = positionResults.filter(p => p.status === 'OUT_OF_RANGE');
    const nearEdge = positionResults.filter(p => p.status === 'NEAR_EDGE');
    
    let msg = '';
    if (outOfRange.length > 0) {
      msg = `🚨 **LP ALERT: ${outOfRange.length} position(s) OUT OF RANGE**\n\n`;
      outOfRange.forEach(p => {
        msg += `• **${p.name}** (#${p.id})\n`;
      });
    } else if (nearEdge.length > 0) {
      msg = `⚠️ **LP ALERT: ${nearEdge.length} position(s) near edge**\n\n`;
      nearEdge.forEach(p => {
        msg += `• **${p.name}** (#${p.id}) at ${p.percent}%\n`;
      });
    }
    
    msg += `\n_Check: /lp or wait for full report_`;
    
    // Send via gateway
    const gatewayUrl = process.env.CLAWDBOT_GATEWAY_URL || 'http://localhost:18789';
    const result = await fetchJSON(`${gatewayUrl}/api/message/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'telegram',
        to: FLAREBANK_GROUP_ID,
        message: msg
      })
    });
    console.log(`  📤 Telegram alert sent: ${JSON.stringify(result)}`);
  } catch (e) {
    console.error(`  ❌ Telegram alert failed: ${e.message}`);
  }
}

async function checkPositions() {
  const now = new Date();
  console.log(`[${now.toISOString()}] Checking positions...`);
  
  let needsAlert = false;
  const positionResults = [];
  
  for (const pos of POSITIONS) {
    try {
      const [posData, currentTick] = await Promise.all([
        getPositionData(pos.id),
        getCurrentTick(pos.pool)
      ]);
      const status = getPositionStatus(currentTick, posData.tickLower, posData.tickUpper);
      console.log(`  ${pos.name}: ${status.emoji} ${status.status} (tick ${currentTick} in [${posData.tickLower}, ${posData.tickUpper}])`);
      
      positionResults.push({
        id: pos.id,
        name: pos.name,
        status: status.status,
        percent: status.percent || null,
        currentTick,
        tickLower: posData.tickLower,
        tickUpper: posData.tickUpper
      });
      
      if (!status.healthy) needsAlert = true;
    } catch (e) {
      console.error(`  ${pos.name}: ERROR - ${e.message}`);
    }
  }
  
  if (needsAlert) {
    const timeSinceLastAlert = Date.now() - lastAlertTime;
    if (timeSinceLastAlert > ALERT_COOLDOWN_MS) {
      console.log('  ⚠️ ALERT: Triggering full report...');
      if (await triggerCronJob()) {
        lastAlertTime = Date.now();
      }
      // Also send Telegram alert
      await sendTelegramAlert(positionResults);
    } else {
      const cooldownRemaining = Math.round((ALERT_COOLDOWN_MS - timeSinceLastAlert) / 60000);
      console.log(`  ⚠️ Alert needed but in cooldown (${cooldownRemaining}m remaining)`);
    }
  }
}

async function main() {
  console.log('🚀 LP Monitor Daemon started');
  console.log(`   Check interval: ${CHECK_INTERVAL_MS / 60000} minutes`);
  console.log(`   Alert cooldown: ${ALERT_COOLDOWN_MS / 60000} minutes`);
  console.log(`   Positions: ${POSITIONS.map(p => p.name).join(', ')}`);
  console.log('');
  
  // Initial check
  await checkPositions();
  
  // Schedule recurring checks
  setInterval(checkPositions, CHECK_INTERVAL_MS);
  
  // Keep alive
  process.on('SIGTERM', () => { console.log('Received SIGTERM, shutting down'); process.exit(0); });
  process.on('SIGINT', () => { console.log('Received SIGINT, shutting down'); process.exit(0); });
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
