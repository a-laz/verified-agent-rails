// World ID / AgentBook registration — client-safe constants and proof helpers.
// These mirror @worldcoin/agentkit-cli@0.2.0 EXACTLY so an in-browser scan
// produces a proof the same relay + AgentBook contract accept:
//   - app_id / action drive which World ID action the proof is bound to
//   - the signal is solidityEncode(['address','uint256'], [agent, nonce]),
//     matching the contract's register(agent, root, nonce, nullifierHash, proof)
//   - normalizeProof unpacks IDKit's ISuccessResult.proof into the uint256[8]
//     the contract expects (classic v3/Semaphore format)
import { decodeAbiParameters, type Address } from "viem";
import { solidityEncode } from "@worldcoin/idkit-core/hashing";
import type { ISuccessResult } from "@worldcoin/idkit";

// ── Constants (verbatim from agentkit-cli) ──────────────────────────────────
export const AGENT_BOOK_ADDRESS: Address = "0xA23aB2712eA7BBa896930544C7d6636a96b944dA";
export const APP_ID = "app_a7c3e2b6b83927251a0db5345bd7146a" as const;
export const ACTION = "agentbook-registration" as const;
export const AGENT_BOOK_NETWORK = "eip155:480"; // World Chain

// The hosted, gasless registration relay. The CLI submits register() through it;
// our /api/var/register route proxies to it (server-side, avoids CORS).
export const REGISTER_RELAY_URL =
  process.env.NEXT_PUBLIC_REGISTER_RELAY_URL ?? "https://x402-worldchain.vercel.app";

// What our /api/var/agent route returns.
export interface AgentStatus {
  agent: Address;
  registered: boolean;
  humanId: string | null; // hex, the World ID nullifier-derived id
  nextNonce: string; // AgentBook.getNextNonce(agent), as a string
  contract: Address;
  network: string;
}

// The wire shape POSTed to the relay /register endpoint (matches the CLI).
export interface RegistrationPayload {
  agent: Address;
  root: string; // merkle_root
  nonce: string;
  nullifierHash: string;
  proof: string[]; // uint256[8] as hex strings
  contract: Address;
}

// The signal the World ID proof is bound to. Must equal the contract's internal
// signal == solidityEncode(['address','uint256'], [agent, nonce]).
export function buildSignal(agent: Address, nextNonce: string) {
  return solidityEncode(["address", "uint256"], [agent, BigInt(nextNonce)]);
}

// IDKit returns proof either as a JSON array string or an ABI-encoded uint256[8]
// hex string; the contract wants a uint256[8]. (Ported from the CLI's
// normalizeProof so the on-chain bytes are identical.)
export function normalizeProof(result: ISuccessResult): string[] | null {
  const raw = result.proof;
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through to ABI decode
    }
  }
  try {
    const decoded = decodeAbiParameters([{ type: "uint256[8]" }], raw as `0x${string}`)[0];
    return (decoded as readonly bigint[]).map((v) => `0x${v.toString(16).padStart(64, "0")}`);
  } catch {
    return null;
  }
}
