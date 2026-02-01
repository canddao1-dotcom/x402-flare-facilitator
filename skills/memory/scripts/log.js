#!/usr/bin/env node
/**
 * Memory Logger - Structured event logging
 * 
 * Usage:
 *   node log.js --type TX --action SEND --details "100 BANK → 0x..." --tx "0x..."
 *   node log.js --type DECISION --details "Rebalance position - price near edge"
 *   node log.js --type ALERT --details "Position OUT OF RANGE"
 *   node log.js --type ERROR --details "Swap failed" --reason "slippage"
 */

const fs = require('fs');
const path = require('path');

const MEMORY_DIR = '/home/node/clawd/memory';
const TRANSACTIONS_FILE = path.join(MEMORY_DIR, 'transactions.md');
const DECISIONS_FILE = path.join(MEMORY_DIR, 'decisions.md');
const ERRORS_FILE = path.join(MEMORY_DIR, 'errors.md');

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : null;
  };
  return {
    type: get('--type') || 'NOTE',
    action: get('--action'),
    details: get('--details'),
    tx: get('--tx'),
    reason: get('--reason'),
    amount: get('--amount'),
    token: get('--token'),
    to: get('--to'),
    from: get('--from'),
  };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getTodayFile() {
  const today = new Date().toISOString().split('T')[0];
  return path.join(MEMORY_DIR, `${today}.md`);
}

function getTimestamp() {
  return new Date().toISOString().replace('T', ' ').split('.')[0] + ' UTC';
}

function formatEntry(args) {
  const { type, action, details, tx, reason } = args;
  const timestamp = getTimestamp();
  
  let entry = `[${timestamp}] [${type}]`;
  
  if (action) {
    entry += ` ${action}`;
  }
  
  if (details) {
    entry += ` | ${details}`;
  }
  
  if (tx) {
    entry += ` | tx: ${tx}`;
  }
  
  if (reason) {
    entry += ` | reason: ${reason}`;
  }
  
  return entry;
}

function appendToFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  
  // Check if file exists and has content
  let prefix = '';
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf8');
    if (existing.length > 0 && !existing.endsWith('\n')) {
      prefix = '\n';
    }
  }
  
  fs.appendFileSync(filePath, prefix + content + '\n');
}

function initFileWithHeader(filePath, header) {
  if (!fs.existsSync(filePath)) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, header + '\n\n');
  }
}

function logTransaction(args, entry) {
  initFileWithHeader(TRANSACTIONS_FILE, '# Transaction Log\n\nAll on-chain transactions with context.');
  
  const txEntry = args.tx 
    ? `| ${getTimestamp()} | ${args.action || 'TX'} | ${args.details || ''} | [${args.tx.slice(0, 10)}...](https://flarescan.com/tx/${args.tx}) |`
    : entry;
  
  appendToFile(TRANSACTIONS_FILE, txEntry);
}

function logDecision(entry) {
  initFileWithHeader(DECISIONS_FILE, '# Decision Log\n\nImportant decisions and rationale.');
  appendToFile(DECISIONS_FILE, entry);
}

function logError(args, entry) {
  initFileWithHeader(ERRORS_FILE, '# Error Log\n\nMistakes and lessons learned.');
  
  const errorEntry = `\n### ${getTimestamp()}\n**Error:** ${args.details || 'Unknown'}\n**Reason:** ${args.reason || 'Unknown'}\n**TX:** ${args.tx || 'N/A'}\n`;
  appendToFile(ERRORS_FILE, errorEntry);
}

function main() {
  const args = parseArgs();
  
  if (!args.details && !args.action) {
    console.error('Usage: node log.js --type <TYPE> --details "description" [--action ACTION] [--tx HASH]');
    console.error('Types: TX, DECISION, ALERT, ERROR, NOTE');
    process.exit(1);
  }
  
  const entry = formatEntry(args);
  
  // Always log to daily file
  const todayFile = getTodayFile();
  initFileWithHeader(todayFile, `# Memory Log - ${new Date().toISOString().split('T')[0]}`);
  appendToFile(todayFile, entry);
  
  // Also log to specialized files based on type
  switch (args.type.toUpperCase()) {
    case 'TX':
    case 'TRANSACTION':
      logTransaction(args, entry);
      break;
    case 'DECISION':
      logDecision(entry);
      break;
    case 'ERROR':
      logError(args, entry);
      break;
  }
  
  console.log('✅ Logged:', entry);
}

main();
