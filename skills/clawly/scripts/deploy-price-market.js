const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying ClawlyPriceMarketV3 with:', deployer.address);

  const USDT = '0xe7cd86e13AC4309349F30B3435a9d337750fC82D';
  const TREASURY = deployer.address;

  const Factory = await ethers.getContractFactory('ClawlyPriceMarketV3');
  const contract = await Factory.deploy(USDT, TREASURY);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('ClawlyPriceMarketV3 deployed to:', address);

  // Save deployment info
  const deployment = {
    network: 'flare',
    chainId: 14,
    contractName: 'ClawlyPriceMarketV3',
    contract: address,
    usdt: USDT,
    treasury: TREASURY,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    verified: false,
    explorer: `https://flarescan.com/address/${address}`,
    features: [
      'FTSO Oracle Integration',
      'Trustless Resolution',
      'Pre-populated Feed IDs (FLR, ETH, BTC, XRP, SOL, DOGE, ADA, AVAX, LINK)'
    ]
  };

  const deploymentPath = path.join(__dirname, '../deployments/flare-price-v3.json');
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log('Deployment saved to:', deploymentPath);

  console.log('\nVerify with:');
  console.log(`npx hardhat verify --network flare ${address} ${USDT} ${TREASURY}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
