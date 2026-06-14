// Mint a fresh Dynamic MPC server wallet to back a new agent, then the gate
// registers it via World ID. Mirrors agent/src/createAgentWallet.ts but is
// non-idempotent (each call is a new wallet) and sources credentials from
// web/.env.local. Server-only; secrets never reach the browser.
import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { DynamicEvmWalletClient } from "@dynamic-labs-wallet/node-evm";
import { ThresholdSignatureScheme } from "@dynamic-labs-wallet/core";
import { crossOriginBlocked } from "@/lib/sameOrigin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const blocked = crossOriginBlocked(req);
  if (blocked) return blocked;

  const environmentId = process.env.DYNAMIC_ENVIRONMENT_ID;
  const apiToken = process.env.DYNAMIC_API_TOKEN ?? process.env.DYNAMIC_AUTH_TOKEN;
  const password = process.env.AGENT_WALLET_PASSWORD;
  if (!environmentId || !apiToken || !password) {
    return NextResponse.json(
      {
        error:
          "Missing Dynamic config in web/.env.local (DYNAMIC_ENVIRONMENT_ID, DYNAMIC_API_TOKEN, AGENT_WALLET_PASSWORD).",
      },
      { status: 500 },
    );
  }

  try {
    const client = new DynamicEvmWalletClient({ environmentId });
    await client.authenticateApiToken(apiToken);

    const { walletMetadata } = await client.createWalletAccount({
      thresholdSignatureScheme: ThresholdSignatureScheme.TWO_OF_TWO,
      // Back the server key share up to Dynamic (password-encrypted) so the
      // wallet stays recoverable for signing without persisting a secret.
      password,
      backUpToDynamic: true,
    });

    const address = walletMetadata.accountAddress;
    if (!isAddress(address)) {
      return NextResponse.json({ error: `Dynamic returned an invalid address: ${address}` }, { status: 502 });
    }
    return NextResponse.json({ walletId: walletMetadata.walletId, address: getAddress(address) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
