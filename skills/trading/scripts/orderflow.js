#!/usr/bin/env node
/**
 * Order Flow Skill Entry Point
 * Wrapper for /orderflow commands
 */

const path = require('path');
const { execSync } = require('child_process');

const CLI = path.join(__dirname, 'analysis', 'order-flow-cli.js');
const args = process.argv.slice(2).join(' ');

try {
  const result = execSync(`node ${CLI} ${args}`, {
    encoding: 'utf8',
    timeout: 60000,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  console.log(result);
} catch (e) {
  if (e.stdout) console.log(e.stdout);
  else console.log(`❌ Error: ${e.message}`);
}
