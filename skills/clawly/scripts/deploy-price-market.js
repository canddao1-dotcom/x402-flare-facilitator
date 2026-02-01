#!/usr/bin/env node
/**
 * Deploy ClawlyPriceMarket - Trustless FTSO-based prediction markets
 */

const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const network = hre.network.name;
  console.log(`\n🚀 Deploying ClawlyPriceMarket to ${network}...\n`);

  // Network config
  const config = {
    flare: {
      usdt: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D',
      treasury: '0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A',
    },
    coston2: {
      usdt: '0x...',  // Testnet USDT if available
      treasury: '0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A',
    }
  };

  const netConfig = config[network];
  if (!netConfig) {
    throw new Error(`Unknown network: ${network}`);
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log('Deployer:', deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log('Balance:', hre.ethers.formatEther(balance), 'FLR');

  // Deploy
  console.log('\nDeploying ClawlyPriceMarket...');
  const ClawlyPriceMarket = await hre.ethers.getContractFactory('ClawlyPriceMarket');
  const contract = await ClawlyPriceMarket.deploy(netConfig.usdt, netConfig.treasury);
  await contract.waitForDeployment();
  
  const address = await contract.getAddress();
  console.log('✅ ClawlyPriceMarket deployed to:', address);

  // Test FTSO integration
  console.log('\n📊 Testing FTSO integration...');
  try {
    // This will fail if FTSO isn't accessible
    const ftsoRegistry = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';
    const registryAbi = ['function getContractAddressByName(string) view returns (address)'];
    const registry = new hre.ethers.Contract(ftsoRegistry, registryAbi, deployer);
    const ftsoAddr = await registry.getContractAddressByName('FtsoV2');
    console.log('FtsoV2 address:', ftsoAddr);
    console.log('✅ FTSO integration verified!');
  } catch (e) {
    console.log('⚠️  FTSO test failed:', e.message);
  }

  // Save deployment info
  const deployDir = path.join(__dirname, '..', 'deployments');
  if (!fs.existsSync(deployDir)) fs.mkdirSync(deployDir);
  
  const deployment = {
    network,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    contract: address,
    usdt: netConfig.usdt,
    treasury: netConfig.treasury,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    txHash: contract.deploymentTransaction()?.hash,
    type: 'price-market',
    features: ['trustless-resolution', 'ftso-oracle', 'anyone-can-resolve']
  };

  const deployFile = path.join(deployDir, `${network}-price.json`);
  fs.writeFileSync(deployFile, JSON.stringify(deployment, null, 2));
  console.log(`\n📁 Deployment saved to: ${deployFile}`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('🎰 ClawlyPriceMarket Deployment Complete!');
  console.log('='.repeat(60));
  console.log(`Contract:  ${address}`);
  console.log(`USDT:      ${netConfig.usdt}`);
  console.log(`Treasury:  ${netConfig.treasury}`);
  console.log(`Network:   ${network}`);
  console.log('='.repeat(60));
  console.log('\n🔑 Key Features:');
  console.log('  • Trustless resolution via FTSO oracle');
  console.log('  • Anyone can trigger resolve() after settlement');
  console.log('  • No admin can manipulate outcomes');
  console.log('  • Fully on-chain and verifiable');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
