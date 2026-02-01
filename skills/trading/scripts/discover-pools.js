#!/usr/bin/env node
/**
 * Pool Discovery - Uses DefiLlama API (same as LP skill)
 * Discovers V3 pools for trading engine
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', 'config', 'pools.json');

// Fetch pools from DefiLlama
async function fetchPools() {
  return new Promise((resolve, reject) => {
    https.get('https://yields.llama.fi/pools', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const pools = JSON.parse(data).data
            .filter(p => p.chain === 'Flare')
            .filter(p => ['sparkdex-v3.1', 'enosys-v3'].includes(p.project))
            .filter(p => p.tvlUsd > 5000)
            .sort((a, b) => b.tvlUsd - a.tvlUsd);
          resolve(pools);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Main
async function main() {
  const action = process.argv[2] || 'list';
  
  if (action === 'list') {
    const pools = await fetchPools();
    
    console.log('📊 **V3 POOLS FOR TRADING**\n');
    console.log('```');
    console.log('Pool                 | DEX       | TVL      | APY');
    console.log('-'.repeat(55));
    
    pools.forEach(p => {
      const dex = p.project.includes('spark') ? 'SparkDex' : 'Enosys';
      const tvl = p.tvlUsd > 1e6 ? `$${(p.tvlUsd/1e6).toFixed(1)}M` : `$${(p.tvlUsd/1e3).toFixed(0)}K`;
      console.log(`${p.symbol.padEnd(20)} | ${dex.padEnd(9)} | ${tvl.padEnd(8)} | ${(p.apy || 0).toFixed(1)}%`);
    });
    console.log('```');
    console.log(`\nTotal: ${pools.length} V3 pools`);
    
  } else if (action === 'update') {
    // Update config with discovered pools
    const pools = await fetchPools();
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    
    console.log('🔄 Updating pool config...\n');
    
    // Add new pools from DefiLlama
    let added = 0;
    for (const p of pools) {
      const poolId = p.pool; // DefiLlama pool ID contains address
      const addrMatch = poolId.match(/0x[a-fA-F0-9]{40}/);
      if (!addrMatch) continue;
      
      const addr = addrMatch[0].toLowerCase();
      const dex = p.project.includes('spark') ? 'sparkdex' : 'enosys';
      const name = `${p.symbol.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${dex}`;
      
      // Check if already exists
      const exists = Object.values(config.pools).some(
        pool => pool.address.toLowerCase() === addr
      );
      
      if (!exists && p.tvlUsd > 50000) {
        const tokens = p.symbol.split('-');
        config.pools[name] = {
          address: addr,
          dex: dex,
          token0: tokens[0] || 'UNKNOWN',
          token1: tokens[1] || 'UNKNOWN',
          fee: 500, // Default, would need to query
          enabled: true,
          collect_interval: 300,
          tvl_usd: p.tvlUsd,
          apy: p.apy,
          source: 'defillama'
        };
        console.log(`+ Added: ${name} (TVL: $${(p.tvlUsd/1000).toFixed(0)}K)`);
        added++;
      }
    }
    
    if (added > 0) {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
      console.log(`\n✅ Added ${added} pools to config`);
    } else {
      console.log('No new pools to add');
    }
    
  } else if (action === 'json') {
    const pools = await fetchPools();
    console.log(JSON.stringify(pools, null, 2));
  }
}

main().catch(console.error);
