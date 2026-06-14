/**
 * Environment loading for the attestation builder. Kept separate from
 * agentWallet.ts so the signing path does not pull in the Dynamic SDK. Reads
 * agent/.env, then falls back to ambient process.env.
 *
 * Identity reads come from World Chain; enforcement (the mirror) is on Arc. Two
 * different RPCs, and they must not be crossed: a mirror read against a World
 * Chain RPC, or an AgentBook read against Arc, returns meaningless data.
 *
 * The attestor private key is a SECRET. It is read here, never logged, never
 * returned in an error message, and never written to disk.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Hex } from "viem";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ENV_FILE = resolve(PACKAGE_ROOT, ".env");

export function loadAttestationEnv(): void {
  try {
    process.loadEnvFile(ENV_FILE);
  } catch {
    // No .env is fine; fall back to ambient process.env.
  }
}

/** Arc RPC for mirror reads/writes. Empty string means use viem's public default. */
export function readArcRpcUrl(): string {
  loadAttestationEnv();
  return process.env.ARC_TESTNET_RPC_URL ?? "";
}

/** Optional World Chain RPC override for the AgentBook read. */
export function readWorldchainRpcUrl(): string | undefined {
  loadAttestationEnv();
  const url = process.env.WORLDCHAIN_RPC_URL;
  return url !== undefined && url !== "" ? url : undefined;
}

const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * The attestor signing key. SECRET. Validated for shape only; never logged and
 * never echoed in errors (a bad value reports its absence/shape, not its bytes).
 * The signer derived from this is what Alex must setAttestor(true) on the mirror.
 */
export function readAttestorPrivateKey(): Hex {
  loadAttestationEnv();
  const raw = process.env.ATTESTOR_PRIVATE_KEY;
  if (raw === undefined || raw === "") {
    throw new Error(
      "Missing ATTESTOR_PRIVATE_KEY in agent/.env. The builder signs attestations " +
        "with this key; set it (0x-prefixed 32-byte hex) and keep it out of git. " +
        "Its address must be setAttestor(true) on the mirror before any real submit.",
    );
  }
  if (!PRIVATE_KEY_RE.test(raw)) {
    throw new Error(
      "ATTESTOR_PRIVATE_KEY is malformed. Expected 0x followed by 64 hex characters. " +
        "(Value withheld from this message on purpose.)",
    );
  }
  return raw as Hex;
}

/**
 * Optional gas payer for the submit transaction. submitAttestation is
 * permissionless (the signature carries all the authority), so the tx sender
 * only pays gas and has no power over the mandate. Keeping it separate lets the
 * attestor key sign offline and never hold funds. Returns undefined when unset,
 * in which case the attestor key sends its own transaction. SECRET; never logged.
 */
export function readSubmitterPrivateKey(): Hex | undefined {
  loadAttestationEnv();
  const raw = process.env.SUBMITTER_PRIVATE_KEY;
  if (raw === undefined || raw === "") {
    return undefined;
  }
  if (!PRIVATE_KEY_RE.test(raw)) {
    throw new Error(
      "SUBMITTER_PRIVATE_KEY is malformed. Expected 0x followed by 64 hex characters. " +
        "(Value withheld from this message on purpose.)",
    );
  }
  return raw as Hex;
}
