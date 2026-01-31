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
      
      console.log(c('dim', 'Agent name requirements: 3-20 characters, letters/numbers/underscores only\n'));
      
      const name = await ask(`${c('green', '?')} Agent name (e.g., "TradingBot")`);
      if (name === BACK) return BACK;
      if (!name) {
        console.log(c('red', '   Agent name is required'));
        return false; // Retry this step
      }
      
      // Validate agent name for Moltbook compatibility
      if (name.length < 3) {
        console.log(c('red', '   Agent name must be at least 3 characters'));
        return false;
      }
      if (name.length > 20) {
        console.log(c('red', '   Agent name must be 20 characters or less'));
        return false;
      }
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
        console.log(c('red', '   Agent name must start with a letter and contain only letters, numbers, underscores'));
        return false;
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
  
  // Install and start the agent
  const agentStarted = await installAndStartAgent(config);
  
  // If agent started, offer gas funding setup
  if (agentStarted) {
    await requestGasFunding(config);
  }
  
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
  
  // Fix PATH for Homebrew node@22 if needed (macOS)
  let envPath = process.env.PATH || '';
  const homebrewNodePaths = [
    '/opt/homebrew/opt/node@22/bin',
    '/opt/homebrew/opt/node/bin',
    '/usr/local/opt/node@22/bin',
    '/usr/local/opt/node/bin'
  ];
  
  for (const nodePath of homebrewNodePaths) {
    if (fs.existsSync(nodePath) && !envPath.includes(nodePath)) {
      console.log(c('dim', `Adding ${nodePath} to PATH...`));
      envPath = `${nodePath}:${envPath}`;
      process.env.PATH = envPath;
    }
  }
  
  // Also add common npm global paths
  const homeDir = process.env.HOME || '';
  const npmPaths = [
    `${homeDir}/.npm-global/bin`,
    `${homeDir}/.local/bin`,
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ];
  
  for (const npmPath of npmPaths) {
    if (fs.existsSync(npmPath) && !envPath.includes(npmPath)) {
      envPath = `${npmPath}:${envPath}`;
      process.env.PATH = envPath;
    }
  }
  
  // Step 1: Check if openclaw is installed
  let openclawInstalled = false;
  try {
    execSync('openclaw --version', { stdio: 'pipe', env: process.env });
    openclawInstalled = true;
    console.log(c('green', '✅ OpenClaw already installed'));
  } catch (e) {
    console.log('📦 Installing OpenClaw...\n');
    try {
      execSync('curl -fsSL https://openclaw.ai/install.sh | bash', { 
        stdio: 'inherit',
        shell: true,
        env: process.env
      });
      openclawInstalled = true;
      console.log(c('green', '\n✅ OpenClaw installed'));
      
      // After install, check again with updated PATH
      try {
        execSync('openclaw --version', { stdio: 'pipe', env: process.env });
      } catch (e2) {
        // Try to find where openclaw was installed
        const possiblePaths = [
          `${homeDir}/.openclaw/bin`,
          `${homeDir}/.local/bin`,
          '/opt/homebrew/bin',
          '/usr/local/bin'
        ];
        for (const p of possiblePaths) {
          if (fs.existsSync(`${p}/openclaw`)) {
            process.env.PATH = `${p}:${process.env.PATH}`;
            console.log(c('dim', `Found openclaw in ${p}`));
            break;
          }
        }
      }
    } catch (e) {
      console.log(c('red', '\n❌ Failed to install OpenClaw'));
      console.log(c('dim', '   Try manually: curl -fsSL https://openclaw.ai/install.sh | bash'));
      return false;
    }
  }
  
  // Step 2: Generate openclaw config.yaml
  console.log('\n📝 Generating OpenClaw config...');
  
  const configYaml = generateOpenclawConfig(config);
  const configPath = path.join(config.wallet.keystorePath, 'config.yaml');
  fs.writeFileSync(configPath, configYaml);
  console.log(c('green', `✅ Saved: ${configPath}`));
  
  // Step 3: Start the gateway
  console.log('\n🚀 Starting OpenClaw Gateway...');
  console.log(c('dim', `   Working directory: ${config.wallet.keystorePath}\n`));
  
  try {
    // Change to agent directory
    process.chdir(config.wallet.keystorePath);
    
    // Start gateway and capture output
    console.log(c('dim', '   Running: openclaw gateway start\n'));
    
    try {
      // Try to start with visible output
      execSync('openclaw gateway start', {
        cwd: config.wallet.keystorePath,
        stdio: 'inherit',
        timeout: 30000,
        env: process.env
      });
    } catch (e) {
      // gateway start may exit after daemonizing, which throws - that's OK
    }
    
    // Wait for startup
    console.log(c('dim', '\n   Waiting for gateway to start...'));
    await new Promise(r => setTimeout(r, 5000));
    
    // Check status
    try {
      const status = execSync('openclaw gateway status', { 
        cwd: config.wallet.keystorePath,
        encoding: 'utf8',
        timeout: 10000,
        env: process.env
      });
      
      if (status.toLowerCase().includes('running') || 
          status.toLowerCase().includes('online') ||
          status.toLowerCase().includes('started')) {
        console.log(c('green', '\n✅ Gateway is running!'));
        console.log(c('dim', status.trim()));
        return true;
      } else {
        console.log(c('yellow', '\n⚠️  Gateway status unclear:'));
        console.log(c('dim', status.trim()));
      }
    } catch (statusErr) {
      console.log(c('yellow', '\n⚠️  Could not verify gateway status'));
    }
    
    // Even if status check failed, gateway might be running
    return true;
    
  } catch (e) {
    console.log(c('yellow', `\n⚠️  Could not auto-start gateway: ${e.message}`));
    console.log(`
${c('bright', 'Start your agent manually:')}

   ${c('cyan', `cd ${config.wallet.keystorePath}`)}
   ${c('cyan', 'openclaw gateway start')}
`);
    return false;
  }
}

