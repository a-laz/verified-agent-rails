"use client";

import type React from "react";
import type { MandateView } from "@/lib/var";

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

const labelStyle: React.CSSProperties = {
  fontSize: "var(--type-xs)",
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: "var(--tracking-wide)",
};

export function GrantRevokePanel({
  mandate,
  spendCap,
  setSpendCap,
  fundBudget,
  setFundBudget,
  expiryMinutes,
  setExpiryMinutes,
  onGrant,
  onRevoke,
  busy,
  connected,
}: {
  mandate: MandateView | null;
  spendCap: string;
  setSpendCap: (v: string) => void;
  fundBudget: string;
  setFundBudget: (v: string) => void;
  expiryMinutes: string;
  setExpiryMinutes: (v: string) => void;
  onGrant: () => void;
  onRevoke: () => void;
  busy: string | null;
  connected: boolean;
}) {
  const active = !!mandate && mandate.active && !mandate.revoked;
  const disabled = busy !== null || !connected;

  return (
    <div style={{ padding: "var(--sp-3)", display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
        <label style={labelStyle}>Spend cap (gUSD per transaction)</label>
        <input type="number" min="0" value={spendCap} onChange={(e) => setSpendCap(e.target.value)} style={inputStyle} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
        <label style={labelStyle}>Fund agent (gUSD budget)</label>
        <input
          type="number"
          min="0"
          value={fundBudget}
          onChange={(e) => setFundBudget(e.target.value)}
          style={inputStyle}
        />
        <span style={{ fontSize: "var(--type-2xs)", color: "var(--subtle)" }}>
          Granting also funds the agent (gas + this gUSD budget) from your wallet.
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
        <label style={labelStyle}>Expiry (minutes)</label>
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
          onClick={onGrant}
          disabled={disabled}
          title="An attestor signs the mandate server-side; your connected wallet relays it (pays gas)."
          style={{
            ...buttonBase,
            flex: 1,
            background: "var(--accent)",
            color: "var(--text-on-accent)",
            borderColor: "var(--accent)",
            fontSize: "var(--type-lg)",
            padding: "var(--sp-3)",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          {busy === "grant" ? "Granting & funding…" : "Grant & fund the agent"}
        </button>
        <button
          type="button"
          onClick={onRevoke}
          disabled={disabled || !active}
          title="Principal-only: your connected wallet must be the mandate's principal."
          style={{
            ...buttonBase,
            background: "var(--danger)",
            color: "var(--text-inverse)",
            borderColor: "var(--danger)",
            opacity: disabled || !active ? 0.5 : 1,
          }}
        >
          {busy === "revoke" ? "Revoking…" : "Revoke"}
        </button>
      </div>

      <div style={{ fontSize: "var(--type-xs)", color: active ? "var(--success)" : "var(--muted)", fontWeight: 600 }}>
        {connected
          ? `Mandate: ${mandate?.revoked ? "revoked" : active ? "active" : "none"}`
          : "Connect a wallet (top right) to grant or revoke."}
      </div>
    </div>
  );
}
