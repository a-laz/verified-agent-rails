// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AgentBook} from "./AgentBook.sol";

/// @title EligibilityResolver
/// @notice VAR's self-defined eligibility resolver. NOT "ERC-8226" (which does not
///         exist publicly) — this is VAR's own composition over an AgentBook anchor.
/// @dev The hot-path `restrictionCode` is a pure VIEW that never reverts. Enforcement
///      happens in the token's `_update` hook, which reads this resolver.
contract EligibilityResolver is Ownable {
    struct Mandate {
        address human;
        address agent;
        uint256 spendCap; // per-transaction cap (D-decision: per-tx only)
        address asset;
        uint64 expiry;
        bool revoked;
        bool exists;
    }

    /// @notice keyed by AGENT address (D9)
    mapping(address => Mandate) public mandates;

    AgentBook public agentBook;

    event MandateGranted(
        address indexed agent,
        address indexed human,
        uint256 spendCap,
        address asset,
        uint64 expiry
    );
    event MandateRevoked(address indexed agent);

    constructor(address agentBook_) Ownable(msg.sender) {
        agentBook = AgentBook(agentBook_);
    }

    /// @notice Grant (or replace) the mandate for `agent`.
    function grantMandate(
        address agent,
        address human,
        uint256 spendCap,
        address asset,
        uint64 expiry
    ) external onlyOwner {
        mandates[agent] = Mandate({
            human: human,
            agent: agent,
            spendCap: spendCap,
            asset: asset,
            expiry: expiry,
            revoked: false,
            exists: true
        });
        emit MandateGranted(agent, human, spendCap, asset, expiry);
    }

    /// @notice Revoke the mandate for `agent` (the kill shot).
    function revokeMandate(address agent) external onlyOwner {
        mandates[agent].revoked = true;
        emit MandateRevoked(agent);
    }

    /// @notice Extend the mandate expiry for `agent`.
    function extendMandate(address agent, uint64 newExpiry) external onlyOwner {
        mandates[agent].expiry = newExpiry;
    }

    /// @notice THE HOT-PATH VIEW — per-transaction cap, pure view, never reverts.
    /// @return code 0=OK,1=NO_PASSPORT,2=MANDATE_REVOKED,3=MANDATE_EXPIRED,
    ///         4=OVER_SPEND_CAP,5=ASSET_NOT_WHITELISTED,6=NOT_VERIFIED_HUMAN
    function restrictionCode(
        address agent,
        address asset,
        uint256 amount
    ) public view returns (uint8) {
        Mandate storage m = mandates[agent];
        if (!m.exists || m.human == address(0)) {
            return 1;
        }
        if (m.revoked) {
            return 2;
        }
        if (block.timestamp >= m.expiry) {
            return 3;
        }
        if (amount > m.spendCap) {
            return 4;
        }
        if (asset != m.asset) {
            return 5;
        }
        address anchored = agentBook.resolveHuman(agent);
        if (anchored == address(0) || anchored != m.human) {
            return 6;
        }
        return 0;
    }

    /// @notice Human-readable message for a restriction code.
    function messageForRestriction(uint8 code) public pure returns (string memory) {
        if (code == 0) return "Transfer allowed";
        if (code == 1) return "Sender carries no Agent Passport";
        if (code == 2) return "Mandate revoked by principal";
        if (code == 3) return "Mandate expired";
        if (code == 4) return "Amount exceeds per-transaction spend cap";
        if (code == 5) return "Asset not permitted by mandate";
        if (code == 6) return "Agent not anchored to a verified human";
        return "Unknown restriction";
    }

    /// @notice ERC-8226-SHAPED wrapper documenting the composition.
    /// @dev agentId == uint160(agent). Returns true when the mandate clears for `amount`
    ///      against the mandate's own whitelisted asset.
    function isActiveForAmount(
        uint256 agentId,
        address principal,
        uint256 amount
    ) external view returns (bool) {
        principal; // documented seam: principal is implied by the mandate's human field
        address agent = address(uint160(agentId));
        return restrictionCode(agent, mandates[agent].asset, amount) == 0;
    }
}
