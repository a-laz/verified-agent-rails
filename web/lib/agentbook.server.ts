// Server-only AgentBook reads on World Chain. Used by /api/var/agent (gate
// status + the nonce the signal binds to) and post-register polling. RPC config
// stays server-side (WORLDCHAIN_RPC_URL); the public viem endpoint is the
// default, matching the CLI.
import { createPublicClient, http, type Address } from "viem";
import { worldchain } from "viem/chains";
import { AGENT_BOOK_ADDRESS, AGENT_BOOK_NETWORK, type AgentStatus } from "./worldid";

const AGENT_BOOK_ABI = [
  {
    type: "function",
    name: "getNextNonce",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "lookupHuman",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "humanId", type: "uint256" }],
  },
] as const;

export function worldClient() {
  return createPublicClient({
    chain: worldchain,
    transport: process.env.WORLDCHAIN_RPC_URL ? http(process.env.WORLDCHAIN_RPC_URL) : http(),
  });
}

export async function getAgentStatus(agent: Address): Promise<AgentStatus> {
  const client = worldClient();
  const [humanIdRaw, nextNonce] = await Promise.all([
    client.readContract({
      address: AGENT_BOOK_ADDRESS,
      abi: AGENT_BOOK_ABI,
      functionName: "lookupHuman",
      args: [agent],
    }),
    client.readContract({
      address: AGENT_BOOK_ADDRESS,
      abi: AGENT_BOOK_ABI,
      functionName: "getNextNonce",
      args: [agent],
    }),
  ]);
  return {
    agent,
    registered: humanIdRaw !== 0n,
    humanId: humanIdRaw === 0n ? null : `0x${humanIdRaw.toString(16)}`,
    nextNonce: nextNonce.toString(),
    contract: AGENT_BOOK_ADDRESS,
    network: AGENT_BOOK_NETWORK,
  };
}
