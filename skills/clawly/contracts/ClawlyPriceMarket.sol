// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IFlareContractRegistry
 * @notice Interface for Flare's contract registry
 */
interface IFlareContractRegistry {
    function getContractAddressByName(string calldata _name) external view returns (address);
}

/**
 * @title IFtsoV2
 * @notice Interface for Flare's FTSO v2 price feeds
 */
interface IFtsoV2 {
    function getFeedById(bytes21 _feedId) external view returns (
        uint256 value,
        int8 decimals,
        uint64 timestamp
    );
}

/**
 * @title ClawlyPriceMarket
 * @notice Trustless prediction markets with FTSO oracle resolution
 * @dev Markets are resolved automatically using Flare's decentralized price feeds
 * 
 * How it works:
 * 1. Admin creates market: "Will ETH be above $5000 on March 1, 2026?"
 * 2. Agents submit predictions (1-99% confidence)
 * 3. After settlement time, ANYONE can call resolve()
 * 4. Contract reads FTSO price on-chain and determines outcome
 * 5. Payouts distributed based on prediction accuracy
 * 
 * Fully trustless - no admin can manipulate outcomes!
 */
contract ClawlyPriceMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    uint256 public constant ENTRY_FEE = 100000;      // 0.10 USDT (6 decimals)
    uint256 public constant PLATFORM_FEE_BPS = 100;  // 1%
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MIN_PYES = 1;
    uint256 public constant MAX_PYES = 99;
    uint256 public constant PYES_DECIMALS = 100;
    
    // Flare Contract Registry (immutable on Flare)
    address public constant FLARE_REGISTRY = 0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019;

    // ============ State ============
    IERC20 public immutable usdt;
    address public treasury;
    
    enum Direction { ABOVE, BELOW }
    
    struct PriceMarket {
        bytes21 feedId;          // FTSO feed ID (e.g., "ETH/USD")
        string symbol;           // Human readable (e.g., "ETH")
        uint256 targetPrice;     // Price threshold (scaled by feed decimals)
        int8 targetDecimals;     // Decimals for target price
        Direction direction;     // ABOVE or BELOW target
        uint256 settlementTime;  // When market settles
        uint256 potAmount;
        uint256 predictionCount;
        bool resolved;
        bool outcome;            // true = condition met
        uint256 totalScore;
        uint256 settledPrice;    // Actual price at settlement
        uint64 settledTimestamp; // FTSO timestamp used
    }
    
    struct Prediction {
        address agent;
        uint256 pYes;
        uint256 timestamp;
        bool claimed;
    }
    
    mapping(bytes32 => PriceMarket) public markets;
    mapping(bytes32 => mapping(address => Prediction)) public predictions;
    mapping(bytes32 => address[]) public marketAgents;
    bytes32[] public allMarkets;

    // ============ Events ============
    event PriceMarketCreated(
        bytes32 indexed marketId,
        string symbol,
        uint256 targetPrice,
        Direction direction,
        uint256 settlementTime
    );
    event PredictionMade(bytes32 indexed marketId, address indexed agent, uint256 pYes);
    event MarketResolved(
        bytes32 indexed marketId,
        bool outcome,
        uint256 settledPrice,
        uint256 totalScore,
        address resolver
    );
    event PayoutClaimed(bytes32 indexed marketId, address indexed agent, uint256 amount);

    // ============ Constructor ============
    constructor(address _usdt, address _treasury) Ownable(msg.sender) {
        require(_usdt != address(0), "Invalid USDT");
        require(_treasury != address(0), "Invalid treasury");
        usdt = IERC20(_usdt);
        treasury = _treasury;
    }

    // ============ Admin Functions ============
    
    /**
     * @notice Create a price-based prediction market
     * @param symbol Token symbol (e.g., "ETH", "BTC", "FLR")
     * @param targetPrice Price threshold (e.g., 5000 * 10^decimals for $5000)
     * @param targetDecimals Decimals for target price (should match FTSO feed)
     * @param direction ABOVE (0) or BELOW (1) target
     * @param settlementTime Unix timestamp when market settles
     * @param seedAmount Initial pot funding
     */
    function createPriceMarket(
        string calldata symbol,
        uint256 targetPrice,
        int8 targetDecimals,
        Direction direction,
        uint256 settlementTime,
        uint256 seedAmount
    ) external onlyOwner {
        require(settlementTime > block.timestamp, "Settlement must be future");
        require(seedAmount > 0, "Need seed amount");
        require(bytes(symbol).length > 0 && bytes(symbol).length <= 10, "Invalid symbol");
        
        // Generate feed ID: category 01 + "SYMBOL/USD" padded to 21 bytes
        bytes21 feedId = _getFeedId(symbol);
        
        // Verify feed exists by querying it
        IFtsoV2 ftso = _getFtsoV2();
        (uint256 testValue, , ) = ftso.getFeedById(feedId);
        require(testValue > 0, "FTSO feed not available");
        
        // Generate market ID
        bytes32 marketId = keccak256(abi.encodePacked(symbol, targetPrice, direction, settlementTime));
        require(markets[marketId].settlementTime == 0, "Market exists");
        
        // Transfer seed
        usdt.safeTransferFrom(msg.sender, address(this), seedAmount);
        
        markets[marketId] = PriceMarket({
            feedId: feedId,
            symbol: symbol,
            targetPrice: targetPrice,
            targetDecimals: targetDecimals,
            direction: direction,
            settlementTime: settlementTime,
            potAmount: seedAmount,
            predictionCount: 0,
            resolved: false,
            outcome: false,
            totalScore: 0,
            settledPrice: 0,
            settledTimestamp: 0
        });
        
        allMarkets.push(marketId);
        
        emit PriceMarketCreated(marketId, symbol, targetPrice, direction, settlementTime);
    }
    
    /**
     * @notice Update treasury address
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    // ============ Agent Functions ============
    
    /**
     * @notice Make a prediction
     */
    function predict(bytes32 marketId, uint256 pYes) external nonReentrant {
        PriceMarket storage market = markets[marketId];
        require(market.settlementTime > 0, "Market not found");
        require(block.timestamp < market.settlementTime, "Market closed");
        require(!market.resolved, "Already resolved");
        require(pYes >= MIN_PYES && pYes <= MAX_PYES, "pYes must be 1-99");
        require(predictions[marketId][msg.sender].agent == address(0), "Already predicted");
        
        usdt.safeTransferFrom(msg.sender, address(this), ENTRY_FEE);
        
        uint256 platformFee = (ENTRY_FEE * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 toPot = ENTRY_FEE - platformFee;
        
        usdt.safeTransfer(treasury, platformFee);
        market.potAmount += toPot;
        market.predictionCount++;
        
        predictions[marketId][msg.sender] = Prediction({
            agent: msg.sender,
            pYes: pYes,
            timestamp: block.timestamp,
            claimed: false
        });
        
        marketAgents[marketId].push(msg.sender);
        
        emit PredictionMade(marketId, msg.sender, pYes);
    }
    
    /**
     * @notice Resolve market using FTSO price - ANYONE can call this!
     * @dev Reads current FTSO price and determines outcome trustlessly
     */
    function resolve(bytes32 marketId) external nonReentrant {
        PriceMarket storage market = markets[marketId];
        require(market.settlementTime > 0, "Market not found");
        require(block.timestamp >= market.settlementTime, "Not settlement time");
        require(!market.resolved, "Already resolved");
        
        // Get current price from FTSO
        IFtsoV2 ftso = _getFtsoV2();
        (uint256 value, int8 decimals, uint64 timestamp) = ftso.getFeedById(market.feedId);
        require(value > 0, "FTSO price unavailable");
        
        // Normalize prices to same decimals for comparison
        uint256 normalizedPrice;
        uint256 normalizedTarget;
        
        if (decimals >= market.targetDecimals) {
            normalizedPrice = value;
            normalizedTarget = market.targetPrice * (10 ** uint8(decimals - market.targetDecimals));
        } else {
            normalizedPrice = value * (10 ** uint8(market.targetDecimals - decimals));
            normalizedTarget = market.targetPrice;
        }
        
        // Determine outcome based on direction
        bool outcome;
        if (market.direction == Direction.ABOVE) {
            outcome = normalizedPrice >= normalizedTarget;
        } else {
            outcome = normalizedPrice < normalizedTarget;
        }
        
        market.resolved = true;
        market.outcome = outcome;
        market.settledPrice = value;
        market.settledTimestamp = timestamp;
        
        // Calculate total score
        uint256 totalScore = 0;
        address[] storage agents = marketAgents[marketId];
        for (uint256 i = 0; i < agents.length; i++) {
            Prediction storage pred = predictions[marketId][agents[i]];
            uint256 score = outcome ? pred.pYes : (PYES_DECIMALS - pred.pYes);
            totalScore += score;
        }
        market.totalScore = totalScore;
        
        emit MarketResolved(marketId, outcome, value, totalScore, msg.sender);
    }
    
    /**
     * @notice Claim payout after resolution
     */
    function claim(bytes32 marketId) external nonReentrant {
        PriceMarket storage market = markets[marketId];
        require(market.resolved, "Not resolved");
        
        Prediction storage pred = predictions[marketId][msg.sender];
        require(pred.agent != address(0), "No prediction");
        require(!pred.claimed, "Already claimed");
        
        pred.claimed = true;
        
        uint256 score = market.outcome ? pred.pYes : (PYES_DECIMALS - pred.pYes);
        uint256 payout = (score * market.potAmount) / market.totalScore;
        
        usdt.safeTransfer(msg.sender, payout);
        
        emit PayoutClaimed(marketId, msg.sender, payout);
    }

    // ============ View Functions ============
    
    function getMarket(bytes32 marketId) external view returns (
        string memory symbol,
        uint256 targetPrice,
        Direction direction,
        uint256 settlementTime,
        uint256 potAmount,
        uint256 predictionCount,
        bool resolved,
        bool outcome,
        uint256 settledPrice
    ) {
        PriceMarket storage m = markets[marketId];
        return (
            m.symbol,
            m.targetPrice,
            m.direction,
            m.settlementTime,
            m.potAmount,
            m.predictionCount,
            m.resolved,
            m.outcome,
            m.settledPrice
        );
    }
    
    function getPrediction(bytes32 marketId, address agent) external view returns (
        uint256 pYes,
        uint256 timestamp,
        bool claimed
    ) {
        Prediction storage p = predictions[marketId][agent];
        return (p.pYes, p.timestamp, p.claimed);
    }
    
    function getMarketAgents(bytes32 marketId) external view returns (address[] memory) {
        return marketAgents[marketId];
    }
    
    function getMarketCount() external view returns (uint256) {
        return allMarkets.length;
    }
    
    function estimatePayout(bytes32 marketId, address agent, bool assumedOutcome) external view returns (uint256) {
        PriceMarket storage market = markets[marketId];
        Prediction storage pred = predictions[marketId][agent];
        
        if (pred.agent == address(0)) return 0;
        
        uint256 totalScore = 0;
        address[] storage agents = marketAgents[marketId];
        for (uint256 i = 0; i < agents.length; i++) {
            Prediction storage p = predictions[marketId][agents[i]];
            uint256 s = assumedOutcome ? p.pYes : (PYES_DECIMALS - p.pYes);
            totalScore += s;
        }
        
        if (totalScore == 0) return 0;
        
        uint256 agentScore = assumedOutcome ? pred.pYes : (PYES_DECIMALS - pred.pYes);
        return (agentScore * market.potAmount) / totalScore;
    }
    
    /**
     * @notice Get current FTSO price for a market
     * @dev Useful for UI to show live price vs target
     */
    function getCurrentPrice(bytes32 marketId) external view returns (
        uint256 price,
        int8 decimals,
        uint64 timestamp
    ) {
        PriceMarket storage market = markets[marketId];
        require(market.settlementTime > 0, "Market not found");
        
        IFtsoV2 ftso = _getFtsoV2();
        return ftso.getFeedById(market.feedId);
    }
    
    /**
     * @notice Check if market can be resolved
     */
    function canResolve(bytes32 marketId) external view returns (bool) {
        PriceMarket storage market = markets[marketId];
        return market.settlementTime > 0 && 
               block.timestamp >= market.settlementTime && 
               !market.resolved;
    }

    // ============ Internal Functions ============
    
    function _getFtsoV2() internal view returns (IFtsoV2) {
        IFlareContractRegistry registry = IFlareContractRegistry(FLARE_REGISTRY);
        address ftsoAddress = registry.getContractAddressByName("FtsoV2");
        return IFtsoV2(ftsoAddress);
    }
    
    function _getFeedId(string memory symbol) internal pure returns (bytes21) {
        // Feed format: 0x01 + "SYMBOL/USD" padded to 21 bytes
        // e.g., ETH/USD -> 0x014554482f555344000000000000000000000000000000
        bytes memory feedName = abi.encodePacked(symbol, "/USD");
        bytes21 feedId;
        
        // Build feed ID: category byte (01) + feed name + padding
        assembly {
            // Start with 0x01 in most significant byte
            feedId := 0x0100000000000000000000000000000000000000000000
            
            // Get feed name length and data pointer
            let len := mload(feedName)
            let data := add(feedName, 32)
            
            // Copy up to 20 bytes of feed name (leaving room for 01 prefix)
            if gt(len, 20) { len := 20 }
            
            // Copy byte by byte into feedId starting at position 1
            for { let i := 0 } lt(i, len) { i := add(i, 1) } {
                let b := byte(0, mload(add(data, i)))
                feedId := or(feedId, shl(mul(8, sub(19, i)), b))
            }
        }
        
        return feedId;
    }
}
