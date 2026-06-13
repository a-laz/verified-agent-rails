"use client";

import React from "react";
import { useBox } from "@/contexts/BoxCacheContext";

// Mirrors SPEC §3.4 box key: var/tx_feed (newest first, cap 20)
interface TxFeedEntry {
  action: string;
  ok: boolean;
  code: number;
  message: string;
  txHash: string;
  amount: number | string;
  ts: number; // unix seconds
}

function formatTs(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function shortenTx(hash?: string): string {
  if (!hash) return "";
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

// Plain-English context per action, for judges skimming at projection distance.
const ACTION_CTX: Record<string, string> = {
  grant: "leash granted",
  pay: "paid a service",
  park: "swept to yield",
  revoke: "leash pulled",
  check: "attempt",
};

export function TxFeedWidget() {
  const data = useBox<TxFeedEntry[]>("var/tx_feed");

  if (!data || data.length === 0) {
    return (
      <div style={{ padding: "var(--sp-3)", color: "var(--muted)", fontSize: "var(--type-base)" }}>
        No transactions yet.
      </div>
    );
  }

  return (
    <div style={{ padding: "var(--sp-2) var(--sp-3)" }}>
      {data.map((entry, i) => {
        const color = entry.ok ? "var(--success)" : "var(--danger)";
        return (
          <div
            key={`${entry.txHash || "noop"}-${entry.ts}-${i}`}
            style={{
              padding: "var(--sp-2) 0",
              borderBottom:
                i < data.length - 1 ? "1px solid var(--glass-border)" : "none",
              fontSize: "var(--type-base)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "var(--sp-2)",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontWeight: 700, color: "var(--text)", textTransform: "capitalize", fontSize: "var(--type-base)" }}>
                  {entry.action}
                </span>
                {ACTION_CTX[entry.action] ? (
                  <span style={{ color: "var(--muted)", fontSize: "var(--type-xs)" }}>· {ACTION_CTX[entry.action]}</span>
                ) : null}
                {entry.amount ? (
                  <span style={{ color: "var(--muted)", fontFamily: "var(--font-data)" }}>
                    {entry.amount} gUSDC
                  </span>
                ) : null}
                <span
                  style={{
                    fontSize: "var(--type-sm)",
                    fontWeight: 700,
                    padding: "2px var(--sp-2)",
                    borderRadius: "var(--r-pill)",
                    background: entry.ok ? "var(--success-soft)" : "var(--danger-soft)",
                    color: entry.ok ? "var(--success)" : "var(--danger)",
                    border: `1px solid ${entry.ok ? "var(--success)" : "var(--danger)"}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {entry.ok ? "✓ mandate-verified" : "✕ blocked"}
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
                color: entry.ok ? "var(--text)" : "var(--danger)",
                opacity: entry.ok ? 0.8 : 1,
                fontSize: "var(--type-sm)",
              }}
            >
              <span style={{ fontFamily: "var(--font-data)" }}>[{entry.code}]</span> {entry.message}
            </div>
            {entry.txHash ? (
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
