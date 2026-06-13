"use client";

import React from "react";
import { useBox } from "@/contexts/BoxCacheContext";

// Mirrors SPEC §3.4 box key: var/mandate
interface Mandate {
  agent: string;
  human: string;
  spendCap: string | number;
  asset: string;
  expiry: number;
  revoked: boolean;
  active: boolean;
}

// POST to the var router via the existing reverse proxy.
// /api/proxy/<path> → backend /api/<path>, so "var/grant" → /api/var/grant.
async function postVar(path: string, body?: Record<string, unknown>): Promise<void> {
  await fetch(`/api/proxy/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

const buttonBase: React.CSSProperties = {
  padding: "var(--sp-2) var(--sp-3)",
  borderRadius: "var(--r-control)",
  border: "1px solid var(--glass-border)",
  fontSize: "var(--type-base)",
  fontWeight: 600,
  fontFamily: "var(--font-ui)",
  cursor: "pointer",
  transition: "background var(--dur-fast) var(--ease-standard)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "var(--sp-2)",
  borderRadius: "var(--r-control)",
  border: "1px solid var(--border-control)",
  background: "var(--panel)",
  color: "var(--text)",
  fontSize: "var(--type-base)",
  fontFamily: "var(--font-data)",
};

export function GrantRevokePanel() {
  const mandate = useBox<Mandate>("var/mandate");
  const [spendCap, setSpendCap] = React.useState("100");
  const [expiryMinutes, setExpiryMinutes] = React.useState("60");
  const [busy, setBusy] = React.useState<string | null>(null);

  const active = !!mandate && mandate.active && !mandate.revoked;

  const runGrant = async () => {
    setBusy("grant");
    try {
      await postVar("var/grant", {
        spendCap: Number(spendCap),
        expiryMinutes: Number(expiryMinutes),
      });
    } finally {
      setBusy(null);
    }
  };

  const runRevoke = async () => {
    setBusy("revoke");
    try {
      await postVar("var/revoke");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ padding: "var(--sp-3)", display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
        <label style={{ fontSize: "var(--type-xs)", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}>
          Spend cap (gUSDC per transaction)
        </label>
        <input
          type="number"
          min="0"
          value={spendCap}
          onChange={(e) => setSpendCap(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
        <label style={{ fontSize: "var(--type-xs)", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}>
          Expiry (minutes)
        </label>
        <input
          type="number"
          min="1"
          value={expiryMinutes}
          onChange={(e) => setExpiryMinutes(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={runGrant}
          disabled={busy !== null}
          style={{
            ...buttonBase,
            flex: 1,
            background: "var(--accent)",
            color: "var(--text-inverse)",
            borderColor: "var(--accent)",
            fontSize: "var(--type-lg)",
            padding: "var(--sp-3)",
            opacity: busy !== null ? 0.6 : 1,
          }}
        >
          {busy === "grant" ? "Granting…" : "Grant the leash"}
        </button>
        <button
          type="button"
          onClick={runRevoke}
          disabled={busy !== null}
          style={{
            ...buttonBase,
            background: "var(--danger)",
            color: "var(--text-inverse)",
            borderColor: "var(--danger)",
            opacity: busy !== null ? 0.6 : 1,
          }}
        >
          {busy === "revoke" ? "Revoking…" : "Revoke"}
        </button>
      </div>

      <button
        type="button"
        onClick={runGrant}
        disabled={busy !== null}
        title="Local stub — stands in for an external proof-of-personhood flow; calls grant directly."
        style={{
          ...buttonBase,
          background: "var(--ai-soft)",
          color: "var(--ai)",
          borderColor: "var(--ai)",
          opacity: busy !== null ? 0.6 : 1,
        }}
      >
        Verify with World ID (local stub)
      </button>

      <div
        style={{
          fontSize: "var(--type-xs)",
          color: active ? "var(--success)" : "var(--muted)",
          fontWeight: 600,
        }}
      >
        Mandate: {mandate?.revoked ? "revoked" : active ? "active" : "none"}
      </div>
    </div>
  );
}
