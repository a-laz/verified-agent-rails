/**
 * signAttestation: produce the attestor's EIP-712 signature over an Attestation.
 *
 * Pure and network-free by design, so it is the single signing path both this
 * builder and Vlad's pipeline share. It signs with the attestor key, then
 * recovers the signer from its own (digest, signature) as a local roundtrip
 * check: if recovery does not return the signing address, the encoding is wrong
 * and no amount of on-chain retrying will help.
 *
 * The mirror's "is this a registered attestor" check is deliberately NOT here:
 * it is a network read against Arc and a deploy-time prerequisite, enforced as a
 * separate startup gate (assertAttestorRegistered) so signing stays pure and
 * testable. recoveredSigner is returned so callers run that gate.
 *
 * The private key is used to construct a viem account and is never logged.
 */
import {
  hashTypedData,
  recoverTypedDataAddress,
  type Address,
  type Hex,
  type TypedDataDomain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ATTESTATION_PRIMARY_TYPE,
  ATTESTATION_TYPES,
  buildDelegationMirrorDomain,
  type Attestation,
} from "@var/shared";
import { isRegisteredAttestor, type ArcPublicClient } from "./mirrorClient.js";

export interface SignedAttestation {
  attestation: Attestation;
  domain: TypedDataDomain;
  digest: Hex; // the EIP-712 digest the contract recovers against
  signature: Hex;
  signer: Address; // address derived from the attestor key
  recoveredSigner: Address; // recovered from (digest, signature); must equal signer
}

/**
 * Sign an attestation with the attestor key for the given verifying contract and
 * chain. Throws if the local recovery roundtrip fails, which would mean the
 * typed-data definition disagrees with itself.
 */
export async function signAttestation(
  attestation: Attestation,
  attestorPrivateKey: Hex,
  verifyingContract: Address,
  chainId: number,
): Promise<SignedAttestation> {
  const account = privateKeyToAccount(attestorPrivateKey);
  const domain = buildDelegationMirrorDomain(verifyingContract, chainId);
  const typedData = {
    domain,
    types: ATTESTATION_TYPES,
    primaryType: ATTESTATION_PRIMARY_TYPE,
    message: attestation,
  } as const;

  const signature = await account.signTypedData(typedData);
  const digest = hashTypedData(typedData);
  const recoveredSigner = await recoverTypedDataAddress({ ...typedData, signature });

  if (recoveredSigner.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(
      `Local recovery roundtrip failed: signed as ${account.address} but recovered ` +
        `${recoveredSigner}. The EIP-712 encoding is inconsistent; do not submit.`,
    );
  }

  return {
    attestation,
    domain,
    digest,
    signature,
    signer: account.address,
    recoveredSigner,
  };
}

/**
 * Hard gate: the recovered signer must be a registered attestor on the mirror, or
 * submitAttestation reverts InvalidAttestor. Throws with the unregistered address
 * so Alex knows exactly what to setAttestor(true). Run at startup and before any
 * real submit.
 */
export async function assertAttestorRegistered(
  client: ArcPublicClient,
  signer: Address,
  mirror?: Address,
): Promise<void> {
  const registered = await isRegisteredAttestor(client, signer, mirror);
  if (!registered) {
    throw new Error(
      `Attestor ${signer} is NOT registered on the mirror. ` +
        "The contract owner must call setAttestor(" +
        signer +
        ", true) before any attestation this key signs will be accepted.",
    );
  }
}
