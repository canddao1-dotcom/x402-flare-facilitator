#!/usr/bin/env node
/**
 * Wallet Operations - Unified Entry Point (Multi-Network)
 * 
 * Supported Networks: Flare, HyperEVM, Base
 * 
 * Subcommands:
 *   balance     - Check token balances
 *   send        - Send native or tokens
 *   wrap        - Wrap native to wrapped token
 *   unwrap      - Unwrap to native
 *   approve     - Approve token spending
 *   allowance   - Check allowance
 *   gas         - Current gas prices
 *   info        - Token info lookup
 *   generate    - Generate new wallet
 *   networks    - List supported networks
 * 
 * Usage:
 *   /wallet balance
 *   /wallet balance --network base
 *   /wallet send 10 FLR to 0x...
 */

const { spawn } = require('child_process');
const path = require('path');
const { listNetworks, getNetwork, DEFAULT_NETWORK } = require('./networks');

// Script paths
const SCRIPTS = {
  balance: path.join(__dirname, 'balance.js'),
  send: path.join(__dirname, 'send-tx.js'),
  wrap: path.join(__dirname, 'wrap-flr.js'),
  approve: path.join(__dirname, 'approve-token.js'),
  allowance: path.join(__dirname, 'check-allowance.js'),
  gas: path.join(__dirname, 'gas-price.js'),
  info: path.join(__dirname, 'token-info.js'),
  generate: path.join(__dirname, 'generate-wallet.js'),
};

const KEYSTORE = '/home/node/clawd/skills/fblpmanager/data/clawd-wallet.json';
const MY_WALLET = '0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A';

function showHelp() {
  const networks = listNetworks();
  console.log(`
Wallet Operations - Multi-Network Command

Usage: /wallet <command> [options] [--network <name>]

Commands:
  balance [address]                    Check native and token balances
  send <amount> <token> to <address>   Send tokens
  wrap <amount>                        Wrap native to wrapped token
  unwrap <amount>                      Unwrap to native
  approve <token> <spender>            Approve token spending
  allowance <token> <spender>          Check allowance
  gas                                  Current gas prices
  info <address|symbol>                Token info lookup
  generate                             Generate new wallet
  networks                             List supported networks

Networks:
${networks.map(n => `  ${n.key.padEnd(10)} ${n.name.padEnd(10)} Chain ${n.chainId} (${n.nativeSymbol})`).join('\n')}

Examples:
  /wallet balance                        # My Flare balance
  /wallet balance --network base         # My Base balance
  /wallet balance --network hyperevm     # My HyperEVM balance
  /wallet balance 0x... --tokens         # Include all tokens
  /wallet send 10 FLR to 0x...           # Send 10 FLR
  /wallet send 0.01 ETH to 0x... --network base  # Send ETH on Base
  /wallet wrap 100                       # Wrap 100 FLR
  /wallet gas --network base             # Base gas prices

My Wallet: ${MY_WALLET}
Default Network: ${DEFAULT_NETWORK}
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

// Extract --network flag from args and return [networkName, remainingArgs]
function extractNetworkFlag(args) {
  const netIndex = args.findIndex(a => a === '--network' || a === '-n');
  if (netIndex !== -1 && args[netIndex + 1]) {
    const network = args[netIndex + 1];
    const remaining = [...args.slice(0, netIndex), ...args.slice(netIndex + 2)];
    return [network, remaining];
  }
  return [DEFAULT_NETWORK, args];
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0]?.toLowerCase();
  const restArgs = args.slice(1);
  
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    showHelp();
    process.exit(0);
  }
  
  // Extract network from args
  const [networkName, cleanArgs] = extractNetworkFlag(restArgs);
  const networkFlags = ['--network', networkName];
  
  try {
    switch (cmd) {
      case 'networks':
      case 'network':
        console.log('\n🌐 Supported Networks:\n');
        for (const net of listNetworks()) {
          const n = getNetwork(net.key);
          console.log(`${net.key.padEnd(10)} ${net.name.padEnd(10)} Chain ${net.chainId}`);
          console.log(`           Native: ${net.nativeSymbol}`);
          console.log(`           RPC: ${n.rpc}`);
          console.log(`           Explorer: ${n.explorer}`);
          console.log('');
        }
        break;
        
      case 'balance':
      case 'bal':
        // Default to my wallet if no address
        const balAddr = cleanArgs.find(a => a.startsWith('0x')) || MY_WALLET;
        const otherBalArgs = cleanArgs.filter(a => !a.startsWith('0x') || a === balAddr);
        await runScript(SCRIPTS.balance, [balAddr, ...otherBalArgs, ...networkFlags]);
        break;
        
      case 'send':
        // Parse: send <amount> <token> to <address>
        const sendArgs = ['--keystore', KEYSTORE, ...networkFlags];
        
        const toIndex = cleanArgs.findIndex(a => a.toLowerCase() === 'to');
        if (toIndex === -1 || toIndex + 1 >= cleanArgs.length) {
          console.error('Error: Invalid format');
          console.log('Usage: /wallet send <amount> [token] to <address>');
          process.exit(1);
        }
        
        const amount = cleanArgs[0];
        const toAddr = cleanArgs[toIndex + 1];
        sendArgs.push('--to', toAddr, '--value', amount);
        
        // Check if token specified
        if (toIndex > 1) {
          const token = cleanArgs[1];
          const net = getNetwork(networkName);
          if (token.toUpperCase() !== net.nativeSymbol) {
            sendArgs.push('--token', token);
          }
        }
        
        await runScript(SCRIPTS.send, sendArgs);
        break;
        
      case 'wrap':
        if (!cleanArgs[0]) {
          console.error('Error: Amount required');
          console.log('Usage: /wallet wrap <amount>');
          process.exit(1);
        }
        await runScript(SCRIPTS.wrap, ['wrap', '--keystore', KEYSTORE, '--amount', cleanArgs[0], ...networkFlags]);
        break;
        
      case 'unwrap':
        if (!cleanArgs[0]) {
          console.error('Error: Amount required');
          console.log('Usage: /wallet unwrap <amount>');
          process.exit(1);
        }
        await runScript(SCRIPTS.wrap, ['unwrap', '--keystore', KEYSTORE, '--amount', cleanArgs[0], ...networkFlags]);
        break;
        
      case 'approve':
        if (!cleanArgs[0] || !cleanArgs[1]) {
          console.error('Error: Token and spender required');
          console.log('Usage: /wallet approve <token> <spender>');
          process.exit(1);
        }
        await runScript(SCRIPTS.approve, ['--keystore', KEYSTORE, '--token', cleanArgs[0], '--spender', cleanArgs[1], ...cleanArgs.slice(2), ...networkFlags]);
        break;
        
      case 'allowance':
        if (!cleanArgs[0] || !cleanArgs[1]) {
          console.error('Error: Token and spender required');
          console.log('Usage: /wallet allowance <token> <spender>');
          process.exit(1);
        }
        await runScript(SCRIPTS.allowance, [MY_WALLET, cleanArgs[0], cleanArgs[1], ...networkFlags]);
        break;
        
      case 'gas':
        await runScript(SCRIPTS.gas, [...cleanArgs, ...networkFlags]);
        break;
        
      case 'info':
      case 'token':
        if (!cleanArgs[0]) {
          console.error('Error: Token address or symbol required');
          console.log('Usage: /wallet info <address|symbol>');
          process.exit(1);
        }
        await runScript(SCRIPTS.info, [...cleanArgs, ...networkFlags]);
        break;
        
      case 'generate':
      case 'new':
        await runScript(SCRIPTS.generate, cleanArgs);
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
