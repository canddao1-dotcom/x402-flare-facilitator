#!/usr/bin/env node
/**
 * Lightweight LP Position Alert Monitor
 * 
 * Checks V3 positions on-chain (RPC only, no AI tokens).
 * If OUT OF RANGE → triggers full report via Clawdbot cron job.
 * Run frequently (every 10-15 min) via system cron.
 * 
 * Usage: node lp-alert.js [--trigger-job <jobId>] [--dry-run]
 */

const https = require('https');
const http = require('http');

// Configuration
const RPC_URL = 'https://flare-api.flare.network/ext/C/rpc';
const POSITION_MANAGER = '0xd9770b1c7a6ccd33c75b5bcb1c0078f46be46657';

// Positions to monitor (same as lp-manager.js)
const POSITIONS = [
  {
    id: 28509,
    name: 'DAO stXRP/FXRP',
    pool: '0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770'
  }
];

// Alert thresholds
const NEAR_EDGE_PERCENT = 10; // Alert when within 10% of bounds

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
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
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
  // positions(uint256) selector: 0x99fbab88
  const data = '0x99fbab88' + positionId.toString(16).padStart(64, '0');
  const result = await rpcCall('eth_call', [{ to: POSITION_MANAGER, data }, 'latest']);
  
  // Decode: [0]=nonce, [1]=operator, [2]=token0, [3]=token1, [4]=fee, [5]=tickLower, [6]=tickUpper
  const hex = result.slice(2);
  
  // tickLower at position 5 (bytes 160-192, hex chars 320-384)
  // tickUpper at position 6 (bytes 192-224, hex chars 384-448)
  const tickLowerHex = hex.slice(320, 384);
  const tickUpperHex = hex.slice(384, 448);
  
  // Parse as BigInt then convert to signed int24
  let tickLower = BigInt('0x' + tickLowerHex);
  let tickUpper = BigInt('0x' + tickUpperHex);
  
  // Handle 2's complement for 256-bit signed integers
  const MAX_INT256 = BigInt('0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  if (tickLower > MAX_INT256) {
    tickLower = tickLower - BigInt('0x10000000000000000000000000000000000000000000000000000000000000000');
  }
  if (tickUpper > MAX_INT256) {
    tickUpper = tickUpper - BigInt('0x10000000000000000000000000000000000000000000000000000000000000000');
  }
  
  return { tickLower: Number(tickLower), tickUpper: Number(tickUpper) };
}

async function getCurrentTick(poolAddress) {
  // slot0() selector: 0x3850c7bd
  const result = await rpcCall('eth_call', [{ to: poolAddress, data: '0x3850c7bd' }, 'latest']);
  const hex = result.slice(2);
  // slot0 returns: sqrtPriceX96 (32 bytes), tick (32 bytes), ...
  const tickHex = hex.slice(64, 128);
  const tick = parseInt(tickHex, 16);
  return tick > 0x7FFFFFFF ? tick - 0x100000000 : tick;
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

async function triggerCronJob(jobId) {
  // Trigger via Gateway API on localhost
  const gatewayUrl = process.env.CLAWDBOT_GATEWAY_URL || 'http://localhost:18789';
  const token = process.env.CLAWDBOT_GATEWAY_TOKEN || '';
  
  try {
    const result = await fetchJSON(`${gatewayUrl}/api/cron/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ jobId, force: true })
    });
    return result;
  } catch (e) {
    console.error('Failed to trigger cron job:', e.message);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const triggerJobIdx = args.indexOf('--trigger-job');
  const triggerJobId = triggerJobIdx >= 0 ? args[triggerJobIdx + 1] : null;
  
  console.log(`[${new Date().toISOString()}] LP Alert Monitor`);
  
  let needsAlert = false;
  const alerts = [];
  
  for (const pos of POSITIONS) {
    try {
      const [posData, currentTick] = await Promise.all([
        getPositionData(pos.id),
        getCurrentTick(pos.pool)
      ]);
      
      const status = getPositionStatus(currentTick, posData.tickLower, posData.tickUpper);
      
      console.log(`  ${pos.name} (#${pos.id}): ${status.emoji} ${status.status} (tick ${currentTick} in [${posData.tickLower}, ${posData.tickUpper}])`);
      
      if (!status.healthy) {
        needsAlert = true;
        alerts.push({ ...pos, ...status, currentTick, ...posData });
      }
    } catch (e) {
      console.error(`  ${pos.name}: ERROR - ${e.message}`);
    }
  }
  
  if (needsAlert) {
    console.log('\n⚠️  ALERT: Position(s) need attention!');
    
    if (triggerJobId && !dryRun) {
      console.log(`Triggering cron job: ${triggerJobId}`);
      const result = await triggerCronJob(triggerJobId);
      if (result) {
        console.log('Job triggered successfully');
      }
    } else if (dryRun) {
      console.log('(dry-run: would trigger job)');
    } else {
      console.log('No --trigger-job specified, just alerting');
    }
    
    process.exit(1); // Exit with error code for scripting
  } else {
    console.log('✅ All positions healthy');
    process.exit(0);
  }
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(2);
});
