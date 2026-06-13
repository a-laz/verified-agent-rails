// Typed view of shared/addresses.json so TS consumers get a checked shape
// instead of re-reading the file or hardcoding addresses. The JSON is the single
// source of truth written at deploy; this module only narrows its type.
import addresses from "../addresses.json" with { type: "json" };
import type { Address } from "viem";

export interface ContractAddress {
  address: Address;
  deployBlock: number;
}

export interface DeployedAddresses {
  DelegationMirror: ContractAddress;
  GatedUSD: ContractAddress;
  MockYieldVault: ContractAddress;
  ServiceSink: ContractAddress;
  chainId: number;
}

export const ADDRESSES = addresses as DeployedAddresses;

// Convenience accessors for the two values the attestation builder needs most.
// Enforcement (the mirror) lives on Arc; this chainId is Arc's, and is also the
// EIP-712 domain chainId every attestation is signed against.
export const DELEGATION_MIRROR_ADDRESS: Address = ADDRESSES.DelegationMirror.address;
export const ARC_CHAIN_ID: number = ADDRESSES.chainId;
