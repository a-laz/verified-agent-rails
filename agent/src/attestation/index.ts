// Public surface of the attestation builder. Vlad's pipeline imports from here
// so signing and struct assembly have exactly one implementation, not two.
export { runHashGate, printHashGate, attestationHashStruct } from "./hashGate.js";
export type { HashGateResult } from "./hashGate.js";
export { buildAttestation } from "./buildAttestation.js";
export type {
  BuildAttestationInput,
  BuildAttestationDeps,
  BuiltAttestation,
} from "./buildAttestation.js";
export { signAttestation, assertAttestorRegistered } from "./signAttestation.js";
export type { SignedAttestation } from "./signAttestation.js";
export { submitAttestation } from "./submitAttestation.js";
export type { SubmitResult } from "./submitAttestation.js";
export { resolveProofRef } from "./proofRef.js";
export type { ProofRefResult } from "./proofRef.js";
export {
  createArcPublicClient,
  createArcWalletClient,
  getLastNonce,
  getNextNonce,
  isRegisteredAttestor,
  preflightMirror,
} from "./mirrorClient.js";
export type { ArcPublicClient, MirrorPreflight } from "./mirrorClient.js";
export { appendAuditEntry, AUDIT_LOG_FILE } from "./auditLog.js";
export type { AuditEntry } from "./auditLog.js";
