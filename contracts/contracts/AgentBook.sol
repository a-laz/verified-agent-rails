// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AgentBook
/// @notice Local mirror anchoring an autonomous agent wallet to a verified human.
/// @dev In production the anchor is established off a World ID Orb proof; here the
///      owner seeds it directly with a deterministic nullifier (replay-guarded).
contract AgentBook is Ownable {
    /// @notice agent wallet => verified human (principal)
    mapping(address => address) private _human;

    /// @notice nullifierHash => agent that claimed it (replay guard)
    mapping(uint256 => address) private _nullifierOwner;

    event Seeded(address indexed agent, address indexed human, uint256 nullifierHash);

    constructor() Ownable(msg.sender) {}

    /// @notice Anchor `agent` to `human`. If `nullifierHash != 0`, it must be unused
    ///         or already owned by `agent` (idempotent re-seed of the same agent is ok).
    function seed(address agent, address human, uint256 nullifierHash) external onlyOwner {
        if (nullifierHash != 0) {
            address owner_ = _nullifierOwner[nullifierHash];
            require(owner_ == address(0) || owner_ == agent, "AgentBook: nullifier already used");
            _nullifierOwner[nullifierHash] = agent;
        }
        _human[agent] = human;
        emit Seeded(agent, human, nullifierHash);
    }

    /// @notice Remove the anchor for `agent`.
    function clearAnchor(address agent) external onlyOwner {
        _human[agent] = address(0);
    }

    /// @notice The verified human anchored to `agent`, or address(0) if none.
    function resolveHuman(address agent) external view returns (address) {
        return _human[agent];
    }
}
