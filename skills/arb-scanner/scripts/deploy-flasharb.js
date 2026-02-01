#!/usr/bin/env node
/**
 * Deploy FlashArb contract
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RPC_URL = 'https://flare-api.flare.network/ext/C/rpc';
const KEYSTORE_PATH = '/home/node/clawd/skills/fblpmanager/data/clawd-wallet.json';

// Compiled contract bytecode and ABI (we'll compile with solc)
async function compile() {
  const contractPath = path.join(__dirname, '..', 'contracts', 'FlashArb.sol');
  const source = fs.readFileSync(contractPath, 'utf8');
  
  // Use solcjs or assume bytecode exists
  // For now, let's use a simpler inline compilation via ethers
  console.log('Contract source ready. Need solc to compile...');
  
  // Check if solc is available
  try {
    execSync('which solc', { encoding: 'utf8' });
    console.log('Compiling with solc...');
    
    const outDir = path.join(__dirname, '..', 'contracts', 'build');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    
    execSync(`solc --optimize --optimize-runs 200 --bin --abi -o ${outDir} --overwrite ${contractPath}`, {
      encoding: 'utf8',
      stdio: 'inherit'
    });
    
    const bytecode = '0x' + fs.readFileSync(path.join(outDir, 'FlashArb.bin'), 'utf8').trim();
    const abi = JSON.parse(fs.readFileSync(path.join(outDir, 'FlashArb.abi'), 'utf8'));
    
    return { bytecode, abi };
  } catch (e) {
    console.log('solc not found, using pre-compiled...');
    // Return null to indicate we need to compile another way
    return null;
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const keystore = JSON.parse(fs.readFileSync(KEYSTORE_PATH, 'utf8'));
  const wallet = new ethers.Wallet(keystore.privateKey, provider);
  
  console.log('Deployer:', wallet.address);
  
  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', ethers.formatEther(balance), 'FLR');
  
  const compiled = await compile();
  if (!compiled) {
    console.log('\n⚠️  Need to install solc or provide pre-compiled bytecode');
    console.log('Run: npm install -g solc');
    console.log('Or: apt-get install solc');
    return;
  }
  
  console.log('\nDeploying FlashArb...');
  const factory = new ethers.ContractFactory(compiled.abi, compiled.bytecode, wallet);
  const contract = await factory.deploy();
  
  console.log('Tx:', contract.deploymentTransaction().hash);
  console.log('Waiting for confirmation...');
  
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  
  console.log('\n✅ FlashArb deployed!');
  console.log('Address:', address);
  
  // Save deployment info
  const deployInfo = {
    address,
    deployer: wallet.address,
    timestamp: Date.now(),
    network: 'flare',
    txHash: contract.deploymentTransaction().hash
  };
  
  fs.writeFileSync(
    path.join(__dirname, '..', 'contracts', 'deployment.json'),
    JSON.stringify(deployInfo, null, 2)
  );
  
  console.log('\nSaved to contracts/deployment.json');
}

main().catch(console.error);
