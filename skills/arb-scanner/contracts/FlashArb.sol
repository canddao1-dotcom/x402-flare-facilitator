// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title FlashArb
 * @notice Atomic triangle arbitrage using Uniswap V3 flash swaps
 * @dev Reverts if not profitable - you only lose gas on failed attempts
 */

interface IUniswapV3Pool {
    function flash(
        address recipient,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external;
    
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
}

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    
    function exactInputSingle(ExactInputSingleParams calldata params) 
        external payable returns (uint256 amountOut);
}

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

contract FlashArb {
    address public immutable owner;
    
    // Routers
    address public constant ENOSYS_ROUTER = 0x5FD34090E9b195d8482Ad3CC63dB078534F1b113;
    address public constant SPARK_ROUTER = 0x8a1E35F5c98C4E85B36B7B253222eE17773b2781;
    
    // Common tokens
    address public constant WFLR = 0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d;
    
    struct ArbParams {
        address flashPool;      // Pool to flash borrow from
        address tokenBorrow;    // Token to borrow
        uint256 borrowAmount;   // Amount to borrow
        address router1;        // First swap router
        address tokenMid;       // Middle token
        uint24 fee1;           // First swap fee tier
        address router2;        // Second swap router  
        uint24 fee2;           // Second swap fee tier
        uint256 minProfit;      // Minimum profit required
    }
    
    event ArbExecuted(
        address indexed token,
        uint256 borrowed,
        uint256 returned,
        uint256 profit
    );
    
    event ArbFailed(string reason);
    
    constructor() {
        owner = msg.sender;
        
        // Pre-approve routers for common tokens
        IERC20(WFLR).approve(ENOSYS_ROUTER, type(uint256).max);
        IERC20(WFLR).approve(SPARK_ROUTER, type(uint256).max);
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    /**
     * @notice Execute triangle arbitrage with flash loan
     * @param params Arbitrage parameters
     */
    function executeArb(ArbParams calldata params) external onlyOwner {
        IUniswapV3Pool pool = IUniswapV3Pool(params.flashPool);
        
        // Determine which token to flash (amount0 or amount1)
        address token0 = pool.token0();
        uint256 amount0 = params.tokenBorrow == token0 ? params.borrowAmount : 0;
        uint256 amount1 = params.tokenBorrow == token0 ? 0 : params.borrowAmount;
        
        // Encode params for callback
        bytes memory data = abi.encode(params);
        
        // Initiate flash loan - callback will execute arb
        pool.flash(address(this), amount0, amount1, data);
    }
    
    /**
     * @notice Callback from V3 pool during flash loan
     */
    function uniswapV3FlashCallback(
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external {
        ArbParams memory params = abi.decode(data, (ArbParams));
        
        // Verify callback is from the flash pool
        require(msg.sender == params.flashPool, "Invalid callback");
        
        // Calculate repayment (borrowed + fee)
        uint256 flashFee = fee0 > 0 ? fee0 : fee1;
        uint256 repayAmount = params.borrowAmount + flashFee;
        
        // Approve middle token for second router
        IERC20(params.tokenMid).approve(params.router2, type(uint256).max);
        
        // === LEG 1: Borrow token → Mid token ===
        uint256 midAmount = ISwapRouter(params.router1).exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: params.tokenBorrow,
                tokenOut: params.tokenMid,
                fee: params.fee1,
                recipient: address(this),
                amountIn: params.borrowAmount,
                amountOutMinimum: 0, // We check profit at the end
                sqrtPriceLimitX96: 0
            })
        );
        
        // === LEG 2: Mid token → Borrow token (back) ===
        uint256 finalAmount = ISwapRouter(params.router2).exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: params.tokenMid,
                tokenOut: params.tokenBorrow,
                fee: params.fee2,
                recipient: address(this),
                amountIn: midAmount,
                amountOutMinimum: repayAmount + params.minProfit, // Must cover repay + min profit
                sqrtPriceLimitX96: 0
            })
        );
        
        // Verify profit
        require(finalAmount >= repayAmount + params.minProfit, "Insufficient profit");
        
        // Repay flash loan
        IERC20(params.tokenBorrow).transfer(params.flashPool, repayAmount);
        
        // Send profit to owner
        uint256 profit = finalAmount - repayAmount;
        if (profit > 0) {
            IERC20(params.tokenBorrow).transfer(owner, profit);
        }
        
        emit ArbExecuted(params.tokenBorrow, params.borrowAmount, finalAmount, profit);
    }
    
    /**
     * @notice Approve a token for a router (for new tokens)
     */
    function approveToken(address token, address router) external onlyOwner {
        IERC20(token).approve(router, type(uint256).max);
    }
    
    /**
     * @notice Withdraw any stuck tokens
     */
    function withdraw(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).transfer(owner, balance);
        }
    }
    
    /**
     * @notice Withdraw native FLR
     */
    function withdrawFLR() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }
    
    receive() external payable {}
}
