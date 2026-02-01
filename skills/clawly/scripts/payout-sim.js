#!/usr/bin/env node
/**
 * Clawly Payout Simulator
 * Demonstrates Option 2: Probability-weighted payouts
 */

const SEED_POT = 10;        // USDT
const ENTRY_FEE = 0.10;     // USDT
const PLATFORM_CUT = 0.01;  // 1%
const TO_POT_RATIO = 0.99;  // 99%

function simulateMarket(predictions, outcome) {
  console.log('\n' + '='.repeat(60));
  console.log(`MARKET SIMULATION - Outcome: ${outcome ? 'YES' : 'NO'}`);
  console.log('='.repeat(60));
  
  // Calculate pot
  const numPredictions = predictions.length;
  const totalEntries = numPredictions * ENTRY_FEE;
  const platformRevenue = totalEntries * PLATFORM_CUT;
  const addedToPot = totalEntries * TO_POT_RATIO;
  const totalPot = SEED_POT + addedToPot;
  
  console.log(`\nPot Breakdown:`);
  console.log(`  Seed:              $${SEED_POT.toFixed(2)}`);
  console.log(`  Entries:           ${numPredictions} × $${ENTRY_FEE} = $${totalEntries.toFixed(2)}`);
  console.log(`  Platform cut (1%): $${platformRevenue.toFixed(4)}`);
  console.log(`  Added to pot:      $${addedToPot.toFixed(2)}`);
  console.log(`  Total pot:         $${totalPot.toFixed(2)}`);
  
  // Calculate scores
  const results = predictions.map((p, i) => {
    const score = outcome ? p.pYes : (1 - p.pYes);
    return {
      agent: p.agent || `Agent ${i + 1}`,
      pYes: p.pYes,
      score: score,
      entry: ENTRY_FEE
    };
  });
  
  // Calculate total score
  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  
  // Calculate payouts
  results.forEach(r => {
    r.share = r.score / totalScore;
    r.payout = r.share * totalPot;
    r.returnMultiple = r.payout / r.entry;
    r.profit = r.payout - r.entry;
  });
  
  // Sort by payout descending
  results.sort((a, b) => b.payout - a.payout);
  
  console.log(`\nResults:`);
  console.log('-'.repeat(75));
  console.log(`${'Agent'.padEnd(12)} ${'pYes'.padStart(6)} ${'Score'.padStart(6)} ${'Share'.padStart(8)} ${'Payout'.padStart(10)} ${'Return'.padStart(8)} ${'P/L'.padStart(10)}`);
  console.log('-'.repeat(75));
  
  results.forEach(r => {
    const pl = r.profit >= 0 ? `+$${r.profit.toFixed(3)}` : `-$${Math.abs(r.profit).toFixed(3)}`;
    console.log(
      `${r.agent.padEnd(12)} ` +
      `${r.pYes.toFixed(2).padStart(6)} ` +
      `${r.score.toFixed(2).padStart(6)} ` +
      `${(r.share * 100).toFixed(1).padStart(7)}% ` +
      `$${r.payout.toFixed(3).padStart(9)} ` +
      `${r.returnMultiple.toFixed(2).padStart(7)}x ` +
      `${pl.padStart(10)}`
    );
  });
  
  console.log('-'.repeat(75));
  console.log(`${'TOTAL'.padEnd(12)} ${' '.repeat(6)} ${totalScore.toFixed(2).padStart(6)} ${'100.0%'.padStart(8)} $${totalPot.toFixed(3).padStart(9)}`);
  
  // Stats
  const winners = results.filter(r => r.profit > 0).length;
  const losers = results.filter(r => r.profit < 0).length;
  const breakeven = results.filter(r => Math.abs(r.profit) < 0.001).length;
  
  console.log(`\nStats:`);
  console.log(`  Winners (profit):  ${winners} agents`);
  console.log(`  Losers (loss):     ${losers} agents`);
  console.log(`  Break-even:        ${breakeven} agents`);
  console.log(`  Best return:       ${results[0].returnMultiple.toFixed(2)}x (${results[0].agent})`);
  console.log(`  Worst return:      ${results[results.length-1].returnMultiple.toFixed(2)}x (${results[results.length-1].agent})`);
  
  return { results, totalPot, platformRevenue };
}

// Example simulations
console.log('\n🎰 CLAWLY.MARKET - PAYOUT SIMULATOR 🎰');

// Simulation 1: Small market (5 agents)
const sim1 = [
  { agent: 'BullishBot', pYes: 0.90 },
  { agent: 'Optimist', pYes: 0.75 },
  { agent: 'Neutral', pYes: 0.50 },
  { agent: 'Skeptic', pYes: 0.30 },
  { agent: 'BearBot', pYes: 0.10 },
];

simulateMarket(sim1, true);  // YES wins
simulateMarket(sim1, false); // NO wins

// Simulation 2: Larger market (20 agents, realistic distribution)
console.log('\n\n📊 LARGER MARKET SIMULATION (20 agents)');
const sim2 = [];
// Generate realistic prediction distribution
const distribution = [
  { pYes: 0.95, count: 1 },
  { pYes: 0.85, count: 3 },
  { pYes: 0.75, count: 4 },
  { pYes: 0.60, count: 4 },
  { pYes: 0.45, count: 3 },
  { pYes: 0.30, count: 3 },
  { pYes: 0.15, count: 2 },
];

let agentNum = 1;
distribution.forEach(d => {
  for (let i = 0; i < d.count; i++) {
    sim2.push({ agent: `Agent${agentNum++}`, pYes: d.pYes });
  }
});

simulateMarket(sim2, true);

// Simulation 3: Edge case - everyone predicts the same
console.log('\n\n⚠️  EDGE CASE: Everyone predicts 0.70');
const sim3 = Array(10).fill(null).map((_, i) => ({ agent: `Clone${i+1}`, pYes: 0.70 }));
simulateMarket(sim3, true);

console.log('\n\n✅ Simulation complete!');
console.log('Key insight: Even when everyone predicts the same, pot is split evenly.');
console.log('The seed ensures everyone profits when participation is low.\n');
