// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TipSplitter
 * @notice Atomic tip splitting - 99% to recipient, 1% to protocol
 * @dev Single transaction for tips with automatic fee extraction
 */
contract TipSplitter is Ownable {
    using SafeERC20 for IERC20;

    // Protocol fee basis points (100 = 1%)
    uint256 public feeBps = 100;
    
    // Fee recipient (protocol treasury)
    address public feeRecipient;
    
    // Events
    event TipSent(
        address indexed token,
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 fee
    );
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);

    constructor(address _feeRecipient) Ownable(msg.sender) {
        require(_feeRecipient != address(0), "Invalid fee recipient");
        feeRecipient = _feeRecipient;
    }

    /**
     * @notice Send a tip with automatic fee splitting
     * @param token ERC20 token address
     * @param to Recipient address
     * @param amount Total tip amount (fee will be deducted)
     */
    function tip(
        address token,
        address to,
        uint256 amount
    ) external {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");
        
        IERC20 tokenContract = IERC20(token);
        
        // Calculate fee and net amount
        uint256 fee = (amount * feeBps) / 10000;
        uint256 netAmount = amount - fee;
        
        // Transfer from sender to this contract
        tokenContract.safeTransferFrom(msg.sender, address(this), amount);
        
        // Split: net to recipient, fee to protocol
        tokenContract.safeTransfer(to, netAmount);
        if (fee > 0) {
            tokenContract.safeTransfer(feeRecipient, fee);
        }
        
        emit TipSent(token, msg.sender, to, netAmount, fee);
    }

    /**
     * @notice Send native token tip (FLR) with fee splitting
     * @param to Recipient address
     */
    function tipNative(address to) external payable {
        require(to != address(0), "Invalid recipient");
        require(msg.value > 0, "Amount must be > 0");
        
        uint256 fee = (msg.value * feeBps) / 10000;
        uint256 netAmount = msg.value - fee;
        
        // Send net to recipient
        (bool success1, ) = to.call{value: netAmount}("");
        require(success1, "Transfer to recipient failed");
        
        // Send fee to protocol
        if (fee > 0) {
            (bool success2, ) = feeRecipient.call{value: fee}("");
            require(success2, "Fee transfer failed");
        }
        
        emit TipSent(address(0), msg.sender, to, netAmount, fee);
    }

    // === Owner Functions ===

    /**
     * @notice Update fee percentage (in basis points)
     * @param newFeeBps New fee in basis points (100 = 1%, max 1000 = 10%)
     */
    function setFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1000, "Fee too high (max 10%)");
        emit FeeUpdated(feeBps, newFeeBps);
        feeBps = newFeeBps;
    }

    /**
     * @notice Update fee recipient address
     * @param newRecipient New fee recipient
     */
    function setFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "Invalid recipient");
        emit FeeRecipientUpdated(feeRecipient, newRecipient);
        feeRecipient = newRecipient;
    }

    /**
     * @notice Rescue stuck tokens (emergency only)
     * @param token Token address (address(0) for native)
     * @param to Destination address
     * @param amount Amount to rescue
     */
    function rescue(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = to.call{value: amount}("");
            require(success, "Native transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
