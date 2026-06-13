/**
 * Attestation builder CLI.
 *
 * Default mode is DRY RUN: it runs the hash gate, builds the struct (proofRef
 * from World Chain, nonce from the mirror), signs with the attestor key, and
 * prints the struct, digest, signature, and recovered signer WITHOUT submitting.
 * A real on-chain submit happens only with --submit, and only after both gates
 * pass: the EIP-712 hash gate, and the attestor being registered on the mirror.
 *
 * Usage:
 *   npm run attest -w @var/agent                 # dry run with defaults
 *   npm run attest -w @var/agent -- --submit     # real submit (needs both gates)
 *   npm run attest -w @var/agent -- --agent 0x.. --principal 0x.. \
 *       --cap-tx 10 --cap-period 100 --period 86400 --token 0x.. --expiry <unix>
 *
 * Caps are USDC amounts (e.g. "10" = 10 USDC) parsed with parseUSDC; never raw
 * parseUnits. The attestor key is read from ATTESTOR_PRIVATE_KEY and never logged.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ADDRESSES,
  ARC_CHAIN_ID,
  DELEGATION_MIRROR_ADDRESS,
  delegationMirrorDomainSeparator,
  parseUSDC,
} from "@var/shared";
import { printHashGate, runHashGate } from "../attestation/hashGate.js";
import {
  createArcPublicClient,
  isRegisteredAttestor,
  preflightMirror,
} from "../attestation/mirrorClient.js";
import { buildAttestation } from "../attestation/buildAttestation.js";
import { signAttestation, type SignedAttestation } from "../attestation/signAttestation.js";
import { submitAttestation } from "../attestation/submitAttestation.js";
import { appendAuditEntry, type AuditEntry } from "../attestation/auditLog.js";
import {
  readArcRpcUrl,
  readAttestorPrivateKey,
  readWorldchainRpcUrl,
} from "../attestation/env.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Minimal flag parser: --key value pairs plus the boolean --submit.
function parseArgs(argv: string[]): { submit: boolean; opts: Map<string, string> } {
  const opts = new Map<string, string>();
  let submit = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) continue;
    if (token === "--submit") {
      submit = true;
      continue;
    }
    if (token.startsWith("--")) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Flag ${token} expects a value.`);
      }
      opts.set(token.slice(2), value);
      i += 1;
    }
  }
  return { submit, opts };
}

function requireAddress(label: string, raw: string): Address {
  if (!isAddress(raw)) throw new Error(`${label} is not a valid address: ${raw}`);
  return getAddress(raw);
}

// Default agent: the persisted MPC wallet address. Read straight from the JSON so
// this CLI does not pull in the Dynamic SDK just to learn one address.
function defaultAgentAddress(): Address | null {
  const file = resolve(PACKAGE_ROOT, ".agent-wallet.json");
  if (!existsSync(file)) return null;
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { address?: string };
  return parsed.address !== undefined && isAddress(parsed.address)
    ? getAddress(parsed.address)
    : null;
}

// JSON.stringify cannot serialize bigint; render the struct with decimal strings.
function structForPrint(s: SignedAttestation["attestation"]): Record<string, string> {
  return {
    agent: s.agent,
    principal: s.principal,
    proofRef: s.proofRef,
    kycRef: s.kycRef,
    spendCapPerTx: s.spendCapPerTx.toString(),
    spendCapPerPeriod: s.spendCapPerPeriod.toString(),
    periodLength: s.periodLength.toString(),
    allowedToken: s.allowedToken,
    expiry: s.expiry.toString(),
    nonce: s.nonce.toString(),
  };
}

async function main(): Promise<void> {
  const { submit, opts } = parseArgs(process.argv.slice(2));
  const mode = submit ? "submit" : "dry-run";

  console.log("=== Verified Agent Rails: attestation builder ===");
  console.log("mode:", mode, submit ? "" : "(dry run; pass --submit to send on-chain)");
  console.log("");

  // GATE 1: EIP-712 hash gate. Nothing is signed or submitted unless this passes.
  const gate = runHashGate();
  const gateOk = printHashGate(gate);
  console.log("");
  if (!gateOk) {
    console.error("Hash gate failed. Fix the EIP-712 encoding before anything else.");
    process.exit(1);
  }

  const arcRpcUrl = readArcRpcUrl();
  const worldchainRpcUrl = readWorldchainRpcUrl();
  const mirror = DELEGATION_MIRROR_ADDRESS;
  const chainId = ARC_CHAIN_ID;

  // Attestor key. Loaded from secret, used to derive the signer address (printed)
  // and to sign. The raw key is never printed.
  const attestorKey: Hex = readAttestorPrivateKey();
  const attestorAddress = privateKeyToAccount(attestorKey).address;

  const arcClient = createArcPublicClient(arcRpcUrl);
  const onchainChainId = await arcClient.getChainId();
  if (onchainChainId !== chainId) {
    throw new Error(
      `Arc RPC reports chainId ${onchainChainId}, expected ${chainId}. ` +
        "Repoint ARC_TESTNET_RPC_URL at Arc; the mirror reads would be meaningless otherwise.",
    );
  }

  // Coordination vectors for diffing against Vlad's pipeline signer and the
  // contract fixture. domainSeparator depends on chainId + verifyingContract.
  const domainSeparator = delegationMirrorDomainSeparator(mirror, chainId);
  console.log("Coordination vectors (diff against pipeline + contract):");
  console.log("  chainId:           ", chainId);
  console.log("  verifyingContract: ", mirror);
  console.log("  typehash:          ", gate.typehash.computed);
  console.log("  sample hashStruct: ", gate.hashStruct.computed);
  console.log("  domainSeparator:   ", domainSeparator);
  console.log("");

  // Preflight: is the contract at `mirror` the EIP-712 DelegationMirror we sign
  // for? On-chain typehash and domainSeparator must match. A stale (pre-EIP-712)
  // deployment fails this and cannot accept submits or attestor registration.
  const preflight = await preflightMirror(arcClient, chainId, mirror);
  console.log("Mirror preflight (deployed contract at", mirror + "):");
  console.log("  on-chain typehash:        ", preflight.onchainTypehash ?? "revert (absent)");
  console.log("  typehash match:           ", preflight.typehashMatch);
  console.log("  on-chain domainSeparator: ", preflight.onchainDomainSeparator ?? "revert (absent)");
  console.log("  domainSeparator match:    ", preflight.domainSeparatorMatch);
  console.log("  live EIP-712 mirror:      ", preflight.live);
  if (!preflight.live) {
    console.log("  reason:", preflight.reason);
  }
  console.log("");

  // GATE 2 (reported here, enforced before submit): is the attestor registered?
  // Only readable when the mirror is the live EIP-712 deployment.
  const attestorRegistered = preflight.live
    ? await isRegisteredAttestor(arcClient, attestorAddress, mirror)
    : false;
  console.log("Attestor:");
  console.log("  address:    ", attestorAddress);
  console.log("  registered: ", preflight.live ? attestorRegistered : "unknown (mirror not live)");
  if (preflight.live && !attestorRegistered) {
    console.log(
      "  note: NOT registered. A real submit is blocked until the owner calls " +
        `setAttestor(${attestorAddress}, true) on the mirror.`,
    );
  }
  console.log("");

  // Resolve inputs: flags > env > sensible demo defaults.
  const agentArg = opts.get("agent") ?? process.env.AGENT_ADDRESS;
  const agent = agentArg !== undefined ? requireAddress("--agent", agentArg) : defaultAgentAddress();
  if (agent === null) {
    throw new Error("No agent address. Pass --agent 0x.., set AGENT_ADDRESS, or create the wallet.");
  }
  const principalArg = opts.get("principal") ?? process.env.PRINCIPAL_ADDRESS;
  // Demo default: the attestor also acts as principal. In production the principal
  // is the World ID verified human who delegates; pass it explicitly.
  const principal =
    principalArg !== undefined ? requireAddress("--principal", principalArg) : attestorAddress;
  const allowedToken = requireAddress(
    "--token",
    opts.get("token") ?? ADDRESSES.GatedUSD.address,
  );
  const spendCapPerTx = parseUSDC(opts.get("cap-tx") ?? "10");
  const spendCapPerPeriod = parseUSDC(opts.get("cap-period") ?? "100");
  const periodLength = BigInt(opts.get("period") ?? "86400");
  // Default expiry: 30 days out. Date is fine in a normal Node script.
  const defaultExpiry = BigInt(Math.floor(Date.now() / 1000) + 30 * 86400);
  const expiry = opts.get("expiry") !== undefined ? BigInt(opts.get("expiry") as string) : defaultExpiry;

  // Nonce source: live getNextNonce when the mirror is the EIP-712 deployment.
  // When it is not (stale deployment), lastNonce reverts, so fall back to an
  // explicit --nonce or 1 purely so a signed sample can be produced for
  // coordination. A real submit is blocked in that case regardless.
  const nonceOverrideArg = opts.get("nonce");
  let nonceOverride: bigint | undefined;
  if (nonceOverrideArg !== undefined) {
    nonceOverride = BigInt(nonceOverrideArg);
  } else if (!preflight.live) {
    nonceOverride = 1n;
  }
  const nonceSource = preflight.live
    ? "live getNextNonce"
    : nonceOverrideArg !== undefined
      ? "override --nonce (mirror not live)"
      : "assumed 1 (mirror not live, NOT read on-chain)";

  console.log("Building attestation (proofRef from World Chain, nonce from mirror)...");
  const built = await buildAttestation(
    { agent, principal, spendCapPerTx, spendCapPerPeriod, periodLength, allowedToken, expiry },
    { arcClient, worldchainRpcUrl, mirror, nonceOverride },
  );
  console.log("  humanId:  ", built.humanId.toString());
  console.log("  proofRef: ", built.proofRef);
  console.log(`  nonce (${nonceSource}):`, built.nonce.toString());
  console.log("");

  const signed = await signAttestation(built.attestation, attestorKey, mirror, chainId);
  console.log("Signed attestation:");
  console.log("  struct:   ", JSON.stringify(structForPrint(signed.attestation), null, 2));
  console.log("  digest:   ", signed.digest);
  console.log("  signature:", signed.signature);
  console.log("  recovered signer:", signed.recoveredSigner);
  console.log(
    "  recovered == attestor:",
    signed.recoveredSigner.toLowerCase() === attestorAddress.toLowerCase(),
  );
  console.log("");

  let txHash: Hex | null = null;
  let txStatus: "success" | "reverted" | null = null;

  if (submit) {
    // GATE: the mirror must be the live EIP-712 deployment.
    if (!preflight.live) {
      console.error("Refusing to submit:", preflight.reason);
      process.exit(1);
    }
    // GATE 2 enforced: refuse to submit with an unregistered attestor.
    if (!attestorRegistered) {
      console.error(
        `Refusing to submit: attestor ${attestorAddress} is not registered on the mirror. ` +
          `Have the owner call setAttestor(${attestorAddress}, true) first.`,
      );
      process.exit(1);
    }
    console.log("Submitting on Arc...");
    const result = await submitAttestation(signed, attestorKey, arcClient, arcRpcUrl, mirror);
    txHash = result.txHash;
    txStatus = result.status;
    console.log("  txHash:     ", result.txHash);
    console.log("  blockNumber:", result.blockNumber.toString());
    console.log("  status:     ", result.status);
    console.log("");
  } else {
    console.log("DRY RUN: nothing submitted. Re-run with --submit once both gates pass.");
    console.log("");
  }

  // Audit: one structured entry per attestation, dry-run or submitted.
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    mode,
    chainId,
    mirror,
    agent: signed.attestation.agent,
    principal: signed.attestation.principal,
    attestor: signed.recoveredSigner,
    attestorRegistered,
    nonce: signed.attestation.nonce.toString(),
    humanId: built.humanId.toString(),
    proofRef: signed.attestation.proofRef,
    kycRef: signed.attestation.kycRef,
    digest: signed.digest,
    spendCapPerTx: signed.attestation.spendCapPerTx.toString(),
    spendCapPerPeriod: signed.attestation.spendCapPerPeriod.toString(),
    allowedToken: signed.attestation.allowedToken,
    expiry: signed.attestation.expiry.toString(),
    txHash,
    txStatus,
  };
  appendAuditEntry(entry);
  console.log("Audit entry appended (agent, principal, attestor, nonce, proofRef, tx).");
}

main().catch((err) => {
  console.error("attest failed:", (err as Error).message);
  process.exit(1);
});
