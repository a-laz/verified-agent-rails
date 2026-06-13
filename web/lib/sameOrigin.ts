import { NextResponse } from "next/server";

// Lightweight CSRF / drive-by guard for privileged mutating routes (mint wallet,
// sign mandate, spend). Rejects cross-origin browser requests; allows same-origin
// (the dashboard itself) and non-browser callers (no Origin header, e.g. curl /
// server-to-server). This is NOT a substitute for real authentication: a public
// deployment must add a session/JWT check and per-identity rate limiting before
// these endpoints can be exposed.
export function crossOriginBlocked(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) return null; // non-browser caller; nothing to forge
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return NextResponse.json({ error: "Malformed Origin header." }, { status: 403 });
  }
  const host = req.headers.get("host");
  if (host && originHost !== host) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }
  return null;
}
