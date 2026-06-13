"use client";

import type { FeedEntry } from "@/lib/var";

function formatTs(ts?: number): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function shortenTx(hash?: string): string {
  if (!hash || hash === "0x") return "";
  return hash.length <= 14 ? hash : `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export function TxFeedWidget({ feed }: { feed: FeedEntry[] }) {
  if (!feed || feed.length === 0) {
    return (
      <div style={{ padding: "var(--sp-3)", color: "var(--muted)", fontSize: "var(--type-base)" }}>
        No mandate events yet.
      </div>
    );
  }

  return (
    <div style={{ padding: "var(--sp-2) var(--sp-3)" }}>
      {feed.map((entry, i) => {
        const color = entry.ok ? "var(--success)" : "var(--danger)";
        return (
          <div
            key={`${entry.txHash}-${i}`}
            style={{
              padding: "var(--sp-2) 0",
              borderBottom: i < feed.length - 1 ? "1px solid var(--glass-border)" : "none",
              fontSize: "var(--type-base)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-2)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                <span
                  style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, flexShrink: 0 }}
                />
                <span style={{ fontWeight: 700, color: "var(--text)", textTransform: "capitalize" }}>
                  {entry.action}
                </span>
                <span
                  style={{
                    fontSize: "var(--type-sm)",
                    fontWeight: 700,
                    padding: "2px var(--sp-2)",
                    borderRadius: "var(--r-pill)",
                    background: entry.ok ? "var(--success-soft)" : "var(--danger-soft)",
                    color,
                    border: `1px solid ${color}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {entry.action === "grant" ? "✓ attested" : "✕ revoked"}
                </span>
              </span>
              <span style={{ color: "var(--muted)", fontSize: "var(--type-xs)", fontFamily: "var(--font-data)" }}>
                {formatTs(entry.ts)}
              </span>
            </div>
            <div
              style={{
                marginTop: "2px",
                marginLeft: "16px",
                color: "var(--muted)",
                fontSize: "var(--type-sm)",
              }}
            >
              {entry.detail}
            </div>
            {shortenTx(entry.txHash) ? (
              <div
                style={{
                  marginLeft: "16px",
                  marginTop: "2px",
                  color: "var(--subtle)",
                  fontSize: "var(--type-xs)",
                  fontFamily: "var(--font-data)",
                }}
              >
                {shortenTx(entry.txHash)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
