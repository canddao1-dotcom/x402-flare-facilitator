#!/usr/bin/env node
/**
 * LP Rebalancer for FlareBank
 * 
 * Automated position rebalancing with configurable strategies:
 * - Aggressive (±5% range)
 * - Conservative (±15% range)
 * - Custom (user-defined ticks)
 * 
 * Based on ai-miguel rewards.py and rebalancing patterns
 */

const { ethers } = require('ethers');
const { LPOperations, DEX_CONFIGS } = require('./lp-operations');
const { WalletManager } = require('./wallet-manager');

// Configuration
const FLARE_RPC = process.env.FLARE_RPC || 'https://flare-api.flare.network/ext/C/rpc';

// Rebalance strategies
const STRATEGIES = {
  aggressive: { spreadPercent: 5, name: 'Aggressive (±5%)' },
  moderate: { spreadPercent: 10, name: 'Moderate (±10%)' },
  conservative: { spreadPercent: 15, name: 'Conservative (±15%)' },
  wide: { spreadPercent: 25, name: 'Wide (±25%)' }
};

// NFT Manager ABI for minting
const MINT_ABI = [
  'function mint(tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)'
];

// Full NFT Manager ABI
const NFT_MANAGER_FULL_ABI = [
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function collect(tuple(uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max) params) returns (uint256 amount0, uint256 amount1)',
  'function decreaseLiquidity(tuple(uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline) params) returns (uint256 amount0, uint256 amount1)',
  'function mint(tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function multicall(bytes[] data) returns (bytes[] results)'
];

// ERC20 ABI
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
];

