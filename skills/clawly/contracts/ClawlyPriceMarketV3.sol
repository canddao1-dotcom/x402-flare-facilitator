// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IFlareContractRegistry {
    function getContractAddressByName(string calldata _name) external view returns (address);
}

interface IFtsoV2 {
    function getFeedById(bytes21 _feedId) external view returns (uint256 value, int8 decimals, uint64 timestamp);
}

/**
 * @title ClawlyPriceMarketV3
 * @notice Trustless prediction markets with FTSO oracle resolution
 * @dev Simplified version with pre-computed feed IDs
 */
contract ClawlyPriceMarketV3 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant ENTRY_FEE = 100000;  // 0.10 USDT
    uint256 public constant PLATFORM_FEE_BPS = 100;
    uint256 public constant BPS_DENOMINATOR = 10000;
    
    address public constant FLARE_REGISTRY = 0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019;

    IERC20 public immutable usdt;
    address public treasury;
    
    // Pre-computed feed IDs (bytes21)
    mapping(string => bytes21) public feedIds;
    
    enum Direction { ABOVE, BELOW }
    
    struct PriceMarket {
        bytes21 feedId;
        string symbol;
        uint256 targetPrice;
        int8 targetDecimals;
        Direction direction;
        uint256 settlementTime;
        uint256 potAmount;
        uint256 predictionCount;
        bool resolved;
        bool outcome;
        uint256 totalScore;
        uint256 settledPrice;
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

    event PriceMarketCreated(bytes32 indexed marketId, string symbol, uint256 targetPrice, Direction direction, uint256 settlementTime);
    event PredictionMade(bytes32 indexed marketId, address indexed agent, uint256 pYes);
    event MarketResolved(bytes32 indexed marketId, bool outcome, uint256 settledPrice, address resolver);
    event PayoutClaimed(bytes32 indexed marketId, address indexed agent, uint256 amount);

    constructor(address _usdt, address _treasury) Ownable(msg.sender) {
        require(_usdt != address(0) && _treasury != address(0), "Invalid address");
        usdt = IERC20(_usdt);
        treasury = _treasury;
        
        // Pre-populate common feed IDs
        feedIds["FLR"] = bytes21(0x01464c522f55534400000000000000000000000000);
        feedIds["ETH"] = bytes21(0x014554482f55534400000000000000000000000000);
        feedIds["BTC"] = bytes21(0x014254432f55534400000000000000000000000000);
        feedIds["XRP"] = bytes21(0x015852502f55534400000000000000000000000000);
        feedIds["SOL"] = bytes21(0x01534f4c2f55534400000000000000000000000000);
        feedIds["DOGE"] = bytes21(0x01444f47452f555344000000000000000000000000);
        feedIds["ADA"] = bytes21(0x014144412f55534400000000000000000000000000);
        feedIds["AVAX"] = bytes21(0x01415641582f555344000000000000000000000000);
        feedIds["LINK"] = bytes21(0x014c494e4b2f555344000000000000000000000000);
    }
    
    function addFeedId(string calldata symbol, bytes21 feedId) external onlyOwner {
        feedIds[symbol] = feedId;
    }
    
    function createPriceMarket(
        string calldata symbol,
        uint256 targetPrice,
        int8 targetDecimals,
        Direction direction,
        uint256 settlementTime,
        uint256 seedAmount
    ) external onlyOwner {
        require(settlementTime > block.timestamp, "Settlement must be future");
        require(seedAmount > 0, "Need seed");
        
        bytes21 feedId = feedIds[symbol];
        require(feedId != bytes21(0), "Unknown symbol - add feedId first");
        
        // Verify feed works
        IFtsoV2 ftso = _getFtsoV2();
        (uint256 testPrice, , ) = ftso.getFeedById(feedId);
        require(testPrice > 0, "FTSO feed unavailable");
        
        bytes32 marketId = keccak256(abi.encodePacked(symbol, targetPrice, direction, settlementTime));
        require(markets[marketId].settlementTime == 0, "Market exists");
        
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
            settledPrice: 0
        });
        
        allMarkets.push(marketId);
        emit PriceMarketCreated(marketId, symbol, targetPrice, direction, settlementTime);
    }
    
    function predict(bytes32 marketId, uint256 pYes) external nonReentrant {
        PriceMarket storage market = markets[marketId];
        require(market.settlementTime > 0, "Not found");
        require(block.timestamp < market.settlementTime, "Closed");
        require(!market.resolved, "Resolved");
        require(pYes >= 1 && pYes <= 99, "pYes 1-99");
        require(predictions[marketId][msg.sender].agent == address(0), "Already bet");
        
        usdt.safeTransferFrom(msg.sender, address(this), ENTRY_FEE);
        
        uint256 fee = (ENTRY_FEE * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        usdt.safeTransfer(treasury, fee);
        market.potAmount += ENTRY_FEE - fee;
        market.predictionCount++;
        
        predictions[marketId][msg.sender] = Prediction(msg.sender, pYes, block.timestamp, false);
        marketAgents[marketId].push(msg.sender);
        
        emit PredictionMade(marketId, msg.sender, pYes);
    }
    
    /// @notice ANYONE can resolve after settlement time - trustless!
    function resolve(bytes32 marketId) external nonReentrant {
        PriceMarket storage market = markets[marketId];
        require(market.settlementTime > 0, "Not found");
        require(block.timestamp >= market.settlementTime, "Not yet");
        require(!market.resolved, "Already resolved");
        
        IFtsoV2 ftso = _getFtsoV2();
        (uint256 price, int8 decimals, ) = ftso.getFeedById(market.feedId);
        require(price > 0, "FTSO unavailable");
        
        // Normalize for comparison
        uint256 normalizedPrice;
        uint256 normalizedTarget;
        if (decimals >= market.targetDecimals) {
            normalizedPrice = price;
            normalizedTarget = market.targetPrice * (10 ** uint8(decimals - market.targetDecimals));
        } else {
            normalizedPrice = price * (10 ** uint8(market.targetDecimals - decimals));
            normalizedTarget = market.targetPrice;
        }
        
        bool outcome = market.direction == Direction.ABOVE 
            ? normalizedPrice >= normalizedTarget 
            : normalizedPrice < normalizedTarget;
        
        market.resolved = true;
        market.outcome = outcome;
        market.settledPrice = price;
        
        // Calculate total score
        uint256 totalScore = 0;
        for (uint256 i = 0; i < marketAgents[marketId].length; i++) {
            uint256 pYes = predictions[marketId][marketAgents[marketId][i]].pYes;
            totalScore += outcome ? pYes : (100 - pYes);
        }
        market.totalScore = totalScore;
        
        emit MarketResolved(marketId, outcome, price, msg.sender);
    }
    
    function claim(bytes32 marketId) external nonReentrant {
        PriceMarket storage market = markets[marketId];
        require(market.resolved, "Not resolved");
        
        Prediction storage pred = predictions[marketId][msg.sender];
        require(pred.agent != address(0), "No bet");
        require(!pred.claimed, "Claimed");
        
        pred.claimed = true;
        
        uint256 score = market.outcome ? pred.pYes : (100 - pred.pYes);
        uint256 payout = (score * market.potAmount) / market.totalScore;
        
        usdt.safeTransfer(msg.sender, payout);
        emit PayoutClaimed(marketId, msg.sender, payout);
    }
    
    function getCurrentPrice(bytes32 marketId) external view returns (uint256 price, int8 decimals, uint64 timestamp) {
        return _getFtsoV2().getFeedById(markets[marketId].feedId);
    }
    
    function canResolve(bytes32 marketId) external view returns (bool) {
        PriceMarket storage m = markets[marketId];
        return m.settlementTime > 0 && block.timestamp >= m.settlementTime && !m.resolved;
    }
    
    function getMarket(bytes32 marketId) external view returns (
        string memory symbol, uint256 targetPrice, Direction direction,
        uint256 settlementTime, uint256 potAmount, uint256 predictionCount,
        bool resolved, bool outcome, uint256 settledPrice
    ) {
        PriceMarket storage m = markets[marketId];
        return (m.symbol, m.targetPrice, m.direction, m.settlementTime, 
                m.potAmount, m.predictionCount, m.resolved, m.outcome, m.settledPrice);
    }
    
    function _getFtsoV2() internal view returns (IFtsoV2) {
        return IFtsoV2(IFlareContractRegistry(FLARE_REGISTRY).getContractAddressByName("FtsoV2"));
    }
}
