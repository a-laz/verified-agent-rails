/**
 * Persistence and reuse for the agent's single Dynamic MPC server wallet.
 *
 * The wallet id/address is written to agent/.agent-wallet.json by
 * createAgentWallet.ts and read back here so every later run reuses the same
 * wallet. Only the id, address, and creation time are persisted; the MPC key
 * shares are never written to disk. getAgentWallet() recovers a signing wallet
 * client from Dynamic using the persisted id, which is why the wallet is created
 * with backUpToDynamic enabled.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isAddress, type Address, type Chain, type WalletClient } from "viem";
import { baseSepolia } from "viem/chains";
import { arcTestnet } from "@var/shared";
import { DynamicEvmWalletClient } from "@dynamic-labs-wallet/node-evm";

// Package root is one level up from src/.
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const WALLET_FILE = resolve(PACKAGE_ROOT, ".agent-wallet.json");
const ENV_FILE = resolve(PACKAGE_ROOT, ".env");

export interface AgentWalletRecord {
  walletId: string;
  address: Address;
  createdAt: string;
}

// chainId to viem chain. Only the two demo chains are supported; any other id is
// rejected so a wrong chain/rpcUrl pairing fails loudly instead of signing for
// the wrong network. arcTestnet (5042002) comes from @var/shared.
const SUPPORTED_CHAINS: Record<number, Chain> = {
  5042002: arcTestnet,
  84532: baseSepolia,
};

export interface DynamicConfig {
  environmentId: string;
  apiToken: string;
}

export function loadAgentEnv(): void {
  try {
    process.loadEnvFile(ENV_FILE);
  } catch {
    // No .env is fine; fall back to ambient process.env.
  }
}

/**
 * Read Dynamic credentials. The Node SDK and its docs call this the API token
 * (authenticateApiToken); the brief referred to DYNAMIC_AUTH_TOKEN, so both
 * names are accepted with the SDK's own name preferred. Never logged.
 */
export function readDynamicConfig(): DynamicConfig {
  loadAgentEnv();
  const environmentId = process.env.DYNAMIC_ENVIRONMENT_ID;
  const apiToken = process.env.DYNAMIC_API_TOKEN ?? process.env.DYNAMIC_AUTH_TOKEN;
  if (
    environmentId === undefined ||
    environmentId === "" ||
    apiToken === undefined ||
    apiToken === ""
  ) {
    const missing = [
      environmentId ? null : "DYNAMIC_ENVIRONMENT_ID",
      apiToken ? null : "DYNAMIC_API_TOKEN",
    ].filter((name): name is string => name !== null);
    throw new Error(
      `Missing Dynamic credentials in agent/.env: ${missing.join(", ")}. ` +
        "Set them before creating or loading the agent wallet.",
    );
  }
  return { environmentId, apiToken };
}

/**
 * The backup password that encrypts the MPC server key share stored at Dynamic.
 * Dynamic requires it whenever a wallet is backed up (which is how the wallet
 * stays recoverable without persisting any secret to disk), and the SAME
 * password is needed to recover the share to sign later. It must be stable for
 * the life of the wallet and is never logged. Losing it makes the wallet
 * permanently unsignable, so it belongs in agent/.env and a secure backup.
 */
export function readWalletPassword(): string {
  loadAgentEnv();
  const password = process.env.AGENT_WALLET_PASSWORD;
  if (password === undefined || password === "") {
    throw new Error(
      "Missing AGENT_WALLET_PASSWORD in agent/.env. Dynamic requires a backup " +
        "password to create a recoverable MPC wallet and to sign with it later. " +
        "Set a strong, durable value and back it up; if it is lost the wallet cannot sign.",
    );
  }
  return password;
}

export function readPersistedWallet(): AgentWalletRecord | null {
  if (!existsSync(WALLET_FILE)) return null;
  const parsed = JSON.parse(readFileSync(WALLET_FILE, "utf8")) as Partial<AgentWalletRecord>;
  if (typeof parsed.walletId !== "string" || typeof parsed.address !== "string") {
    throw new Error(
      `${WALLET_FILE} exists but is missing walletId/address. ` +
        "Refusing to proceed; fix or remove it by hand.",
    );
  }
  if (!isAddress(parsed.address)) {
    throw new Error(`${WALLET_FILE} has an invalid address: ${parsed.address}`);
  }
  return {
    walletId: parsed.walletId,
    address: parsed.address,
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
  };
}

export function writePersistedWallet(record: AgentWalletRecord): void {
  writeFileSync(WALLET_FILE, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8" });
}

/**
 * Construct a Dynamic EVM client and authenticate with the API token. Auth
 * failures are surfaced with their exact cause and never include the token.
 */
export async function authenticatedClient(config?: DynamicConfig): Promise<DynamicEvmWalletClient> {
  const { environmentId, apiToken } = config ?? readDynamicConfig();
  const client = new DynamicEvmWalletClient({ environmentId });
  try {
    await client.authenticateApiToken(apiToken);
  } catch (err) {
    throw new Error(`Dynamic API token authentication failed: ${(err as Error).message}`);
  }
  return client;
}

export interface GetAgentWalletParams {
  chainId: number;
  rpcUrl: string;
}

/**
 * Return a viem WalletClient for the persisted agent wallet on the given chain,
 * recovered from Dynamic. Supports chainId 5042002 (Arc) and 84532 (Base
 * Sepolia). The agent loop and any Base-side calls import this so they all reuse
 * the one wallet.
 */
export async function getAgentWallet({ chainId, rpcUrl }: GetAgentWalletParams): Promise<WalletClient> {
  const chain = SUPPORTED_CHAINS[chainId];
  if (chain === undefined) {
    throw new Error(
      `Unsupported chainId ${chainId}. getAgentWallet supports 5042002 (Arc) and 84532 (Base Sepolia).`,
    );
  }
  const persisted = readPersistedWallet();
  if (persisted === null) {
    throw new Error(
      `No persisted agent wallet at ${WALLET_FILE}. ` +
        "Run 'npm run create:wallet -w @var/agent' first.",
    );
  }

  const password = readWalletPassword();
  const client = await authenticatedClient();
  // getWallets() is the documented path whose result carries
  // externalServerKeySharesBackupInfo, which getWalletClient needs to recover
  // the MPC server key share for signing. fetchWalletMetadata() returns identity
  // only and cannot sign with auto-recovery, so it is deliberately not used.
  const wallets = await client.getWallets();
  const walletMetadata = wallets.find((w) => w.walletId === persisted.walletId);
  if (walletMetadata === undefined) {
    throw new Error(
      `Persisted walletId ${persisted.walletId} was not found in the Dynamic environment. ` +
        "The wallet file and the Dynamic environment are out of sync.",
    );
  }

  // password recovers the backed-up server key share so the client can sign.
  return client.getWalletClient({ walletMetadata, password, chain, rpcUrl });
}
