const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying ClawlyMarket with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "FLR");

  // Token addresses on Flare
  const USDT_FLARE = "0xe7cd86e13AC4309349F30B3435a9d337750fC82D"; // USD₮0
  const TREASURY = deployer.address; // Use deployer as treasury initially
  
  console.log("\nDeploying ClawlyMarket...");
  console.log("  USDT:", USDT_FLARE);
  console.log("  Treasury:", TREASURY);
  
  const ClawlyMarket = await hre.ethers.getContractFactory("ClawlyMarket");
  const market = await ClawlyMarket.deploy(USDT_FLARE, TREASURY);
  
  await market.waitForDeployment();
  const address = await market.getAddress();
  
  console.log("\n✅ ClawlyMarket deployed to:", address);
  console.log("\nNext steps:");
  console.log("1. Approve USDT spend: usdt.approve('" + address + "', amount)");
  console.log("2. Create first market: market.createMarket(slug, question, seedAmount, closeTime)");
  console.log("3. Agents predict: market.predict(marketId, pYes)");
  
  // Save deployment info
  const fs = require("fs");
  const deployInfo = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    contract: address,
    usdt: USDT_FLARE,
    treasury: TREASURY,
    deployer: deployer.address,
    deployedAt: new Date().toISOString()
  };
  
  fs.writeFileSync(
    `./deployments/${hre.network.name}.json`,
    JSON.stringify(deployInfo, null, 2)
  );
  console.log("\nDeployment info saved to deployments/" + hre.network.name + ".json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
