#!/usr/bin/env node
/**
 * Bridge Skill CLI
 * 
 * Main entry point for all bridge commands.
 * 
 * Usage:
 *   bridge.js quote FXRP 10
 *   bridge.js send FXRP 10 [recipient]
 *   bridge.js status
 *   bridge.js check <txHash>
 *   bridge.js tokens
 *   bridge.js daemon start|stop|status
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SCRIPTS_DIR = __dirname;
const DATA_DIR = path.join(SCRIPTS_DIR, '..', 'data');
const PID_FILE = '/tmp/bridge-monitor.pid';

function runScript(script, args = []) {
  const scriptPath = path.join(SCRIPTS_DIR, script);
  try {
    execSync(`node "${scriptPath}" ${args.join(' ')}`, { stdio: 'inherit' });
  } catch (e) {
    // Error already printed by child
  }
}

function isDaemonRunning() {
  if (!fs.existsSync(PID_FILE)) return false;
  const pid = fs.readFileSync(PID_FILE, 'utf8').trim();
  try {
    process.kill(parseInt(pid), 0);
    return pid;
  } catch (e) {
    return false;
  }
}

function startDaemon() {
  const daemonPid = isDaemonRunning();
  if (daemonPid) {
    console.log(`Daemon already running (PID ${daemonPid})`);
    return;
  }
  
  execSync(`bash "${path.join(SCRIPTS_DIR, 'ensure-daemon.sh')}"`, { stdio: 'inherit' });
}

function stopDaemon() {
  const daemonPid = isDaemonRunning();
  if (!daemonPid) {
    console.log('Daemon not running');
    return;
  }
  
  try {
    process.kill(parseInt(daemonPid), 'SIGTERM');
    fs.unlinkSync(PID_FILE);
    console.log(`Daemon stopped (was PID ${daemonPid})`);
  } catch (e) {
    console.log('Error stopping daemon:', e.message);
  }
}

function daemonStatus() {
  const daemonPid = isDaemonRunning();
  if (daemonPid) {
    console.log(`Daemon running (PID ${daemonPid})`);
    
    // Check pending bridges
    const pendingFile = path.join(DATA_DIR, 'pending-bridges.json');
    if (fs.existsSync(pendingFile)) {
      const pending = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
      console.log(`Pending bridges: ${pending.length}`);
    }
    
    // Check for alerts
    const alertFile = path.join(DATA_DIR, 'bridge-alert.json');
    if (fs.existsSync(alertFile)) {
      const alert = JSON.parse(fs.readFileSync(alertFile, 'utf8'));
      if (!alert.read) {
        console.log(`\n⚠️  ALERT: ${alert.message}`);
      }
    }
  } else {
    console.log('Daemon not running');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0]?.toLowerCase();
  
  switch (cmd) {
    case 'quote':
      // bridge.js quote FXRP 10 [recipient]
      if (args.length < 3) {
        console.log('Usage: bridge.js quote <token> <amount> [recipient]');
        return;
      }
      runScript('fassets-bridge.js', ['quote', '--token', args[1], '--amount', args[2], '--recipient', args[3] || '0x0000000000000000000000000000000000000001']);
      break;
      
    case 'send':
    case 'bridge':
      // bridge.js send FXRP 10 [recipient]
      if (args.length < 3) {
        console.log('Usage: bridge.js send <token> <amount> [recipient]');
        return;
      }
      const recipient = args[3] || '0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A';
      runScript('fassets-bridge.js', ['send', '--token', args[1], '--amount', args[2], '--recipient', recipient]);
      break;
      
    case 'status':
    case 'pending':
      runScript('bridge-monitor.js', ['list']);
      break;
      
    case 'history':
      runScript('bridge-monitor.js', ['history', args[1] || '10']);
      break;
      
    case 'check':
      if (args[1]) {
        runScript('check-delivery.js', ['tx', args[1]]);
      } else {
        runScript('bridge-monitor.js', ['check']);
      }
      break;
      
    case 'tokens':
      runScript('fassets-bridge.js', ['tokens']);
      break;
      
    case 'daemon':
      const subCmd = args[1]?.toLowerCase();
      switch (subCmd) {
        case 'start':
          startDaemon();
          break;
        case 'stop':
          stopDaemon();
          break;
        case 'status':
        default:
          daemonStatus();
          break;
      }
      break;
      
    case 'dest':
    case 'hyperevm':
      runScript('check-delivery.js', ['hyperevm', args[1] || '0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A']);
      break;
      
    default:
      console.log(`
Bridge Skill - Flare → HyperEVM via LayerZero

Commands:
  quote <token> <amount>         Get bridge fee quote
  send <token> <amount> [to]     Execute bridge transfer
  status                         List pending bridges
  history [n]                    Show bridge history
  check [txHash]                 Check bridge/delivery status
  tokens                         List supported tokens
  daemon start|stop|status       Control monitor daemon
  hyperevm [address]             Check HyperEVM balances

Examples:
  bridge.js quote FXRP 10
  bridge.js send FXRP 10
  bridge.js check 0x1df1d092...
  bridge.js daemon start

Supported Tokens: FXRP (more coming)
Bridge Fee: ~11 FLR
Delivery Time: 1-5 minutes
`);
  }
}

main().catch(console.error);
