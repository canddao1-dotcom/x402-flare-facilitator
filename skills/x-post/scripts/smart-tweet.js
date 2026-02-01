#!/usr/bin/env node
/**
 * Smart Tweet Generator
 * Uses actual skill data: FTSO history, LP manager, risk analysis
 * Generates actionable, data-driven tweets
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SKILLS_DIR = '/home/node/clawd/skills';
const POST_SCRIPT = path.join(__dirname, 'post.js');

// Get FTSO price data
function getFTSOData(hours = 1) {
  try {
    const cmd = `node ${SKILLS_DIR}/ftso-history/scripts/query.js --all --stats --hours ${hours}`;
    const output = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
    
    // Parse the stats output
    const lines = output.split('\n');
    const data = {};
    
    for (const line of lines) {
      const match = line.match(/^(\w+)\s+([\d.e+-]+)\s+([+-]?[\d.]+%)/);
      if (match) {
        data[match[1]] = {
          price: parseFloat(match[2]),
          change: parseFloat(match[3])
        };
      }
    }
    return data;
  } catch (e) {
    console.error('FTSO data error:', e.message);
    return null;
  }
}

// Get LP opportunities from manager
function getLPOpportunities() {
  try {
    const cmd = `node ${SKILLS_DIR}/fblpmanager/scripts/lp-manager.js --opportunities --json 2>/dev/null`;
    const output = execSync(cmd, { encoding: 'utf8', timeout: 60000 });
    return JSON.parse(output);
  } catch (e) {
    // Fallback: try to get from DefiLlama directly
    return null;
  }
}

// Analyze market sentiment from price data
function analyzeMarket(ftsoData) {
  if (!ftsoData) return null;
  
  const tokens = Object.entries(ftsoData);
  const gainers = tokens.filter(([_, d]) => d.change > 0).sort((a, b) => b[1].change - a[1].change);
  const losers = tokens.filter(([_, d]) => d.change < 0).sort((a, b) => a[1].change - b[1].change);
  
  const avgChange = tokens.reduce((sum, [_, d]) => sum + d.change, 0) / tokens.length;
  
  return {
    sentiment: avgChange > 1 ? 'bullish' : avgChange < -1 ? 'bearish' : 'neutral',
    avgChange: avgChange.toFixed(2),
    topGainer: gainers[0] ? { symbol: gainers[0][0], change: gainers[0][1].change } : null,
    topLoser: losers[0] ? { symbol: losers[0][0], change: losers[0][1].change } : null,
    flrChange: ftsoData.FLR?.change || 0,
    btcChange: ftsoData.BTC?.change || 0,
    flrPrice: ftsoData.FLR?.price || 0
  };
}

// Generate tweet based on market conditions
function generateMarketTweet(market, hours) {
  if (!market) return null;
  
  const lines = [];
  const timeframe = hours === 1 ? '1h' : hours === 24 ? '24h' : `${hours}h`;
  
  // Lead with the story
  if (Math.abs(market.flrChange - market.btcChange) > 1) {
    // FLR diverging from BTC
    if (market.flrChange > market.btcChange) {
      lines.push(`📈 $FLR outperforming BTC`);
      lines.push(`FLR: ${market.flrChange > 0 ? '+' : ''}${market.flrChange.toFixed(1)}% vs BTC: ${market.btcChange > 0 ? '+' : ''}${market.btcChange.toFixed(1)}%`);
      lines.push(`\nRelative strength = bullish signal`);
    } else {
      lines.push(`📉 $FLR lagging BTC (${timeframe})`);
      lines.push(`FLR: ${market.flrChange.toFixed(1)}% vs BTC: ${market.btcChange > 0 ? '+' : ''}${market.btcChange.toFixed(1)}%`);
    }
  } else if (market.sentiment === 'bearish') {
    lines.push(`🔴 Market pullback (${timeframe})`);
    lines.push(`Avg: ${market.avgChange}% across 20 FTSO feeds`);
    if (market.topLoser) {
      lines.push(`Biggest drop: $${market.topLoser.symbol} ${market.topLoser.change.toFixed(1)}%`);
    }
  } else if (market.sentiment === 'bullish') {
    lines.push(`🟢 Market up (${timeframe})`);
    lines.push(`Avg: +${market.avgChange}% across FTSO feeds`);
    if (market.topGainer) {
      lines.push(`Leading: $${market.topGainer.symbol} +${market.topGainer.change.toFixed(1)}%`);
    }
  } else {
    lines.push(`⚪ Sideways chop (${timeframe})`);
    lines.push(`$FLR at $${market.flrPrice.toFixed(4)} | BTC ${market.btcChange > 0 ? '+' : ''}${market.btcChange.toFixed(1)}%`);
  }
  
  lines.push(`\nFTSO oracle data, 90s updates`);
  lines.push(`\n— @cand_dao 🤖`);
  
  return lines.join('\n');
}

// Generate yield-focused tweet with risk context
function generateYieldTweet(ftsoData) {
  // This would integrate with LP manager data
  // For now, use a smarter template
  return null;
}

function tweet(text, shouldConfirm) {
  const confirmFlag = shouldConfirm ? '--confirm' : '';
  const escaped = text.replace(/'/g, "'\\''");
  const cmd = `node "${POST_SCRIPT}" '${escaped}' ${confirmFlag}`;
  
  try {
    const result = execSync(cmd, { encoding: 'utf8' });
    console.log(result);
    return true;
  } catch (e) {
    console.error('Tweet failed:', e.message);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const type = args.find(a => a.startsWith('--type='))?.split('=')[1] || 'market';
  const hours = parseInt(args.find(a => a.startsWith('--hours='))?.split('=')[1] || '1');
  const confirm = args.includes('--confirm');
  
  console.log(`Generating ${type} tweet (${hours}h data)...\n`);
  
  // Get data
  const ftsoData = getFTSOData(hours);
  const market = analyzeMarket(ftsoData);
  
  let tweetText = null;
  
  switch (type) {
    case 'market':
      tweetText = generateMarketTweet(market, hours);
      break;
    case 'yield':
      tweetText = generateYieldTweet(ftsoData);
      break;
    default:
      console.error('Unknown type:', type);
      process.exit(1);
  }
  
  if (tweetText) {
    console.log('--- Tweet ---');
    console.log(tweetText);
    console.log('--- End ---\n');
    
    if (confirm) {
      tweet(tweetText, true);
    } else {
      console.log('🔒 DRY RUN - Add --confirm to post');
    }
  } else {
    console.log('Could not generate tweet (insufficient data)');
    process.exit(1);
  }
}

main();
