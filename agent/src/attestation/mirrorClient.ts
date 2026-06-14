/**
 * Read/write access to the DelegationMirror on Arc. Enforcement lives on Arc
 * (chainId 5042002); use an Arc RPC here, never a World Chain one. Identity reads
 * (proofRef) go through proofRef.ts against World Chain instead.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  arcTestnet,
  ATTESTATION_TYPEHASH,
  delegationMirrorDomainSeparator,
  DelegationMirrorAbi,
  DELEGATION_MIRROR_ADDRESS,
} from "@var/shared";
import type { Hex } from "viem";

export type ArcPublicClient = ReturnType<typeof createArcPublicClient>;

/** Arc public client for mirror reads. Empty rpcUrl uses viem's public default. */
export function createArcPublicClient(rpcUrl: string) {
  return createPublicClient({
    chain: arcTestnet,
    transport: rpcUrl !== "" ? http(rpcUrl) : http(),
  });
}

/**
 * Arc wallet client to send submitAttestation. submitAttestation is
 * permissionless (no msg.sender check), so the sender only needs USDC for gas;
 * it does not have to be the attestor. We reuse the attestor account as sender to
 * keep the demo to one key. The account's private key never leaves memory.
 */
export function createArcWalletClient(privateKey: Hex, rpcUrl: string) {
  const account = privateKeyToAccount(privateKey);
  const client = createWalletClient({
    account,
    chain: arcTestnet,
    transport: rpcUrl !== "" ? http(rpcUrl) : http(),
  });
  return { client, account };
}

/** Highest nonce the mirror has consumed for this agent (0 if none yet). */
export function getLastNonce(
  client: ArcPublicClient,
  agent: Address,
  mirror: Address = DELEGATION_MIRROR_ADDRESS,
): Promise<bigint> {
  return client.readContract({
    address: mirror,
    abi: DelegationMirrorAbi,
    functionName: "lastNonce",
    args: [agent],
  });
}

/**
 * The next valid nonce for this agent: lastNonce + 1. The contract reverts
 * StaleNonce when a.nonce <= lastNonce, so nonces are strictly increasing and the
 * first ever attestation must be 1 (lastNonce defaults to 0). Re-read this
 * immediately before each submit so a retry never reuses a stale value.
 */
export async function getNextNonce(
  client: ArcPublicClient,
  agent: Address,
  mirror: Address = DELEGATION_MIRROR_ADDRESS,
): Promise<bigint> {
  return (await getLastNonce(client, agent, mirror)) + 1n;
}

/** Whether `signer` is a registered attestor the mirror will accept signatures from. */
export function isRegisteredAttestor(
  client: ArcPublicClient,
  signer: Address,
  mirror: Address = DELEGATION_MIRROR_ADDRESS,
): Promise<boolean> {
  return client.readContract({
    address: mirror,
    abi: DelegationMirrorAbi,
    functionName: "registeredAttestor",
    args: [signer],
  });
}

// A view read that returns null instead of throwing when the function does not
// exist on the deployed bytecode (a stale deployment reverts on the new surface).
async function readOrNull(fn: () => Promise<Hex>): Promise<Hex | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export interface MirrorPreflight {
  live: boolean; // true only if the deployed contract is the EIP-712 mirror we sign for
  onchainTypehash: Hex | null;
  expectedTypehash: Hex;
  typehashMatch: boolean;
  onchainDomainSeparator: Hex | null;
  expectedDomainSeparator: Hex;
  domainSeparatorMatch: boolean;
  reason: string | null; // why it is not live, for a loud and specific error
}

/**
 * Confirm the contract deployed at `mirror` is the EIP-712 DelegationMirror this
 * builder signs against. Two on-chain checks:
 *   1. ATTESTATION_TYPEHASH equals the locked typehash (same struct schema).
 *   2. domainSeparator() equals the value we compute for (mirror, chainId), so
 *      our signatures will recover correctly inside _hashTypedDataV4.
 * A pre-EIP-712 deployment reverts on both, which is reported as not live with a
 * concrete remediation (redeploy + update addresses.json) rather than an opaque
 * revert deeper in the flow.
 */
export async function preflightMirror(
  client: ArcPublicClient,
  chainId: number,
  mirror: Address = DELEGATION_MIRROR_ADDRESS,
): Promise<MirrorPreflight> {
  const onchainTypehash = await readOrNull(() =>
    client.readContract({
      address: mirror,
      abi: DelegationMirrorAbi,
      functionName: "ATTESTATION_TYPEHASH",
    }),
  );
  const onchainDomainSeparator = await readOrNull(() =>
    client.readContract({
      address: mirror,
      abi: DelegationMirrorAbi,
      functionName: "domainSeparator",
    }),
  );

  const expectedTypehash = ATTESTATION_TYPEHASH;
  const expectedDomainSeparator = delegationMirrorDomainSeparator(mirror, chainId);
  const typehashMatch =
    onchainTypehash !== null &&
    onchainTypehash.toLowerCase() === expectedTypehash.toLowerCase();
  const domainSeparatorMatch =
    onchainDomainSeparator !== null &&
    onchainDomainSeparator.toLowerCase() === expectedDomainSeparator.toLowerCase();
  const live = typehashMatch && domainSeparatorMatch;

  let reason: string | null = null;
  if (!live) {
    if (onchainTypehash === null && onchainDomainSeparator === null) {
      reason =
        `The contract at ${mirror} does not expose ATTESTATION_TYPEHASH or domainSeparator. ` +
        "It is a pre-EIP-712 DelegationMirror (no submitAttestation/attestor registry). " +
        "Redeploy the current DelegationMirror to Arc and update shared/addresses.json " +
        "before nonce reads, attestor registration, or submits will work.";
    } else if (!typehashMatch) {
      reason = `On-chain ATTESTATION_TYPEHASH (${onchainTypehash ?? "revert"}) does not match the locked schema.`;
    } else {
      reason = `On-chain domainSeparator (${onchainDomainSeparator ?? "revert"}) does not match the value computed for chainId ${chainId} and verifyingContract ${mirror}.`;
    }
  }

  return {
    live,
    onchainTypehash,
    expectedTypehash,
    typehashMatch,
    onchainDomainSeparator,
    expectedDomainSeparator,
    domainSeparatorMatch,
    reason,
  };
}

export type { Account };
