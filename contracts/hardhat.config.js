import fs from 'fs';

const walletData = JSON.parse(fs.readFileSync('/home/node/clawd/skills/fblpmanager/data/clawd-wallet.json', 'utf8'));

export default {
  solidity: "0.8.20",
  networks: {
    flare: {
      url: "https://flare-api.flare.network/ext/C/rpc",
      chainId: 14,
      accounts: [walletData.privateKey]
    }
  }
};
