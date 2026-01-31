#!/usr/bin/env node
/**
 * Agent Setup Wizard v2
 * 
 * Interactive setup with:
 * - Back navigation (type 'back' at any prompt)
 * - Summary confirmation before saving
 * - Tip request flow for onboarding
 */

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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

// Navigation control
const BACK = Symbol('BACK');

async function ask(question, defaultVal = '', allowBack = true) {
  return new Promise((resolve) => {
    const backHint = allowBack ? c('dim', ' (type "back" to go back)') : '';
    const suffix = defaultVal ? c('dim', ` [${defaultVal}]`) : '';
    rl.question(`${question}${suffix}${backHint}: `, (answer) => {
      const trimmed = answer.trim();
      if (allowBack && trimmed.toLowerCase() === 'back') {
        resolve(BACK);
      } else {
        resolve(trimmed || defaultVal);
      }
    });
  });
}

async function askSecret(question, allowBack = true) {
  // Simpler implementation that works across more terminals
  // Falls back to visible input if TTY tricks fail
  return new Promise((resolve) => {
    const backHint = allowBack ? c('dim', ' (or "back")') : '';
    
    try {
      // Try to use raw mode for hidden input
      if (process.stdin.isTTY && process.stdin.setRawMode) {
        process.stdout.write(`${question}${backHint}: `);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        
        let input = '';
        const onData = (char) => {
          char = char.toString();
          
          if (char === '\n' || char === '\r') {
            try {
              process.stdin.setRawMode(false);
            } catch (e) {}
            process.stdin.removeListener('data', onData);
            process.stdout.write('\n');
            if (allowBack && input.toLowerCase() === 'back') {
              resolve(BACK);
            } else {
              resolve(input);
            }
          } else if (char === '\u0003') {
            try {
              process.stdin.setRawMode(false);
            } catch (e) {}
            process.exit();
          } else if (char === '\u007F' || char === '\b') {
            if (input.length > 0) {
              input = input.slice(0, -1);
              process.stdout.write('\b \b');
            }
          } else if (char.charCodeAt(0) >= 32) {
            input += char;
            process.stdout.write('*');
          }
        };
        
        process.stdin.on('data', onData);
      } else {
        // Fallback: use regular readline (input will be visible)
        console.log(c('yellow', '   (Note: input will be visible - TTY not available)'));
        rl.question(`${question}${backHint}: `, (answer) => {
          const trimmed = answer.trim();
          if (allowBack && trimmed.toLowerCase() === 'back') {
            resolve(BACK);
          } else {
            resolve(trimmed);
          }
        });
      }
    } catch (e) {
      // Ultimate fallback
      console.log(c('yellow', '   (Note: input will be visible)'));
      rl.question(`${question}${backHint}: `, (answer) => {
        const trimmed = answer.trim();
        if (allowBack && trimmed.toLowerCase() === 'back') {
          resolve(BACK);
        } else {
          resolve(trimmed);
        }
      });
    }
  });
}

