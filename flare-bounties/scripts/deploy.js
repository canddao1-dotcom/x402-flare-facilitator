#!/usr/bin/env node
/**
 * Deploy BountyEscrow to Flare or HyperEVM
 */

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Network configs
const NETWORKS = {
  flare: {
    rpc: 'https://flare-api.flare.network/ext/C/rpc',
    chainId: 14,
    explorer: 'https://flarescan.com',
    usdt: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', // USD₮0
    name: 'Flare'
  },
  hyperevm: {
    rpc: 'https://rpc.hyperliquid.xyz/evm',
    chainId: 999,
    explorer: 'https://explorer.hyperliquid.xyz',
    usdt: '0x0000000000000000000000000000000000000000', // TBD
    name: 'HyperEVM'
  }
};

// Compiled bytecode (we'll compile with solc)
const BOUNTY_ESCROW_ABI = [
  "constructor(address _feeRecipient)",
  "function setAllowedToken(address token, bool allowed)",
  "function createBounty(address token, uint256 amount, uint256 workDeadlineHours, bytes32 metadataHash) returns (uint256)",
  "function claimBounty(uint256 bountyId)",
  "function submitWork(uint256 bountyId, bytes32 workHash)",
  "function approveBounty(uint256 bountyId)",
  "function rejectBounty(uint256 bountyId)",
  "function cancelBounty(uint256 bountyId)",
  "function finalizeExpired(uint256 bountyId)",
  "function getBounty(uint256 bountyId) view returns (tuple(address poster, address worker, address token, uint256 amount, uint256 stake, uint256 createdAt, uint256 workDeadline, uint256 reviewDeadline, bytes32 metadataHash, bytes32 workHash, uint8 status))",
  "function nextBountyId() view returns (uint256)",
  "function platformFeeBps() view returns (uint256)",
  "function stakeRatioBps() view returns (uint256)",
  "function allowedTokens(address) view returns (bool)",
  "event BountyCreated(uint256 indexed bountyId, address indexed poster, address token, uint256 amount, uint256 workDeadline, bytes32 metadataHash)",
  "event BountyClaimed(uint256 indexed bountyId, address indexed worker, uint256 stake)",
  "event WorkSubmitted(uint256 indexed bountyId, bytes32 workHash)",
  "event BountyApproved(uint256 indexed bountyId, address indexed worker, uint256 payout)",
  "event BountyRejected(uint256 indexed bountyId, address indexed worker, uint256 slashedStake)"
];

async function loadWallet(network) {
  // Try keystore first
  const keystorePath = process.env.KEYSTORE_PATH || path.join(process.env.HOME, '.agent-keystore.json');
  const passwordPath = process.env.KEYSTORE_PASSWORD_PATH || path.join(process.env.HOME, '.agent-keystore-password');
  
  if (fs.existsSync(keystorePath) && fs.existsSync(passwordPath)) {
    const keystore = fs.readFileSync(keystorePath, 'utf8');
    const password = fs.readFileSync(passwordPath, 'utf8').trim();
    const wallet = await ethers.Wallet.fromEncryptedJson(keystore, password);
    const provider = new ethers.JsonRpcProvider(NETWORKS[network].rpc);
    return wallet.connect(provider);
  }
  
  // Try private key
  if (process.env.PRIVATE_KEY) {
    const provider = new ethers.JsonRpcProvider(NETWORKS[network].rpc);
    return new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  }
  
  throw new Error('No wallet found. Set KEYSTORE_PATH or PRIVATE_KEY');
}

async function deploy(network) {
  console.log(`\n🚀 Deploying BountyEscrow to ${NETWORKS[network].name}...\n`);
  
  const wallet = await loadWallet(network);
  console.log(`Deployer: ${wallet.address}`);
  
  const balance = await wallet.provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ${network === 'flare' ? 'FLR' : 'HYPE'}`);
  
  // For now, use a pre-compiled bytecode or compile on the fly
  // In production, we'd use hardhat or foundry
  console.log('\n⚠️  Contract needs to be compiled first.');
  console.log('Run: npx hardhat compile');
  console.log('Or use Remix to deploy manually.\n');
  
  // Save deployment info template
  const deploymentPath = path.join(__dirname, '..', 'data', `deployment-${network}.json`);
  const template = {
    network,
    chainId: NETWORKS[network].chainId,
    deployer: wallet.address,
    feeRecipient: wallet.address, // Default to deployer
    contract: null, // Fill after deployment
    usdt: NETWORKS[network].usdt,
    deployedAt: null
  };
  
  fs.writeFileSync(deploymentPath, JSON.stringify(template, null, 2));
  console.log(`Template saved to ${deploymentPath}`);
  console.log('Update "contract" field after manual deployment.\n');
}

async function verify(network) {
  const deploymentPath = path.join(__dirname, '..', 'data', `deployment-${network}.json`);
  
  if (!fs.existsSync(deploymentPath)) {
    console.error('No deployment found. Run deploy first.');
    process.exit(1);
  }
  
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  
  if (!deployment.contract) {
    console.error('Contract address not set in deployment file.');
    process.exit(1);
  }
  
  const provider = new ethers.JsonRpcProvider(NETWORKS[network].rpc);
  const contract = new ethers.Contract(deployment.contract, BOUNTY_ESCROW_ABI, provider);
  
  console.log(`\n📋 BountyEscrow on ${NETWORKS[network].name}`);
  console.log(`Contract: ${deployment.contract}`);
  console.log(`Explorer: ${NETWORKS[network].explorer}/address/${deployment.contract}`);
  
  try {
    const nextId = await contract.nextBountyId();
    const feeBps = await contract.platformFeeBps();
    const stakeBps = await contract.stakeRatioBps();
    const usdtAllowed = await contract.allowedTokens(NETWORKS[network].usdt);
    
    console.log(`\nStats:`);
    console.log(`  Total bounties: ${nextId}`);
    console.log(`  Platform fee: ${Number(feeBps) / 100}%`);
    console.log(`  Stake ratio: ${Number(stakeBps) / 100}%`);
    console.log(`  USDT allowed: ${usdtAllowed}`);
  } catch (e) {
    console.error(`Error reading contract: ${e.message}`);
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0];
const network = args[1] || 'flare';

if (!NETWORKS[network]) {
  console.error(`Unknown network: ${network}. Use 'flare' or 'hyperevm'`);
  process.exit(1);
}

switch (command) {
  case 'deploy':
    deploy(network);
    break;
  case 'verify':
    verify(network);
    break;
  default:
    console.log(`
BountyEscrow Deployment

Usage:
  node deploy.js deploy <network>   Deploy contract
  node deploy.js verify <network>   Verify deployment

Networks: flare, hyperevm
`);
}
