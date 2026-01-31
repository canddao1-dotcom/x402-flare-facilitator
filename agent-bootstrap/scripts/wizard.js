#!/usr/bin/env node
/**
 * Agent Setup Wizard
 * 
 * Interactive setup that guides users through:
 * 1. LLM API key (Anthropic/OpenAI)
 * 2. Wallet setup (uses existing bootstrap or creates new)
 * 3. Agent identity & description
 * 4. x402 tipping registration
 * 5. Optional: Telegram/Discord channels
 * 
 * Outputs a complete .env ready to run OpenClaw.
 */

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

const c = (color, text) => `${colors[color]}${text}${colors.reset}`;

// Readline interface
let rl;

function createRL() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

async function ask(question, defaultVal = '') {
  return new Promise((resolve) => {
    const suffix = defaultVal ? c('dim', ` [${defaultVal}]`) : '';
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultVal);
    });
  });
}

async function askSecret(question) {
  return new Promise((resolve) => {
    process.stdout.write(`${question}: `);
    
    // Hide input
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    
    let input = '';
    const onData = (char) => {
      char = char.toString();
      
      if (char === '\n' || char === '\r') {
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(input);
      } else if (char === '\u0003') {
        // Ctrl+C
        process.exit();
      } else if (char === '\u007F') {
        // Backspace
        input = input.slice(0, -1);
      } else {
        input += char;
        process.stdout.write('*');
      }
    };
    
    process.stdin.on('data', onData);
    process.stdin.resume();
  });
}

async function askYesNo(question, defaultYes = true) {
  const suffix = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await ask(`${question} ${c('dim', suffix)}`);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

async function askChoice(question, choices) {
  console.log(`\n${question}`);
  choices.forEach((choice, i) => {
    console.log(`  ${c('cyan', i + 1)}) ${choice.label}`);
  });
  
  const answer = await ask(`\nChoice (1-${choices.length})`);
  const idx = parseInt(answer) - 1;
  
  if (idx >= 0 && idx < choices.length) {
    return choices[idx].value;
  }
  return choices[0].value;
}

function printBanner() {
  console.log(`
${c('cyan', '╔══════════════════════════════════════════════════════════════╗')}
${c('cyan', '║')}        ${c('bright', '🧙 OpenClaw Agent Setup Wizard')}                      ${c('cyan', '║')}
${c('cyan', '╚══════════════════════════════════════════════════════════════╝')}

This wizard will help you set up a new AI agent with:
  • Multi-chain wallets (Flare, Base, HyperEVM, Solana)
  • LLM API connection (Anthropic or OpenAI)
  • x402 tipping integration
  • Optional messaging channels (Telegram, Discord)

${c('dim', 'Press Ctrl+C at any time to exit.')}
`);
}

function printSection(title) {
  console.log(`\n${c('magenta', '━━━')} ${c('bright', title)} ${c('magenta', '━━━')}\n`);
}

// Generate wallet (simplified version)
function generateWallet() {
  const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    privateKey
  };
}