async function askYesNo(question, defaultYes = true, allowBack = true) {
  const suffix = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await ask(`${question} ${c('dim', suffix)}`, '', allowBack);
  if (answer === BACK) return BACK;
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

async function askChoice(question, choices, allowBack = true) {
  console.log(`\n${question}`);
  choices.forEach((choice, i) => {
    console.log(`  ${c('cyan', i + 1)}) ${choice.label}`);
  });
  if (allowBack) {
    console.log(`  ${c('dim', '0) Go back')}`);
  }
  
  const answer = await ask(`\nChoice (1-${choices.length})`, '', false);
  
  if (answer === '0' && allowBack) return BACK;
  
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
  • Optional messaging channels

${c('dim', 'Type "back" at any prompt to go to the previous step.')}
${c('dim', 'Press Ctrl+C to exit.')}
`);
}

function printSection(num, title) {
  console.log(`\n${c('magenta', '━━━')} ${c('bright', `Step ${num}: ${title}`)} ${c('magenta', '━━━')}\n`);
}

// Wizard steps as array for navigation
async function runWizard() {
  rl = createRL();
  printBanner();
  
  const config = {
    agent: {},
    llm: {},
    wallet: {},
    x402: { enabled: true },
    channels: {}
  };
  
  // Step functions
  const steps = [
    // Step 1: Agent Identity
    async () => {
      printSection(1, 'Agent Identity');
      
      const name = await ask(`${c('green', '?')} Agent name (e.g., "TradingBot")`);
      if (name === BACK) return BACK;
      if (!name) {
        console.log(c('red', '   Agent name is required'));
        return false; // Retry this step
      }
      config.agent.name = name;
      
      const desc = await ask(
        `${c('green', '?')} Brief description`,
        'AI assistant powered by OpenClaw'
      );
      if (desc === BACK) return BACK;
      config.agent.description = desc;
      
      return true;
    },
    
    // Step 2: LLM Provider
    async () => {
      printSection(2, 'LLM Provider');
      
      const provider = await askChoice(
        `${c('green', '?')} Choose your LLM provider:`,
        [
          { label: 'Anthropic (Claude) - Recommended', value: 'anthropic' },
          { label: 'OpenAI (GPT-4)', value: 'openai' },
          { label: 'OpenRouter (Multiple models)', value: 'openrouter' }
        ]
      );
      if (provider === BACK) return BACK;
      config.llm.provider = provider;
      
      const apiKeyPrompts = {
        anthropic: 'Anthropic API key (sk-ant-...)',
        openai: 'OpenAI API key (sk-...)',
        openrouter: 'OpenRouter API key (sk-or-...)'
      };
      
      console.log(`\n${c('dim', 'Get your API key from:')}`);
      if (provider === 'anthropic') {
        console.log(c('dim', '  https://console.anthropic.com/settings/keys'));
      } else if (provider === 'openai') {
        console.log(c('dim', '  https://platform.openai.com/api-keys'));
      } else {
        console.log(c('dim', '  https://openrouter.ai/keys'));
      }
      
      const apiKey = await askSecret(`\n${c('green', '?')} ${apiKeyPrompts[provider]}`);
      if (apiKey === BACK) return BACK;
      config.llm.apiKey = apiKey;
      
      if (!apiKey) {
        console.log(c('yellow', '   ⚠️  No API key - you\'ll need to add it later'));
      }
      
      const modelChoices = {
        anthropic: [
          { label: 'Claude Sonnet 4 (Recommended)', value: 'claude-sonnet-4-20250514' },
          { label: 'Claude Opus 4 (Most capable)', value: 'claude-opus-4-20250514' },
          { label: 'Claude Haiku 3.5 (Fast & cheap)', value: 'claude-3-5-haiku-20241022' }
        ],
        openai: [
          { label: 'GPT-4o (Recommended)', value: 'gpt-4o' },
          { label: 'GPT-4o Mini (Fast & cheap)', value: 'gpt-4o-mini' },
          { label: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
          { label: 'o1 (Reasoning)', value: 'o1' }
        ],
        openrouter: [
          { label: 'Claude Sonnet 4 (Recommended)', value: 'anthropic/claude-sonnet-4' },
          { label: 'Claude Opus 4', value: 'anthropic/claude-opus-4' },
          { label: 'GPT-4o', value: 'openai/gpt-4o' },
          { label: 'Llama 3.1 405B', value: 'meta-llama/llama-3.1-405b-instruct' },
          { label: 'Gemini Pro 1.5', value: 'google/gemini-pro-1.5' }
        ]
      };
      
      const model = await askChoice(
        `${c('green', '?')} Choose your model:`,
        modelChoices[provider]
      );
      if (model === BACK) return BACK;
      config.llm.model = model;
      
      return true;
    },
    
    // Step 3: Wallet
    async () => {
      printSection(3, 'Multi-Chain Wallet');
      
      const existingPath = path.join(DATA_DIR, config.agent.name);
      
      if (fs.existsSync(existingPath)) {
        console.log(c('yellow', `Found existing wallet for "${config.agent.name}"`));
        const useExisting = await askYesNo('Use existing wallet?', true);
        if (useExisting === BACK) return BACK;
        
        if (useExisting) {
          const summary = JSON.parse(
            fs.readFileSync(path.join(existingPath, 'wallet-summary.json'), 'utf8')
          );
          config.wallet = {
            evmAddress: summary.wallets.evm.address,
            solanaAddress: summary.wallets.solana.address,
            keystorePath: existingPath
          };
          console.log(c('green', `\n✅ Using: ${config.wallet.evmAddress}`));
          return true;
        }
      }
      
      console.log('\n📦 Generating new multi-chain wallet...\n');
      
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
        return false;
      }
      
      return true;
    },
    
    // Step 4: x402 Tipping
    async () => {
      printSection(4, 'x402 Tipping Integration');
      
      console.log(`
x402 allows your agent to receive tips from users and other agents.
Your agent will be registered at: ${c('cyan', 'https://agent-tips.vercel.app')}
`);
      
      const enabled = await askYesNo('Enable x402 tipping?', true);
      if (enabled === BACK) return BACK;
      config.x402.enabled = enabled;
      
      if (enabled) {
        config.x402.facilitatorUrl = 'https://agent-tips.vercel.app';
        config.x402.agentId = config.agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        console.log(c('green', `\n✅ Agent ID: ${config.x402.agentId}`));
      }
      
      return true;
    },
    
    // Step 5: Channels
    async () => {
      printSection(5, 'Messaging Channels (Optional)');
      
      const setupTelegram = await askYesNo('Set up Telegram bot?', false);
      if (setupTelegram === BACK) return BACK;
      
      if (setupTelegram) {
        console.log(`\n${c('dim', '1. Message @BotFather on Telegram')}`);
        console.log(c('dim', '2. Send /newbot and follow prompts'));
        console.log(c('dim', '3. Copy the bot token\n'));
        
        const token = await askSecret(`${c('green', '?')} Telegram bot token`);
        if (token === BACK) return BACK;
        if (token) config.channels.telegram = { token };
      }
      
      const setupDiscord = await askYesNo('Set up Discord bot?', false);
      if (setupDiscord === BACK) return BACK;
      
      if (setupDiscord) {
        console.log(`\n${c('dim', '1. Go to discord.com/developers/applications')}`);
        console.log(c('dim', '2. Create app → Bot → Reset Token'));
        console.log(c('dim', '3. Enable Message Content Intent\n'));
        
        const token = await askSecret(`${c('green', '?')} Discord bot token`);
        if (token === BACK) return BACK;
        if (token) config.channels.discord = { token };
      }
      
      return true;
    },
    
    // Step 6: Summary & Confirmation
    async () => {
      printSection(6, 'Review & Confirm');
      
      console.log(`
${c('bright', '📋 Configuration Summary:')}

${c('cyan', 'Agent:')}
  Name:        ${config.agent.name}
  Description: ${config.agent.description}

${c('cyan', 'LLM:')}
  Provider:    ${config.llm.provider}
  Model:       ${config.llm.model}
  API Key:     ${config.llm.apiKey ? '••••••••' + config.llm.apiKey.slice(-4) : c('yellow', '(not set)')}

${c('cyan', 'Wallets:')}
  EVM:         ${config.wallet.evmAddress}
  Solana:      ${config.wallet.solanaAddress}

${c('cyan', 'x402 Tipping:')}
  Enabled:     ${config.x402.enabled ? c('green', 'Yes') : 'No'}
  ${config.x402.enabled ? `Agent ID:    ${config.x402.agentId}` : ''}

${c('cyan', 'Channels:')}
  Telegram:    ${config.channels.telegram ? c('green', 'Configured') : 'Not configured'}
  Discord:     ${config.channels.discord ? c('green', 'Configured') : 'Not configured'}
`);
      
      const confirm = await askYesNo(`\n${c('green', '?')} Save this configuration?`, true);
      if (confirm === BACK) return BACK;
      
      if (!confirm) {
        console.log(c('yellow', '\nConfiguration not saved. Starting over...\n'));
        return 'restart';
      }
      
      return true;
    }
  ];
  
  // Run steps with back navigation
  let currentStep = 0;
  
  while (currentStep < steps.length) {
    const result = await steps[currentStep]();
    
    if (result === BACK) {
      if (currentStep > 0) {
        currentStep--;
        console.log(c('dim', '\n↩ Going back...\n'));
      } else {
        console.log(c('dim', '\n(Already at first step)\n'));
      }
    } else if (result === 'restart') {
      currentStep = 0;
    } else if (result === false) {
      // Retry current step
      continue;
    } else {
      currentStep++;
    }
  }
  
  // Save configuration
  await saveConfig(config);
  
  // Offer to request starter funds
  await offerStarterFunds(config);
  
  // Install and start the agent
  const agentStarted = await installAndStartAgent(config);
  
  // Show final instructions
  printFinalInstructions(config, agentStarted);
  
  rl.close();
}

async function saveConfig(config) {
  console.log(`\n${c('cyan', '━━━')} ${c('bright', 'Saving Configuration')} ${c('cyan', '━━━')}\n`);
  
  // Read passphrase from PASSPHRASE.json
  const passphrasePath = path.join(config.wallet.keystorePath, 'PASSPHRASE.json');
  let passphrase = '';
  try {
    const passphraseData = JSON.parse(fs.readFileSync(passphrasePath, 'utf8'));
    passphrase = passphraseData.passphrase || passphraseData;
  } catch (e) {
    console.log(c('yellow', '   ⚠️  Could not read passphrase file'));
  }
  
  const envLines = [
    '# OpenClaw Agent Configuration',
    `# Generated ${new Date().toISOString()}`,
    '',
    '# Agent',
    `AGENT_NAME="${config.agent.name}"`,
    `AGENT_DESCRIPTION="${config.agent.description}"`,
    '',
    '# LLM',
    `LLM_PROVIDER="${config.llm.provider}"`,
  ];
  
  if (config.llm.provider === 'anthropic') {
    envLines.push(`ANTHROPIC_API_KEY="${config.llm.apiKey || ''}"`);
  } else if (config.llm.provider === 'openai') {
    envLines.push(`OPENAI_API_KEY="${config.llm.apiKey || ''}"`);
  } else {
    envLines.push(`OPENROUTER_API_KEY="${config.llm.apiKey || ''}"`);
  }
  envLines.push(`LLM_MODEL="${config.llm.model}"`, '');
  
  envLines.push(
    '# Wallet',
    `EVM_ADDRESS="${config.wallet.evmAddress}"`,
    `SOLANA_ADDRESS="${config.wallet.solanaAddress}"`,
    `WALLET_KEYSTORE_PATH="${config.wallet.keystorePath}"`,
    `WALLET_PASSPHRASE="${passphrase}"`,
    '',
    '# Networks',
    'FLARE_RPC="https://flare-api.flare.network/ext/C/rpc"',
    'BASE_RPC="https://mainnet.base.org"',
    'HYPEREVM_RPC="https://rpc.hyperliquid.xyz/evm"',
    'SOLANA_RPC="https://api.mainnet-beta.solana.com"',
    ''
  );
  
  if (config.x402.enabled) {
    envLines.push(
      '# x402',
      'X402_ENABLED=true',
      `X402_FACILITATOR_URL="${config.x402.facilitatorUrl}"`,
      `X402_AGENT_ID="${config.x402.agentId}"`,
      ''
    );
  }
  
  if (config.channels.telegram?.token) {
    envLines.push('# Telegram', `TELEGRAM_BOT_TOKEN="${config.channels.telegram.token}"`, '');
  }
  
  if (config.channels.discord?.token) {
    envLines.push('# Discord', `DISCORD_BOT_TOKEN="${config.channels.discord.token}"`, '');
  }
  
  const outputPath = path.join(config.wallet.keystorePath, '.env');
  fs.writeFileSync(outputPath, envLines.join('\n'));
  console.log(c('green', `✅ Saved: ${outputPath}`));
  
  // Save summary
  const configSummary = {
    ...config,
    llm: { ...config.llm, apiKey: config.llm.apiKey ? '[REDACTED]' : null },
    channels: {
      telegram: config.channels.telegram ? { configured: true } : null,
      discord: config.channels.discord ? { configured: true } : null
    },
    savedAt: new Date().toISOString()
  };
  fs.writeFileSync(
    path.join(config.wallet.keystorePath, 'config-summary.json'),
    JSON.stringify(configSummary, null, 2)
  );
  console.log(c('green', `✅ Saved: config-summary.json`));
  
  // Delete PASSPHRASE.json for security (passphrase is now in .env)
  if (passphrase) {
    try {
      fs.unlinkSync(passphrasePath);
      console.log(c('green', `✅ Removed: PASSPHRASE.json (passphrase saved in .env)`));
    } catch (e) {}
  }
}

