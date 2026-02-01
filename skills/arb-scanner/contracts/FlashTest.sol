// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IUniswapV3Pool {
    function flash(address recipient, uint256 amount0, uint256 amount1, bytes calldata data) external;
    function token0() external view returns (address);
    function token1() external view returns (address);
}

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract FlashTest {
    address public owner;
    
    event FlashReceived(address pool, uint256 fee0, uint256 fee1, uint256 balance);
    
    constructor() {
        owner = msg.sender;
    }
    
    function testFlash(address pool, uint256 amount) external {
        require(msg.sender == owner, "not owner");
        
        // Flash borrow token0
        IUniswapV3Pool(pool).flash(address(this), amount, 0, abi.encode(pool, amount));
    }
    
    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external {
        (address pool, uint256 borrowed) = abi.decode(data, (address, uint256));
        
        require(msg.sender == pool, "invalid callback");
        
        address token0 = IUniswapV3Pool(pool).token0();
        uint256 balance = IERC20(token0).balanceOf(address(this));
        
        emit FlashReceived(pool, fee0, fee1, balance);
        
        // Repay flash loan
        uint256 repay = borrowed + fee0;
        IERC20(token0).transfer(pool, repay);
    }
    
    // Send some tokens to contract first for the fee
    function withdraw(address token) external {
        require(msg.sender == owner, "not owner");
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) IERC20(token).transfer(owner, bal);
    }
    
    receive() external payable {}
}
