#!/usr/bin/env node
/**
 * FTSO Price Daemon - Continuous background polling
 * Run with: node daemon.js &
 * Or: nohup node daemon.js > /dev/null 2>&1 &
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SKILL_DIR = path.dirname(__dirname);
const CONFIG = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'config.json'), 'utf8'));
const DATA_DIR = path.join(SKILL_DIR, CONFIG.dataDir);
const PID_FILE = path.join(SKILL_DIR, 'daemon.pid');
const POLL_INTERVAL = 90000; // 90 seconds (matches voting rounds)

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Write PID file
fs.writeFileSync(PID_FILE, process.pid.toString());

// Cleanup on exit
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

function cleanup() {
  try { fs.unlinkSync(PID_FILE); } catch (e) {}
  process.exit(0);
}

// Create reverse map: feedId -> symbol
const idToSymbol = {};
for (const [symbol, id] of Object.entries(CONFIG.feeds)) {
  idToSymbol[id.toLowerCase()] = symbol;
}

function post(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(data);
    
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 10000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Parse error: ${body.slice(0, 200)}`));
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(postData);
    req.end();
  });
}

let lastRoundId = null;
let consecutiveErrors = 0;

async function poll() {
  const feedIds = Object.values(CONFIG.feeds);
  
  try {
    const results = await post(CONFIG.api, { feed_ids: feedIds });
    
    if (!Array.isArray(results) || results.length === 0) {
      throw new Error('Empty response');
    }
    
    // Build price map
    const prices = {};
    let votingRoundId = null;
    
    for (const { body } of results) {
      if (!body) continue;
      
      votingRoundId = body.votingRoundId;
      const feedId = body.id.toLowerCase();
      const symbol = idToSymbol[feedId];
      
      if (!symbol) continue;
      prices[symbol] = body.value / Math.pow(10, body.decimals);
    }
    
    // Skip if same round (no new data)
    if (votingRoundId === lastRoundId) {
      return;
    }
    lastRoundId = votingRoundId;
    
    // Create record
    const record = {
      t: Math.floor(Date.now() / 1000),
      r: votingRoundId,
      p: prices
    };
    
    // Append to daily file
    const today = new Date().toISOString().slice(0, 10);
    const filePath = path.join(DATA_DIR, `${today}.jsonl`);
    
    fs.appendFileSync(filePath, JSON.stringify(record) + '\n');
    consecutiveErrors = 0;
    
  } catch (err) {
    consecutiveErrors++;
    console.error(`[${new Date().toISOString()}] ERROR (${consecutiveErrors}): ${err.message}`);
    
    // Exponential backoff on repeated errors
    if (consecutiveErrors >= 5) {
      console.error('Too many errors, sleeping 5 minutes...');
      await new Promise(r => setTimeout(r, 300000));
      consecutiveErrors = 0;
    }
  }
}

// Initial poll
poll();

// Schedule polls
setInterval(poll, POLL_INTERVAL);

console.log(`[${new Date().toISOString()}] FTSO daemon started (PID: ${process.pid})`);