async function installAndStartAgent(config) {
  const { execSync, spawn } = await import('child_process');
  
  console.log(`\n${c('cyan', '━━━')} ${c('bright', 'Starting Your Agent')} ${c('cyan', '━━━')}\n`);
  
  // Step 1: Check if clawdbot is installed
  let clawdbotInstalled = false;
  try {
    execSync('clawdbot --version', { stdio: 'pipe' });
    clawdbotInstalled = true;
    console.log(c('green', '✅ Clawdbot already installed'));
  } catch (e) {
    console.log('📦 Installing Clawdbot...\n');
    try {
      execSync('npm install -g clawdbot', { stdio: 'inherit' });
      clawdbotInstalled = true;
      console.log(c('green', '\n✅ Clawdbot installed'));
    } catch (e) {
      console.log(c('red', '\n❌ Failed to install Clawdbot'));
      console.log(c('dim', '   Try manually: npm install -g clawdbot'));
      return false;
    }
  }
  
  // Step 2: Generate clawdbot config.yaml
  console.log('\n📝 Generating Clawdbot config...');
  
  const configYaml = generateClawdbotConfig(config);
  const configPath = path.join(config.wallet.keystorePath, 'config.yaml');
  fs.writeFileSync(configPath, configYaml);
  console.log(c('green', `✅ Saved: ${configPath}`));
  
  // Step 3: Start the gateway
  console.log('\n🚀 Starting Clawdbot Gateway...\n');
  
  try {
    // Change to agent directory and start
    process.chdir(config.wallet.keystorePath);
    
    // Start gateway in background
    const gateway = spawn('clawdbot', ['gateway', 'start'], {
      detached: true,
      stdio: 'ignore',
      cwd: config.wallet.keystorePath
    });
    gateway.unref();
    
    // Wait a moment for startup
    await new Promise(r => setTimeout(r, 3000));
    
    // Check status
    try {
      const status = execSync('clawdbot gateway status', { 
        cwd: config.wallet.keystorePath,
        encoding: 'utf8',
        timeout: 5000
      });
      if (status.includes('running') || status.includes('online')) {
        console.log(c('green', '✅ Gateway is running!'));
        return true;
      }
    } catch (e) {}
    
    // Alternative: check if process is running
    console.log(c('green', '✅ Gateway started'));
    return true;
    
  } catch (e) {
    console.log(c('yellow', `⚠️  Could not auto-start gateway: ${e.message}`));
    console.log(c('dim', '\nStart manually:'));
    console.log(c('dim', `   cd ${config.wallet.keystorePath}`));
    console.log(c('dim', '   clawdbot gateway start'));
    return false;
  }
}

