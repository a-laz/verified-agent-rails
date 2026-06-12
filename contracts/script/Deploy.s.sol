// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DelegationMirror} from "../src/DelegationMirror.sol";
import {GatedUSD} from "../src/GatedUSD.sol";
import {MockYieldVault} from "../src/MockYieldVault.sol";
import {ServiceSink} from "../src/ServiceSink.sol";

/// Deploys mirror, token, vault, sink in order, wires addresses, and writes
/// ../shared/addresses.json. Run:
///   forge script script/Deploy.s.sol --rpc-url $ARC_TESTNET_RPC_URL --broadcast
/// The deployer key is read from DEPLOYER_PRIVATE_KEY and never logged.
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        DelegationMirror mirror = new DelegationMirror();
        uint256 mirrorBlock = block.number;
        GatedUSD token = new GatedUSD(address(mirror));
        uint256 tokenBlock = block.number;
        MockYieldVault vault = new MockYieldVault(token);
        uint256 vaultBlock = block.number;
        ServiceSink sink = new ServiceSink(IERC20(address(token)));
        uint256 sinkBlock = block.number;
        vm.stopBroadcast();

        string memory json = "deployment";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeString(json, "DelegationMirror", _entry(address(mirror), mirrorBlock));
        vm.serializeString(json, "GatedUSD", _entry(address(token), tokenBlock));
        vm.serializeString(json, "MockYieldVault", _entry(address(vault), vaultBlock));
        string memory out = vm.serializeString(json, "ServiceSink", _entry(address(sink), sinkBlock));
        vm.writeJson(out, "../shared/addresses.json");
    }

    /// Builds {"address": "0x...", "deployBlock": n}; vm.serializeString embeds
    /// valid JSON strings as nested objects.
    function _entry(address addr, uint256 deployBlock) internal returns (string memory) {
        string memory obj = string.concat("entry_", vm.toString(addr));
        vm.serializeAddress(obj, "address", addr);
        return vm.serializeUint(obj, "deployBlock", deployBlock);
    }
}
