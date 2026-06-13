// Shared EIP-712 schema for DelegationMirror attestations: the single source of
// truth CJ's TS builder, Vlad's pipeline signer, and DelegationMirror.sol must
// all reproduce byte for byte. The type string, typehash, and field order here
// are consensus-locked; reordering or retyping any field changes the digest,
// every signature then fails ECDSA.recover, and submitAttestation reverts
// InvalidAttestor. Do not edit one side of this without the others.
//
// TODO(workstream-A): DelegationMirror.sol still carries a local copy of this
// type string (its own TODO points here). Once this module is the agreed source,
// regenerate any duplicated copies from it so Solidity and TS cannot drift.
import { keccak256, toBytes, type Address, type Hex, type TypedDataDomain } from "viem";

// The canonical EIP-712 type string. keccak256 of its UTF-8 bytes is the
// typehash the contract stores as ATTESTATION_TYPEHASH. Field order is locked.
export const ATTESTATION_TYPE_STRING =
  "Attestation(address agent,address principal,bytes32 proofRef,bytes32 kycRef,uint96 spendCapPerTx,uint96 spendCapPerPeriod,uint64 periodLength,address allowedToken,uint64 expiry,uint256 nonce)";

// Derived, not hardcoded, so this module cannot silently disagree with its own
// type string. Asserted against the contract's locked value by the hash gate.
export const ATTESTATION_TYPEHASH: Hex = keccak256(toBytes(ATTESTATION_TYPE_STRING));

// viem typed-data definition. The member order MUST match ATTESTATION_TYPE_STRING
// and the Solidity struct exactly. Used for signTypedData / hashTypedData.
export const ATTESTATION_TYPES = {
  Attestation: [
    { name: "agent", type: "address" },
    { name: "principal", type: "address" },
    { name: "proofRef", type: "bytes32" },
    { name: "kycRef", type: "bytes32" },
    { name: "spendCapPerTx", type: "uint96" },
    { name: "spendCapPerPeriod", type: "uint96" },
    { name: "periodLength", type: "uint64" },
    { name: "allowedToken", type: "address" },
    { name: "expiry", type: "uint64" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export const ATTESTATION_PRIMARY_TYPE = "Attestation" as const;

// EIP-712 domain. name and version are fixed in the contract's constructor
// (EIP712("DelegationMirror", "1")); chainId and verifyingContract are supplied
// per deployment. hashStruct and the typehash are domain-independent; only the
// final digest depends on the domain, which is why the builder injects it last.
export const DELEGATION_MIRROR_DOMAIN_NAME = "DelegationMirror" as const;
export const DELEGATION_MIRROR_DOMAIN_VERSION = "1" as const;

export function buildDelegationMirrorDomain(
  verifyingContract: Address,
  chainId: number,
): TypedDataDomain {
  return {
    name: DELEGATION_MIRROR_DOMAIN_NAME,
    version: DELEGATION_MIRROR_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  };
}

// The attestation message. Field order mirrors the type string for readability;
// for hashing, viem keys by name from ATTESTATION_TYPES so order here is cosmetic.
// uint amounts are bigint; bytes32 refs and addresses are hex strings.
export interface Attestation {
  agent: Address;
  principal: Address;
  proofRef: Hex;
  kycRef: Hex;
  spendCapPerTx: bigint;
  spendCapPerPeriod: bigint;
  periodLength: bigint;
  allowedToken: Address;
  expiry: bigint;
  nonce: bigint;
}
