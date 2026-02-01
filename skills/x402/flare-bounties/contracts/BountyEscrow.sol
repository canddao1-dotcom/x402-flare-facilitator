// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BountyEscrow
 * @notice Agent-to-agent bounty system for Flare/HyperEVM
 * @dev Escrow contract with staking, slashing, and auto-approval
 */
contract BountyEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════

    enum BountyStatus {
        Open,           // Available to claim
        Claimed,        // Worker has claimed, working
        Submitted,      // Work submitted, awaiting review
        Approved,       // Completed successfully
        Rejected,       // Poster rejected work
        Cancelled,      // Poster cancelled before claim
        Expired         // Deadline passed without submission
    }

    struct Bounty {
        address poster;
        address worker;
        address token;
        uint256 amount;
        uint256 stake;          // 10% of amount, provided by worker
        uint256 createdAt;
        uint256 workDeadline;   // Worker must submit by this time
        uint256 reviewDeadline; // Auto-approve after this time
        bytes32 metadataHash;   // IPFS hash or keccak of metadata
        bytes32 workHash;       // Hash of submitted work
        BountyStatus status;
    }

    // ═══════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════

    mapping(uint256 => Bounty) public bounties;
    uint256 public nextBountyId;
    
    uint256 public platformFeeBps = 500; // 5%
    uint256 public stakeRatioBps = 1000; // 10%
    address public feeRecipient;
    
    uint256 public constant DEFAULT_WORK_DEADLINE = 24 hours;
    uint256 public constant DEFAULT_REVIEW_DEADLINE = 48 hours;
    uint256 public constant MIN_BOUNTY_AMOUNT = 1e6; // 1 USDT (6 decimals)

    // Allowed payment tokens
    mapping(address => bool) public allowedTokens;

    // ═══════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════

    event BountyCreated(
        uint256 indexed bountyId,
        address indexed poster,
        address token,
        uint256 amount,
        uint256 workDeadline,
        bytes32 metadataHash
    );
    
    event BountyClaimed(
        uint256 indexed bountyId,
        address indexed worker,
        uint256 stake
    );
    
    event WorkSubmitted(
        uint256 indexed bountyId,
        bytes32 workHash
    );
    
    event BountyApproved(
        uint256 indexed bountyId,
        address indexed worker,
        uint256 payout
    );
    
    event BountyRejected(
        uint256 indexed bountyId,
        address indexed worker,
        uint256 slashedStake
    );
    
    event BountyCancelled(uint256 indexed bountyId);
    event BountyExpired(uint256 indexed bountyId);

    // ═══════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════

    constructor(address _feeRecipient) {
        feeRecipient = _feeRecipient;
    }

    // ═══════════════════════════════════════════════════════════
    // POSTER FUNCTIONS
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Create a new bounty
     * @param token Payment token address
     * @param amount Bounty amount (excl. platform fee)
     * @param workDeadlineHours Hours to complete work (0 = default 24h)
     * @param metadataHash Hash of bounty metadata (title, description, etc.)
     */
    function createBounty(
        address token,
        uint256 amount,
        uint256 workDeadlineHours,
        bytes32 metadataHash
    ) external nonReentrant returns (uint256 bountyId) {
        require(allowedTokens[token], "Token not allowed");
        require(amount >= MIN_BOUNTY_AMOUNT, "Amount too low");
        
        // Calculate total including platform fee
        uint256 fee = (amount * platformFeeBps) / 10000;
        uint256 total = amount + fee;
        
        // Transfer funds to escrow
        IERC20(token).safeTransferFrom(msg.sender, address(this), total);
        
        // Transfer fee immediately
        if (fee > 0) {
            IERC20(token).safeTransfer(feeRecipient, fee);
        }
        
        bountyId = nextBountyId++;
        
        uint256 workDeadline = workDeadlineHours > 0 
            ? workDeadlineHours * 1 hours 
            : DEFAULT_WORK_DEADLINE;
        
        bounties[bountyId] = Bounty({
            poster: msg.sender,
            worker: address(0),
            token: token,
            amount: amount,
            stake: 0,
            createdAt: block.timestamp,
            workDeadline: workDeadline,
            reviewDeadline: DEFAULT_REVIEW_DEADLINE,
            metadataHash: metadataHash,
            workHash: bytes32(0),
            status: BountyStatus.Open
        });
        
        emit BountyCreated(bountyId, msg.sender, token, amount, workDeadline, metadataHash);
    }

    /**
     * @notice Cancel an unclaimed bounty
     */
    function cancelBounty(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.poster == msg.sender, "Not poster");
        require(bounty.status == BountyStatus.Open, "Not open");
        
        bounty.status = BountyStatus.Cancelled;
        
        // Refund poster
        IERC20(bounty.token).safeTransfer(msg.sender, bounty.amount);
        
        emit BountyCancelled(bountyId);
    }

    /**
     * @notice Approve submitted work
     */
    function approveBounty(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.poster == msg.sender, "Not poster");
        require(bounty.status == BountyStatus.Submitted, "Not submitted");
        
        _approveBounty(bountyId, bounty);
    }

    /**
     * @notice Reject submitted work (slashes worker stake)
     */
    function rejectBounty(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.poster == msg.sender, "Not poster");
        require(bounty.status == BountyStatus.Submitted, "Not submitted");
        require(block.timestamp < bounty.createdAt + bounty.workDeadline + bounty.reviewDeadline, "Review expired");
        
        bounty.status = BountyStatus.Rejected;
        
        // Refund poster
        IERC20(bounty.token).safeTransfer(bounty.poster, bounty.amount);
        
        // Slash stake to fee recipient
        if (bounty.stake > 0) {
            IERC20(bounty.token).safeTransfer(feeRecipient, bounty.stake);
        }
        
        emit BountyRejected(bountyId, bounty.worker, bounty.stake);
    }

    // ═══════════════════════════════════════════════════════════
    // WORKER FUNCTIONS
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Claim a bounty and stake 10%
     */
    function claimBounty(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.status == BountyStatus.Open, "Not open");
        
        uint256 stake = (bounty.amount * stakeRatioBps) / 10000;
        
        // Transfer stake from worker
        IERC20(bounty.token).safeTransferFrom(msg.sender, address(this), stake);
        
        bounty.worker = msg.sender;
        bounty.stake = stake;
        bounty.status = BountyStatus.Claimed;
        // Work deadline starts now
        bounty.workDeadline = block.timestamp + bounty.workDeadline;
        
        emit BountyClaimed(bountyId, msg.sender, stake);
    }

    /**
     * @notice Submit completed work
     */
    function submitWork(uint256 bountyId, bytes32 workHash) external nonReentrant {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.worker == msg.sender, "Not worker");
        require(bounty.status == BountyStatus.Claimed, "Not claimed");
        require(block.timestamp <= bounty.workDeadline, "Work deadline passed");
        
        bounty.workHash = workHash;
        bounty.status = BountyStatus.Submitted;
        // Review deadline starts now
        bounty.reviewDeadline = block.timestamp + bounty.reviewDeadline;
        
        emit WorkSubmitted(bountyId, workHash);
    }

    // ═══════════════════════════════════════════════════════════
    // PUBLIC FUNCTIONS
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Auto-approve if review deadline passed
     */
    function finalizeExpired(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = bounties[bountyId];
        
        if (bounty.status == BountyStatus.Submitted && 
            block.timestamp > bounty.reviewDeadline) {
            // Auto-approve
            _approveBounty(bountyId, bounty);
        } else if (bounty.status == BountyStatus.Claimed && 
                   block.timestamp > bounty.workDeadline) {
            // Work deadline expired - slash stake, reopen bounty
            bounty.status = BountyStatus.Open;
            bounty.worker = address(0);
            
            if (bounty.stake > 0) {
                IERC20(bounty.token).safeTransfer(feeRecipient, bounty.stake);
            }
            bounty.stake = 0;
            
            emit BountyExpired(bountyId);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // INTERNAL
    // ═══════════════════════════════════════════════════════════

    function _approveBounty(uint256 bountyId, Bounty storage bounty) internal {
        bounty.status = BountyStatus.Approved;
        
        // Pay worker: bounty amount + stake returned
        uint256 payout = bounty.amount + bounty.stake;
        IERC20(bounty.token).safeTransfer(bounty.worker, payout);
        
        emit BountyApproved(bountyId, bounty.worker, payout);
    }

    // ═══════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════

    function setAllowedToken(address token, bool allowed) external onlyOwner {
        allowedTokens[token] = allowed;
    }

    function setPlatformFee(uint256 bps) external onlyOwner {
        require(bps <= 1000, "Max 10%");
        platformFeeBps = bps;
    }

    function setStakeRatio(uint256 bps) external onlyOwner {
        require(bps >= 500 && bps <= 2000, "5-20%");
        stakeRatioBps = bps;
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        feeRecipient = recipient;
    }

    // ═══════════════════════════════════════════════════════════
    // VIEW
    // ═══════════════════════════════════════════════════════════

    function getBounty(uint256 bountyId) external view returns (Bounty memory) {
        return bounties[bountyId];
    }

    function calculateStake(uint256 amount) external view returns (uint256) {
        return (amount * stakeRatioBps) / 10000;
    }

    function calculateFee(uint256 amount) external view returns (uint256) {
        return (amount * platformFeeBps) / 10000;
    }
}
