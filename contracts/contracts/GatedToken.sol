// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EligibilityResolver} from "./EligibilityResolver.sol";

/// @title GatedToken
/// @notice ERC20 ("Gated USDC", gUSDC, 6 decimals) whose transfers are gated by an
///         EligibilityResolver. Enforcement lives in the state-changing `_update`
///         hook (D10/H2); the detection probes are pure views that never revert.
contract GatedToken is ERC20, Ownable {
    EligibilityResolver public resolver;

    error TransferRestricted(uint8 code, string message);

    constructor(
        address resolver_,
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        resolver = EligibilityResolver(resolver_);
    }

    /// @notice gUSDC mirrors USDC's 6 decimals.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Demo funding — owner mints to `to`.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @dev Enforcement hook. Mint (from==0) and burn (to==0) are exempt.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint8 code = resolver.restrictionCode(from, address(this), value);
            if (code != 0) {
                revert TransferRestricted(code, resolver.messageForRestriction(code));
            }
        }
        super._update(from, to, value);
    }

    /// @notice Pure VIEW probe — would this transfer be allowed? Never reverts.
    function canTransfer(address from, address to, uint256 amount) external view returns (bool) {
        to;
        return resolver.restrictionCode(from, address(this), amount) == 0;
    }

    /// @notice Pure VIEW probe — the restriction code for this transfer. Never reverts.
    function detectTransferRestriction(
        address from,
        address to,
        uint256 amount
    ) external view returns (uint8) {
        to;
        return resolver.restrictionCode(from, address(this), amount);
    }

    /// @notice Human-readable message for a restriction code.
    function messageForTransferRestriction(uint8 code) external view returns (string memory) {
        return resolver.messageForRestriction(code);
    }
}
