#!/usr/bin/env node
/**
 * Order Flow Analysis - Skill Entry Point
 * Wrapper for the trading skill's order flow analyzer
 */

const { execSync } = require('child_process');
const path = require('path');

const CLI = path.join(__dirname, '..', '..', 'trading', 'scripts', 'analysis', 'order-flow-cli.js');
const args = process.argv.slice(2).join(' ');

try {
  const result = execSync(`node ${CLI} ${args}`, {
    encoding: 'utf8',
    timeout: 60000
  });
  console.log(result);
} catch (e) {
  if (e.stdout) console.log(e.stdout);
  else console.log(`❌ Error: ${e.message}`);
}
