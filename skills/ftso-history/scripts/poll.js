#!/usr/bin/env node
/**
 * FTSO Price Poller - Zero dependencies
 * Fetches current prices from Flare DA Layer and appends to daily JSONL
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SKILL_DIR = path.dirname(__dirname);
const CONFIG = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'config.json'), 'utf8'));
const DATA_DIR = path.join(SKILL_DIR, CONFIG.dataDir);

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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

async function poll() {
  const feedIds = Object.values(CONFIG.feeds);
  
  // Create reverse map: feedId -> symbol
  const idToSymbol = {};
  for (const [symbol, id] of Object.entries(CONFIG.feeds)) {
    idToSymbol[id.toLowerCase()] = symbol;
  }
  
  try {
    const results = await post(CONFIG.api, { feed_ids: feedIds });
    
    if (!Array.isArray(results) || results.length === 0) {
      throw new Error('Empty response');
    }
    
    // Build price map by matching returned ID to symbol
    const prices = {};
    let votingRoundId = null;
    
    for (const { body } of results) {
      if (!body) continue;
      
      votingRoundId = body.votingRoundId;
      const feedId = body.id.toLowerCase();
      const symbol = idToSymbol[feedId];
      
      if (!symbol) {
        console.error(`Unknown feed ID: ${body.id}`);
        continue;
      }
      
      // Convert to USD (value is integer, decimals tells us where the point goes)
      prices[symbol] = body.value / Math.pow(10, body.decimals);
    }
    
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
    
    // Quick summary
    console.log(`[${new Date().toISOString()}] Round ${votingRoundId} | ${Object.keys(prices).length} feeds | FLR=$${prices.FLR?.toFixed(5) || '?'} BTC=$${prices.BTC?.toFixed(0) || '?'}`);
    
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ERROR: ${err.message}`);
    process.exit(1);
  }
}

poll();
