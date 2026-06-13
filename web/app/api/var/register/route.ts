// In-browser AgentBook registration: forwards a World ID proof to the hosted,
// gasless relay (the same one @worldcoin/agentkit-cli register uses), which
// submits register(agent, root, nonce, nullifierHash, proof) on World Chain and
// returns the tx hash. Proxied server-side so the browser isn't blocked by CORS.
import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { AGENT_BOOK_ADDRESS, REGISTER_RELAY_URL, type RegistrationPayload } from "@/lib/worldid";
import { crossOriginBlocked } from "@/lib/sameOrigin";

export const runtime = "nodejs";

const HEX = /^0x[0-9a-fA-F]+$/;

export async function POST(req: Request) {
  const blocked = crossOriginBlocked(req);
  if (blocked) return blocked;

  let body: Partial<RegistrationPayload>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Validate the shape the relay + contract expect before spending a relay call.
  if (!body.agent || !isAddress(body.agent)) {
    return NextResponse.json({ error: "Missing or invalid agent address." }, { status: 400 });
  }
  if (!body.root || !HEX.test(body.root) || !body.nullifierHash || !HEX.test(body.nullifierHash)) {
    return NextResponse.json({ error: "Missing or invalid proof roots." }, { status: 400 });
  }
  if (typeof body.nonce !== "string" || body.nonce === "") {
    return NextResponse.json({ error: "Missing nonce." }, { status: 400 });
  }
  if (!Array.isArray(body.proof) || body.proof.length !== 8 || !body.proof.every((p) => HEX.test(p))) {
    return NextResponse.json({ error: "Proof must be a uint256[8] hex array." }, { status: 400 });
  }

  const payload: RegistrationPayload = {
    agent: getAddress(body.agent),
    root: body.root,
    nonce: body.nonce,
    nullifierHash: body.nullifierHash,
    proof: body.proof,
    contract: AGENT_BOOK_ADDRESS,
  };

  const registerUrl = `${REGISTER_RELAY_URL.replace(/\/$/, "")}/register`;
  try {
    const relayRes = await fetch(registerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await relayRes.text();
    if (!relayRes.ok) {
      return NextResponse.json(
        { error: `Relay ${relayRes.status}: ${text}` },
        { status: 502 },
      );
    }
    // Relay returns { txHash }.
    let result: { txHash?: string };
    try {
      result = JSON.parse(text);
    } catch {
      result = {};
    }
    return NextResponse.json({ agent: payload.agent, txHash: result.txHash ?? null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