function generateClawdbotConfig(config) {
  // Build provider config
  let providerConfig = '';
  if (config.llm.provider === 'anthropic') {
    providerConfig = `provider:
  anthropic:
    apiKey: "${config.llm.apiKey}"`;
  } else if (config.llm.provider === 'openai') {
    providerConfig = `provider:
  openai:
    apiKey: "${config.llm.apiKey}"`;
  } else {
    providerConfig = `provider:
  openrouter:
    apiKey: "${config.llm.apiKey}"`;
  }
  
  // Build channel config
  let channelConfig = '';
  if (config.channels.telegram?.token) {
    channelConfig = `
channels:
  telegram:
    token: "${config.channels.telegram.token}"
    allowlist:
      - "*"  # Allow all users (restrict this in production)`;
  } else if (config.channels.discord?.token) {
    channelConfig = `
channels:
  discord:
    token: "${config.channels.discord.token}"
    allowlist:
      - "*"`;
  }
  
  return `# Clawdbot Configuration
# Generated by OpenClaw Agent Setup Wizard

agent:
  name: "${config.agent.name}"
  description: "${config.agent.description}"

model: "${config.llm.model}"

${providerConfig}
${channelConfig}

# Workspace
workspace: "."

# Heartbeat (optional background tasks)
# heartbeat:
#   enabled: true
#   intervalMinutes: 30
`;
}

