/**
 * Resolve the on-chain proofRef for an agent from its World Chain AgentKit
 * identity. This is the reusable form of the logic proven in
 * scripts/proveLookupHuman.ts: read AgentBook.lookupHuman on World Chain, require
 * a non-zero (human-backed) result, and derive the bytes32 proofRef the bridge
 * carries as keccak256(bytes32(humanId)).
 *
 * Identity lives on World Chain (chainId 480), NOT Arc and NOT Base Sepolia. The
 * agentkit verifier defaults to World Chain; rpcUrl only overrides the endpoint.
 * The verifier swallows errors to null, so a raw read runs first to distinguish a
 * broken RPC from an unregistered agent, and the two paths are cross-checked.
 */
import { createPublicClient, http, keccak256, toHex, type Address, type Hex } from "viem";
import { worldchain } from "viem/chains";
import { createAgentBookVerifier } from "@worldcoin/agentkit";

// Canonical AgentBook, equal to the agentkit built-in default. Restated so the
// raw read targets the exact contract the verifier resolves.
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

export interface ProofRefResult {
  humanId: bigint; // raw World ID nullifier hash from AgentBook.lookupHuman
  proofRef: Hex; // keccak256(bytes32(humanId)); what the mirror mandate carries
}

/**
 * Read the agent's humanId on World Chain and derive its proofRef. Throws if the
 * RPC is wrong (chainId mismatch), if the two read paths disagree, or if the
 * agent is not human-backed (lookupHuman == 0): no proofRef means no attestation.
 */
export async function resolveProofRef(
  agent: Address,
  worldchainRpcUrl?: string,
): Promise<ProofRefResult> {
  const client = createPublicClient({
    chain: worldchain,
    transport: worldchainRpcUrl !== undefined ? http(worldchainRpcUrl) : http(),
  });

  // Fail loudly on the wrong network rather than misreading an empty result as
  // "not registered".
  const onchainChainId = await client.getChainId();
  if (onchainChainId !== worldchain.id) {
    throw new Error(
      `World Chain RPC reports chainId ${onchainChainId}, expected ${worldchain.id}. ` +
        "Wrong network; the AgentBook read would be meaningless.",
    );
  }

  const rawHumanId = await client.readContract({
    address: AGENT_BOOK_ADDRESS,
    abi: AGENT_BOOK_ABI,
    functionName: "lookupHuman",
    args: [agent],
  });

  // Library cross-check. The verifier returns hex or null and hides errors, so it
  // is only trusted once the raw read above has succeeded.
  const verifier = createAgentBookVerifier(
    worldchainRpcUrl !== undefined ? { rpcUrl: worldchainRpcUrl } : {},
  );
  const libHuman = await verifier.lookupHuman(agent);
  const libHumanId = libHuman === null ? 0n : BigInt(libHuman);
  if (libHumanId !== rawHumanId) {
    throw new Error(
      `World Chain raw read (${rawHumanId.toString()}) and verifier (${libHuman ?? "null"}) ` +
        "disagree; the verifier may be resolving a different chain than the raw client.",
    );
  }

  if (rawHumanId === 0n) {
    throw new Error(
      `Agent ${agent} is not human-backed on World Chain (lookupHuman == 0). ` +
        "Register it in AgentBook (or fix the RPC) before building an attestation.",
    );
  }

  const proofRef = keccak256(toHex(rawHumanId, { size: 32 }));
  return { humanId: rawHumanId, proofRef };
}
