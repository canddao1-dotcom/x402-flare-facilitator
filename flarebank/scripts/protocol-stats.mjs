#!/usr/bin/env node
/**
 * FlareBank Protocol Stats
 * Queries Main Vault and IBDP contracts for protocol-wide metrics
 */

import { ethers } from 'ethers';

const RPC = 'https://flare-api.flare.network/ext/C/rpc';

const CONTRACTS = {
  MAIN: '0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059',
  IBDP: '0x90679234fe693b39bfdf5642060cb10571adc59b',
  WFLR: '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d',
  DAO: '0xaa68bc4bab9a63958466f49f5a58c54a412d4906',
};

// V2 LP for AMM price
const V2_LP_ENOSYS = '0x5f29c8d049e47dd180c2b83e3560e8e271110335';

const SEL = {
  balanceOf: '0x70a08231',
  totalSupply: '0x18160ddd',
  buyPrice: '0x8620410b',
  sellPrice: '0x4b750334',
  nextClaimEpoch: '0x96137390',
  getReserves: '0x0902f1ac',
};

async function rpcCall(to, data) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [{ to, data }, 'latest'], id: 1 }),
  });
  const json = await res.json();
  if (json.error) return null;
  return json.result;
}

function encAddr(addr) {
  return addr.toLowerCase().replace('0x', '').padStart(64, '0');
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  FlareBank Protocol Stats - Live On-Chain Data');
  console.log('  Time:', new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Get WFLR balances
  const mainWFLRHex = await rpcCall(CONTRACTS.WFLR, SEL.balanceOf + encAddr(CONTRACTS.MAIN));
  const ibdpWFLRHex = await rpcCall(CONTRACTS.WFLR, SEL.balanceOf + encAddr(CONTRACTS.IBDP));
  const bankSupplyHex = await rpcCall(CONTRACTS.MAIN, SEL.totalSupply);
  
  const mainWFLR = parseFloat(ethers.formatUnits(BigInt(mainWFLRHex), 18));
  const ibdpWFLR = parseFloat(ethers.formatUnits(BigInt(ibdpWFLRHex), 18));
  const bankSupply = parseFloat(ethers.formatUnits(BigInt(bankSupplyHex), 18));
  const totalTVL = mainWFLR + ibdpWFLR;
  const backing = totalTVL / bankSupply;

  // Get prices
  const buyPriceHex = await rpcCall(CONTRACTS.MAIN, SEL.buyPrice);
  const sellPriceHex = await rpcCall(CONTRACTS.MAIN, SEL.sellPrice);
  const buyPrice = parseFloat(ethers.formatUnits(BigInt(buyPriceHex), 18));
  const sellPrice = parseFloat(ethers.formatUnits(BigInt(sellPriceHex), 18));

  // Get next claim epoch
  const nextEpochHex = await rpcCall(CONTRACTS.MAIN, SEL.nextClaimEpoch);
  const nextEpoch = nextEpochHex ? parseInt(nextEpochHex, 16) : 'N/A';

  // Get AMM price from Enosys V2 LP
  const reservesHex = await rpcCall(V2_LP_ENOSYS, SEL.getReserves);
  const r0 = BigInt('0x' + reservesHex.slice(2, 66));   // BANK
  const r1 = BigInt('0x' + reservesHex.slice(66, 130)); // WFLR
  const ammPrice = Number(ethers.formatUnits(r1, 18)) / Number(ethers.formatUnits(r0, 18));

  // TVL Formula price: 1 + (TVL / 10000) * 0.01
  const tvlFormulaPrice = 1 + (totalTVL / 10000) * 0.01;

  console.log('📍 MAIN CONTRACT (BANK Token)');
  console.log('───────────────────────────────────────────────────────────────────');
  console.log(`  Address:         ${CONTRACTS.MAIN}`);
  console.log(`  WFLR Balance:    ${mainWFLR.toLocaleString()} WFLR`);
  console.log(`  BANK Supply:     ${bankSupply.toLocaleString()} BANK`);
  console.log(`  Buy Price:       ${buyPrice.toFixed(4)} WFLR/BANK`);
  console.log(`  Sell Price:      ${sellPrice.toFixed(6)} WFLR/BANK`);
  console.log(`  Next Claim:      Epoch ${nextEpoch}`);

  console.log('\n📍 IBDP CONTRACT (Delegation Pot)');
  console.log('───────────────────────────────────────────────────────────────────');
  console.log(`  Address:         ${CONTRACTS.IBDP}`);
  console.log(`  WFLR Staked:     ${ibdpWFLR.toLocaleString()} WFLR`);
  console.log(`  % of TVL:        ${((ibdpWFLR / totalTVL) * 100).toFixed(2)}%`);

  console.log('\n📍 PROTOCOL TOTALS');
  console.log('───────────────────────────────────────────────────────────────────');
  console.log(`  Total TVL:       ${totalTVL.toLocaleString()} WFLR`);
  console.log(`  Backing/BANK:    ${backing.toFixed(4)} WFLR`);
  console.log(`  TVL Formula:     ${tvlFormulaPrice.toFixed(4)} WFLR/BANK`);
  console.log(`  AMM Price:       ${ammPrice.toFixed(4)} WFLR/BANK`);
  console.log(`  Premium/Disc:    ${((ammPrice / tvlFormulaPrice - 1) * 100).toFixed(2)}%`);

  // Get FLR price for USD values
  try {
    const priceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=flare-networks&vs_currencies=usd');
    const priceData = await priceRes.json();
    const flrPrice = priceData['flare-networks']?.usd || 0;
    
    if (flrPrice > 0) {
      console.log('\n📍 USD VALUES');
      console.log('───────────────────────────────────────────────────────────────────');
      console.log(`  FLR Price:       $${flrPrice.toFixed(6)}`);
      console.log(`  Protocol TVL:    $${(totalTVL * flrPrice).toLocaleString()}`);
      console.log(`  BANK (Buy):      $${(buyPrice * flrPrice).toFixed(4)}`);
      console.log(`  BANK (AMM):      $${(ammPrice * flrPrice).toFixed(4)}`);
      console.log(`  Market Cap:      $${(bankSupply * ammPrice * flrPrice).toLocaleString()}`);
    }
  } catch (e) {
    console.log('\n⚠️  Could not fetch USD prices');
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
}

main().catch(console.error);
