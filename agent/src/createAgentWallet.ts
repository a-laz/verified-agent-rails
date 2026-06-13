/**
 * Create ONE persistent Dynamic MPC server wallet for the agent, persist its
 * id/address, and print the address. This address is what AgentKit registration
 * and the whole demo key off, so it must be stable across restarts.
 *
 * Idempotent: if agent/.agent-wallet.json already exists it prints that wallet
 * and exits without creating a second one. We never want a second wallet
 * silently created.
 *
 * Run: npm run create:wallet -w @var/agent
 *
 * Dashboard prerequisite (resolved open question): the Dynamic Node SDK requires
 * at least one EVM chain enabled in the dashboard under Chains & Networks, or
 * wallet creation fails (silently or with an error). The MPC keypair produces
 * the same address on every EVM chain, so Arc and Base Sepolia do not need to be
 * the specific chains enabled; any one EVM network is enough.
 */
import { getAddress, isAddress } from "viem";
import { ThresholdSignatureScheme } from "@dynamic-labs-wallet/core";
import {
  WALLET_FILE,
  authenticatedClient,
  readDynamicConfig,
  readPersistedWallet,
  readWalletPassword,
  writePersistedWallet,
  type AgentWalletRecord,
} from "./agentWallet.js";

function printAgentAddress(address: string): void {
  console.log(`persisted: ${WALLET_FILE}`);
  // Final line, machine readable. Keep this last.
  console.log(`AGENT_ADDRESS=${address}`);
}

async function main(): Promise<void> {
  // Idempotency first: never create a second wallet silently.
  const existing = readPersistedWallet();
  if (existing !== null) {
    console.log("Agent wallet already exists; reusing it (no new wallet created).");
    console.log(`  walletId:  ${existing.walletId}`);
    if (existing.createdAt !== "") console.log(`  createdAt: ${existing.createdAt}`);
    printAgentAddress(existing.address);
    return;
  }

  // Validate credentials and the backup password are present before any network
  // call. Reading the password first fails fast if it is missing.
  const config = readDynamicConfig();
  const password = readWalletPassword();

  // Authenticate. A failure here means the env id / api token is wrong or the
  // dashboard is not set up; print the exact error and stop.
  const client = await authenticatedClient(config).catch((err: unknown) => {
    console.error((err as Error).message);
    console.error(
      "Stop: the Dynamic env/token is wrong. Fix DYNAMIC_ENVIRONMENT_ID / " +
        "DYNAMIC_API_TOKEN in the dashboard and agent/.env, then re-run.",
    );
    process.exit(1);
  });

  console.log("Creating a new MPC server wallet (TWO_OF_TWO)...");
  let walletId: string;
  let address: string;
  try {
    const { walletMetadata } = await client.createWalletAccount({
      thresholdSignatureScheme: ThresholdSignatureScheme.TWO_OF_TWO,
      // Back the external server key share up to Dynamic so getAgentWallet() can
      // recover it after a restart without persisting any secret to disk. Dynamic
      // requires a password to encrypt that backup; the same password recovers it.
      password,
      backUpToDynamic: true,
    });
    walletId = walletMetadata.walletId;
    address = walletMetadata.accountAddress;
  } catch (err) {
    console.error(`Wallet creation failed: ${(err as Error).message}`);
    console.error(
      "If this mentions a chain or network not being enabled, enable an EVM chain " +
        "in the Dynamic dashboard under Chains & Networks, then re-run.",
    );
    process.exit(1);
  }

  if (!isAddress(address)) {
    console.error(`Dynamic returned an address that is not a valid EVM address: ${address}`);
    process.exit(1);
  }

  const record: AgentWalletRecord = {
    walletId,
    address: getAddress(address),
    createdAt: new Date().toISOString(),
  };
  writePersistedWallet(record);

  console.log("Created and persisted a new agent wallet.");
  console.log(`  walletId:  ${record.walletId}`);
  console.log(`  createdAt: ${record.createdAt}`);
  printAgentAddress(record.address);
}

main().catch((err: unknown) => {
  console.error("create:wallet failed:", (err as Error).message);
  process.exit(1);
});
