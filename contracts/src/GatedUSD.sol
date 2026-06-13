// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {DelegationMirror} from "./DelegationMirror.sol";

/// @title GatedUSD
/// @notice Demo stablecoin with 6 decimals, mirroring USDC on Arc. Transfers from
///         addresses holding a mandate in the DelegationMirror are gated by the
///         mirror's checkTransfer. Humans and contracts without a mandate transfer
///         freely. Exposes the ERC-7943 canTransfer surface (Final).
contract GatedUSD is ERC20 {
    DelegationMirror public immutable mirror;

    error TransferBlocked(bytes32 reason);

    constructor(address mirror_) ERC20("Gated USD", "gUSD") {
        mirror = DelegationMirror(mirror_);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @dev Gate only registered agent addresses: a sender with no mandate in the
    ///      mirror (principal == 0) is not an agent and moves funds freely.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && mirror.isRegistered(from)) {
            (bool ok, bytes32 reason) = mirror.checkTransfer(from, address(this), value);
            if (!ok) revert TransferBlocked(reason);
        }
        super._update(from, to, value);
    }

    /// @notice ERC-7943 compliance surface. Thin wrapper over the mirror's checkTransfer.
    function canTransfer(address from, address to, uint256 amount) external view returns (bool) {
        to; // unused, kept for the ERC-7943 signature
        if (from == address(0)) return true;
        if (!mirror.isRegistered(from)) return true;
        (bool ok,) = mirror.checkTransfer(from, address(this), amount);
        return ok;
    }

    /// @notice Unrestricted mint, hackathon demo token only.
    function faucetMint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}
