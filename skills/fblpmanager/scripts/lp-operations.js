#!/usr/bin/env node
/**
 * LP Operations Manager for FlareBank
 * 
 * Handles:
 * - Fee collection from V3 positions
 * - Position rebalancing (decrease, swap, mint new)
 * - Position health monitoring
 * 
 * Based on ai-miguel uniswap_v3.py and rebalance.py patterns
 */

const { ethers } = require('ethers');
const { WalletManager, NFT_MANAGER_ABI, ERC20_ABI } = require('./wallet-manager');

// Configuration
const FLARE_RPC = process.env.FLARE_RPC || 'https://flare-api.flare.network/ext/C/rpc';

// DEX Configurations (Enosys and SparkDex on Flare)
const DEX_CONFIGS = {
  enosys: {
    factory: '0x17AA157AC8C54034381b840Cb8f6bf7Fc355f0de',
    nftManager: '0xD9770b1C7A6ccd33C75b5bcB1c0078f46bE46657',
    router: '0x17aca82378c2859e40d84a373b49ee0b318020c4'
  },
  sparkdex: {
    factory: '0x8A2578d23d4C532cC9A98FaD91C0523f5efDE652',
    nftManager: '0xbEEFA7FAb245B568183D5f67731487908630d801',
    router: '0x17aca82378c2859e40d84a373b49ee0b318020c4'
  }
};

// Pool ABI for slot0 and other calls
const POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
  'function tickSpacing() view returns (int24)',
  'function liquidity() view returns (uint128)'
];

// Extended NFT Manager ABI
const EXTENDED_NFT_ABI = [
  ...NFT_MANAGER_ABI,
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)'
];