// Main wizard
async function runWizard() {
  rl = createRL();
  
  printBanner();
  
  const config = {
    agent: {},
    llm: {},
    wallet: {},
    x402: {},
    channels: {}
  };
  
  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Agent Identity
  // ═══════════════════════════════════════════════════════════════
  printSection('Step 1: Agent Identity');
  
  config.agent.name = await ask(`${c('green', '?')} Agent name (e.g., "TradingBot", "MyAssistant")`);
  
  if (!config.agent.name) {
    console.log(c('red', '\n❌ Agent name is required'));
    process.exit(1);
  }
  
  config.agent.description = await ask(
    `${c('green', '?')} Brief description`,
    'AI assistant powered by OpenClaw'
  );
  
  // ═══════════════════════════════════════════════════════════════
  // STEP 2: LLM Provider
  // ═══════════════════════════════════════════════════════════════
  printSection('Step 2: LLM Provider');
  
  config.llm.provider = await askChoice(
    `${c('green', '?')} Choose your LLM provider:`,
    [
      { label: 'Anthropic (Claude) - Recommended', value: 'anthropic' },
      { label: 'OpenAI (GPT-4)', value: 'openai' },
      { label: 'OpenRouter (Multiple models)', value: 'openrouter' }
    ]
  );
  
  const apiKeyPrompts = {
    anthropic: 'Anthropic API key (sk-ant-...)',
    openai: 'OpenAI API key (sk-...)',
    openrouter: 'OpenRouter API key (sk-or-...)'
  };
  
  console.log(`\n${c('dim', 'Get your API key from:')}`)
  if (config.llm.provider === 'anthropic') {
    console.log(c('dim', '  https://console.anthropic.com/settings/keys'));
  } else if (config.llm.provider === 'openai') {
    console.log(c('dim', '  https://platform.openai.com/api-keys'));
  } else {
    console.log(c('dim', '  https://openrouter.ai/keys'));
  }
  
  config.llm.apiKey = await askSecret(`\n${c('green', '?')} ${apiKeyPrompts[config.llm.provider]}`);
  
  if (!config.llm.apiKey) {
    console.log(c('yellow', '\n⚠️  No API key provided - you\'ll need to add it later'));
  }
  
  // Model selection
  const defaultModels = {
    anthropic: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o',
    openrouter: 'anthropic/claude-sonnet-4'
  };
  
  config.llm.model = await ask(
    `${c('green', '?')} Model`,
    defaultModels[config.llm.provider]
  );
  
  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Wallet Setup
  // ═══════════════════════════════════════════════════════════════
  printSection('Step 3: Multi-Chain Wallet');
  
  // Check for existing bootstrap
  const existingPath = path.join(DATA_DIR, config.agent.name);
  let useExisting = false;
  
  if (fs.existsSync(existingPath)) {
    console.log(c('yellow', `Found existing wallet for "${config.agent.name}"`));
    useExisting = await askYesNo('Use existing wallet?', true);
  }
  
  if (useExisting) {
    const summary = JSON.parse(
      fs.readFileSync(path.join(existingPath, 'wallet-summary.json'), 'utf8')
    );
    config.wallet = {
      evmAddress: summary.wallets.evm.address,
      solanaAddress: summary.wallets.solana.address,
      keystorePath: existingPath
    };
    console.log(c('green', `\n✅ Using existing wallet: ${config.wallet.evmAddress}`));
  } else {
    console.log('\nGenerating new multi-chain wallet...');
    
    // Import and run bootstrap
    const { execSync } = await import('child_process');
    
    try {
      execSync(`node ${path.join(__dirname, 'bootstrap.js')} new --name "${config.agent.name}"`, {
        stdio: 'inherit'
      });
      
      const summary = JSON.parse(
        fs.readFileSync(path.join(DATA_DIR, config.agent.name, 'wallet-summary.json'), 'utf8')
      );
      config.wallet = {
        evmAddress: summary.wallets.evm.address,
        solanaAddress: summary.wallets.solana.address,
        keystorePath: path.join(DATA_DIR, config.agent.name)
      };
    } catch (e) {
      console.log(c('red', '\n❌ Wallet generation failed'));
      process.exit(1);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // STEP 4: x402 Tipping Setup
  // ═══════════════════════════════════════════════════════════════
  printSection('Step 4: x402 Tipping Integration');
  
  console.log(`
x402 allows your agent to receive tips from other agents and users.
Your agent will be registered at: ${c('cyan', 'https://agent-tips.vercel.app')}
`);
  
  config.x402.enabled = await askYesNo('Enable x402 tipping?', true);
  
  if (config.x402.enabled) {
    config.x402.facilitatorUrl = 'https://agent-tips.vercel.app';
    
    // Register agent for tipping
    console.log('\nRegistering agent for tips...');
    
    try {
      const response = await fetch('https://agent-tips.vercel.app/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: config.agent.name,
          address: config.wallet.evmAddress,
          description: config.agent.description,
          networks: ['flare', 'base', 'hyperevm']
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(c('green', `✅ Registered! Agent ID: ${data.agentId || config.agent.name}`));
        config.x402.agentId = data.agentId || config.agent.name;
      } else {
        // API might not exist yet, that's ok
        console.log(c('yellow', '⚠️  Auto-registration not available'));
        console.log(c('dim', '   Submit a PR to register: https://github.com/canddao1-dotcom/x402-flare-facilitator'));
        config.x402.agentId = config.agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      }
    } catch (e) {
      console.log(c('yellow', '⚠️  Could not auto-register (network error)'));
      config.x402.agentId = config.agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // STEP 5: Messaging Channels (Optional)
  // ═══════════════════════════════════════════════════════════════
  printSection('Step 5: Messaging Channels (Optional)');
  
  const setupTelegram = await askYesNo('Set up Telegram bot?', false);
  
  if (setupTelegram) {
    console.log(`
${c('dim', 'To create a Telegram bot:')}
${c('dim', '1. Message @BotFather on Telegram')}
${c('dim', '2. Send /newbot and follow prompts')}
${c('dim', '3. Copy the bot token')}
`);
    config.channels.telegram = {
      token: await askSecret(`${c('green', '?')} Telegram bot token`)
    };
  }
  
  const setupDiscord = await askYesNo('Set up Discord bot?', false);
  
  if (setupDiscord) {
    console.log(`
${c('dim', 'To create a Discord bot:')}
${c('dim', '1. Go to https://discord.com/developers/applications')}
${c('dim', '2. Create application → Bot → Reset Token')}
${c('dim', '3. Enable Message Content Intent')}
`);
    config.channels.discord = {
      token: await askSecret(`${c('green', '?')} Discord bot token`)
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // STEP 6: Generate Config
  // ═══════════════════════════════════════════════════════════════
  printSection('Step 6: Generating Configuration');
  
  // Build .env content
  const envLines = [
    '# OpenClaw Agent Configuration',
    `# Generated by Setup Wizard - ${new Date().toISOString()}`,
    '',
    '# Agent Identity',
    `AGENT_NAME="${config.agent.name}"`,
    `AGENT_DESCRIPTION="${config.agent.description}"`,
    '',
    '# LLM Provider',
    `LLM_PROVIDER="${config.llm.provider}"`,
  ];
  
  if (config.llm.provider === 'anthropic') {
    envLines.push(`ANTHROPIC_API_KEY="${config.llm.apiKey || 'your-api-key-here'}"`);
  } else if (config.llm.provider === 'openai') {
    envLines.push(`OPENAI_API_KEY="${config.llm.apiKey || 'your-api-key-here'}"`);
  } else {
    envLines.push(`OPENROUTER_API_KEY="${config.llm.apiKey || 'your-api-key-here'}"`);
  }
  
  envLines.push(`LLM_MODEL="${config.llm.model}"`);
  envLines.push('');
  
  // Wallet
  envLines.push('# Wallet (same address on Flare, Base, HyperEVM)');
  envLines.push(`EVM_ADDRESS="${config.wallet.evmAddress}"`);
  envLines.push(`SOLANA_ADDRESS="${config.wallet.solanaAddress}"`);
  envLines.push(`WALLET_KEYSTORE_PATH="${config.wallet.keystorePath}"`);
  envLines.push('WALLET_PASSPHRASE="<paste from PASSPHRASE.json>"');
  envLines.push('');
  
  // Networks
  envLines.push('# Network RPCs');
  envLines.push('FLARE_RPC="https://flare-api.flare.network/ext/C/rpc"');
  envLines.push('BASE_RPC="https://mainnet.base.org"');
  envLines.push('HYPEREVM_RPC="https://rpc.hyperliquid.xyz/evm"');
  envLines.push('SOLANA_RPC="https://api.mainnet-beta.solana.com"');
  envLines.push('');
  
  // x402
  if (config.x402.enabled) {
    envLines.push('# x402 Tipping');
    envLines.push('X402_ENABLED=true');
    envLines.push(`X402_FACILITATOR_URL="${config.x402.facilitatorUrl}"`);
    envLines.push(`X402_AGENT_ID="${config.x402.agentId}"`);
    envLines.push('');
  }
  
  // Channels
  if (config.channels.telegram?.token) {
    envLines.push('# Telegram');
    envLines.push(`TELEGRAM_BOT_TOKEN="${config.channels.telegram.token}"`);
    envLines.push('');
  }
  
  if (config.channels.discord?.token) {
    envLines.push('# Discord');
    envLines.push(`DISCORD_BOT_TOKEN="${config.channels.discord.token}"`);
    envLines.push('');
  }
  
  const envContent = envLines.join('\n');
  
  // Save .env
  const outputPath = path.join(config.wallet.keystorePath, '.env');
  fs.writeFileSync(outputPath, envContent);
  console.log(c('green', `✅ Saved: ${outputPath}`));
  
  // Save config summary as JSON too
  const configSummary = {
    ...config,
    llm: { ...config.llm, apiKey: config.llm.apiKey ? '[REDACTED]' : null },
    channels: {
      telegram: config.channels.telegram ? { configured: true } : null,
      discord: config.channels.discord ? { configured: true } : null
    }
  };
  fs.writeFileSync(
    path.join(config.wallet.keystorePath, 'config-summary.json'),
    JSON.stringify(configSummary, null, 2)
  );
  
  // ═══════════════════════════════════════════════════════════════
  // DONE!
  // ═══════════════════════════════════════════════════════════════
  console.log(`
${c('cyan', '╔══════════════════════════════════════════════════════════════╗')}
${c('cyan', '║')}                  ${c('green', '✅ Setup Complete!')}                         ${c('cyan', '║')}
${c('cyan', '╚══════════════════════════════════════════════════════════════╝')}

${c('bright', '📍 Your Agent:')}
   Name:    ${config.agent.name}
   EVM:     ${config.wallet.evmAddress}
   Solana:  ${config.wallet.solanaAddress}

${c('bright', '📁 Files:')}
   ${config.wallet.keystorePath}/
   ├── .env                 (your config - ${c('yellow', 'add passphrase!')})
   ├── evm-keystore.json    (encrypted wallet)
   ├── solana-keystore.json (encrypted wallet)
   └── PASSPHRASE.json      (${c('red', 'MOVE TO SECURE LOCATION!')})

${c('bright', '💰 Fund Your Wallets:')}
   Flare:    https://flarescan.com/address/${config.wallet.evmAddress}
   Base:     https://basescan.org/address/${config.wallet.evmAddress}
   Solana:   https://solscan.io/account/${config.wallet.solanaAddress}

${c('bright', '🚀 Next Steps:')}
   1. ${c('yellow', 'Edit .env')} - paste WALLET_PASSPHRASE from PASSPHRASE.json
   2. ${c('yellow', 'Fund wallet')} - send gas tokens to your addresses
   3. ${c('yellow', 'Start agent')} - run your OpenClaw instance
   4. ${c('yellow', 'Request a tip')} - test at https://agent-tips.vercel.app

${c('bright', '💡 Request a Tip:')}
   curl -X POST https://agent-tips.vercel.app/api/tip \\
     -H "Content-Type: application/json" \\
     -d '{"agent": "${config.x402.agentId || config.agent.name}", "amount": "1", "token": "USDT"}'

${c('dim', '─────────────────────────────────────────────────────────────────')}
${c('dim', 'Docs: https://docs.clawd.bot | Tips: https://agent-tips.vercel.app')}
`);
  
  rl.close();
}

// CLI entry
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Agent Setup Wizard

Usage:
  node wizard.js          Run interactive setup
  node wizard.js --help   Show this help

The wizard guides you through:
  1. Agent identity (name, description)
  2. LLM provider setup (Anthropic/OpenAI/OpenRouter)
  3. Multi-chain wallet generation
  4. x402 tipping registration
  5. Optional channel setup (Telegram/Discord)

Outputs a complete .env file ready for OpenClaw.
`);
    return;
  }
  
  await runWizard();
}

main().catch((e) => {
  console.error(c('red', `\n❌ Error: ${e.message}`));
  process.exit(1);
});
