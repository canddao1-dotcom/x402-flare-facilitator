#!/usr/bin/env node
/**
 * FAssets Bridge - Flare to Hyperliquid via LayerZero
 * 
 * Supports: FXRP, USDT0, FLR → HyperEVM
 * 
 * Discovered from tx: 0x79ff4fee36338a62dc37bd923717498e027d33bf91fb839fecfe3cca794e17ff
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Config
const FLARE_RPC = 'https://flare-api.flare.network/ext/C/rpc';
const HYPEREVM_EID = 30367;  // NOT 30150!

// Token configs
const TOKENS = {
  FXRP: {
    address: '0xAd552A648C74D49E10027AB8a618A3ad4901c5bE',
    oft: '0xd70659a6396285BF7214d7Ea9673184e7C72E07E',
    decimals: 6,
    name: 'FXRP'
  },
  USDT0: {
    address: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D',
    oft: null, // TODO: Find from user tx
    decimals: 6,
    name: 'USD₮0'
  },
  FLR: {
    address: null, // Native
    oft: null, // TODO: Find
    decimals: 18,
    name: 'FLR'
  }
};

// ABIs
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function decimals() view returns (uint8)'
];

const OFT_ABI = [
  'function token() view returns (address)',
  'function endpoint() view returns (address)',
  'function quoteSend(tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd), bool payInLzToken) view returns (tuple(uint256 nativeFee, uint256 lzTokenFee))',
  'function send(tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd), tuple(uint256 nativeFee, uint256 lzTokenFee), address refundAddress) payable returns (tuple(bytes32, uint64, tuple(uint256, uint256)))'
];

// LayerZero executor options for HyperEVM
// Gas limit 200000 for execution
const EXTRA_OPTIONS = '0x00030100110100000000000000000000000000030d4001001303000000000000000000000000000000030d40';

function buildComposeMsg(senderAddress) {
  // Pad sender address for compose message
  const clean = senderAddress.toLowerCase().replace('0x', '');
  return '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' + clean;
}

async function loadWallet(keystorePath) {
  const provider = new ethers.JsonRpcProvider(FLARE_RPC);
  
  const keystore = JSON.parse(fs.readFileSync(keystorePath, 'utf8'));
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr
  });
  
  const password = await new Promise(resolve => {
    rl.question('Keystore password: ', answer => {
      rl.close();
      resolve(answer);
    });
  });
  
  const wallet = await ethers.Wallet.fromEncryptedJson(JSON.stringify(keystore), password);
  return wallet.connect(provider);
}

async function getQuote(token, amount, recipient) {
  const tokenConfig = TOKENS[token.toUpperCase()];
  if (!tokenConfig || !tokenConfig.oft) {
    console.error('Token not supported:', token);
    console.log('Supported tokens with OFT:', Object.keys(TOKENS).filter(t => TOKENS[t].oft).join(', '));
    return null;
  }
  
  const provider = new ethers.JsonRpcProvider(FLARE_RPC);
  const oft = new ethers.Contract(tokenConfig.oft, OFT_ABI, provider);
  
  const amountLD = ethers.parseUnits(amount.toString(), tokenConfig.decimals);
  const to = ethers.zeroPadValue(recipient, 32);
  const composeMsg = buildComposeMsg(recipient);
  
  const sendParam = {
    dstEid: HYPEREVM_EID,
    to: to,
    amountLD: amountLD,
    minAmountLD: amountLD, // No slippage for now
    extraOptions: EXTRA_OPTIONS,
    composeMsg: composeMsg,
    oftCmd: '0x'
  };
  
  try {
    const quote = await oft.quoteSend(sendParam, false);
    return {
      nativeFee: quote[0],
      lzTokenFee: quote[1],
      sendParam,
      tokenConfig
    };
  } catch (e) {
    console.error('Quote failed:', e.message);
    return null;
  }
}

async function quote(token, amount, recipient) {
  console.log(`\n=== FAssets Bridge Quote ===`);
  console.log(`Route: Flare → HyperEVM (eid ${HYPEREVM_EID})`);
  console.log(`Token: ${token.toUpperCase()}`);
  console.log(`Amount: ${amount}`);
  console.log(`Recipient: ${recipient}`);
  
  const result = await getQuote(token, amount, recipient);
  if (result) {
    console.log(`\nLayerZero Fee: ${ethers.formatEther(result.nativeFee)} FLR`);
    console.log(`\n✅ Route available`);
  }
  return result;
}

async function bridge(keystorePath, token, amount, recipient, skipConfirm = false) {
  const tokenConfig = TOKENS[token.toUpperCase()];
  if (!tokenConfig || !tokenConfig.oft) {
    console.error('Token not supported:', token);
    return;
  }
  
  // Load wallet
  const wallet = await loadWallet(keystorePath);
  const provider = wallet.provider;
  
  console.log(`\n=== FAssets Bridge ===`);
  console.log(`From: ${wallet.address}`);
  console.log(`To: ${recipient} (HyperEVM)`);
  console.log(`Token: ${tokenConfig.name}`);
  console.log(`Amount: ${amount}`);
  
  // Check balance
  const tokenContract = new ethers.Contract(tokenConfig.address, ERC20_ABI, provider);
  const balance = await tokenContract.balanceOf(wallet.address);
  const amountLD = ethers.parseUnits(amount.toString(), tokenConfig.decimals);
  
  console.log(`\nBalance: ${ethers.formatUnits(balance, tokenConfig.decimals)} ${tokenConfig.name}`);
  
  if (balance < amountLD) {
    console.error('Insufficient balance!');
    return;
  }
  
  // Get quote
  const quoteResult = await getQuote(token, amount, recipient);
  if (!quoteResult) return;
  
  console.log(`LZ Fee: ${ethers.formatEther(quoteResult.nativeFee)} FLR`);
  
  // Check FLR balance for fees
  const flrBalance = await provider.getBalance(wallet.address);
  if (flrBalance < quoteResult.nativeFee + ethers.parseEther('1')) {
    console.error('Insufficient FLR for fees!');
    return;
  }
  
  // Check allowance
  const allowance = await tokenContract.allowance(wallet.address, tokenConfig.oft);
  
  if (allowance < amountLD) {
    console.log(`\nApproving ${tokenConfig.name}...`);
    const approveTx = await tokenContract.connect(wallet).approve(
      tokenConfig.oft,
      ethers.MaxUint256
    );
    console.log(`Approval tx: ${approveTx.hash}`);
    await approveTx.wait();
    console.log('✅ Approved');
  }
  
  // Confirm
  if (!skipConfirm) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr
    });
    
    const confirm = await new Promise(resolve => {
      rl.question('\nProceed with bridge? (yes/no): ', answer => {
        rl.close();
        resolve(answer.toLowerCase());
      });
    });
    
    if (confirm !== 'yes' && confirm !== 'y') {
      console.log('Cancelled');
      return;
    }
  }
  
  // Execute bridge
  console.log('\nSending to HyperEVM...');
  
  const oft = new ethers.Contract(tokenConfig.oft, OFT_ABI, wallet);
  
  const tx = await oft.send(
    quoteResult.sendParam,
    { nativeFee: quoteResult.nativeFee, lzTokenFee: 0n },
    wallet.address, // refund address
    { value: quoteResult.nativeFee }
  );
  
  console.log(`Bridge tx: ${tx.hash}`);
  console.log(`Flarescan: https://flarescan.com/tx/${tx.hash}`);
  
  const receipt = await tx.wait();
  console.log(`\n✅ Bridge initiated! Gas used: ${receipt.gasUsed}`);
  console.log(`\nTokens will arrive on HyperEVM in ~1-5 minutes`);
  console.log(`Check: https://layerzeroscan.com/tx/${tx.hash}`);
  
  // Add to bridge monitor tracking
  try {
    const { execSync } = require('child_process');
    const monitorScript = path.join(__dirname, 'bridge-monitor.js');
    execSync(`node "${monitorScript}" add ${tx.hash} ${tokenConfig.name} ${amount} ${recipient}`, {
      stdio: 'inherit'
    });
  } catch (e) {
    // Monitor tracking is optional
    console.log('(Bridge tracking not available)');
  }
  
  return tx.hash;
}

async function checkBalance(token, address) {
  const tokenConfig = TOKENS[token.toUpperCase()];
  if (!tokenConfig) {
    console.error('Unknown token:', token);
    return;
  }
  
  const provider = new ethers.JsonRpcProvider(FLARE_RPC);
  
  if (tokenConfig.address) {
    const contract = new ethers.Contract(tokenConfig.address, ERC20_ABI, provider);
    const balance = await contract.balanceOf(address);
    console.log(`${tokenConfig.name}: ${ethers.formatUnits(balance, tokenConfig.decimals)}`);
  } else {
    const balance = await provider.getBalance(address);
    console.log(`FLR: ${ethers.formatEther(balance)}`);
  }
}

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      parsed[key] = args[i + 1];
      i++;
    }
  }
  return parsed;
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const opts = parseArgs(args.slice(1));
  
  switch (cmd) {
    case 'quote':
      if (!opts.token || !opts.amount) {
        console.log('Usage: fassets-bridge.js quote --token FXRP --amount 10 --recipient 0x...');
        return;
      }
      await quote(opts.token, opts.amount, opts.recipient || opts.to || '0x0000000000000000000000000000000000000001');
      break;
      
    case 'send':
    case 'bridge':
      if (!opts.keystore || !opts.token || !opts.amount || !opts.recipient) {
        console.log('Usage: fassets-bridge.js send --keystore <path> --token FXRP --amount 10 --recipient 0x...');
        return;
      }
      await bridge(opts.keystore, opts.token, opts.amount, opts.recipient, opts.yes === 'true');
      break;
      
    case 'balance':
      if (!opts.address) {
        console.log('Usage: fassets-bridge.js balance --token FXRP --address 0x...');
        return;
      }
      await checkBalance(opts.token || 'FXRP', opts.address);
      break;
      
    case 'tokens':
      console.log('\n=== Supported Tokens ===');
      for (const [key, config] of Object.entries(TOKENS)) {
        console.log(`${key}:`);
        console.log(`  Token: ${config.address || '(native)'}`);
        console.log(`  OFT: ${config.oft || '(not configured)'}`);
        console.log(`  Status: ${config.oft ? '✅ Ready' : '❌ Need OFT address'}`);
      }
      break;
      
    default:
      console.log(`
FAssets Bridge - Flare → HyperEVM (LayerZero)

Commands:
  tokens                    Show supported tokens
  quote                     Get bridge fee quote
  send/bridge               Execute bridge transfer
  balance                   Check token balance

Examples:
  fassets-bridge.js quote --token FXRP --amount 10 --recipient 0x...
  fassets-bridge.js send --keystore ./keystore.json --token FXRP --amount 10 --recipient 0x...
  fassets-bridge.js balance --token FXRP --address 0x...

Notes:
  - HyperEVM endpoint: ${HYPEREVM_EID}
  - Bridge fee: ~11 FLR (LayerZero cross-chain fee)
  - Arrival time: 1-5 minutes
`);
  }
}

main().catch(console.error);
