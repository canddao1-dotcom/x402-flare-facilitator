import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // Load wallet
  const walletData = JSON.parse(fs.readFileSync('/home/node/clawd/skills/fblpmanager/data/clawd-wallet.json', 'utf8'));
  
  // Connect to Flare
  const provider = new ethers.JsonRpcProvider("https://flare-api.flare.network/ext/C/rpc");
  const wallet = new ethers.Wallet(walletData.privateKey, provider);
  
  console.log("Deployer:", wallet.address);
  
  // Fee recipient is CanddaoJr wallet
  const feeRecipient = "0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A";
  console.log("Fee recipient:", feeRecipient);
  
  // Load compiled contract
  const artifactPath = path.join(__dirname, '../artifacts/contracts/TipSplitter.sol/TipSplitter.json');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  
  console.log("Deploying TipSplitter...");
  
  // Deploy
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(feeRecipient);
  
  console.log("TX:", contract.deploymentTransaction().hash);
  console.log("Waiting for confirmation...");
  
  await contract.waitForDeployment();
  
  const address = await contract.getAddress();
  console.log("✅ TipSplitter deployed to:", address);
  
  // Verify owner
  const owner = await contract.owner();
  console.log("Contract owner:", owner);
  
  // Verify fee settings
  const feeBps = await contract.feeBps();
  console.log("Fee (bps):", feeBps.toString(), "=", Number(feeBps) / 100, "%");
  
  // Save deployment info
  const deployment = {
    address,
    owner,
    feeRecipient,
    feeBps: Number(feeBps),
    deployedAt: new Date().toISOString(),
    network: "flare",
    chainId: 14
  };
  
  fs.writeFileSync(
    path.join(__dirname, '../deployment.json'),
    JSON.stringify(deployment, null, 2)
  );
  console.log("Deployment info saved to deployment.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