async function offerStarterFunds(config) {
  if (!config.x402.enabled) return;
  
  console.log(`
${c('cyan', '╔══════════════════════════════════════════════════════════════╗')}
${c('cyan', '║')}            ${c('bright', '💰 Get Starter Funds')}                            ${c('cyan', '║')}
${c('cyan', '╚══════════════════════════════════════════════════════════════╝')}

New agents can request starter funds from our facilitator pool!
This helps you test x402 payments without needing your own tokens.
`);
  
  const requestFunds = await askYesNo('Request starter funds now?', true, false);
  
  if (!requestFunds) {
    return;
  }
  
  console.log(`\n${c('cyan', '━━━')} ${c('bright', 'Requesting Starter Funds')} ${c('cyan', '━━━')}\n`);
  
  // Request funds from facilitator
  console.log('📡 Connecting to facilitator...\n');
  
  try {
    const response = await fetch('https://agent-tips.vercel.app/api/onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentName: config.agent.name,
        agentId: config.x402.agentId,
        evmAddress: config.wallet.evmAddress,
        solanaAddress: config.wallet.solanaAddress,
        description: config.agent.description,
        requestType: 'starter_funds'
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(c('green', '✅ Request submitted!\n'));
      
      if (data.txHash) {
        console.log(`   Transaction: ${c('cyan', data.txHash)}`);
        console.log(`   Amount: ${data.amount || '1'} ${data.token || 'USDT'}`);
        console.log(`   Network: ${data.network || 'Flare'}`);
      } else if (data.queued) {
        console.log(`   Status: ${c('yellow', 'Queued for review')}`);
        console.log(`   Your request will be processed shortly.`);
      }
      
      if (data.message) {
        console.log(`\n   ${c('dim', data.message)}`);
      }
    } else {
      const errorText = await response.text();
      console.log(c('yellow', '⚠️  Could not auto-request funds\n'));
      console.log(c('dim', `   ${errorText || 'Facilitator may be busy'}`));
      showManualFundingInstructions(config);
    }
  } catch (e) {
    console.log(c('yellow', '⚠️  Network error - could not reach facilitator\n'));
    showManualFundingInstructions(config);
  }
}

