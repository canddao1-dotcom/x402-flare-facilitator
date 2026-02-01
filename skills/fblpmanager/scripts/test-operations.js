#!/usr/bin/env node
/**
 * Test suite for LP Operations
 * 
 * Tests:
 * - Wallet generation
 * - Balance checking
 * - Position queries
 * - Pool state
 * - Health reports
 * - Rebalance simulation
 */

const { WalletManager } = require('./wallet-manager');
const { LPOperations, DEX_CONFIGS } = require('./lp-operations');
const { LPRebalancer, STRATEGIES } = require('./lp-rebalancer');

// Test configuration
const TEST_CONFIG = {
  daoTreasury: '0xaa68bc4bab9a63958466f49f5a58c54a412d4906',
  v3Position: {
    nftManager: '0xD9770b1C7A6ccd33C75b5bcB1c0078f46bE46657',
    tokenId: 28509,
    poolAddress: '0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770'
  }
};

async function runTests() {
  console.log('=== FlareBank LP Operations Test Suite ===\n');
  
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  const logTest = (name, passed, details = '') => {
    const status = passed ? '✅' : '❌';
    console.log(`${status} ${name}${details ? ': ' + details : ''}`);
    results.tests.push({ name, passed, details });
    passed ? results.passed++ : results.failed++;
  };

  // Test 1: Wallet Generation
  console.log('\n--- Wallet Manager Tests ---');
  try {
    const wm = new WalletManager();
    const wallet = wm.generateWallet();
    logTest('Wallet Generation', 
      wallet.address && wallet.privateKey && wallet.address.startsWith('0x'),
      `Address: ${wallet.address.slice(0, 10)}...`
    );
  } catch (e) {
    logTest('Wallet Generation', false, e.message);
  }

  // Test 2: Balance Check
  try {
    const wm = new WalletManager();
    const balance = await wm.getNativeBalance(TEST_CONFIG.daoTreasury);
    logTest('Balance Check', 
      parseFloat(balance) > 0,
      `DAO Treasury: ${parseFloat(balance).toFixed(2)} FLR`
    );
  } catch (e) {
    logTest('Balance Check', false, e.message);
  }

  // Test 3: Token Balance
  try {
    const wm = new WalletManager();
    const balance = await wm.getTokenBalance(
      '0x194726F6C2aE988f1Ab5e1C943c17e591a6f6059', // BANK
      TEST_CONFIG.daoTreasury
    );
    logTest('Token Balance', 
      balance.symbol === 'BANK',
      `${parseFloat(balance.formatted).toFixed(2)} ${balance.symbol}`
    );
  } catch (e) {
    logTest('Token Balance', false, e.message);
  }

  // Test 4: Position Details
  console.log('\n--- LP Operations Tests ---');
  let position;
  try {
    const ops = new LPOperations();
    position = await ops.getPositionDetails(
      TEST_CONFIG.v3Position.nftManager,
      TEST_CONFIG.v3Position.tokenId
    );
    logTest('Position Details', 
      position.owner.toLowerCase() === TEST_CONFIG.daoTreasury.toLowerCase(),
      `Owner verified, Liquidity: ${position.liquidity.toString()}`
    );
  } catch (e) {
    logTest('Position Details', false, e.message);
  }

  // Test 5: Pool State
  let poolState;
  try {
    const ops = new LPOperations();
    poolState = await ops.getPoolState(TEST_CONFIG.v3Position.poolAddress);
    logTest('Pool State', 
      poolState.tick !== undefined && poolState.price > 0,
      `Tick: ${poolState.tick}, Price: ${poolState.price.toFixed(6)}`
    );
  } catch (e) {
    logTest('Pool State', false, e.message);
  }

  // Test 6: Range Check
  try {
    const ops = new LPOperations();
    if (position && poolState) {
      const range = ops.checkPositionRange(position, poolState.tick);
      logTest('Range Check', 
        range.status !== undefined,
        `Status: ${range.status}, Edge Proximity: ${(range.edgeProximity * 100).toFixed(1)}%`
      );
    } else {
      logTest('Range Check', false, 'Missing position or pool data');
    }
  } catch (e) {
    logTest('Range Check', false, e.message);
  }

  // Test 7: Tick Calculation
  try {
    const ops = new LPOperations();
    const range = ops.calculateTickRange(poolState.tick, poolState.tickSpacing, 10);
    logTest('Tick Calculation', 
      range.tickLower < range.tickUpper,
      `Range: [${range.tickLower}, ${range.tickUpper}]`
    );
  } catch (e) {
    logTest('Tick Calculation', false, e.message);
  }

  // Test 8: Health Report
  try {
    const ops = new LPOperations();
    const health = await ops.getPositionHealth(
      TEST_CONFIG.v3Position.nftManager,
      TEST_CONFIG.v3Position.tokenId,
      TEST_CONFIG.v3Position.poolAddress
    );
    logTest('Health Report', 
      health.range && health.fees && health.rebalance !== undefined,
      `In Range: ${health.range.inRange}, Needs Rebalance: ${health.rebalance.needed}`
    );
  } catch (e) {
    logTest('Health Report', false, e.message);
  }

  // Test 9: Rebalancer Simulation
  console.log('\n--- Rebalancer Tests ---');
  try {
    const rebalancer = new LPRebalancer();
    const sim = await rebalancer.simulateRebalance(
      TEST_CONFIG.v3Position.nftManager,
      TEST_CONFIG.v3Position.tokenId,
      TEST_CONFIG.v3Position.poolAddress,
      'moderate'
    );
    logTest('Rebalance Simulation', 
      sim.steps && sim.steps.length > 0,
      `Strategy: ${sim.strategy}, Needs Rebalance: ${sim.needsRebalance}`
    );
  } catch (e) {
    logTest('Rebalance Simulation', false, e.message);
  }

  // Test 10: Strategy Calculation
  try {
    const rebalancer = new LPRebalancer();
    const params = rebalancer.calculateRebalanceParams(position, poolState, 'aggressive');
    logTest('Strategy Calculation', 
      params.strategy && params.newPosition,
      `${params.strategy}: [${params.newPosition.tickLower}, ${params.newPosition.tickUpper}]`
    );
  } catch (e) {
    logTest('Strategy Calculation', false, e.message);
  }

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${results.passed}/${results.passed + results.failed}`);
  console.log(`Failed: ${results.failed}`);

  if (results.failed > 0) {
    console.log('\nFailed tests:');
    results.tests.filter(t => !t.passed).forEach(t => {
      console.log(`  - ${t.name}: ${t.details}`);
    });
  }

  return results.failed === 0;
}

// Run tests
runTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(e => {
    console.error('Test suite error:', e);
    process.exit(1);
  });
