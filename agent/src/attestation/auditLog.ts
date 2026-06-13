/**
 * Append-only audit log of every attestation the builder processes, dry-run or
 * submitted. One JSON object per line at agent/.attestation-audit.log (gitignored
 * since it references real agents/principals). Captures who delegated what to
 * whom, under which attestor and nonce, and the resulting tx if any.
 */
import { appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Address, Hex } from "viem";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const AUDIT_LOG_FILE = resolve(PACKAGE_ROOT, ".attestation-audit.log");

export interface AuditEntry {
  timestamp: string; // ISO 8601
  mode: "dry-run" | "submit";
  chainId: number;
  mirror: Address;
  agent: Address;
  principal: Address;
  attestor: Address; // recovered signer
  attestorRegistered: boolean;
  nonce: string; // bigint as decimal string
  humanId: string; // World ID nullifier, decimal string
  proofRef: Hex;
  kycRef: Hex;
  digest: Hex;
  spendCapPerTx: string;
  spendCapPerPeriod: string;
  allowedToken: Address;
  expiry: string;
  txHash: Hex | null;
  txStatus: "success" | "reverted" | null;
}

/** Append one entry as a JSON line. Returns the entry written. */
export function appendAuditEntry(entry: AuditEntry): AuditEntry {
  appendFileSync(AUDIT_LOG_FILE, `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
  return entry;
}
