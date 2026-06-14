/**
 * buildAttestation: assemble a complete, signable Attestation struct for an
 * agent. Pure assembly plus two live reads it cannot fake:
 *   - proofRef from the agent's World Chain identity (resolveProofRef)
 *   - nonce from the mirror on Arc (getNextNonce = lastNonce + 1)
 * kycRef is bytes32(0) for now. The result is exported so Vlad's pipeline calls
 * this rather than reimplementing struct assembly; there is one build path.
 *
 * Amount fields are base units (6-decimal USDC). Callers convert at the edge with
 * parseUSDC, never raw parseUnits: parseUnits("1", 18) here would encode a
 * trillion-unit cap. uint ranges are checked so an out-of-range cap fails here
 * with a clear message instead of as an opaque ABI encode error at sign time.
 */
import { zeroHash, type Address, type Hex } from "viem";
import type { Attestation } from "@var/shared";
import { resolveProofRef } from "./proofRef.js";
import { getNextNonce, type ArcPublicClient } from "./mirrorClient.js";

const U96_MAX = (1n << 96n) - 1n;
const U64_MAX = (1n << 64n) - 1n;

export interface BuildAttestationInput {
  agent: Address;
  principal: Address;
  spendCapPerTx: bigint; // base units (6-decimal USDC)
  spendCapPerPeriod: bigint; // base units
  periodLength: bigint; // seconds
  allowedToken: Address;
  expiry: bigint; // unix seconds
}

export interface BuildAttestationDeps {
  arcClient: ArcPublicClient;
  worldchainRpcUrl?: string;
  mirror?: Address; // defaults to the deployed mirror from addresses.json
  // Use this exact nonce instead of reading getNextNonce live. Only for when the
  // mirror is not yet the live EIP-712 deployment (lastNonce would revert) so a
  // signed sample can still be produced for coordination. Never use for a real
  // submit; the live read is the source of truth there.
  nonceOverride?: bigint;
}

export interface BuiltAttestation {
  attestation: Attestation;
  humanId: bigint; // provenance: the World ID nullifier proofRef was derived from
  proofRef: Hex;
  nonce: bigint;
}

function assertRange(name: string, value: bigint, max: bigint): void {
  if (value < 0n || value > max) {
    throw new Error(`${name} out of range: ${value.toString()} (must be 0..${max.toString()}).`);
  }
}

function validateInput(input: BuildAttestationInput): void {
  if (BigInt(input.agent) === 0n) throw new Error("agent must not be the zero address.");
  if (BigInt(input.principal) === 0n) throw new Error("principal must not be the zero address.");
  assertRange("spendCapPerTx", input.spendCapPerTx, U96_MAX);
  assertRange("spendCapPerPeriod", input.spendCapPerPeriod, U96_MAX);
  assertRange("periodLength", input.periodLength, U64_MAX);
  assertRange("expiry", input.expiry, U64_MAX);
}

export async function buildAttestation(
  input: BuildAttestationInput,
  deps: BuildAttestationDeps,
): Promise<BuiltAttestation> {
  validateInput(input);

  // proofRef from World Chain identity. Throws if the agent is not human-backed.
  const { proofRef, humanId } = await resolveProofRef(input.agent, deps.worldchainRpcUrl);

  // Live nonce from the mirror by default. Read again right before submit to
  // dodge a stale retry; this value is the build-time view. An override is used
  // only when the live mirror is not yet deployed (see BuildAttestationDeps).
  const nonce =
    deps.nonceOverride ?? (await getNextNonce(deps.arcClient, input.agent, deps.mirror));

  const attestation: Attestation = {
    agent: input.agent,
    principal: input.principal,
    proofRef,
    // TODO(kyc): wire a real KYC reference. bytes32(0) means "no KYC attached".
    kycRef: zeroHash,
    spendCapPerTx: input.spendCapPerTx,
    spendCapPerPeriod: input.spendCapPerPeriod,
    periodLength: input.periodLength,
    allowedToken: input.allowedToken,
    expiry: input.expiry,
    nonce,
  };

  return { attestation, humanId, proofRef, nonce };
}
