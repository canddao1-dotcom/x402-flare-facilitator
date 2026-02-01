#!/usr/bin/env node
/**
 * Portfolio CLI - Unified Entry Point
 * 
 * Subcommands:
 *   (default)    - Full portfolio dashboard
 *   track        - Save performance snapshot
 *   history      - Show historical snapshots
 *   compare      - Compare to past performance
 *   analyze      - Deep DeFi position analysis
 * 
 * Usage:
 *   /portfolio                    # Full dashboard
 *   /portfolio track              # Save snapshot
 *   /portfolio history            # Recent history
 *   /portfolio compare 7d         # Compare to 7 days ago
 *   /portfolio analyze            # Deep analysis
 */

const { spawn } = require('child_process');
const path = require('path');

const SCRIPTS = {
  dashboard: path.join(__dirname, 'portfolio.js'),
  tracker: path.join(__dirname, 'tracker.js'),
  analyze: path.join(__dirname, 'analyze.js'),
};

function runScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, ...args], {
      stdio: 'inherit',
      env: process.env
    });
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`Exit ${code}`)));
    child.on('error', reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0]?.toLowerCase();
  const restArgs = args.slice(1);
  
  // Check if first arg is a subcommand or an address
  const isCommand = ['track', 'history', 'compare', 'analyze', 'help'].includes(cmd);
  
  if (!cmd || !isCommand) {
    // Default: run dashboard with all args
    await runScript(SCRIPTS.dashboard, args);
    return;
  }
  
  switch (cmd) {
    case 'track':
      // /portfolio track [address]
      await runScript(SCRIPTS.tracker, ['track', ...restArgs]);
      break;
      
    case 'history':
      // /portfolio history [address]
      await runScript(SCRIPTS.tracker, ['history', ...restArgs]);
      break;
      
    case 'compare':
      // /portfolio compare 7d [address]
      await runScript(SCRIPTS.tracker, ['compare', ...restArgs]);
      break;
      
    case 'analyze':
      // /portfolio analyze [address]
      await runScript(SCRIPTS.analyze, restArgs);
      break;
      
    case 'help':
      console.log(`
Portfolio CLI - Unified DeFi Dashboard

USAGE:
  /portfolio                    Full dashboard (token balances, LPs, CDP, vaults)
  /portfolio track [address]    Save performance snapshot
  /portfolio history [address]  Show recent snapshots
  /portfolio compare 7d [addr]  Compare to N days ago
  /portfolio analyze [address]  Deep position analysis

OPTIONS:
  --json                        Output raw JSON
  --no-prices                   Skip USD valuations

ADDRESSES:
  Default: Agent wallet (0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A)
  "dao" or "treasury": DAO Treasury (0xaa68bc4bab9a63958466f49f5a58c54a412d4906)
  Or any 0x address
`);
      break;
      
    default:
      // Unknown command - pass to dashboard
      await runScript(SCRIPTS.dashboard, args);
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
