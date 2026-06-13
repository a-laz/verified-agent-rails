// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title YieldVault
/// @notice 1:1 stub vault (ERC-4626-ish). Shares equal deposited assets. The "park
///         yield" seam: the agent parks gUSDC here. Because `deposit` pulls via
///         `transferFrom`, the move is gated by the agent's mandate on the GatedToken.
contract YieldVault {
    /// @notice The GatedToken this vault accepts.
    IERC20 public immutable asset;

    /// @notice shares == deposited assets (1:1)
    mapping(address => uint256) public balanceOf;

    /// @notice total assets held by the vault
    uint256 public totalAssets;

    event Deposit(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event Withdraw(
        address indexed caller,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    constructor(address asset_) {
        asset = IERC20(asset_);
    }

    /// @notice Pull `assets` of gUSDC from the caller and credit 1:1 shares to `receiver`.
    /// @dev The `transferFrom` triggers the GatedToken gate on the caller (the agent).
    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        require(asset.transferFrom(msg.sender, address(this), assets), "YieldVault: pull failed");
        shares = assets; // 1:1 stub
        balanceOf[receiver] += shares;
        totalAssets += assets;
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /// @notice Burn `assets` of `owner_`'s shares and send `assets` of gUSDC to `receiver`.
    function withdraw(
        uint256 assets,
        address receiver,
        address owner_
    ) external returns (uint256 shares) {
        shares = assets; // 1:1 stub
        require(balanceOf[owner_] >= shares, "YieldVault: insufficient shares");
        balanceOf[owner_] -= shares;
        totalAssets -= assets;
        require(asset.transfer(receiver, assets), "YieldVault: payout failed");
        emit Withdraw(msg.sender, receiver, owner_, assets, shares);
    }
}
