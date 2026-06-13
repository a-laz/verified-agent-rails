// Server-only: recover the agent's Dynamic MPC wallet as a viem WalletClient on
// Arc, so the agent itself can sign gated spends (/api/var/pay). Mirrors the
// agent workspace's getAgentWallet, but sources the walletId + credentials from
// web/.env.local instead of the persisted file. Secrets never reach the browser.
import type { Address, WalletClient } from "viem";
import { arcTestnet } from "@var/shared";
import { DynamicEvmWalletClient } from "@dynamic-labs-wallet/node-evm";

interface AgentSigner {
  walletClient: WalletClient;
  address: Address;
}

function readConfig() {
  const environmentId = process.env.DYNAMIC_ENVIRONMENT_ID;
  const apiToken = process.env.DYNAMIC_API_TOKEN ?? process.env.DYNAMIC_AUTH_TOKEN;
  const password = process.env.AGENT_WALLET_PASSWORD;
  const walletId = process.env.AGENT_WALLET_ID;
  const missing = [
    environmentId ? null : "DYNAMIC_ENVIRONMENT_ID",
    apiToken ? null : "DYNAMIC_API_TOKEN",
    password ? null : "AGENT_WALLET_PASSWORD",
    walletId ? null : "AGENT_WALLET_ID",
  ].filter((n): n is string => n !== null);
  if (missing.length > 0) {
    throw new Error(
      `Missing agent wallet config in web/.env.local: ${missing.join(", ")}. ` +
        "Copy them from agent/.env and agent/.agent-wallet.json.",
    );
  }
  return {
    environmentId: environmentId as string,
    apiToken: apiToken as string,
    password: password as string,
    walletId: walletId as string,
  };
}

function arcRpcUrl(): string {
  return process.env.ARC_TESTNET_RPC_URL ?? arcTestnet.rpcUrls.default.http[0];
}

// Recover a signing WalletClient for the persisted agent wallet on Arc. Uses
// getWallets() (carries the backup info getWalletClient needs to recover the MPC
// server key share) + the backup password — same path as the agent workspace.
export async function getAgentSigner(): Promise<AgentSigner> {
  const { environmentId, apiToken, password, walletId } = readConfig();
  const client = new DynamicEvmWalletClient({ environmentId });
  await client.authenticateApiToken(apiToken);

  const wallets = await client.getWallets();
  const walletMetadata = wallets.find((w) => w.walletId === walletId);
  if (!walletMetadata) {
    throw new Error(
      `Configured AGENT_WALLET_ID ${walletId} not found in the Dynamic environment.`,
    );
  }

  const walletClient = await client.getWalletClient({
    walletMetadata,
    password,
    chain: arcTestnet,
    rpcUrl: arcRpcUrl(),
  });
  return { walletClient, address: walletClient.account!.address };
}
