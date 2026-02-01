#!/usr/bin/env node
/**
 * FTSO History Query - Zero dependencies
 * Query stored price history for analysis
 */

const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.dirname(__dirname);
const CONFIG = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'config.json'), 'utf8'));
const DATA_DIR = path.join(SKILL_DIR, CONFIG.dataDir);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    symbol: null,
    all: false,
    hours: null,
    days: null,
    csv: false,
    json: false,
    stats: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--all') opts.all = true;
    else if (arg === '--csv') opts.csv = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--stats') opts.stats = true;
    else if (arg === '--hours' && args[i+1]) opts.hours = parseInt(args[++i]);
    else if (arg === '--days' && args[i+1]) opts.days = parseInt(args[++i]);
    else if (!arg.startsWith('-')) opts.symbol = arg.toUpperCase();
  }
  
  // Default to 24 hours
  if (!opts.hours && !opts.days) opts.hours = 24;
  
  return opts;
}

function getDataFiles(hours, days) {
  const now = Date.now();
  const msBack = (hours || 0) * 3600000 + (days || 0) * 86400000;
  const startTime = now - msBack;
  
  const files = [];
  if (!fs.existsSync(DATA_DIR)) return files;
  
  const entries = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.jsonl')).sort();
  
  for (const filename of entries) {
    const dateStr = filename.replace('.jsonl', '');
    const fileDate = new Date(dateStr + 'T00:00:00Z').getTime();
    const nextDay = fileDate + 86400000;
    
    // Include file if it overlaps with our time range
    if (nextDay >= startTime && fileDate <= now) {
      files.push(path.join(DATA_DIR, filename));
    }
  }
  
  return files;
}

function loadRecords(files, startTs) {
  const records = [];
  
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const rec = JSON.parse(line);
        if (rec.t >= startTs) {
          records.push(rec);
        }
      } catch (e) {
        // Skip malformed lines
      }
    }
  }
  
  return records.sort((a, b) => a.t - b.t);
}

function calcStats(prices) {
  if (prices.length === 0) return null;
  
  const sorted = [...prices].sort((a, b) => a - b);
  const sum = prices.reduce((a, b) => a + b, 0);
  const mean = sum / prices.length;
  const variance = prices.reduce((acc, p) => acc + Math.pow(p - mean, 2), 0) / prices.length;
  
  return {
    count: prices.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: mean,
    stdDev: Math.sqrt(variance),
    first: prices[0],
    last: prices[prices.length - 1],
    change: ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100
  };
}

function main() {
  const opts = parseArgs();
  
  if (!opts.symbol && !opts.all) {
    console.log('Usage: query.js <SYMBOL> [--hours N] [--days N] [--csv] [--json] [--stats]');
    console.log('       query.js --all [--hours N] [--days N] [--stats]');
    console.log('\nAvailable symbols:', Object.keys(CONFIG.feeds).join(', '));
    process.exit(1);
  }
  
  const msBack = (opts.hours || 0) * 3600000 + (opts.days || 0) * 86400000;
  const startTs = Math.floor((Date.now() - msBack) / 1000);
  
  const files = getDataFiles(opts.hours, opts.days);
  if (files.length === 0) {
    console.error('No data files found. Run poll.js first.');
    process.exit(1);
  }
  
  const records = loadRecords(files, startTs);
  if (records.length === 0) {
    console.error('No records in time range.');
    process.exit(1);
  }
  
  // Stats mode for all symbols
  if (opts.stats && opts.all) {
    const allStats = {};
    for (const symbol of Object.keys(CONFIG.feeds)) {
      const prices = records.map(r => r.p[symbol]).filter(p => p !== undefined);
      if (prices.length > 0) {
        allStats[symbol] = calcStats(prices);
      }
    }
    
    console.log('\n=== FTSO Price Stats ===');
    console.log(`Period: ${opts.hours || opts.days * 24}h | Records: ${records.length}\n`);
    console.log('Symbol     Price      Change    Min        Max        StdDev');
    console.log('------     -----      ------    ---        ---        ------');
    
    for (const [sym, s] of Object.entries(allStats)) {
      const price = s.last < 0.01 ? s.last.toExponential(2) : s.last.toFixed(s.last < 1 ? 5 : 2);
      const change = s.change >= 0 ? `+${s.change.toFixed(2)}%` : `${s.change.toFixed(2)}%`;
      const min = s.min < 0.01 ? s.min.toExponential(2) : s.min.toFixed(s.min < 1 ? 5 : 2);
      const max = s.max < 0.01 ? s.max.toExponential(2) : s.max.toFixed(s.max < 1 ? 5 : 2);
      const std = s.stdDev < 0.01 ? s.stdDev.toExponential(2) : s.stdDev.toFixed(s.stdDev < 1 ? 5 : 2);
      
      console.log(`${sym.padEnd(10)} ${price.padStart(10)} ${change.padStart(8)} ${min.padStart(10)} ${max.padStart(10)} ${std.padStart(10)}`);
    }
    return;
  }
  
  // Single symbol query
  const symbol = opts.symbol;
  if (!CONFIG.feeds[symbol]) {
    console.error(`Unknown symbol: ${symbol}`);
    console.error('Available:', Object.keys(CONFIG.feeds).join(', '));
    process.exit(1);
  }
  
  const prices = records.map(r => ({ t: r.t, r: r.r, p: r.p[symbol] })).filter(x => x.p !== undefined);
  
  if (opts.stats) {
    const s = calcStats(prices.map(x => x.p));
    console.log(`\n=== ${symbol} Stats (${opts.hours || opts.days * 24}h) ===`);
    console.log(`Records: ${s.count}`);
    console.log(`Current: $${s.last}`);
    console.log(`Change:  ${s.change >= 0 ? '+' : ''}${s.change.toFixed(2)}%`);
    console.log(`Min:     $${s.min}`);
    console.log(`Max:     $${s.max}`);
    console.log(`Mean:    $${s.mean.toFixed(6)}`);
    console.log(`StdDev:  $${s.stdDev.toFixed(6)}`);
    return;
  }
  
  if (opts.csv) {
    console.log('timestamp,round,price');
    for (const p of prices) {
      console.log(`${p.t},${p.r},${p.p}`);
    }
    return;
  }
  
  if (opts.json) {
    console.log(JSON.stringify(prices, null, 2));
    return;
  }
  
  // Default: table view
  console.log(`\n=== ${symbol} History (${opts.hours || opts.days * 24}h) ===`);
  console.log(`Records: ${prices.length}\n`);
  console.log('Time                 Round      Price');
  console.log('----                 -----      -----');
  
  // Show max 50 records, evenly sampled
  const step = Math.max(1, Math.floor(prices.length / 50));
  for (let i = 0; i < prices.length; i += step) {
    const p = prices[i];
    const time = new Date(p.t * 1000).toISOString().replace('T', ' ').slice(0, 19);
    const price = p.p < 0.01 ? p.p.toExponential(4) : p.p.toFixed(p.p < 1 ? 6 : 2);
    console.log(`${time}  ${p.r}  $${price}`);
  }
}

main();