class LPOperations {
  constructor(rpcUrl = FLARE_RPC) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.walletManager = new WalletManager(rpcUrl);
  }

  /**
   * Get position details from NFT manager
   * @param {string} nftManager 
   * @param {number} tokenId 
   * @returns {Promise<object>}
   */
  async getPositionDetails(nftManager, tokenId) {
    const contract = new ethers.Contract(nftManager, EXTENDED_NFT_ABI, this.provider);
    
    const position = await contract.positions(tokenId);
    const owner = await contract.ownerOf(tokenId);

    return {
      tokenId,
      owner,
      nonce: position.nonce,
      operator: position.operator,
      token0: position.token0,
      token1: position.token1,
      fee: Number(position.fee),
      tickLower: Number(position.tickLower),
      tickUpper: Number(position.tickUpper),
      liquidity: position.liquidity,
      feeGrowthInside0LastX128: position.feeGrowthInside0LastX128,
      feeGrowthInside1LastX128: position.feeGrowthInside1LastX128,
      tokensOwed0: position.tokensOwed0,
      tokensOwed1: position.tokensOwed1
    };
  }

  /**
   * Get pool state from pool contract
   * @param {string} poolAddress 
   * @returns {Promise<object>}
   */
  async getPoolState(poolAddress) {
    const pool = new ethers.Contract(poolAddress, POOL_ABI, this.provider);
    
    const [slot0, token0, token1, fee, tickSpacing, liquidity] = await Promise.all([
      pool.slot0(),
      pool.token0(),
      pool.token1(),
      pool.fee(),
      pool.tickSpacing(),
      pool.liquidity()
    ]);

    const sqrtPriceX96 = slot0.sqrtPriceX96;
    const tick = Number(slot0.tick);
    
    // Calculate price from sqrtPriceX96
    const price = (Number(sqrtPriceX96) / (2 ** 96)) ** 2;

    return {
      sqrtPriceX96,
      tick,
      price,
      token0,
      token1,
      fee: Number(fee),
      tickSpacing: Number(tickSpacing),
      liquidity
    };
  }

  /**
   * Check if position is in range
   * @param {object} position 
   * @param {number} currentTick 
   * @returns {object}
   */
  checkPositionRange(position, currentTick) {
    const inRange = currentTick >= position.tickLower && currentTick <= position.tickUpper;
    const rangeWidth = position.tickUpper - position.tickLower;
    
    // Calculate how close to edge
    let edgeProximity = 0;
    if (inRange) {
      const distanceToLower = currentTick - position.tickLower;
      const distanceToUpper = position.tickUpper - currentTick;
      const minDistance = Math.min(distanceToLower, distanceToUpper);
      edgeProximity = minDistance / (rangeWidth / 2);
    }

    return {
      inRange,
      currentTick,
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
      rangeWidth,
      edgeProximity,
      status: inRange 
        ? (edgeProximity < 0.2 ? 'NEAR_EDGE' : 'IN_RANGE') 
        : 'OUT_OF_RANGE'
    };
  }

  /**
   * Calculate uncollected fees for a position
   * This is a simplified version - real implementation needs feeGrowth tracking
   * @param {object} position 
   * @returns {object}
   */
  getUnclaimedFees(position) {
    return {
      token0: position.tokensOwed0,
      token1: position.tokensOwed1,
      hasUnclaimedFees: position.tokensOwed0 > 0n || position.tokensOwed1 > 0n
    };
  }

  /**
   * Collect fees from a position (requires wallet)
   * @param {string} privateKey 
   * @param {string} nftManager 
   * @param {number} tokenId 
   * @param {string} recipient - where to send fees
   * @returns {Promise<object>}
   */
  async collectFees(privateKey, nftManager, tokenId, recipient = null) {
    const signer = this.walletManager.getSigner(privateKey);
    const signerAddress = await signer.getAddress();
    recipient = recipient || signerAddress;

    const contract = new ethers.Contract(nftManager, EXTENDED_NFT_ABI, signer);

    // Get position to check ownership
    const owner = await contract.ownerOf(tokenId);
    if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
      throw new Error(`Signer ${signerAddress} is not owner of position ${tokenId}`);
    }

    // Get position details before collection
    const positionBefore = await this.getPositionDetails(nftManager, tokenId);

    // Collect with max amounts
    const collectParams = {
      tokenId: tokenId,
      recipient: recipient,
      amount0Max: BigInt(2) ** BigInt(128) - BigInt(1),
      amount1Max: BigInt(2) ** BigInt(128) - BigInt(1)
    };

    console.log(`Collecting fees from position ${tokenId}...`);
    const tx = await contract.collect(collectParams);
    const receipt = await tx.wait();

    // Parse collected amounts from events
    let amount0Collected = 0n;
    let amount1Collected = 0n;

    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.name === 'Collect') {
          amount0Collected = parsed.args.amount0;
          amount1Collected = parsed.args.amount1;
        }
      } catch (e) {
        // Not our event
      }
    }

    return {
      success: true,
      tokenId,
      recipient,
      transactionHash: receipt.hash,
      gasUsed: receipt.gasUsed.toString(),
      amount0Collected: amount0Collected.toString(),
      amount1Collected: amount1Collected.toString(),
      token0: positionBefore.token0,
      token1: positionBefore.token1
    };
  }

  /**
   * Decrease liquidity from a position
   * @param {string} privateKey 
   * @param {string} nftManager 
   * @param {number} tokenId 
   * @param {number} percentToRemove - 0-100
   * @returns {Promise<object>}
   */
  async decreaseLiquidity(privateKey, nftManager, tokenId, percentToRemove = 100) {
    const signer = this.walletManager.getSigner(privateKey);
    const signerAddress = await signer.getAddress();

    const contract = new ethers.Contract(nftManager, EXTENDED_NFT_ABI, signer);

    // Get position details
    const position = await this.getPositionDetails(nftManager, tokenId);
    
    // Calculate liquidity to remove
    const liquidityToRemove = (position.liquidity * BigInt(Math.floor(percentToRemove))) / 100n;
    
    if (liquidityToRemove <= 0n) {
      throw new Error('No liquidity to remove');
    }

    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour

    const decreaseParams = {
      tokenId: tokenId,
      liquidity: liquidityToRemove,
      amount0Min: 0,
      amount1Min: 0,
      deadline: deadline
    };

    console.log(`Decreasing liquidity by ${percentToRemove}% from position ${tokenId}...`);
    const tx = await contract.decreaseLiquidity(decreaseParams);
    const receipt = await tx.wait();

    return {
      success: true,
      tokenId,
      percentRemoved: percentToRemove,
      liquidityRemoved: liquidityToRemove.toString(),
      transactionHash: receipt.hash,
      gasUsed: receipt.gasUsed.toString()
    };
  }

  /**
   * Increase liquidity in a position
   * @param {string} privateKey 
   * @param {string} nftManager 
   * @param {number} tokenId 
   * @param {string} amount0Desired 
   * @param {string} amount1Desired 
   * @returns {Promise<object>}
   */
  async increaseLiquidity(privateKey, nftManager, tokenId, amount0Desired, amount1Desired) {
    const signer = this.walletManager.getSigner(privateKey);
    const contract = new ethers.Contract(nftManager, EXTENDED_NFT_ABI, signer);

    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const increaseParams = {
      tokenId: tokenId,
      amount0Desired: ethers.parseUnits(amount0Desired, 18), // Adjust decimals as needed
      amount1Desired: ethers.parseUnits(amount1Desired, 18),
      amount0Min: 0,
      amount1Min: 0,
      deadline: deadline
    };

    console.log(`Increasing liquidity in position ${tokenId}...`);
    const tx = await contract.increaseLiquidity(increaseParams);
    const receipt = await tx.wait();

    return {
      success: true,
      tokenId,
      transactionHash: receipt.hash,
      gasUsed: receipt.gasUsed.toString()
    };
  }

  /**
   * Get all positions owned by an address
   * @param {string} nftManager 
   * @param {string} ownerAddress 
   * @returns {Promise<Array>}
   */
  async getPositionsForOwner(nftManager, ownerAddress) {
    const contract = new ethers.Contract(nftManager, EXTENDED_NFT_ABI, this.provider);
    
    const balance = await contract.balanceOf(ownerAddress);
    const positions = [];

    for (let i = 0; i < balance; i++) {
      const tokenId = await contract.tokenOfOwnerByIndex(ownerAddress, i);
      const details = await this.getPositionDetails(nftManager, Number(tokenId));
      
      // Only include positions with liquidity
      if (details.liquidity > 0n) {
        positions.push(details);
      }
    }

    return positions;
  }

  /**
   * Calculate tick range for a given price spread
   * @param {number} currentTick 
   * @param {number} tickSpacing 
   * @param {number} spreadPercent - e.g., 5 for ±5%
   * @returns {object}
   */
  calculateTickRange(currentTick, tickSpacing, spreadPercent = 5) {
    // Convert spread to tick delta
    // 1 tick ≈ 0.01% price change (1.0001^tick)
    const tickDelta = Math.floor(Math.log(1 + spreadPercent / 100) / Math.log(1.0001));
    
    // Align to tick spacing
    const tickLower = Math.floor((currentTick - tickDelta) / tickSpacing) * tickSpacing;
    const tickUpper = Math.ceil((currentTick + tickDelta) / tickSpacing) * tickSpacing;

    // Calculate actual price range
    const priceLower = Math.pow(1.0001, tickLower);
    const priceUpper = Math.pow(1.0001, tickUpper);
    const priceCurrent = Math.pow(1.0001, currentTick);

    return {
      tickLower,
      tickUpper,
      tickDelta,
      priceLower,
      priceUpper,
      priceCurrent,
      rangeWidth: tickUpper - tickLower
    };
  }

  /**
   * Simulate rebalance scenario
   * @param {object} position - current position
   * @param {object} poolState - current pool state
   * @param {number} newSpreadPercent - desired spread for new position
   * @returns {object}
   */
  simulateRebalance(position, poolState, newSpreadPercent = 5) {
    const rangeStatus = this.checkPositionRange(position, poolState.tick);
    const newRange = this.calculateTickRange(poolState.tick, poolState.tickSpacing, newSpreadPercent);
    
    // Get token decimals (simplified - in production fetch from contracts)
    const token0Decimals = 18;
    const token1Decimals = 18;

    // Calculate current position value (simplified)
    const tokensOwed0 = Number(position.tokensOwed0) / Math.pow(10, token0Decimals);
    const tokensOwed1 = Number(position.tokensOwed1) / Math.pow(10, token1Decimals);

    return {
      currentPosition: {
        tokenId: position.tokenId,
        ...rangeStatus,
        liquidity: position.liquidity.toString(),
        unclaimedFees: {
          token0: tokensOwed0,
          token1: tokensOwed1
        }
      },
      suggestedNewRange: newRange,
      steps: [
        'Collect unclaimed fees',
        'Decrease liquidity 100%',
        'Collect withdrawn tokens',
        `Mint new position with ${newSpreadPercent}% spread around current price`
      ],
      needsRebalance: !rangeStatus.inRange || rangeStatus.edgeProximity < 0.2
    };
  }

  /**
   * Full position health report
   * @param {string} nftManager 
   * @param {number} tokenId 
   * @param {string} poolAddress 
   * @returns {Promise<object>}
   */
  async getPositionHealth(nftManager, tokenId, poolAddress) {
    const [position, poolState] = await Promise.all([
      this.getPositionDetails(nftManager, tokenId),
      this.getPoolState(poolAddress)
    ]);

    const rangeStatus = this.checkPositionRange(position, poolState.tick);
    const fees = this.getUnclaimedFees(position);
    const rebalanceSim = this.simulateRebalance(position, poolState);

    return {
      position: {
        tokenId,
        liquidity: position.liquidity.toString(),
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        token0: position.token0,
        token1: position.token1,
        fee: position.fee
      },
      pool: {
        currentTick: poolState.tick,
        currentPrice: poolState.price,
        liquidity: poolState.liquidity.toString()
      },
      range: rangeStatus,
      fees: {
        token0: fees.token0.toString(),
        token1: fees.token1.toString(),
        hasUnclaimed: fees.hasUnclaimedFees
      },
      rebalance: {
        needed: rebalanceSim.needsRebalance,
        reason: rangeStatus.status,
        suggestedRange: rebalanceSim.suggestedNewRange
      }
    };
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const ops = new LPOperations();

  switch (command) {
    case 'position': {
      const nftManager = args[1];
      const tokenId = parseInt(args[2]);
      
      if (!nftManager || !tokenId) {
        console.error('Usage: lp-operations.js position <nftManager> <tokenId>');
        process.exit(1);
      }

      const details = await ops.getPositionDetails(nftManager, tokenId);
      console.log(JSON.stringify(details, (k, v) => 
        typeof v === 'bigint' ? v.toString() : v, 2));
      break;
    }

    case 'health': {
      const nftManager = args[1];
      const tokenId = parseInt(args[2]);
      const poolAddress = args[3];
      
      if (!nftManager || !tokenId || !poolAddress) {
        console.error('Usage: lp-operations.js health <nftManager> <tokenId> <poolAddress>');
        process.exit(1);
      }

      const health = await ops.getPositionHealth(nftManager, tokenId, poolAddress);
      console.log(JSON.stringify(health, null, 2));
      break;
    }

    case 'pool': {
      const poolAddress = args[1];
      
      if (!poolAddress) {
        console.error('Usage: lp-operations.js pool <poolAddress>');
        process.exit(1);
      }

      const state = await ops.getPoolState(poolAddress);
      console.log(JSON.stringify(state, (k, v) => 
        typeof v === 'bigint' ? v.toString() : v, 2));
      break;
    }

    case 'collect': {
      const privateKey = args[1];
      const nftManager = args[2];
      const tokenId = parseInt(args[3]);
      
      if (!privateKey || !nftManager || !tokenId) {
        console.error('Usage: lp-operations.js collect <privateKey> <nftManager> <tokenId>');
        process.exit(1);
      }

      const result = await ops.collectFees(privateKey, nftManager, tokenId);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'decrease': {
      const privateKey = args[1];
      const nftManager = args[2];
      const tokenId = parseInt(args[3]);
      const percent = parseInt(args[4] || '100');
      
      if (!privateKey || !nftManager || !tokenId) {
        console.error('Usage: lp-operations.js decrease <privateKey> <nftManager> <tokenId> [percent]');
        process.exit(1);
      }

      const result = await ops.decreaseLiquidity(privateKey, nftManager, tokenId, percent);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'help':
    default:
      console.log(`
LP Operations Manager for FlareBank

Commands:
  position <nftManager> <tokenId>                    Get position details
  pool <poolAddress>                                  Get pool state
  health <nftManager> <tokenId> <poolAddress>        Get position health report
  collect <privateKey> <nftManager> <tokenId>        Collect fees (requires signing)
  decrease <privateKey> <nftManager> <tokenId> [%]   Decrease liquidity

DEX Configs:
  Enosys NFT Manager: ${DEX_CONFIGS.enosys.nftManager}
  SparkDex NFT Manager: ${DEX_CONFIGS.sparkdex.nftManager}

Environment Variables:
  FLARE_RPC    RPC endpoint (default: Flare mainnet)
      `);
  }
}

// Export for module use
module.exports = { LPOperations, DEX_CONFIGS, POOL_ABI };

// Run CLI if executed directly
if (require.main === module) {
  main().catch(console.error);
}