class LPRebalancer {
  constructor(rpcUrl = FLARE_RPC) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.lpOps = new LPOperations(rpcUrl);
    this.walletManager = new WalletManager(rpcUrl);
  }

  /**
   * Calculate rebalance parameters
   * @param {object} position - Current position
   * @param {object} poolState - Current pool state
   * @param {string} strategy - Strategy name
   * @returns {object}
   */
  calculateRebalanceParams(position, poolState, strategy = 'moderate') {
    const config = STRATEGIES[strategy] || STRATEGIES.moderate;
    const newRange = this.lpOps.calculateTickRange(
      poolState.tick, 
      poolState.tickSpacing, 
      config.spreadPercent
    );

    const currentRange = this.lpOps.checkPositionRange(position, poolState.tick);

    return {
      strategy: config.name,
      currentPosition: {
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        inRange: currentRange.inRange,
        status: currentRange.status
      },
      newPosition: {
        tickLower: newRange.tickLower,
        tickUpper: newRange.tickUpper,
        priceLower: newRange.priceLower,
        priceUpper: newRange.priceUpper
      },
      poolState: {
        currentTick: poolState.tick,
        currentPrice: poolState.price
      }
    };
  }

  /**
   * Simulate a full rebalance without executing
   * @param {string} nftManager 
   * @param {number} tokenId 
   * @param {string} poolAddress 
   * @param {string} strategy 
   * @returns {Promise<object>}
   */
  async simulateRebalance(nftManager, tokenId, poolAddress, strategy = 'moderate') {
    const [position, poolState] = await Promise.all([
      this.lpOps.getPositionDetails(nftManager, tokenId),
      this.lpOps.getPoolState(poolAddress)
    ]);

    const params = this.calculateRebalanceParams(position, poolState, strategy);
    const fees = this.lpOps.getUnclaimedFees(position);

    // Get token info
    const token0Contract = new ethers.Contract(position.token0, ERC20_ABI, this.provider);
    const token1Contract = new ethers.Contract(position.token1, ERC20_ABI, this.provider);
    
    const [token0Symbol, token0Decimals, token1Symbol, token1Decimals] = await Promise.all([
      token0Contract.symbol(),
      token0Contract.decimals(),
      token1Contract.symbol(),
      token1Contract.decimals()
    ]);

    // Format fees (handle BigInt)
    const formatFees = (amount, decimals) => {
      const amountBigInt = typeof amount === 'bigint' ? amount : BigInt(amount || 0);
      const divisor = BigInt(10) ** BigInt(decimals);
      // Convert to number safely for display
      return Number(amountBigInt * BigInt(1000000) / divisor) / 1000000;
    };

    return {
      position: {
        tokenId,
        liquidity: position.liquidity.toString(),
        token0: { address: position.token0, symbol: token0Symbol },
        token1: { address: position.token1, symbol: token1Symbol },
        fee: position.fee / 10000 + '%'
      },
      currentRange: params.currentPosition,
      suggestedRange: params.newPosition,
      strategy: params.strategy,
      unclaimedFees: {
        [token0Symbol]: formatFees(fees.token0, token0Decimals),
        [token1Symbol]: formatFees(fees.token1, token1Decimals)
      },
      needsRebalance: !params.currentPosition.inRange || params.currentPosition.status === 'NEAR_EDGE',
      steps: [
        `1. Collect unclaimed fees (${formatFees(fees.token0, token0Decimals)} ${token0Symbol}, ${formatFees(fees.token1, token1Decimals)} ${token1Symbol})`,
        `2. Remove 100% liquidity from position ${tokenId}`,
        `3. Collect withdrawn tokens`,
        `4. Approve tokens for NFT Manager`,
        `5. Mint new position: [${params.newPosition.tickLower}, ${params.newPosition.tickUpper}]`,
        `   Price range: ${params.newPosition.priceLower.toFixed(6)} - ${params.newPosition.priceUpper.toFixed(6)}`
      ],
      estimatedGas: {
        collect: '150,000',
        decrease: '200,000', 
        approve: '50,000 x2',
        mint: '400,000',
        total: '~850,000 gas'
      }
    };
  }

  /**
   * Execute full rebalance (LIVE TRANSACTION)
   * @param {string} privateKey 
   * @param {string} nftManager 
   * @param {number} tokenId 
   * @param {string} poolAddress 
   * @param {string} strategy 
   * @param {boolean} dryRun - If true, only simulate
   * @returns {Promise<object>}
   */
  async executeRebalance(privateKey, nftManager, tokenId, poolAddress, strategy = 'moderate', dryRun = true) {
    const signer = this.walletManager.getSigner(privateKey);
    const signerAddress = await signer.getAddress();

    console.log(`\n=== LP Rebalancer ===`);
    console.log(`Signer: ${signerAddress}`);
    console.log(`Position: ${tokenId}`);
    console.log(`Strategy: ${strategy}`);
    console.log(`Mode: ${dryRun ? 'DRY RUN (no transactions)' : '🔴 LIVE'}\n`);

    // Get simulation first
    const simulation = await this.simulateRebalance(nftManager, tokenId, poolAddress, strategy);
    console.log('Simulation:', JSON.stringify(simulation, null, 2));

    if (dryRun) {
      return {
        mode: 'dry_run',
        simulation,
        message: 'Dry run complete. Set dryRun=false to execute.'
      };
    }

    if (!simulation.needsRebalance) {
      return {
        mode: 'skipped',
        reason: 'Position is already in optimal range',
        simulation
      };
    }

    const results = {
      mode: 'live',
      steps: [],
      errors: []
    };

    const nftContract = new ethers.Contract(nftManager, NFT_MANAGER_FULL_ABI, signer);
    const position = await this.lpOps.getPositionDetails(nftManager, tokenId);

    try {
      // Step 1: Collect fees
      console.log('\nStep 1: Collecting fees...');
      const collectParams = {
        tokenId: tokenId,
        recipient: signerAddress,
        amount0Max: BigInt(2) ** BigInt(128) - BigInt(1),
        amount1Max: BigInt(2) ** BigInt(128) - BigInt(1)
      };
      const collectTx = await nftContract.collect(collectParams);
      const collectReceipt = await collectTx.wait();
      results.steps.push({
        step: 'collect_fees',
        success: true,
        hash: collectReceipt.hash,
        gasUsed: collectReceipt.gasUsed.toString()
      });
      console.log(`  ✓ Fees collected. Hash: ${collectReceipt.hash}`);

      // Step 2: Decrease liquidity 100%
      console.log('\nStep 2: Removing liquidity...');
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const decreaseParams = {
        tokenId: tokenId,
        liquidity: position.liquidity,
        amount0Min: 0,
        amount1Min: 0,
        deadline: deadline
      };
      const decreaseTx = await nftContract.decreaseLiquidity(decreaseParams);
      const decreaseReceipt = await decreaseTx.wait();
      results.steps.push({
        step: 'decrease_liquidity',
        success: true,
        hash: decreaseReceipt.hash,
        gasUsed: decreaseReceipt.gasUsed.toString()
      });
      console.log(`  ✓ Liquidity removed. Hash: ${decreaseReceipt.hash}`);

      // Step 3: Collect withdrawn tokens
      console.log('\nStep 3: Collecting withdrawn tokens...');
      const collect2Tx = await nftContract.collect(collectParams);
      const collect2Receipt = await collect2Tx.wait();
      results.steps.push({
        step: 'collect_tokens',
        success: true,
        hash: collect2Receipt.hash,
        gasUsed: collect2Receipt.gasUsed.toString()
      });
      console.log(`  ✓ Tokens collected. Hash: ${collect2Receipt.hash}`);

      // Step 4: Get token balances and approve
      console.log('\nStep 4: Checking balances and approving...');
      const token0Contract = new ethers.Contract(position.token0, ERC20_ABI, signer);
      const token1Contract = new ethers.Contract(position.token1, ERC20_ABI, signer);

      const [balance0, balance1, decimals0, decimals1] = await Promise.all([
        token0Contract.balanceOf(signerAddress),
        token1Contract.balanceOf(signerAddress),
        token0Contract.decimals(),
        token1Contract.decimals()
      ]);

      console.log(`  Token0 balance: ${ethers.formatUnits(balance0, decimals0)}`);
      console.log(`  Token1 balance: ${ethers.formatUnits(balance1, decimals1)}`);

      // Approve tokens
      const maxApproval = ethers.MaxUint256;
      const approve0Tx = await token0Contract.approve(nftManager, maxApproval);
      await approve0Tx.wait();
      const approve1Tx = await token1Contract.approve(nftManager, maxApproval);
      await approve1Tx.wait();
      results.steps.push({
        step: 'approvals',
        success: true,
        message: 'Both tokens approved'
      });
      console.log(`  ✓ Tokens approved`);

      // Step 5: Mint new position
      console.log('\nStep 5: Minting new position...');
      const mintParams = {
        token0: position.token0,
        token1: position.token1,
        fee: position.fee,
        tickLower: simulation.suggestedRange.tickLower,
        tickUpper: simulation.suggestedRange.tickUpper,
        amount0Desired: balance0,
        amount1Desired: balance1,
        amount0Min: 0,
        amount1Min: 0,
        recipient: signerAddress,
        deadline: deadline
      };

      const mintTx = await nftContract.mint(mintParams);
      const mintReceipt = await mintTx.wait();

      // Parse new token ID from events
      let newTokenId = null;
      for (const log of mintReceipt.logs) {
        try {
          const parsed = nftContract.interface.parseLog({ topics: log.topics, data: log.data });
          if (parsed && parsed.name === 'IncreaseLiquidity') {
            newTokenId = parsed.args.tokenId;
          }
        } catch (e) {}
      }

      results.steps.push({
        step: 'mint_position',
        success: true,
        hash: mintReceipt.hash,
        gasUsed: mintReceipt.gasUsed.toString(),
        newTokenId: newTokenId?.toString() || 'unknown'
      });
      console.log(`  ✓ New position minted. Hash: ${mintReceipt.hash}`);
      console.log(`  New Token ID: ${newTokenId}`);

      results.success = true;
      results.summary = {
        oldPosition: tokenId,
        newPosition: newTokenId?.toString(),
        strategy: simulation.strategy,
        newRange: simulation.suggestedRange,
        totalGasUsed: results.steps.reduce((sum, s) => sum + BigInt(s.gasUsed || 0), 0n).toString()
      };

    } catch (error) {
      results.success = false;
      results.errors.push({
        message: error.message,
        data: error.data
      });
      console.error('\n❌ Error:', error.message);
    }

    return results;
  }

  /**
   * Batch check multiple positions and suggest rebalances
   * @param {Array<{nftManager: string, tokenId: number, poolAddress: string}>} positions 
   * @returns {Promise<Array>}
   */
  async batchAnalyze(positions) {
    const results = [];
    
    for (const pos of positions) {
      try {
        const simulation = await this.simulateRebalance(
          pos.nftManager, 
          pos.tokenId, 
          pos.poolAddress,
          'moderate'
        );
        results.push({
          ...pos,
          ...simulation,
          error: null
        });
      } catch (error) {
        results.push({
          ...pos,
          error: error.message,
          needsRebalance: 'unknown'
        });
      }
    }

    return results;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const rebalancer = new LPRebalancer();

  switch (command) {
    case 'simulate': {
      const nftManager = args[1];
      const tokenId = parseInt(args[2]);
      const poolAddress = args[3];
      const strategy = args[4] || 'moderate';
      
      if (!nftManager || !tokenId || !poolAddress) {
        console.error('Usage: lp-rebalancer.js simulate <nftManager> <tokenId> <poolAddress> [strategy]');
        console.error('Strategies: aggressive, moderate, conservative, wide');
        process.exit(1);
      }

      const result = await rebalancer.simulateRebalance(nftManager, tokenId, poolAddress, strategy);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'execute': {
      const privateKey = args[1];
      const nftManager = args[2];
      const tokenId = parseInt(args[3]);
      const poolAddress = args[4];
      const strategy = args[5] || 'moderate';
      const live = args[6] === '--live';
      
      if (!privateKey || !nftManager || !tokenId || !poolAddress) {
        console.error('Usage: lp-rebalancer.js execute <privateKey> <nftManager> <tokenId> <poolAddress> [strategy] [--live]');
        console.error('WARNING: Add --live to actually execute transactions');
        process.exit(1);
      }

      const result = await rebalancer.executeRebalance(
        privateKey, 
        nftManager, 
        tokenId, 
        poolAddress, 
        strategy, 
        !live // dryRun is opposite of live
      );
      console.log('\n=== Result ===');
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'strategies':
      console.log('\nAvailable Rebalance Strategies:');
      Object.entries(STRATEGIES).forEach(([key, val]) => {
        console.log(`  ${key}: ${val.name}`);
      });
      break;

    case 'help':
    default:
      console.log(`
LP Rebalancer for FlareBank

Commands:
  simulate <nftManager> <tokenId> <poolAddress> [strategy]
      Simulate a rebalance without executing

  execute <privateKey> <nftManager> <tokenId> <poolAddress> [strategy] [--live]
      Execute rebalance (dry run by default, add --live to execute)

  strategies
      List available rebalance strategies

Strategies:
  aggressive   - ±5% price range (more fees, more rebalances)
  moderate     - ±10% price range (balanced)
  conservative - ±15% price range (less rebalances)
  wide         - ±25% price range (minimal rebalances)

Examples:
  # Simulate rebalance for DAO stXRP/FXRP position
  node lp-rebalancer.js simulate \\
    0xD9770b1C7A6ccd33C75b5bcB1c0078f46bE46657 \\
    28509 \\
    0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770 \\
    moderate

  # Execute with dry run
  node lp-rebalancer.js execute \\
    <PRIVATE_KEY> \\
    0xD9770b1C7A6ccd33C75b5bcB1c0078f46bE46657 \\
    28509 \\
    0xa4ce7dafc6fb5aceedd0070620b72ab8f09b0770

Environment:
  FLARE_RPC    RPC endpoint (default: Flare mainnet)
      `);
  }
}

// Export for module use
module.exports = { LPRebalancer, STRATEGIES };

// Run CLI if executed directly
if (require.main === module) {
  main().catch(console.error);
}
