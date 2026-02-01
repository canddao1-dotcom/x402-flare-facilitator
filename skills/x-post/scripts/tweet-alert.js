#!/usr/bin/env node
/**
 * Tweet Alert Script
 * Called by LP daemon when positions need attention
 * 
 * Usage: node tweet-alert.js --type <alert|status> [--positions <json>] [--confirm]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const POST_SCRIPT = path.join(__dirname, 'post.js');
const RATE_LIMIT_PATH = '/home/node/clawd/.secrets/x-rate-limit.json';

// Parse args
const args = process.argv.slice(2);
let type = 'status';
let positions = [];
let confirm = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--type' && args[i + 1]) type = args[++i];
  if (args[i] === '--positions' && args[i + 1]) positions = JSON.parse(args[++i]);
  if (args[i] === '--confirm') confirm = true;
}

function formatPositionStatus(positions) {
  const lines = ['📊 LP Position Check\n'];
  
  // Group by status
  const healthy = positions.filter(p => p.status === 'HEALTHY');
  const nearEdge = positions.filter(p => p.status === 'NEAR_EDGE');
  const outOfRange = positions.filter(p => p.status === 'OUT_OF_RANGE');
  
  for (const p of outOfRange) {
    lines.push(`❌ ${p.name}: OUT OF RANGE`);
  }
  for (const p of nearEdge) {
    lines.push(`⚠️ ${p.name}: NEAR EDGE (${p.percent}%)`);
  }
  
  // Summarize healthy
  if (healthy.length > 0 && (nearEdge.length > 0 || outOfRange.length > 0)) {
    lines.push(`✅ ${healthy.length} others: IN RANGE`);
  } else if (healthy.length === positions.length) {
    lines.push(`✅ All ${healthy.length} positions IN RANGE`);
  }
  
  // Add action hint
  if (outOfRange.length > 0) {
    lines.push('\nRebalance needed 🔄');
  } else if (nearEdge.length > 0) {
    lines.push('\nMonitoring closely 👀');
  }
  
  return lines.join('\n');
}

function formatAlertTweet(positions) {
  const outOfRange = positions.filter(p => p.status === 'OUT_OF_RANGE');
  const nearEdge = positions.filter(p => p.status === 'NEAR_EDGE');
  
  if (outOfRange.length > 0) {
    const names = outOfRange.map(p => p.name.replace('Agent ', '')).join(', ');
    return `🚨 LP Alert: ${outOfRange.length} position${outOfRange.length > 1 ? 's' : ''} OUT OF RANGE

${names}

Evaluating rebalance options on @enosys_global`;
  }
  
  if (nearEdge.length > 0) {
    const names = nearEdge.map(p => `${p.name.replace('Agent ', '')} (${p.percent}%)`).join('\n');
    return `⚠️ LP positions approaching edge

${names}

Monitoring on @enosys_global`;
  }
  
  return null;
}

function checkDailyLimit() {
  try {
    const data = JSON.parse(fs.readFileSync(RATE_LIMIT_PATH, 'utf8'));
    const today = new Date().toISOString().split('T')[0];
    if (data.date === today && data.count >= 5) {
      console.log('Daily tweet limit reached (5/5)');
      return false;
    }
  } catch {}
  return true;
}

function tweet(text, shouldConfirm) {
  if (!checkDailyLimit()) return false;
  
  const confirmFlag = shouldConfirm ? '--confirm' : '';
  const cmd = `node "${POST_SCRIPT}" "${text.replace(/"/g, '\\"')}" ${confirmFlag}`;
  
  try {
    const result = execSync(cmd, { encoding: 'utf8' });
    console.log(result);
    return result.includes('Posted successfully') || result.includes('DRY RUN');
  } catch (e) {
    console.error('Tweet failed:', e.message);
    return false;
  }
}

// Main
if (type === 'alert' && positions.length > 0) {
  const text = formatAlertTweet(positions);
  if (text) {
    console.log('Alert tweet:');
    tweet(text, confirm);
  } else {
    console.log('No alert needed');
  }
} else if (type === 'status' && positions.length > 0) {
  const text = formatPositionStatus(positions);
  console.log('Status tweet:');
  tweet(text, confirm);
} else {
  console.log('Usage: node tweet-alert.js --type <alert|status> --positions <json> [--confirm]');
}
