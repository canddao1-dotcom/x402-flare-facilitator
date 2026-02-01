// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ClawlyMarket
 * @notice Prediction markets for AI agents with probability-weighted payouts
 * @dev Entry: 0.10 USDT, 1% platform fee, 99% to pot
 *      Payout formula: score = pYes if YES wins, (1-pYes) if NO wins
 *      Agent share = score / totalScore, payout = share * pot
 */
contract ClawlyMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    uint256 public constant ENTRY_FEE = 100000;      // 0.10 USDT (6 decimals)
    uint256 public constant PLATFORM_FEE_BPS = 100;  // 1% = 100 basis points
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MIN_PYES = 1;            // 0.01 (1%)
    uint256 public constant MAX_PYES = 99;           // 0.99 (99%)
    uint256 public constant PYES_DECIMALS = 100;     // pYes stored as 1-99

    // ============ State ============
    IERC20 public immutable usdt;
    address public treasury;
    
    struct Market {
        bytes32 slug;
        string question;
        uint256 seedAmount;
        uint256 potAmount;
        uint256 closeTime;
        uint256 resolveTime;
        bool resolved;
        bool outcome;          // true = YES, false = NO
        uint256 totalScore;    // Sum of all scores (calculated on resolution)
        uint256 predictionCount;
    }
    
    struct Prediction {
        address agent;
        uint256 pYes;          // 1-99 representing 0.01-0.99
        uint256 timestamp;
        bool claimed;
    }
    
    // marketId => Market
    mapping(bytes32 => Market) public markets;
    
    // marketId => agent => Prediction
    mapping(bytes32 => mapping(address => Prediction)) public predictions;
    
    // marketId => list of agents who predicted
    mapping(bytes32 => address[]) public marketAgents;
    
    // All market IDs
    bytes32[] public allMarkets;

    // ============ Events ============
    event MarketCreated(bytes32 indexed marketId, string question, uint256 seedAmount, uint256 closeTime);
    event PredictionMade(bytes32 indexed marketId, address indexed agent, uint256 pYes);
    event MarketResolved(bytes32 indexed marketId, bool outcome, uint256 totalScore);
    event PayoutClaimed(bytes32 indexed marketId, address indexed agent, uint256 amount);
    event TreasuryUpdated(address oldTreasury, address newTreasury);

    // ============ Constructor ============
    constructor(address _usdt, address _treasury) Ownable(msg.sender) {
        require(_usdt != address(0), "Invalid USDT address");
        require(_treasury != address(0), "Invalid treasury address");
        usdt = IERC20(_usdt);
        treasury = _treasury;
    }

    // ============ Admin Functions ============
    
    /**
     * @notice Create a new prediction market
     * @param slug Unique identifier for the market
     * @param question The question being predicted
     * @param seedAmount Initial pot amount (transferred from caller)
     * @param closeTime When predictions lock
     */
    function createMarket(
        string calldata slug,
        string calldata question,
        uint256 seedAmount,
        uint256 closeTime
    ) external onlyOwner {
        bytes32 marketId = keccak256(abi.encodePacked(slug));
        require(markets[marketId].closeTime == 0, "Market already exists");
        require(closeTime > block.timestamp, "Close time must be in future");
        require(seedAmount > 0, "Seed amount must be positive");
        
        // Transfer seed from owner
        usdt.safeTransferFrom(msg.sender, address(this), seedAmount);
        
        markets[marketId] = Market({
            slug: marketId,
            question: question,
            seedAmount: seedAmount,
            potAmount: seedAmount,
            closeTime: closeTime,
            resolveTime: 0,
            resolved: false,
            outcome: false,
            totalScore: 0,
            predictionCount: 0
        });
        
        allMarkets.push(marketId);
        
        emit MarketCreated(marketId, question, seedAmount, closeTime);
    }
    
    /**
     * @notice Resolve a market with the outcome
     * @param marketId The market to resolve
     * @param outcome true = YES wins, false = NO wins
     */
    function resolveMarket(bytes32 marketId, bool outcome) external onlyOwner {
        Market storage market = markets[marketId];
        require(market.closeTime > 0, "Market does not exist");
        require(!market.resolved, "Already resolved");
        require(block.timestamp >= market.closeTime, "Market not closed yet");
        
        market.resolved = true;
        market.outcome = outcome;
        market.resolveTime = block.timestamp;
        
        // Calculate total score
        uint256 totalScore = 0;
        address[] storage agents = marketAgents[marketId];
        
        for (uint256 i = 0; i < agents.length; i++) {
            Prediction storage pred = predictions[marketId][agents[i]];
            uint256 score = outcome ? pred.pYes : (PYES_DECIMALS - pred.pYes);
            totalScore += score;
        }
        
        market.totalScore = totalScore;
        
        emit MarketResolved(marketId, outcome, totalScore);
    }
    
    /**
     * @notice Update treasury address
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }

    // ============ Agent Functions ============
    
    /**
     * @notice Make a prediction on a market
     * @param marketId The market to predict on
     * @param pYes Probability of YES (1-99, representing 0.01-0.99)
     */
    function predict(bytes32 marketId, uint256 pYes) external nonReentrant {
        Market storage market = markets[marketId];
        require(market.closeTime > 0, "Market does not exist");
        require(block.timestamp < market.closeTime, "Market closed");
        require(!market.resolved, "Market resolved");
        require(pYes >= MIN_PYES && pYes <= MAX_PYES, "pYes must be 1-99");
        require(predictions[marketId][msg.sender].agent == address(0), "Already predicted");
        
        // Transfer entry fee
        usdt.safeTransferFrom(msg.sender, address(this), ENTRY_FEE);
        
        // Calculate fee split
        uint256 platformFee = (ENTRY_FEE * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 toPot = ENTRY_FEE - platformFee;
        
        // Send platform fee to treasury
        usdt.safeTransfer(treasury, platformFee);
        
        // Add to pot
        market.potAmount += toPot;
        market.predictionCount++;
        
        // Store prediction
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
     * @notice Claim payout after market resolution
     * @param marketId The market to claim from
     */
    function claim(bytes32 marketId) external nonReentrant {
        Market storage market = markets[marketId];
        require(market.resolved, "Market not resolved");
        
        Prediction storage pred = predictions[marketId][msg.sender];
        require(pred.agent != address(0), "No prediction found");
        require(!pred.claimed, "Already claimed");
        
        pred.claimed = true;
        
        // Calculate payout
        uint256 score = market.outcome ? pred.pYes : (PYES_DECIMALS - pred.pYes);
        uint256 payout = (score * market.potAmount) / market.totalScore;
        
        // Transfer payout
        usdt.safeTransfer(msg.sender, payout);
        
        emit PayoutClaimed(marketId, msg.sender, payout);
    }

    // ============ View Functions ============
    
    /**
     * @notice Get market details
     */
    function getMarket(bytes32 marketId) external view returns (
        string memory question,
        uint256 seedAmount,
        uint256 potAmount,
        uint256 closeTime,
        bool resolved,
        bool outcome,
        uint256 predictionCount
    ) {
        Market storage m = markets[marketId];
        return (m.question, m.seedAmount, m.potAmount, m.closeTime, m.resolved, m.outcome, m.predictionCount);
    }
    
    /**
     * @notice Get prediction for an agent
     */
    function getPrediction(bytes32 marketId, address agent) external view returns (
        uint256 pYes,
        uint256 timestamp,
        bool claimed
    ) {
        Prediction storage p = predictions[marketId][agent];
        return (p.pYes, p.timestamp, p.claimed);
    }
    
    /**
     * @notice Calculate potential payout for an agent (before resolution)
     * @dev This is an estimate - actual payout depends on final totalScore
     */
    function estimatePayout(bytes32 marketId, address agent, bool assumedOutcome) external view returns (uint256) {
        Market storage market = markets[marketId];
        Prediction storage pred = predictions[marketId][agent];
        
        if (pred.agent == address(0)) return 0;
        
        // Calculate current total score with assumed outcome
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
     * @notice Get all agents who predicted on a market
     */
    function getMarketAgents(bytes32 marketId) external view returns (address[] memory) {
        return marketAgents[marketId];
    }
    
    /**
     * @notice Get total number of markets
     */
    function getMarketCount() external view returns (uint256) {
        return allMarkets.length;
    }
    
    /**
     * @notice Convert slug string to marketId
     */
    function slugToId(string calldata slug) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(slug));
    }
}
