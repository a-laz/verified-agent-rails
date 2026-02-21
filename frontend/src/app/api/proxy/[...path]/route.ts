/**
 * Reverse proxy — forwards /api/proxy/* to the Python backend.
 *
 * Why: ngrok free-tier intercepts browser CORS preflight (OPTIONS) requests
 * with an interstitial page, stripping CORS headers. By proxying through
 * a Next.js API route, all browser calls are same-origin (no CORS) and
 * the server-side fetch to ngrok skips the interstitial.
 */

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function handler(
  req: Request,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join("/");
  const target = `${BACKEND_URL}/api/${path}`;

  const headers = new Headers();
  headers.set("Content-Type", req.headers.get("Content-Type") || "application/json");
  headers.set("ngrok-skip-browser-warning", "true");

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  // Forward body for POST/PUT/PATCH
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }

  const upstream = await fetch(target, init);

  // For SSE streaming responses, pipe through directly
  if (
    upstream.headers.get("content-type")?.includes("text/event-stream") ||
    upstream.headers.get("transfer-encoding") === "chunked"
  ) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // Regular JSON responses
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
    },
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
