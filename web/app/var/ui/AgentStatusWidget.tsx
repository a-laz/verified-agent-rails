"use client";

import type React from "react";
import type { StatusView } from "@/lib/var";

// Plain-English status + reason keyed by the mirror's bytes32 reason codes
// (decodeReason output), for a mixed (non-crypto) audience.
const PLAIN: Record<string, string> = {
  OK: "Allowed: mandate active",
  NO_MANDATE: "Blocked: no mandate",
  REVOKED: "Locked out: revoked",
  EXPIRED: "Blocked: mandate expired",
  OVER_CAP: "Blocked: over the cap",
  TOKEN_NOT_ALLOWED: "Blocked: token not allowed",
};

const REASON: Record<string, string> = {
  OK: "The token checked the mandate and would allow this transfer.",
  NO_MANDATE: "The agent has no mandate, so the token refuses to move funds.",
  REVOKED: "The principal revoked the mandate, so the agent is locked out.",
  EXPIRED: "The mandate has expired, so the token refuses to move funds.",
  OVER_CAP: "This amount exceeds the mandate's per-transaction cap. The leash holds even if the agent is compromised.",
  TOKEN_NOT_ALLOWED: "This token is outside the mandate's allowed asset.",
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

const buttonBase: React.CSSProperties = {
  flex: 1,
  padding: "var(--sp-2)",
  borderRadius: "var(--r-control)",
  border: "1px solid var(--glass-border)",
  fontSize: "var(--type-base)",
  fontWeight: 600,
  fontFamily: "var(--font-ui)",
  cursor: "pointer",
  background: "var(--panel-2)",
  color: "var(--text)",
  transition: "background var(--dur-fast) var(--ease-standard)",
};

export function AgentStatusWidget({
  status,
  amount,
  setAmount,
  onCheck,
  busy,
}: {
  status: StatusView | null;
  amount: string;
  setAmount: (v: string) => void;
  onCheck: () => void;
  busy: boolean;
}) {
  const reason = status?.reason ?? "";
  const isOk = reason === "OK";
  const isBlocked = reason !== "" && !isOk;
  const color = isBlocked ? "var(--danger)" : isOk ? "var(--success)" : "var(--muted)";
  const headline = reason ? (PLAIN[reason] ?? reason) : "Ready";
  const detail = reason ? (REASON[reason] ?? "") : "Enter an amount and check the gate.";

  return (
    <div style={{ padding: "var(--sp-3)", display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
        <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontSize: "clamp(1.1rem, 1.5vw, 1.4rem)", fontWeight: 800, color, lineHeight: 1.1 }}>
          {headline}
        </span>
      </div>

      <div style={{ minHeight: "44px" }}>
        <div style={{ fontSize: "var(--type-base)", color: "var(--text)", lineHeight: "var(--leading-normal)" }}>
          {detail}
        </div>
        {reason ? (
          <div
            style={{
              marginTop: "var(--sp-1)",
              fontSize: "var(--type-xs)",
              color: "var(--muted)",
              fontFamily: "var(--font-data)",
            }}
          >
            on-chain checkTransfer({status?.amount} gUSD) → {reason}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
        <label
          style={{
            fontSize: "var(--type-xs)",
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: "var(--tracking-wide)",
          }}
        >
          Amount (gUSD)
        </label>
        <input
          type="number"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={{ display: "flex", gap: "var(--sp-2)" }}>
        <button
          type="button"
          onClick={onCheck}
          disabled={busy}
          style={{
            ...buttonBase,
            background: "var(--accent)",
            color: "var(--text-on-accent)",
            borderColor: "var(--accent)",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Checking…" : "Check the gate"}
        </button>
        <button
          type="button"
          disabled
          title="Pay/Park are driven by the agent loop (next workstream). The gate check above is live."
          style={{ ...buttonBase, opacity: 0.5, cursor: "not-allowed" }}
        >
          Pay / Park (agent loop)
        </button>
      </div>
    </div>
  );
}
