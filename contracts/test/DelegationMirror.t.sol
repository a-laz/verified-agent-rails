// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {DelegationMirror} from "../src/DelegationMirror.sol";

contract DelegationMirrorTest is Test {
    DelegationMirror internal mirror;

    address internal principal = makeAddr("principal");
    address internal agent = makeAddr("agent");
    address internal token = makeAddr("token");
    address internal otherToken = makeAddr("otherToken");

    bytes32 internal constant NULLIFIER = keccak256("worldid-nullifier");
    uint96 internal constant CAP = 100e6;
    uint64 internal expiry;

    function setUp() public {
        mirror = new DelegationMirror();
        expiry = uint64(block.timestamp + 1 days);
    }

    function _delegate() internal {
        vm.prank(principal);
        mirror.delegate(agent, NULLIFIER, CAP, expiry, token);
    }

    function test_delegate_storesMandateAndEmits() public {
        vm.expectEmit(true, true, false, true);
        emit DelegationMirror.Delegated(agent, principal, NULLIFIER, CAP, expiry, token);
        _delegate();

        DelegationMirror.Mandate memory m = mirror.getMandate(agent);
        assertEq(m.principal, principal);
        assertEq(m.worldIdNullifier, NULLIFIER);
        assertEq(m.spendCapPerTx, CAP);
        assertEq(m.expiry, expiry);
        assertFalse(m.revoked);
        assertEq(m.allowedToken, token);
    }

    function test_delegate_revertsWhileMandateActive() public {
        _delegate();
        vm.prank(makeAddr("someoneElse"));
        vm.expectRevert(abi.encodeWithSelector(DelegationMirror.MandateActive.selector, agent));
        mirror.delegate(agent, NULLIFIER, CAP, expiry, token);
    }

    function test_delegate_allowedAfterRevoke() public {
        _delegate();
        vm.prank(principal);
        mirror.revoke(agent);
        vm.prank(principal);
        mirror.delegate(agent, NULLIFIER, CAP, expiry, token);
        assertFalse(mirror.getMandate(agent).revoked);
    }

    function test_delegate_allowedAfterExpiry() public {
        _delegate();
        vm.warp(uint256(expiry));
        vm.prank(principal);
        mirror.delegate(agent, NULLIFIER, CAP, uint64(block.timestamp + 1 days), token);
        (bool ok,) = mirror.checkTransfer(agent, token, 1);
        assertTrue(ok);
    }

    function test_revoke_onlyPrincipal() public {
        _delegate();
        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(DelegationMirror.NotPrincipal.selector, agent, attacker));
        mirror.revoke(agent);
    }

    function test_revoke_unknownAgentReverts() public {
        vm.prank(principal);
        vm.expectRevert(abi.encodeWithSelector(DelegationMirror.NoMandateFor.selector, agent));
        mirror.revoke(agent);
    }

    function test_revoke_setsFlagAndEmits() public {
        _delegate();
        vm.expectEmit(true, true, false, false);
        emit DelegationMirror.Revoked(agent, principal);
        vm.prank(principal);
        mirror.revoke(agent);
        assertTrue(mirror.getMandate(agent).revoked);
    }

    function test_checkTransfer_ok() public {
        _delegate();
        (bool ok, bytes32 reason) = mirror.checkTransfer(agent, token, CAP);
        assertTrue(ok);
        assertEq(reason, mirror.OK());
    }

    function test_checkTransfer_noMandate() public view {
        (bool ok, bytes32 reason) = mirror.checkTransfer(agent, token, 1);
        assertFalse(ok);
        assertEq(reason, mirror.NO_MANDATE());
    }

    function test_checkTransfer_revoked() public {
        _delegate();
        vm.prank(principal);
        mirror.revoke(agent);
        (bool ok, bytes32 reason) = mirror.checkTransfer(agent, token, 1);
        assertFalse(ok);
        assertEq(reason, mirror.REVOKED());
    }

    function test_checkTransfer_expired() public {
        _delegate();
        vm.warp(uint256(expiry));
        (bool ok, bytes32 reason) = mirror.checkTransfer(agent, token, 1);
        assertFalse(ok);
        assertEq(reason, mirror.EXPIRED());
    }

    function test_checkTransfer_overCap() public {
        _delegate();
        (bool ok, bytes32 reason) = mirror.checkTransfer(agent, token, uint256(CAP) + 1);
        assertFalse(ok);
        assertEq(reason, mirror.OVER_CAP());
    }

    function test_checkTransfer_tokenNotAllowed() public {
        _delegate();
        (bool ok, bytes32 reason) = mirror.checkTransfer(agent, otherToken, 1);
        assertFalse(ok);
        assertEq(reason, mirror.TOKEN_NOT_ALLOWED());
    }

    /// OVER_CAP is evaluated before TOKEN_NOT_ALLOWED per the declared order.
    function test_checkTransfer_orderOverCapBeforeToken() public {
        _delegate();
        (, bytes32 reason) = mirror.checkTransfer(agent, otherToken, uint256(CAP) + 1);
        assertEq(reason, mirror.OVER_CAP());
    }

    function test_updateFromAttestation_onlyOwner() public {
        vm.prank(makeAddr("rando"));
        vm.expectRevert();
        mirror.updateFromAttestation("");
        // owner (this test contract) passes the no-op stub
        mirror.updateFromAttestation("");
    }
}
