// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @notice Minimal Aave V3 IPool interface
interface IPool {
    function liquidationCall(
        address collateralAsset,
        address debtAsset,
        address user,
        uint256 debtToCover,
        bool receiveAToken
    ) external;

    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;
}

/// @notice Minimal IFlashLoanSimpleReceiver interface
interface IFlashLoanSimpleReceiver {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);

    function ADDRESSES_PROVIDER() external view returns (address);
    function POOL() external view returns (address);
}

/// @notice Minimal Aave V3 addresses provider
interface IPoolAddressesProvider {
    function getPool() external view returns (address);
}

/// @notice Uniswap V3 SwapRouter interface
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        returns (uint256 amountOut);
}

/**
 * @title FlashLiquidator
 * @notice Atomically flash-loans debt asset, liquidates an Aave V3 position,
 *         swaps received collateral back to debt via Uniswap V3, repays loan,
 *         and sends profit to owner.
 * @dev Supports Ethereum mainnet, Arbitrum, and Base via constructor-configurable addresses.
 */
contract FlashLiquidator is IFlashLoanSimpleReceiver, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Immutables ────────────────────────────────────────────────────────────
    IPoolAddressesProvider public immutable override ADDRESSES_PROVIDER;
    IPool public immutable override POOL;
    ISwapRouter public immutable SWAP_ROUTER;

    // ─── Constants ─────────────────────────────────────────────────────────────
    uint24 public constant DEFAULT_POOL_FEE = 3000; // 0.3 % Uniswap pool fee tier

    // ─── Events ────────────────────────────────────────────────────────────────
    event LiquidationExecuted(
        address indexed borrower,
        address indexed collateralAsset,
        address indexed debtAsset,
        uint256 debtCovered,
        uint256 collateralReceived,
        uint256 profit
    );
    event Withdrawn(address indexed token, uint256 amount, address indexed to);

    // ─── Errors ────────────────────────────────────────────────────────────────
    error OnlyPool();
    error OnlySelf();
    error InsufficientProfit();
    error SwapFailed();

    // ─── Constructor ───────────────────────────────────────────────────────────
    /**
     * @param _addressesProvider  Aave V3 PoolAddressesProvider
     * @param _swapRouter         Uniswap V3 SwapRouter
     */
    constructor(
        address _addressesProvider,
        address _swapRouter
    ) Ownable(msg.sender) {
        ADDRESSES_PROVIDER = IPoolAddressesProvider(_addressesProvider);
        POOL = IPool(ADDRESSES_PROVIDER.getPool());
        SWAP_ROUTER = ISwapRouter(_swapRouter);
    }

    // ─── External: Initiate liquidation ────────────────────────────────────────
    /**
     * @notice Kick off a flash-loan-backed liquidation.
     * @param collateralAsset  Asset to receive as liquidation bonus
     * @param debtAsset        Asset to repay (also the flash-loan asset)
     * @param borrower         The under-collateralised account
     * @param debtToCover      Debt amount to repay (use type(uint256).max for max)
     * @param poolFee          Uniswap V3 fee tier for the swap (e.g. 3000, 500, 10000)
     * @param minProfit        Minimum profit in debtAsset units; reverts if not met
     */
    function executeLiquidation(
        address collateralAsset,
        address debtAsset,
        address borrower,
        uint256 debtToCover,
        uint24 poolFee,
        uint256 minProfit
    ) external onlyOwner nonReentrant {
        bytes memory params = abi.encode(
            collateralAsset,
            borrower,
            poolFee,
            minProfit
        );

        // Request flash loan — callback will handle everything
        POOL.flashLoanSimple(
            address(this),
            debtAsset,
            debtToCover,
            params,
            0 // referral code
        );
    }

    // ─── IFlashLoanSimpleReceiver callback ─────────────────────────────────────
    /**
     * @notice Called by Aave Pool after funds are transferred.
     *         1. Liquidate borrower → receive collateral
     *         2. Swap collateral → debt asset via Uniswap V3
     *         3. Approve repayment (amount + premium)
     *         4. Transfer surplus profit to owner
     */
    function executeOperation(
        address asset,          // debt asset (flash-loaned)
        uint256 amount,         // flash-loan amount
        uint256 premium,        // 0.05 % fee
        address initiator,      // must be this contract
        bytes calldata params
    ) external override returns (bool) {
        if (msg.sender != address(POOL)) revert OnlyPool();
        if (initiator != address(this)) revert OnlySelf();

        (
            address collateralAsset,
            address borrower,
            uint24 poolFee,
            uint256 minProfit
        ) = abi.decode(params, (address, address, uint24, uint256));

        // ── Step 1: Approve debt repayment to Pool and liquidate ──────────────
        IERC20(asset).safeApprove(address(POOL), amount);

        uint256 collateralBefore = IERC20(collateralAsset).balanceOf(address(this));

        IPool(address(POOL)).liquidationCall(
            collateralAsset,
            asset,          // debtAsset
            borrower,
            amount,
            false           // receive underlying, not aToken
        );

        uint256 collateralReceived =
            IERC20(collateralAsset).balanceOf(address(this)) - collateralBefore;

        // ── Step 2: Swap collateral → debt asset ──────────────────────────────
        uint256 repaymentNeeded = amount + premium;

        IERC20(collateralAsset).safeApprove(address(SWAP_ROUTER), collateralReceived);

        uint256 amountOut = SWAP_ROUTER.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn:           collateralAsset,
                tokenOut:          asset,
                fee:               poolFee == 0 ? DEFAULT_POOL_FEE : poolFee,
                recipient:         address(this),
                deadline:          block.timestamp + 300, // 5 min
                amountIn:          collateralReceived,
                amountOutMinimum:  repaymentNeeded,       // slippage: must cover repayment
                sqrtPriceLimitX96: 0
            })
        );

        if (amountOut < repaymentNeeded) revert SwapFailed();

        uint256 profit = amountOut - repaymentNeeded;
        if (profit < minProfit) revert InsufficientProfit();

        // ── Step 3: Approve Aave to pull repayment ────────────────────────────
        IERC20(asset).safeApprove(address(POOL), repaymentNeeded);

        // ── Step 4: Send profit to owner ──────────────────────────────────────
        if (profit > 0) {
            IERC20(asset).safeTransfer(owner(), profit);
        }

        emit LiquidationExecuted(
            borrower,
            collateralAsset,
            asset,
            amount,
            collateralReceived,
            profit
        );

        return true;
    }

    // ─── Admin ─────────────────────────────────────────────────────────────────
    /**
     * @notice Rescue any ERC-20 tokens accidentally sent to this contract.
     * @param token  Token address (use address(0) for ETH)
     * @param amount Amount to withdraw (0 = full balance)
     */
    function withdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            uint256 bal = address(this).balance;
            uint256 toSend = amount == 0 ? bal : amount;
            payable(owner()).transfer(toSend);
            emit Withdrawn(address(0), toSend, owner());
        } else {
            uint256 bal = IERC20(token).balanceOf(address(this));
            uint256 toSend = amount == 0 ? bal : amount;
            IERC20(token).safeTransfer(owner(), toSend);
            emit Withdrawn(token, toSend, owner());
        }
    }

    /// @dev Accept ETH (e.g., from WETH unwraps)
    receive() external payable {}
}
