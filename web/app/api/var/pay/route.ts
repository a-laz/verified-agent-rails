// The agent spends, through the gate. The agent's own MPC wallet signs a
// GatedUSD transfer to the ServiceSink; the mirror's mandate caps it. We
// pre-check the mirror's gate (checkTransfer) so an over-cap attempt returns the
// exact reason without a failed tx, then the agent sends the real transfer. This
// is the "leash holds even if the agent is compromised" demonstration.
import { NextResponse } from "next/server";
import { createPublicClient, getAddress, http, isAddress, type Address } from "viem";
import {
  arcTestnet,
  ADDRESSES,
  DELEGATION_MIRROR_ADDRESS,
  DelegationMirrorAbi,
  GatedUSDAbi,
  decodeReason,
  parseUSDC,
} from "@var/shared";
import { getAgentSigner } from "@/lib/agentWallet.server";
import { crossOriginBlocked } from "@/lib/sameOrigin";

export const runtime = "nodejs";

const GUSD: Address = ADDRESSES.GatedUSD.address;
const SERVICE_SINK: Address = ADDRESSES.ServiceSink.address;

function arcPublic() {
  return createPublicClient({
    chain: arcTestnet,
    transport: process.env.ARC_TESTNET_RPC_URL ? http(process.env.ARC_TESTNET_RPC_URL) : http(),
  });
}

export async function POST(req: Request) {
  const blocked = crossOriginBlocked(req);
  if (blocked) return blocked;

  let body: { agent?: string; amount?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.agent || !isAddress(body.agent)) {
    return NextResponse.json({ error: "Missing or invalid agent address." }, { status: 400 });
  }
  const agent = getAddress(body.agent);
  const amount = body.amount && body.amount !== "" ? body.amount : "5";
  const amountWei = parseUSDC(amount);

  const pub = arcPublic();
  try {
    // 1. Ask the mirror's own gate first — authoritative, never reverts.
    const [ok, reasonRaw] = await pub.readContract({
      address: DELEGATION_MIRROR_ADDRESS,
      abi: DelegationMirrorAbi,
      functionName: "checkTransfer",
      args: [agent, GUSD, amountWei],
    });
    const reason = decodeReason(reasonRaw);
    if (!ok) {
      // The leash holds: report the reason, move no funds.
      return NextResponse.json({ ok: false, blocked: true, reason, amount });
    }

    // 2. Recover the agent's MPC wallet (it must be the sender the gate checks).
    const { walletClient, address: signerAddress } = await getAgentSigner();
    if (getAddress(signerAddress) !== agent) {
      return NextResponse.json(
        {
          error: `Configured agent wallet (${signerAddress}) is not the requested agent (${agent}).`,
        },
        { status: 409 },
      );
    }

    // 3. Funding checks with actionable messages (fund via Grant).
    const [gas, gusdBal] = await Promise.all([
      pub.getBalance({ address: agent }),
      pub.readContract({ address: GUSD, abi: GatedUSDAbi, functionName: "balanceOf", args: [agent] }),
    ]);
    if (gas === 0n) {
      return NextResponse.json(
        { error: "Agent has no native USDC for gas. Grant the leash to provision it." },
        { status: 409 },
      );
    }
    if (gusdBal < amountWei) {
      return NextResponse.json(
        { error: "Agent's gUSD balance is below this amount. Grant a larger budget." },
        { status: 409 },
      );
    }

    // 4. The agent pays the service, gated by its mandate.
    const hash = await walletClient.writeContract({
      account: walletClient.account!,
      chain: arcTestnet,
      address: GUSD,
      abi: GatedUSDAbi,
      functionName: "transfer",
      args: [SERVICE_SINK, amountWei],
    });
    await pub.waitForTransactionReceipt({ hash });
    return NextResponse.json({ ok: true, reason, amount, txHash: hash, to: SERVICE_SINK });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
