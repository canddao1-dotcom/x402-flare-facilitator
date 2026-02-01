#!/usr/bin/env node
/**
 * LP Management - Unified Entry Point
 * 
 * Subcommands:
 *   check      - Quick position health check
 *   report     - Full report with opportunities
 *   positions  - View V3 positions with fees
 *   collect    - Collect fees from position
 *   remove     - Remove liquidity from position
 *   mint       - Mint new V3 position
 *   rebalance  - Close and redeploy at new range
 *   deploy     - Deployment guide with price ranges
 * 
 * Usage:
 *   /lp check
 *   /lp report
 *   /lp positions
 *   /lp collect <position_id>
 *   /lp mint --pool <address> --amount0 <n> --amount1 <n>
 *   /lp deploy
 */

const { spawn } = require('child_process');
const path = require('path');

// Script paths
const SCRIPTS = {
  check: path.join(__dirname, '../../fblpmanager/scripts/lp-monitor.js'),
  report: path.join(__dirname, '../../fblpmanager/scripts/lp-manager.js'),
  positions: path.join(__dirname, 'positions.js'),
  collect: path.join(__dirname, '../../fblpmanager/scripts/lp-operations.js'),
  remove: path.join(__dirname, '../../fblpmanager/scripts/lp-operations.js'),
  mint: path.join(__dirname, '../../fblpmanager/scripts/mint-v3.js'),
  rebalance: path.join(__dirname, '../../fblpmanager/scripts/lp-rebalancer.js'),
  deploy: path.join(__dirname, '../../fblpmanager/scripts/deployment-guide.js'),
};

const KEYSTORE = '/home/node/clawd/skills/fblpmanager/data/clawd-wallet.json';

function showHelp() {
  console.log(`
LP Management - Unified Command

Usage: /lp <command> [options]

Commands:
  check              Quick position health check (in/out of range)
  report             Full LP report with opportunities and suggestions
  positions          View all V3 positions with pending fees
  collect <id>       Collect fees from position NFT
  remove <id> [%]    Remove liquidity (default 100%)
  mint               Mint new V3 position
  rebalance <id>     Close position and redeploy at new range
  deploy             Deployment guide with recommended price ranges

Examples:
  /lp check                          # Quick health check
  /lp report                         # Full report + opportunities
  /lp positions                      # List all positions
  /lp collect 34935                  # Collect fees from #34935
  /lp remove 34935 50                # Remove 50% from #34935
  /lp mint --pool 0x... --lower -1000 --upper 1000 --amount0 100
  /lp deploy                         # Get deployment suggestions

Keystore: ${KEYSTORE}
`);
}

function runScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, ...args], {
      stdio: 'inherit',
      env: process.env
    });
    
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Script exited with code ${code}`));
    });
    
    child.on('error', reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0]?.toLowerCase();
  const restArgs = args.slice(1);
  
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    showHelp();
    process.exit(0);
  }
  
  try {
    switch (cmd) {
      case 'check':
        await runScript(SCRIPTS.check, restArgs);
        break;
        
      case 'report':
        // Add --opportunities by default for full report
        const reportArgs = restArgs.includes('--opportunities') ? restArgs : ['--opportunities', ...restArgs];
        await runScript(SCRIPTS.report, reportArgs);
        break;
        
      case 'positions':
        await runScript(SCRIPTS.positions, restArgs);
        break;
        
      case 'collect':
        if (!restArgs[0]) {
          console.error('Error: Position ID required');
          console.log('Usage: /lp collect <position_id>');
          process.exit(1);
        }
        await runScript(SCRIPTS.collect, ['collect', '--keystore', KEYSTORE, '--id', restArgs[0], ...restArgs.slice(1)]);
        break;
        
      case 'remove':
        if (!restArgs[0]) {
          console.error('Error: Position ID required');
          console.log('Usage: /lp remove <position_id> [percent]');
          process.exit(1);
        }
        const percent = restArgs[1] || '100';
        await runScript(SCRIPTS.remove, ['decrease', '--keystore', KEYSTORE, '--id', restArgs[0], '--percent', percent, ...restArgs.slice(2)]);
        break;
        
      case 'mint':
        await runScript(SCRIPTS.mint, ['--keystore', KEYSTORE, ...restArgs]);
        break;
        
      case 'rebalance':
        if (!restArgs[0]) {
          console.error('Error: Position ID required');
          console.log('Usage: /lp rebalance <position_id> [strategy]');
          process.exit(1);
        }
        await runScript(SCRIPTS.rebalance, ['simulate', restArgs[0], ...restArgs.slice(1)]);
        break;
        
      case 'deploy':
        await runScript(SCRIPTS.deploy, restArgs);
        break;
        
      default:
        console.error(`Unknown command: ${cmd}`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
