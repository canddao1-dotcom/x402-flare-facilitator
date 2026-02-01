#!/usr/bin/env node
/**
 * Hyperliquid Trading Skill
 */

const https = require('https');

const API_URL = 'https://api.hyperliquid.xyz';
const MY_ADDRESS = '0xDb3556E7D9F7924713b81C1fe14C739A92F9ea9A';

async function apiCall(endpoint, data) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.hyperliquid.xyz',
      path: '/' + endpoint,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

async function getAccount(address = MY_ADDRESS) {
  const data = await apiCall('info', { type: 'clearinghouseState', user: address });
  
  console.log('\n=== Hyperliquid Account ===');
  console.log('Address:', address);
  console.log('Account Value:', data.marginSummary.accountValue, 'USD');
  console.log('Withdrawable:', data.withdrawable, 'USD');
  console.log('Positions:', data.assetPositions.length);
  
  if (data.assetPositions.length > 0) {
    console.log('\nOpen Positions:');
    for (const pos of data.assetPositions) {
      console.log(`  ${pos.position.coin}: ${pos.position.szi} @ ${pos.position.entryPx}`);
    }
  }
  
  return data;
}

async function getMarkets() {
  const data = await apiCall('info', { type: 'meta' });
  
  console.log('\n=== Hyperliquid Markets ===');
  console.log('Total markets:', data.universe.length);
  
  // Filter active, high-leverage markets
  const active = data.universe
    .filter(m => !m.isDelisted && m.maxLeverage >= 10)
    .sort((a, b) => b.maxLeverage - a.maxLeverage)
    .slice(0, 20);
  
  console.log('\nTop leverage markets:');
  console.log('Asset    | Max Lev | Decimals');
  console.log('---------|---------|----------');
  for (const m of active) {
    console.log(`${m.name.padEnd(8)} | ${String(m.maxLeverage).padEnd(7)} | ${m.szDecimals}`);
  }
}

async function getPrice(asset) {
  const data = await apiCall('info', { type: 'allMids' });
  const price = data[asset];
  if (price) {
    console.log(`${asset}: $${price}`);
  } else {
    console.log(`Asset ${asset} not found`);
  }
  return price;
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  
  switch (cmd) {
    case 'account':
      await getAccount(args[1] || MY_ADDRESS);
      break;
    case 'markets':
      await getMarkets();
      break;
    case 'price':
      if (!args[1]) {
        console.log('Usage: hl.js price BTC');
        return;
      }
      await getPrice(args[1].toUpperCase());
      break;
    default:
      console.log(`
Hyperliquid Trading CLI

Commands:
  account [address]   Check account balance and positions
  markets             List available markets
  price <asset>       Get current price

Status: Read-only. Trading requires funds deposited.
Deposit: Bridge USDT from Flare via Stargate
`);
  }
}

main().catch(console.error);
