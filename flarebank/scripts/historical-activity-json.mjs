#!/usr/bin/env node
/**
 * FlareBank Historical Activity - JSON Output
 * For programmatic access to mints, burns, transfers
 */

import { ethers } from 'ethers';

const MAIN = '0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059';
const ROUTESCAN_API = 'https://api.routescan.io/v2/network/mainnet/evm/14/etherscan/api';

const EVENTS = {
  Transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  TokenPurchase: '0x623b3804fa71d67900d064613da8f94b9617215ee90799290593e1745087ad18',
  TokenSell: '0xdd73686403cf2d37d399d32aa0be7cc16f739561af09f5ddf2ccdc238a794e98',
};

async function fetchLogs(topic0, limit = 50) {
  const url = `${ROUTESCAN_API}?module=logs&action=getLogs&address=${MAIN}&topic0=${topic0}&fromBlock=0&toBlock=latest&page=1&offset=${limit}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.result || [];
}

async function main() {
  const result = {
    timestamp: new Date().toISOString(),
    contract: MAIN,
    mints: [],
    burns: [],
    transfers: [],
  };

  // Get mints
  const mintLogs = await fetchLogs(EVENTS.TokenPurchase, 50);
  for (const log of mintLogs) {
    const user = '0x' + log.topics[1].slice(26);
    const referrer = '0x' + log.topics[2].slice(26);
    const ethIn = BigInt('0x' + log.data.slice(2, 66));
    const minted = BigInt('0x' + log.data.slice(66, 130));
    result.mints.push({
      block: parseInt(log.blockNumber, 16),
      timestamp: new Date(parseInt(log.timeStamp, 16) * 1000).toISOString(),
      txHash: log.transactionHash,
      user,
      referrer,
      wflrIn: parseFloat(ethers.formatUnits(ethIn, 18)),
      bankMinted: parseFloat(ethers.formatUnits(minted, 18)),
    });
  }

  // Get burns
  const burnLogs = await fetchLogs(EVENTS.TokenSell, 50);
  for (const log of burnLogs) {
    const user = '0x' + log.topics[1].slice(26);
    const burned = BigInt('0x' + log.data.slice(2, 66));
    const ethOut = BigInt('0x' + log.data.slice(66, 130));
    result.burns.push({
      block: parseInt(log.blockNumber, 16),
      timestamp: new Date(parseInt(log.timeStamp, 16) * 1000).toISOString(),
      txHash: log.transactionHash,
      user,
      bankBurned: parseFloat(ethers.formatUnits(burned, 18)),
      wflrOut: parseFloat(ethers.formatUnits(ethOut, 18)),
    });
  }

  // Get transfers
  const transferLogs = await fetchLogs(EVENTS.Transfer, 100);
  for (const log of transferLogs) {
    const from = '0x' + log.topics[1].slice(26);
    const to = '0x' + log.topics[2].slice(26);
    const amount = BigInt(log.data);
    
    // Categorize
    let type = 'transfer';
    if (from === '0x0000000000000000000000000000000000000000') type = 'mint';
    else if (to === '0x0000000000000000000000000000000000000000') type = 'burn';
    else if (to.toLowerCase() === '0x5f29c8d049e47dd180c2b83e3560e8e271110335') type = 'lp_add_enosys';
    else if (from.toLowerCase() === '0x5f29c8d049e47dd180c2b83e3560e8e271110335') type = 'lp_remove_enosys';
    else if (to.toLowerCase() === '0x0f574fc895c1abf82aeff334fa9d8ba43f866111') type = 'lp_add_sparkdex';
    else if (from.toLowerCase() === '0x0f574fc895c1abf82aeff334fa9d8ba43f866111') type = 'lp_remove_sparkdex';

    result.transfers.push({
      block: parseInt(log.blockNumber, 16),
      timestamp: new Date(parseInt(log.timeStamp, 16) * 1000).toISOString(),
      txHash: log.transactionHash,
      type,
      from,
      to,
      amount: parseFloat(ethers.formatUnits(amount, 18)),
    });
  }

  // Sort by timestamp descending
  result.mints.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  result.burns.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  result.transfers.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