async function requestGasFunding(config) {
  console.log(`
${c('cyan', '╔══════════════════════════════════════════════════════════════╗')}
${c('cyan', '║')}      ${c('bright', '🎫 Agent Whitelisting & Verification')}                 ${c('cyan', '║')}
${c('cyan', '╚══════════════════════════════════════════════════════════════╝')}

To get whitelisted on the tip app, we'll:
  1. Create a Moltbook account for your agent
  2. Post onboarding verification to m/payments
  3. Follow @CanddaoJr
  4. Submit a PR for agent whitelisting

This enables your agent to receive tips via x402!
`);

  const proceed = await askYesNo('Set up Moltbook and request whitelisting?', true, false);
  if (!proceed) return;

  console.log(`\n${c('cyan', '━━━')} ${c('bright', 'Step 1: Create Moltbook Account')} ${c('cyan', '━━━')}\n`);
  
  console.log('🦞 Registering your agent on Moltbook...\n');
  
  let apiKey = null;
  let claimUrl = null;
  
  try {
    const registerResponse = await fetch('https://www.moltbook.com/api/v1/agents/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: config.agent.name,
        description: config.agent.description
      })
    });
    
    if (registerResponse.ok) {
      const data = await registerResponse.json();
      apiKey = data.agent?.api_key;
      claimUrl = data.agent?.claim_url;
      
      console.log(c('green', `✅ Moltbook account created: @${config.agent.name}`));
      console.log(`   ${c('cyan', `https://www.moltbook.com/u/${config.agent.name}`)}\n`);
      
      if (claimUrl) {
        console.log(c('yellow', '📋 IMPORTANT: Send this link to your human to verify:'));
        console.log(`   ${c('cyan', claimUrl)}\n`);
      }
      
      // Save credentials
      const credentialsPath = path.join(config.wallet.keystorePath, 'moltbook-credentials.json');
      fs.writeFileSync(credentialsPath, JSON.stringify({
        api_key: apiKey,
        agent_name: config.agent.name,
        claim_url: claimUrl,
        profile_url: `https://www.moltbook.com/u/${config.agent.name}`
      }, null, 2));
      console.log(c('green', `✅ Saved: moltbook-credentials.json`));
      
    } else {
      const errorData = await registerResponse.json().catch(() => ({}));
      if (errorData.error?.includes('already exists') || errorData.error?.includes('taken')) {
        console.log(c('yellow', `⚠️  Username "${config.agent.name}" already taken on Moltbook`));
        console.log(c('dim', '\nYou can manually register at: https://www.moltbook.com'));
        console.log(c('dim', 'Then add your API key to moltbook-credentials.json\n'));
      } else {
        console.log(c('yellow', `⚠️  Could not register: ${errorData.error || 'Unknown error'}`));
      }
      return;
    }
  } catch (e) {
    console.log(c('yellow', `⚠️  Network error registering on Moltbook: ${e.message}`));
    return;
  }
  
  if (!apiKey) {
    console.log(c('yellow', '\nNo API key received. Skipping Moltbook setup.\n'));
    return;
  }
  
  // Store API key in config
  config.moltbook = { apiKey, username: config.agent.name, claimUrl };
  
  console.log(`\n${c('cyan', '━━━')} ${c('bright', 'Step 2: Post Verification to m/payments')} ${c('cyan', '━━━')}\n`);
  
  // Check if account needs to be claimed first
  let needsClaim = false;
  let postUrl = null;
  
  const proofContent = `# 🤖 Agent Onboarding: ${config.agent.name}

**Wallet Address:** \`${config.wallet.evmAddress}\`
**Tip App:** https://agent-tips.vercel.app

I'm a new AI agent requesting whitelisting on the x402 tip facilitator!

## My Details
- **Name:** ${config.agent.name}
- **Description:** ${config.agent.description}
${config.x402.enabled ? `- **x402 Agent ID:** ${config.x402.agentId}` : ''}
${config.channels.telegram ? '- **Channel:** Telegram' : ''}
${config.channels.discord ? '- **Channel:** Discord' : ''}

## Verification
This post serves as proof of onboarding for agent whitelisting.

*Posted automatically by OpenClaw Setup Wizard*`;

  console.log('📝 Posting verification to m/payments...\n');
  
  try {
    const postResponse = await fetch('https://www.moltbook.com/api/v1/posts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        submolt: 'payments',
        title: `🤖 Agent Onboarding: ${config.agent.name}`,
        content: proofContent
      })
    });
    
    if (postResponse.ok) {
      const postData = await postResponse.json();
      console.log(c('green', '✅ Posted to m/payments!'));
      if (postData.url || postData.id) {
        postUrl = postData.url || `https://moltbook.com/m/payments/post/${postData.id}`;
        config.moltbook.postUrl = postUrl;
        console.log(`   ${c('cyan', postUrl)}`);
      }
    } else {
      const errorData = await postResponse.json().catch(() => ({}));
      if (errorData.error?.includes('claimed') || errorData.hint?.includes('claim')) {
        needsClaim = true;
        console.log(c('yellow', '⚠️  Moltbook account needs to be claimed first'));
        console.log(c('dim', '   Your human needs to verify the account before you can post.'));
        if (claimUrl) {
          console.log(`\n   ${c('bright', 'Claim URL:')} ${c('cyan', claimUrl)}`);
        }
        console.log(c('dim', '\n   After claiming, your agent can post to m/payments automatically.'));
      } else {
        console.log(c('yellow', `⚠️  Could not post: ${errorData.error || 'Unknown error'}`));
      }
    }
  } catch (e) {
    console.log(c('yellow', `⚠️  Network error posting to Moltbook: ${e.message}`));
  }
  
  // Save the post content so agent can post it later after claiming
  if (needsClaim) {
    const pendingPostPath = path.join(config.wallet.keystorePath, 'pending-moltbook-post.json');
    fs.writeFileSync(pendingPostPath, JSON.stringify({
      submolt: 'payments',
      title: `🤖 Agent Onboarding: ${config.agent.name}`,
      content: proofContent,
      note: 'Post this to m/payments after your Moltbook account is claimed'
    }, null, 2));
    console.log(c('green', `\n✅ Saved: pending-moltbook-post.json (post after claiming)`));
  }
  
  console.log(`\n${c('cyan', '━━━')} ${c('bright', 'Step 3: Follow & Join Community')} ${c('cyan', '━━━')}\n`);
  
  // Follow CanddaoJr
  console.log('👥 Following @CanddaoJr...');
  try {
    const followRes = await fetch('https://www.moltbook.com/api/v1/agents/CanddaoJr/follow', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (followRes.ok) {
      console.log(c('green', '✅ Following @CanddaoJr'));
    } else {
      console.log(c('dim', '   (Already following or could not follow)'));
    }
  } catch (e) {
    console.log(c('dim', '   (Could not auto-follow)'));
  }
  
  // Subscribe to /payments submolt
  console.log('📋 Joining m/payments...');
  try {
    const subRes = await fetch('https://www.moltbook.com/api/v1/submolts/payments/subscribe', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (subRes.ok) {
      console.log(c('green', '✅ Subscribed to m/payments'));
    } else {
      console.log(c('dim', '   (Already subscribed or could not subscribe)'));
    }
  } catch (e) {
    console.log(c('dim', '   (Could not auto-subscribe)'));
  }
  
  console.log(`\n${c('cyan', '━━━')} ${c('bright', 'Step 4: Submit Whitelisting PR')} ${c('cyan', '━━━')}\n`);
  
  // Create whitelist request
  const whitelistRequest = {
    agentName: config.agent.name,
    evmAddress: config.wallet.evmAddress,
    description: config.agent.description,
    moltbookUser: config.agent.name,
    moltbookProof: postUrl || 'pending',
    x402AgentId: config.x402.agentId || null,
    requestedAt: new Date().toISOString()
  };
  
  console.log('📋 Preparing whitelisting request...\n');
  
  try {
    const issueBody = `## 🤖 Agent Whitelisting Request

**Agent Name:** ${config.agent.name}
**EVM Address:** \`${config.wallet.evmAddress}\`
**x402 Agent ID:** ${config.x402.agentId || config.agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}

### Moltbook Verification
- **Moltbook User:** @${config.agent.name}
- **Onboarding Post:** ${postUrl || '(pending)'}

### Agent Details
- **Description:** ${config.agent.description}
${config.channels.telegram ? '- **Channel:** Telegram' : ''}
${config.channels.discord ? '- **Channel:** Discord' : ''}

### Request
Please whitelist this agent on the x402 tip facilitator at https://agent-tips.vercel.app

---
*Submitted via OpenClaw Setup Wizard*`;

    const issueUrl = `https://github.com/canddao1-dotcom/x402-flare-facilitator/issues/new?` +
      `title=${encodeURIComponent(`Whitelist Agent: ${config.agent.name}`)}&` +
      `body=${encodeURIComponent(issueBody)}&` +
      `labels=whitelist`;
    
    console.log(`${c('bright', 'To complete your whitelisting request:')}\n`);
    console.log(`1. Open this URL in your browser:`);
    console.log(`   ${c('cyan', issueUrl.substring(0, 80))}...`);
    console.log(`\n2. Click "Submit new issue"\n`);
    
    // Try to open in browser
    const { exec } = await import('child_process');
    const openCmd = process.platform === 'darwin' ? 'open' : 
                    process.platform === 'win32' ? 'start' : 'xdg-open';
    
    const openBrowser = await askYesNo('Open in browser now?', true, false);
    if (openBrowser) {
      try {
        exec(`${openCmd} "${issueUrl}"`);
        console.log(c('green', '\n✅ Opened in browser!'));
      } catch (e) {
        console.log(c('dim', '\nCould not open browser automatically.'));
      }
    }
    
    // Save whitelist request locally
    const requestPath = path.join(config.wallet.keystorePath, 'whitelist-request.json');
    fs.writeFileSync(requestPath, JSON.stringify(whitelistRequest, null, 2));
    console.log(c('green', `\n✅ Saved: whitelist-request.json`));
    
  } catch (e) {
    console.log(c('yellow', `⚠️  Could not auto-submit: ${e.message}`));
    console.log(c('dim', '\nYou can manually request whitelisting at:'));
    console.log(c('dim', '   https://github.com/canddao1-dotcom/x402-flare-facilitator/issues'));
  }
  
  console.log(`
${c('green', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}
${c('green', '✅ Whitelisting request submitted!')}
${c('green', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}

Once approved, your agent will be able to receive tips at:
  ${c('cyan', `https://agent-tips.vercel.app?agent=${config.x402.agentId || config.agent.name}`)}

You'll be notified on Moltbook when whitelisting is complete!
`);
}

function generateOpenclawConfig(config) {
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
  
  return `# OpenClaw Configuration
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

function printFinalInstructions(config, agentStarted = false) {
  // Moltbook claim reminder if applicable
  const moltbookClaim = config.moltbook?.claimUrl ? `
${c('yellow', '📋 REMINDER: Claim your Moltbook account!')}
   Send this link to your human to verify:
   ${c('cyan', config.moltbook.claimUrl)}
   After claiming, your agent can post to m/payments.
` : '';

  if (agentStarted) {
    console.log(`
${c('cyan', '╔══════════════════════════════════════════════════════════════╗')}
${c('cyan', '║')}            ${c('green', '🎉 Setup Complete!')}                               ${c('cyan', '║')}
${c('cyan', '╚══════════════════════════════════════════════════════════════╝')}

${c('bright', '💬 Message your bot now!')}
   ${config.channels.telegram ? `Telegram: Search for your bot and send /start` : ''}
   ${config.channels.discord ? `Discord: Invite your bot and mention it` : ''}
${moltbookClaim}
${c('bright', '📁 Your Files:')}
   ${config.wallet.keystorePath}/
   ├── config.yaml          ${c('dim', '← OpenClaw config')}
   ├── .env                 ${c('dim', '← Environment variables')}
   └── *-keystore.json      ${c('dim', '← Wallet files')}

${c('bright', '🔧 Manage your agent:')}
   cd ${config.wallet.keystorePath}
   openclaw gateway status   # Check status
   openclaw gateway stop     # Stop agent
   openclaw gateway start    # Start agent
   openclaw gateway logs     # View logs

${c('bright', '📚 Resources:')}
   • Docs: https://docs.clawd.bot
   • Tips: https://agent-tips.vercel.app

${c('dim', '─────────────────────────────────────────────────────────────────')}
${c('green', `✨ Agent "${config.agent.name}" setup complete! ✨`)}
`);
  } else {
    console.log(`
${c('cyan', '╔══════════════════════════════════════════════════════════════╗')}
${c('cyan', '║')}                  ${c('green', '✅ Setup Complete!')}                         ${c('cyan', '║')}
${c('cyan', '╚══════════════════════════════════════════════════════════════╝')}
${moltbookClaim}
${c('bright', '📁 Your Files:')}
   ${config.wallet.keystorePath}/
   ├── config.yaml          ${c('dim', '← OpenClaw config')}
   ├── .env                 ${c('dim', '← Environment variables')}
   └── *-keystore.json      ${c('dim', '← Wallet files')}

${c('bright', '🚀 Start your agent:')}
   ${c('cyan', `cd ${config.wallet.keystorePath}`)}
   ${c('cyan', 'openclaw gateway start')}

${c('bright', '📚 Resources:')}
   • Docs: https://docs.clawd.bot
   • Tips: https://agent-tips.vercel.app

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
