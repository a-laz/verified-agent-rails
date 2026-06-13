/**
 * HARD GATE. Before any attestation is signed for an onchain submit, prove the
 * EIP-712 encoding matches the contract exactly. One wrong field, type, or order
 * and the typehash or hashStruct diverges; every signature then recovers the
 * wrong signer and submitAttestation reverts InvalidAttestor. So this runs first
 * and the submit path refuses to proceed unless it passes.
 *
 * The sample inputs mirror Eip712Coordination.t.sol exactly. The expected
 * outputs are the values that test locks (full values in the constants below):
 *   typehash   0xe263...aacc0
 *   hashStruct 0xa812...91fe3
 * Both are domain-independent, so they are the primary cross-implementation diff
 * target shared with Vlad's pipeline signer and the Solidity fixture.
 */
import { hashStruct, keccak256, toBytes, type Hex } from "viem";
import {
  ATTESTATION_PRIMARY_TYPE,
  ATTESTATION_TYPEHASH,
  ATTESTATION_TYPES,
  type Attestation,
} from "@var/shared";

// Locked expected vectors from contracts/test/Eip712Coordination.t.sol.
export const EXPECTED_TYPEHASH: Hex =
  "0xe263cdf7d5db3872de733a287600951f9b260f011b1afcc9c4f82109405aacc0"; // pragma: allowlist secret
export const EXPECTED_SAMPLE_HASH_STRUCT: Hex =
  "0xa8128805165c1b7777580af05d416d590329e2a9fa86fa046efd0e7f87791fe3"; // pragma: allowlist secret

// Fixed sample, byte-identical to the Solidity fixture. Addresses are the
// zero-padded forms of address(0xA11CE), address(0xB0B), address(0xC0FFEE). The
// refs are keccak256 of the literal UTF-8 strings, which is what Solidity's
// keccak256("sample-proof") computes (the bytes, with no length prefix).
export const SAMPLE_ATTESTATION: Attestation = {
  agent: "0x00000000000000000000000000000000000a11ce",
  principal: "0x0000000000000000000000000000000000000b0b",
  proofRef: keccak256(toBytes("sample-proof")),
  kycRef: keccak256(toBytes("sample-kyc")),
  spendCapPerTx: 100_000_000n, // 100 gUSD at 6 decimals
  spendCapPerPeriod: 1_000_000_000n, // 1000 gUSD
  periodLength: 86_400n, // 1 day
  allowedToken: "0x0000000000000000000000000000000000c0ffee",
  expiry: 1_893_456_000n, // 2030-01-01
  nonce: 1n,
};

export interface HashGateResult {
  ok: boolean;
  typehash: { computed: Hex; expected: Hex; match: boolean };
  hashStruct: { computed: Hex; expected: Hex; match: boolean };
}

/**
 * Compute the hashStruct of any attestation with the shared schema. This is the
 * exact value the contract's hashStruct(a) returns; it is domain-independent.
 */
export function attestationHashStruct(attestation: Attestation): Hex {
  return hashStruct({
    primaryType: ATTESTATION_PRIMARY_TYPE,
    types: ATTESTATION_TYPES,
    data: attestation,
  });
}

/**
 * Run the gate. Returns the computed and expected values plus an overall ok.
 * Does not throw; callers decide whether to stop (the submit path does).
 */
export function runHashGate(): HashGateResult {
  const typehashComputed = ATTESTATION_TYPEHASH;
  const hashStructComputed = attestationHashStruct(SAMPLE_ATTESTATION);
  const typehashMatch = typehashComputed.toLowerCase() === EXPECTED_TYPEHASH.toLowerCase();
  const hashStructMatch =
    hashStructComputed.toLowerCase() === EXPECTED_SAMPLE_HASH_STRUCT.toLowerCase();
  return {
    ok: typehashMatch && hashStructMatch,
    typehash: { computed: typehashComputed, expected: EXPECTED_TYPEHASH, match: typehashMatch },
    hashStruct: {
      computed: hashStructComputed,
      expected: EXPECTED_SAMPLE_HASH_STRUCT,
      match: hashStructMatch,
    },
  };
}

/** Print the gate result. Returns ok so a caller can branch on it. */
export function printHashGate(result: HashGateResult): boolean {
  console.log("EIP-712 hash gate");
  console.log("  typehash computed:", result.typehash.computed);
  console.log("  typehash expected:", result.typehash.expected);
  console.log("  typehash match:   ", result.typehash.match);
  console.log("  hashStruct computed:", result.hashStruct.computed);
  console.log("  hashStruct expected:", result.hashStruct.expected);
  console.log("  hashStruct match:   ", result.hashStruct.match);
  if (result.ok) {
    console.log("  RESULT: PASS. Encoding matches the contract; safe to sign.");
  } else {
    console.log(
      "  RESULT: FAIL. The EIP-712 encoding does not match the contract. " +
        "A field, type, or order is wrong. STOP; no signing or submit until this passes.",
    );
  }
  return result.ok;
}