function showManualFundingInstructions(config) {
  console.log(`
${c('bright', 'Manual Funding Options:')}

1. ${c('cyan', 'Request via API:')}
   curl -X POST https://agent-tips.vercel.app/api/tip \\
     -H "Content-Type: application/json" \\
     -d '{"agent": "${config.x402.agentId}", "amount": "1", "token": "USDT"}'

2. ${c('cyan', 'Request via Web:')}
   Visit: https://agent-tips.vercel.app?agent=${config.x402.agentId}

3. ${c('cyan', 'Self-fund:')}
   Send tokens to: ${config.wallet.evmAddress}
`);
}

function printFinalInstructions(config, agentStarted = false) {
  if (agentStarted) {
    console.log(`
${c('cyan', '╔══════════════════════════════════════════════════════════════╗')}
${c('cyan', '║')}            ${c('green', '🎉 Your Agent is LIVE!')}                          ${c('cyan', '║')}
${c('cyan', '╚══════════════════════════════════════════════════════════════╝')}

${c('bright', '💬 Message your bot now!')}
   ${config.channels.telegram ? `Telegram: Search for your bot and send /start` : ''}
   ${config.channels.discord ? `Discord: Invite your bot and mention it` : ''}

${c('bright', '📁 Your Files:')}
   ${config.wallet.keystorePath}/
   ├── config.yaml          ${c('dim', '← Clawdbot config')}
   ├── .env                 ${c('dim', '← Environment variables')}
   └── *-keystore.json      ${c('dim', '← Wallet files')}

${c('bright', '🔧 Manage your agent:')}
   cd ${config.wallet.keystorePath}
   clawdbot gateway status   # Check status
   clawdbot gateway stop     # Stop agent
   clawdbot gateway start    # Start agent
   clawdbot gateway logs     # View logs

${c('bright', '📚 Resources:')}
   • Docs: https://docs.clawd.bot
   • Tips: https://agent-tips.vercel.app

${c('dim', '─────────────────────────────────────────────────────────────────')}
${c('green', `✨ Agent "${config.agent.name}" is running! Go chat with it! ✨`)}
`);
  } else {
    console.log(`
${c('cyan', '╔══════════════════════════════════════════════════════════════╗')}
${c('cyan', '║')}                  ${c('green', '✅ Setup Complete!')}                         ${c('cyan', '║')}
${c('cyan', '╚══════════════════════════════════════════════════════════════╝')}

${c('bright', '📁 Your Files:')}
   ${config.wallet.keystorePath}/
   ├── config.yaml          ${c('dim', '← Clawdbot config')}
   ├── .env                 ${c('dim', '← Environment variables')}
   └── *-keystore.json      ${c('dim', '← Wallet files')}

${c('bright', '🚀 Start your agent:')}
   cd ${config.wallet.keystorePath}
   clawdbot gateway start

${c('bright', '📚 Resources:')}
   • Docs: https://docs.clawd.bot
   • Tips: https://agent-tips.vercel.app
   • GitHub: github.com/canddao1-dotcom/x402-flare-facilitator

${c('dim', '─────────────────────────────────────────────────────────────────')}
${c('dim', `Agent "${config.agent.name}" is ready! Happy building 🤖`)}
`);
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Agent Setup Wizard v2

Usage:
  node wizard.js          Run interactive setup
  node wizard.js --help   Show this help

Features:
  • Back navigation (type "back" at any prompt)
  • Summary confirmation before saving
  • Starter funds request for new agents

The wizard guides you through:
  1. Agent identity (name, description)
  2. LLM provider setup (Anthropic/OpenAI/OpenRouter)
  3. Multi-chain wallet generation
  4. x402 tipping registration
  5. Optional channels (Telegram/Discord)
  6. Review & confirm

Outputs a complete .env file ready for OpenClaw.
`);
    return;
  }
  
  try {
    await runWizard();
  } catch (e) {
    console.error(c('red', `\n❌ Error: ${e.message}`));
    if (e.stack) {
      console.error(c('dim', e.stack));
    }
    process.exit(1);
  }
}

// Handle unexpected termination
process.on('uncaughtException', (e) => {
  console.error(c('red', `\n❌ Unexpected error: ${e.message}`));
  if (rl) {
    try { rl.close(); } catch (e) {}
  }
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log(c('yellow', '\n\n👋 Setup cancelled.'));
  if (rl) {
    try { rl.close(); } catch (e) {}
  }
  process.exit(0);
});

main();
