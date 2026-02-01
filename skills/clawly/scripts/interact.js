#!/usr/bin/env node
/**
 * Clawly Market Interaction Script
 * Usage: node scripts/interact.js <command> [args]
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Load deployment
const NETWORK = process.env.NETWORK || 'flare';
const deployPath = path.join(__dirname, '..', 'deployments', `${NETWORK}.json`);

// ABI (minimal for interactions)
const ABI = [
  "function createMarket(string slug, string question, uint256 seedAmount, uint256 closeTime) external",
  "function predict(bytes32 marketId, uint256 pYes) external",
  "function resolveMarket(bytes32 marketId, bool outcome) external",
  "function claim(bytes32 marketId) external",
  "function getMarket(bytes32 marketId) external view returns (string question, uint256 seedAmount, uint256 potAmount, uint256 closeTime, bool resolved, bool outcome, uint256 predictionCount)",
  "function getPrediction(bytes32 marketId, address agent) external view returns (uint256 pYes, uint256 timestamp, bool claimed)",
  "function estimatePayout(bytes32 marketId, address agent, bool assumedOutcome) external view returns (uint256)",
  "function slugToId(string slug) external pure returns (bytes32)",
  "function getMarketAgents(bytes32 marketId) external view returns (address[])",
  "function ENTRY_FEE() external view returns (uint256)",
  "event MarketCreated(bytes32 indexed marketId, string question, uint256 seedAmount, uint256 closeTime)",
  "event PredictionMade(bytes32 indexed marketId, address indexed agent, uint256 pYes)",
  "event MarketResolved(bytes32 indexed marketId, bool outcome, uint256 totalScore)",
  "event PayoutClaimed(bytes32 indexed marketId, address indexed agent, uint256 amount)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)"
];

async function main() {
  const command = process.argv[2];
  
  if (!command) {
    console.log(`
Clawly Market CLI

Usage: node interact.js <command> [args]

Commands:
  info                           Show contract info
  create <slug> <question> <days> Create market (seed=10 USDT, closes in N days)
  predict <slug> <pYes>          Make prediction (pYes: 1-99)
  resolve <slug> <yes|no>        Resolve market
  claim <slug>                   Claim payout
  market <slug>                  Show market details
  agents <slug>                  List agents who predicted
  estimate <slug> <agent> <yes|no>  Estimate payout

Environment:
  PRIVATE_KEY    Wallet private key
  NETWORK        Network name (default: flare)
  RPC_URL        Custom RPC URL
`);
    process.exit(0);
  }
  
  // Setup provider
  const RPC_URLS = {
    flare: 'https://flare-api.flare.network/ext/C/rpc',
    coston2: 'https://coston2-api.flare.network/ext/C/rpc'
  };
  const rpcUrl = process.env.RPC_URL || RPC_URLS[NETWORK];
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  // Load deployment info
  if (!fs.existsSync(deployPath)) {
    console.error(`No deployment found at ${deployPath}`);
    console.error('Deploy first with: npx hardhat run scripts/deploy.js --network ' + NETWORK);
    process.exit(1);
  }
  const deploy = JSON.parse(fs.readFileSync(deployPath, 'utf8'));
  
  // Setup wallet if needed
  let wallet = null;
  if (process.env.PRIVATE_KEY) {
    wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  }
  
  const contract = new ethers.Contract(deploy.contract, ABI, wallet || provider);
  const usdt = new ethers.Contract(deploy.usdt, ERC20_ABI, wallet || provider);
  
  // Execute command
  switch (command) {
    case 'info': {
      console.log('Clawly Market Info');
      console.log('==================');
      console.log('Network:', NETWORK);
      console.log('Contract:', deploy.contract);
      console.log('USDT:', deploy.usdt);
      console.log('Treasury:', deploy.treasury);
      console.log('Deployed:', deploy.deployedAt);
      const entryFee = await contract.ENTRY_FEE();
      console.log('Entry Fee:', ethers.formatUnits(entryFee, 6), 'USDT');
      break;
    }
    
    case 'create': {
      if (!wallet) throw new Error('PRIVATE_KEY required');
      const [, , , slug, question, days] = process.argv;
      if (!slug || !question || !days) throw new Error('Usage: create <slug> <question> <days>');
      
      const seedAmount = ethers.parseUnits('10', 6); // 10 USDT
      const closeTime = Math.floor(Date.now() / 1000) + (parseInt(days) * 86400);
      
      // Approve USDT
      console.log('Approving USDT spend...');
      const approveTx = await usdt.approve(deploy.contract, seedAmount);
      await approveTx.wait();
      
      // Create market
      console.log('Creating market:', slug);
      const tx = await contract.createMarket(slug, question, seedAmount, closeTime);
      const receipt = await tx.wait();
      
      const marketId = await contract.slugToId(slug);
      console.log('✅ Market created!');
      console.log('   Slug:', slug);
      console.log('   Market ID:', marketId);
      console.log('   Closes:', new Date(closeTime * 1000).toISOString());
      console.log('   TX:', receipt.hash);
      break;
    }
    
    case 'predict': {
      if (!wallet) throw new Error('PRIVATE_KEY required');
      const [, , , slug, pYes] = process.argv;
      if (!slug || !pYes) throw new Error('Usage: predict <slug> <pYes>');
      
      const pYesInt = parseInt(pYes);
      if (pYesInt < 1 || pYesInt > 99) throw new Error('pYes must be 1-99');
      
      const marketId = await contract.slugToId(slug);
      const entryFee = await contract.ENTRY_FEE();
      
      // Approve USDT
      console.log('Approving USDT spend...');
      const approveTx = await usdt.approve(deploy.contract, entryFee);
      await approveTx.wait();
      
      // Make prediction
      console.log('Making prediction: pYes =', pYesInt + '%');
      const tx = await contract.predict(marketId, pYesInt);
      const receipt = await tx.wait();
      
      console.log('✅ Prediction submitted!');
      console.log('   TX:', receipt.hash);
      break;
    }
    
    case 'resolve': {
      if (!wallet) throw new Error('PRIVATE_KEY required');
      const [, , , slug, outcome] = process.argv;
      if (!slug || !outcome) throw new Error('Usage: resolve <slug> <yes|no>');
      
      const marketId = await contract.slugToId(slug);
      const outcomeBoolean = outcome.toLowerCase() === 'yes';
      
      console.log('Resolving market:', slug, '→', outcomeBoolean ? 'YES' : 'NO');
      const tx = await contract.resolveMarket(marketId, outcomeBoolean);
      const receipt = await tx.wait();
      
      console.log('✅ Market resolved!');
      console.log('   TX:', receipt.hash);
      break;
    }
    
    case 'claim': {
      if (!wallet) throw new Error('PRIVATE_KEY required');
      const [, , , slug] = process.argv;
      if (!slug) throw new Error('Usage: claim <slug>');
      
      const marketId = await contract.slugToId(slug);
      
      console.log('Claiming payout for market:', slug);
      const tx = await contract.claim(marketId);
      const receipt = await tx.wait();
      
      console.log('✅ Payout claimed!');
      console.log('   TX:', receipt.hash);
      break;
    }
    
    case 'market': {
      const [, , , slug] = process.argv;
      if (!slug) throw new Error('Usage: market <slug>');
      
      const marketId = await contract.slugToId(slug);
      const m = await contract.getMarket(marketId);
      
      console.log('Market:', slug);
      console.log('=========');
      console.log('Question:', m[0]);
      console.log('Seed:', ethers.formatUnits(m[1], 6), 'USDT');
      console.log('Pot:', ethers.formatUnits(m[2], 6), 'USDT');
      console.log('Closes:', new Date(Number(m[3]) * 1000).toISOString());
      console.log('Resolved:', m[4]);
      if (m[4]) console.log('Outcome:', m[5] ? 'YES' : 'NO');
      console.log('Predictions:', m[6].toString());
      break;
    }
    
    case 'agents': {
      const [, , , slug] = process.argv;
      if (!slug) throw new Error('Usage: agents <slug>');
      
      const marketId = await contract.slugToId(slug);
      const agents = await contract.getMarketAgents(marketId);
      
      console.log('Agents for market:', slug);
      console.log('Total:', agents.length);
      for (const agent of agents) {
        const pred = await contract.getPrediction(marketId, agent);
        console.log(`  ${agent}: pYes=${pred[0]}% claimed=${pred[2]}`);
      }
      break;
    }
    
    case 'estimate': {
      const [, , , slug, agent, outcome] = process.argv;
      if (!slug || !agent || !outcome) throw new Error('Usage: estimate <slug> <agent> <yes|no>');
      
      const marketId = await contract.slugToId(slug);
      const outcomeBoolean = outcome.toLowerCase() === 'yes';
      
      const payout = await contract.estimatePayout(marketId, agent, outcomeBoolean);
      console.log('Estimated payout:', ethers.formatUnits(payout, 6), 'USDT');
      break;
    }
    
    default:
      console.error('Unknown command:', command);
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
