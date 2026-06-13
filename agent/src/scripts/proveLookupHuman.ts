/**
 * Proof script: confirm the lookupHuman primitive resolves for the already
 * registered agent BEFORE any attestation-bridge code is built on top of it.
 *
 * Per the brief, identity lives on the AgentBook deployment at
 * 0xA23aB2712eA7BBa896930544C7d6636a96b944dA on Base Sepolia.
 *
 * Two facts about the published @worldcoin/agentkit (0.2.0) that the brief did
 * not anticipate, verified against the package source:
 *   1. lookupHuman takes a single argument, lookupHuman(address). There is no
 *      lookupHuman(agent, chain). The chain is chosen when the verifier is
 *      constructed, via the rpcUrl option.
 *   2. The verifier defaults its read to World Chain. To honour "identity lives
 *      on Base Sepolia" we pass rpcUrl pointed at Base Sepolia; the canonical
 *      AgentBook address is the same on both, so only the RPC needs overriding.
 *
 * Two independent reads are performed so a broken RPC is never mistaken for an
 * unregistered agent:
 *   - a raw viem readContract, which surfaces reverts and transport errors.
 *   - the agentkit verifier, whose lookupHuman swallows every error to null.
 *
 * Usage:
 *   npm run prove:lookup -w @var/agent -- 0xYourAgentAddress
 *   AGENT_ADDRESS=0x... npm run prove:lookup -w @var/agent
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  keccak256,
  toHex,
  type Address,
} from "viem";
import { baseSepolia } from "viem/chains";
import { createAgentBookVerifier } from "@worldcoin/agentkit";

// Canonical AgentBook address. Equal to the @worldcoin/agentkit built-in
// default (AGENT_BOOK_ADDRESS), restated here so this script is self documenting
// and so the raw read targets the exact same contract the verifier does.
const AGENT_BOOK_ADDRESS: Address = "0xA23aB2712eA7BBa896930544C7d6636a96b944dA";

const AGENT_BOOK_ABI = [
  {
    type: "function",
    name: "lookupHuman",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const DEFAULT_BASE_SEPOLIA_RPC = "https://sepolia.base.org";

function loadAgentEnv(): void {
  // agent/.env sits two levels up from src/scripts.
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, "../../.env");
  try {
    process.loadEnvFile(envPath);
  } catch {
    // No .env is fine; fall back to process.env and the public default RPC.
  }
}

function readAgentAddress(): Address {
  const raw = process.argv[2] ?? process.env.AGENT_ADDRESS;
  if (raw === undefined || raw === "") {
    throw new Error(
      "No agent address. Pass it as an argument or set AGENT_ADDRESS.\n" +
        "  npm run prove:lookup -w @var/agent -- 0xYourAgentAddress",
    );
  }
  if (!isAddress(raw)) {
    throw new Error(`Not a valid address: ${raw}`);
  }
  return getAddress(raw);
}

async function main(): Promise<void> {
  loadAgentEnv();
  const agent = readAgentAddress();
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL ?? DEFAULT_BASE_SEPOLIA_RPC;

  console.log("lookupHuman proof");
  console.log("  agent:            ", agent);
  console.log("  agentBook:        ", AGENT_BOOK_ADDRESS);
  console.log("  chain:            ", `${baseSepolia.name} (${baseSepolia.id})`);
  console.log("  rpcUrl:           ", rpcUrl);

  const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });

  // 1. RPC connectivity. A wrong RPC must fail loudly here, not masquerade as
  //    an unregistered agent further down.
  let onchainChainId: number;
  try {
    onchainChainId = await client.getChainId();
  } catch (err) {
    throw new Error(
      `Cannot reach Base Sepolia RPC at ${rpcUrl}. ` +
        `Set BASE_SEPOLIA_RPC_URL in agent/.env. Cause: ${(err as Error).message}`,
    );
  }
  console.log("  rpc chainId:      ", onchainChainId);
  if (onchainChainId !== baseSepolia.id) {
    throw new Error(
      `RPC reports chainId ${onchainChainId}, expected ${baseSepolia.id} (Base Sepolia). ` +
        "Wrong network; the AgentBook read would be meaningless.",
    );
  }

  // 2. Raw read. Surfaces a revert or transport error instead of hiding it.
  const rawHumanId = await client.readContract({
    address: AGENT_BOOK_ADDRESS,
    abi: AGENT_BOOK_ABI,
    functionName: "lookupHuman",
    args: [agent],
  });

  // 3. Library path. The agentkit verifier returns a hex string or null and
  //    swallows errors, so we only trust it once the raw read above succeeded.
  const verifier = createAgentBookVerifier({ rpcUrl });
  const libHuman = await verifier.lookupHuman(agent);

  const humanBacked = rawHumanId !== 0n;
  console.log("");
  console.log("  raw humanId:      ", `${rawHumanId.toString()} (${toHex(rawHumanId)})`);
  console.log("  verifier result:  ", libHuman ?? "null");
  console.log("  human-backed:     ", humanBacked);

  // proofRef the bridge will carry onchain: the anonymous human id hashed to
  // bytes32. Deterministic for a given humanId.
  const proofRef = humanBacked ? keccak256(toHex(rawHumanId, { size: 32 })) : null;
  console.log("  proofRef (bytes32):", proofRef ?? "n/a (not human-backed)");

  // The two paths must agree, or the verifier is reading a different chain than
  // the raw client and our configuration is wrong.
  const libHumanId = libHuman === null ? 0n : BigInt(libHuman);
  if (libHumanId !== rawHumanId) {
    throw new Error(
      `Raw read (${rawHumanId.toString()}) and verifier (${libHuman ?? "null"}) disagree. ` +
        "The verifier may be resolving a different chain than the raw client.",
    );
  }

  if (!humanBacked) {
    console.log("");
    console.log("RESULT: NOT human-backed (lookupHuman returned 0).");
    console.log(
      "Stop. Per the brief this means the registration or RPC is wrong; nothing " +
        "downstream will work until this resolves non-zero.",
    );
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("RESULT: human-backed. Primitive proven. Safe to build the bridge on top.");
}

main().catch((err) => {
  console.error("lookupHuman proof failed:", (err as Error).message);
  process.exit(1);
});
