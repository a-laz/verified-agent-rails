// Agent registration status on World Chain: drives the login gate (is the human
// behind this agent verified?) and hands the client the next nonce the World ID
// signal must bind to. Pure reads, no secrets.
import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { getAgentStatus } from "@/lib/agentbook.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Missing or invalid agent address." }, { status: 400 });
  }
  try {
    const status = await getAgentStatus(getAddress(address));
    return NextResponse.json(status);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
