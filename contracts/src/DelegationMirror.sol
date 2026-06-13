// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title DelegationMirror
/// @notice Onchain registry of scoped authority delegated by a World ID verified
///         principal to an AI agent. Vocabulary aligned with ERC-8226 (RAMS, Draft):
///         mandate, principal, scoped authority. Acts as the transfer gate consulted
///         by GatedUSD. Mirror of the offchain attestation flow; Saturday's relayer
///         lands attestations through updateFromAttestation.
contract DelegationMirror is Ownable {
    struct Mandate {
        address principal;
        bytes32 worldIdNullifier;
        uint96 spendCapPerTx;
        uint64 expiry;
        bool revoked;
        address allowedToken;
    }

    /// Machine readable reason codes, evaluated in this order.
    bytes32 public constant OK = "OK";
    bytes32 public constant NO_MANDATE = "NO_MANDATE";
    bytes32 public constant REVOKED = "REVOKED";
    bytes32 public constant EXPIRED = "EXPIRED";
    bytes32 public constant OVER_CAP = "OVER_CAP";
    bytes32 public constant TOKEN_NOT_ALLOWED = "TOKEN_NOT_ALLOWED";

    mapping(address agent => Mandate) public mandates;

    event Delegated(
        address indexed agent, address indexed principal, bytes32 nullifier, uint96 cap, uint64 expiry, address token
    );
    event Revoked(address indexed agent, address indexed principal);

    error ZeroAgent();
    error MandateActive(address agent);
    error NoMandateFor(address agent);
    error NotPrincipal(address agent, address caller);

    constructor() Ownable(msg.sender) {}

    /// @notice Caller becomes the principal of a new mandate for `agent`.
    ///         Reverts if an active (non-revoked, non-expired) mandate already exists.
    function delegate(address agent, bytes32 nullifier, uint96 cap, uint64 expiry, address token) external {
        if (agent == address(0)) revert ZeroAgent();
        Mandate storage existing = mandates[agent];
        if (existing.principal != address(0) && !existing.revoked && block.timestamp < existing.expiry) {
            revert MandateActive(agent);
        }
        mandates[agent] = Mandate({
            principal: msg.sender,
            worldIdNullifier: nullifier,
            spendCapPerTx: cap,
            expiry: expiry,
            revoked: false,
            allowedToken: token
        });
        emit Delegated(agent, msg.sender, nullifier, cap, expiry, token);
    }

    /// @notice Kill switch. Only the principal of the mandate. Local and instant.
    function revoke(address agent) external {
        Mandate storage m = mandates[agent];
        if (m.principal == address(0)) revert NoMandateFor(agent);
        if (msg.sender != m.principal) revert NotPrincipal(agent, msg.sender);
        m.revoked = true;
        emit Revoked(agent, msg.sender);
    }

    function getMandate(address agent) external view returns (Mandate memory) {
        return mandates[agent];
    }

    /// @notice True once an agent has a mandate on record. GatedUSD uses this to
    ///         decide whether to gate a sender, so the token never destructures
    ///         the Mandate tuple and stays decoupled from its field layout. A
    ///         revoked mandate still reads as registered; checkTransfer returns
    ///         REVOKED for it.
    function isRegistered(address agent) external view returns (bool) {
        return mandates[agent].principal != address(0);
    }

    /// @notice Evaluates whether `from` may move `amount` of `token` under its mandate.
    ///         Reason codes are evaluated in declaration order.
    function checkTransfer(address from, address token, uint256 amount)
        external
        view
        returns (bool ok, bytes32 reason)
    {
        Mandate storage m = mandates[from];
        if (m.principal == address(0)) return (false, NO_MANDATE);
        if (m.revoked) return (false, REVOKED);
        if (block.timestamp >= m.expiry) return (false, EXPIRED);
        if (amount > m.spendCapPerTx) return (false, OVER_CAP);
        if (token != m.allowedToken) return (false, TOKEN_NOT_ALLOWED);
        return (true, OK);
    }

    /// @notice Entry point for the Saturday backend relayer path: a World ID
    ///         attestation lands here and updates the mirrored mandate state.
    // TODO(saturday): verify relayer payload and apply mandate updates.
    function updateFromAttestation(bytes calldata) external onlyOwner {}
}
