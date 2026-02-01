#!/usr/bin/env node
/**
 * FlareBank Historical Activity
 * Queries mints, burns, transfers, and swaps from the Main contract
 */

import { ethers } from 'ethers';

const MAIN = '0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059';
const ROUTESCAN_API = 'https://api.routescan.io/v2/network/mainnet/evm/14/etherscan/api';

// Event topic hashes
const EVENTS = {
  Transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  Approval: '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',
  TokenPurchase: '0x623b3804fa71d67900d064613da8f94b9617215ee90799290593e1745087ad18',
  TokenSell: '0xdd73686403cf2d37d399d32aa0be7cc16f739561af09f5ddf2ccdc238a794e98',
  Reinvestment: '0x5f9b5ce1d7ec7b554529284a94d3930206ff8019f832a0bfb56c0b2cbfc729e9',
  // This appears to be a dividend/fee event
  OnTokenFee: '0x884edad9ce6fa2440d8a54cc123490eb96d2768479d49ff9c7366125a9424364',
};

// Known addresses
const KNOWN = {
  '0x0000000000000000000000000000000000000000': 'Null (Mint/Burn)',
  '0xaa68bc4bab9a63958466f49f5a58c54a412d4906': 'DAO Treasury',
  '0x5f29c8d049e47dd180c2b83e3560e8e271110335': 'Enosys V2 LP',
  '0x0f574fc895c1abf82aeff334fa9d8ba43f866111': 'SparkDex V2 LP',
};

function getEventName(topic) {
  for (const [name, hash] of Object.entries(EVENTS)) {
    if (hash.toLowerCase() === topic.toLowerCase()) return name;
  }
  return 'Unknown';
}

function getAddressLabel(addr) {
  const lower = addr.toLowerCase();
  for (const [a, label] of Object.entries(KNOWN)) {
    if (a.toLowerCase() === lower) return label;
  }
  return addr.slice(0, 10) + '...';
}

function formatTimestamp(hex) {
  const ts = parseInt(hex, 16);
  return new Date(ts * 1000).toISOString();
}

async function getEvents(fromBlock = 0, limit = 100) {
  const url = `${ROUTESCAN_API}?module=logs&action=getLogs&address=${MAIN}&fromBlock=${fromBlock}&toBlock=latest&page=1&offset=${limit}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.result || [];
}

async function getTokenPurchases(limit = 50) {
  const url = `${ROUTESCAN_API}?module=logs&action=getLogs&address=${MAIN}&topic0=${EVENTS.TokenPurchase}&fromBlock=0&toBlock=latest&page=1&offset=${limit}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.result || [];
}

async function getTokenSells(limit = 50) {
  const url = `${ROUTESCAN_API}?module=logs&action=getLogs&address=${MAIN}&topic0=${EVENTS.TokenSell}&fromBlock=0&toBlock=latest&page=1&offset=${limit}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.result || [];
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  FlareBank Historical Activity');
  console.log('  Contract:', MAIN);
  console.log('  Time:', new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Get recent mints (TokenPurchase)
  console.log('📍 RECENT MINTS (TokenPurchase)');
  console.log('───────────────────────────────────────────────────────────────────');
  const mints = await getTokenPurchases(10);
  
  if (mints.length === 0) {
    console.log('  No recent mints found');
  } else {
    for (const log of mints.slice(-10).reverse()) {
      const user = '0x' + log.topics[1].slice(26);
      const data = log.data;
      // data = ethIncoming (32 bytes) + minted (32 bytes)
      const ethIn = BigInt('0x' + data.slice(2, 66));
      const minted = BigInt('0x' + data.slice(66, 130));
      const time = formatTimestamp(log.timeStamp);
      console.log(`  ${time.slice(0, 16)}`);
      console.log(`    User: ${getAddressLabel(user)}`);
      console.log(`    WFLR In: ${parseFloat(ethers.formatUnits(ethIn, 18)).toFixed(2)}`);
      console.log(`    BANK Minted: ${parseFloat(ethers.formatUnits(minted, 18)).toFixed(2)}`);
      console.log('');
    }
  }

  // Get recent burns (TokenSell)
  console.log('📍 RECENT BURNS (TokenSell)');
  console.log('───────────────────────────────────────────────────────────────────');
  const burns = await getTokenSells(10);
  
  if (burns.length === 0) {
    console.log('  No recent burns found');
  } else {
    for (const log of burns.slice(-10).reverse()) {
      const user = '0x' + log.topics[1].slice(26);
      const data = log.data;
      // data = burned (32 bytes) + ethEarned (32 bytes)
      const burned = BigInt('0x' + data.slice(2, 66));
      const ethOut = BigInt('0x' + data.slice(66, 130));
      const time = formatTimestamp(log.timeStamp);
      console.log(`  ${time.slice(0, 16)}`);
      console.log(`    User: ${getAddressLabel(user)}`);
      console.log(`    BANK Burned: ${parseFloat(ethers.formatUnits(burned, 18)).toFixed(2)}`);
      console.log(`    WFLR Out: ${parseFloat(ethers.formatUnits(ethOut, 18)).toFixed(2)}`);
      console.log('');
    }
  }

  // Get recent transfers
  console.log('📍 RECENT TRANSFERS');
  console.log('───────────────────────────────────────────────────────────────────');
  const allLogs = await getEvents(54000000, 50);
  const transfers = allLogs.filter(l => l.topics[0].toLowerCase() === EVENTS.Transfer.toLowerCase());
  
  for (const log of transfers.slice(-10).reverse()) {
    const from = '0x' + log.topics[1].slice(26);
    const to = '0x' + log.topics[2].slice(26);
    const amount = BigInt(log.data);
    const time = formatTimestamp(log.timeStamp);
    
    // Categorize
    let type = 'Transfer';
    if (from === '0x0000000000000000000000000000000000000000') type = 'MINT';
    else if (to === '0x0000000000000000000000000000000000000000') type = 'BURN';
    else if (KNOWN[to.toLowerCase()]?.includes('LP')) type = 'LP Add';
    else if (KNOWN[from.toLowerCase()]?.includes('LP')) type = 'LP Remove';
    
    console.log(`  ${time.slice(0, 16)} | ${type.padEnd(10)} | ${parseFloat(ethers.formatUnits(amount, 18)).toFixed(2).padStart(12)} BANK`);
    console.log(`    ${getAddressLabel(from)} → ${getAddressLabel(to)}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
}

main().catch(console.error);
