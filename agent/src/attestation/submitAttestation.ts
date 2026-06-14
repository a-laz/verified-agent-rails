/**
 * submitAttestation: send a signed attestation to the mirror on Arc.
 *
 * Idempotency and ordering: the agent's nonce is re-read immediately before
 * sending. If the built nonce is no longer strictly greater than the mirror's
 * lastNonce (someone advanced it in between), the submit would revert StaleNonce,
 * so we refuse early with a clear message. The signature covers the nonce, so a
 * stale one cannot be bumped in place; the caller must rebuild and re-sign.
 *
 * The transaction is simulated first so a revert surfaces as a decoded reason
 * here rather than as a burned, failed transaction.
 */
import { type Address, type Hex } from "viem";
import { DelegationMirrorAbi, DELEGATION_MIRROR_ADDRESS } from "@var/shared";
import {
  createArcWalletClient,
  getLastNonce,
  type ArcPublicClient,
} from "./mirrorClient.js";
import type { SignedAttestation } from "./signAttestation.js";

export interface SubmitResult {
  txHash: Hex;
  blockNumber: bigint;
  status: "success" | "reverted";
  nonce: bigint;
}

/**
 * Submit on Arc. `senderPrivateKey` funds gas (USDC on Arc) and sends the tx;
 * submitAttestation is permissionless so this need not be the attestor, though
 * the CLI passes the attestor key for simplicity. Never logged.
 */
export async function submitAttestation(
  signed: SignedAttestation,
  senderPrivateKey: Hex,
  arcClient: ArcPublicClient,
  arcRpcUrl: string,
  mirror: Address = DELEGATION_MIRROR_ADDRESS,
): Promise<SubmitResult> {
  const { attestation, signature } = signed;

  // Re-read nonce right before sending. The contract reverts on nonce <= last.
  const lastNonce = await getLastNonce(arcClient, attestation.agent, mirror);
  if (attestation.nonce <= lastNonce) {
    throw new Error(
      `Stale nonce: built attestation carries nonce ${attestation.nonce.toString()} but the ` +
        `mirror's lastNonce is now ${lastNonce.toString()}. The signature covers the nonce, so ` +
        "rebuild and re-sign with a nonce strictly greater than lastNonce before submitting.",
    );
  }

  const { client: walletClient, account } = createArcWalletClient(senderPrivateKey, arcRpcUrl);

  // Simulate so a revert (e.g. InvalidAttestor) is decoded here, not paid for.
  const { request } = await arcClient.simulateContract({
    account,
    address: mirror,
    abi: DelegationMirrorAbi,
    functionName: "submitAttestation",
    args: [attestation, signature],
  });

  const txHash = await walletClient.writeContract(request);
  const receipt = await arcClient.waitForTransactionReceipt({ hash: txHash });

  return {
    txHash,
    blockNumber: receipt.blockNumber,
    status: receipt.status,
    nonce: attestation.nonce,
  };
}
