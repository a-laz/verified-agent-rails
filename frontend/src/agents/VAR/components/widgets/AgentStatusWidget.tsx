"use client";

import React from "react";
import { useBox } from "@/contexts/BoxCacheContext";

// Mirrors SPEC §3.4 box key: var/status
interface VarStatus {
  state: "idle" | "rejected" | "cleared" | "paid" | "parked" | "revoked";
  action: string;
  ok: boolean;
  code: number;
  message: string;
  txHash: string;
}

// /api/proxy/<path> → backend /api/<path>.
async function postVar(path: string, body?: Record<string, unknown>): Promise<void> {
  await fetch(`/api/proxy/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

const stateColor = (s?: string): string => {
  switch (s) {
    case "cleared":
    case "paid":
    case "parked":
      return "var(--success)";
    case "rejected":
    case "revoked":
      return "var(--danger)";
    case "idle":
    default:
      return "var(--muted)";
  }
};

// Plain-English status + reason for a mixed (non-crypto) judging audience.
const PLAIN: Record<string, string> = {
  idle: "Ready",
  rejected: "Blocked — no mandate",
  cleared: "Allowed — mandate active",
  paid: "Paid — within mandate",
  parked: "Parked — within mandate",
  revoked: "Locked out — revoked",
  overcap: "Blocked — over the cap",
};

const REASON: Record<string, string> = {
  idle: "Trigger a payment below to test the gate.",
  rejected: "The agent has no mandate, so the token refused to move the funds.",
  cleared: "The token checked the mandate and allowed the transfer.",
  paid: "Paid a service autonomously — inside the mandate's cap and scope.",
  parked: "Swept idle funds to a yield vault — still inside the mandate.",
  revoked: "The human revoked the mandate — the agent is locked out next block.",
  overcap: "The transfer exceeds the mandate's per-transaction spend cap, so the token refused it. The leash holds even if the agent is compromised.",
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

export function AgentStatusWidget() {
  const data = useBox<VarStatus>("var/status");
  const [amount, setAmount] = React.useState("25");
  const [busy, setBusy] = React.useState<string | null>(null);

  const trigger = async (path: string) => {
    setBusy(path);
    try {
      await postVar(path, { amount: Number(amount) });
    } finally {
      setBusy(null);
    }
  };

  const state = data?.state ?? "idle";
  // Distinguish revoke (code 2) and over-cap (code 4) from a plain no-mandate rejection,
  // so the panel never shows "Blocked — no mandate" when the human actually revoked.
  let key = state;
  if (state === "rejected" && data?.code === 2) key = "revoked";
  if (state === "rejected" && data?.code === 4) key = "overcap";
  const isBlocked = key === "rejected" || key === "revoked" || key === "overcap";
  const isOk = key === "cleared" || key === "paid" || key === "parked";
  const color = isBlocked ? "var(--danger)" : isOk ? "var(--success)" : "var(--muted)";

  return (
    <div style={{ padding: "var(--sp-3)", display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
        <span
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: "clamp(1.2rem, 1.6vw, 1.5rem)",
            fontWeight: 800,
            color,
            lineHeight: 1.1,
          }}
        >
          {PLAIN[key] ?? key}
        </span>
      </div>

      <div style={{ minHeight: "40px" }}>
        <div
          style={{
            fontSize: "var(--type-base)",
            color: "var(--text)",
            lineHeight: "var(--leading-normal)",
          }}
        >
          {REASON[key] ?? (data?.message || "No activity yet.")}
        </div>
        {data?.message ? (
          <div
            style={{
              marginTop: "var(--sp-1)",
              fontSize: "var(--type-xs)",
              color: "var(--muted)",
              fontFamily: "var(--font-data)",
            }}
          >
            on-chain: [{data.code}] {data.message}
          </div>
        ) : null}
        {data?.txHash ? (
          <div
            style={{
              marginTop: "2px",
              fontSize: "var(--type-xs)",
              color: "var(--muted)",
              fontFamily: "var(--font-data)",
              wordBreak: "break-all",
            }}
          >
            tx {data.txHash}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
        <label style={{ fontSize: "var(--type-xs)", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}>
          Amount (gUSDC)
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
          onClick={() => trigger("var/check")}
          disabled={busy !== null}
          style={{ ...buttonBase, opacity: busy !== null ? 0.6 : 1 }}
        >
          {busy === "var/check" ? "…" : "Check"}
        </button>
        <button
          type="button"
          onClick={() => trigger("var/pay")}
          disabled={busy !== null}
          style={{
            ...buttonBase,
            background: "var(--accent)",
            color: "var(--text-inverse)",
            borderColor: "var(--accent)",
            opacity: busy !== null ? 0.6 : 1,
          }}
        >
          {busy === "var/pay" ? "…" : "Pay"}
        </button>
        <button
          type="button"
          onClick={() => trigger("var/park")}
          disabled={busy !== null}
          style={{
            ...buttonBase,
            background: "var(--ai)",
            color: "var(--text-inverse)",
            borderColor: "var(--ai)",
            opacity: busy !== null ? 0.6 : 1,
          }}
        >
          {busy === "var/park" ? "…" : "Park"}
        </button>
      </div>
    </div>
  );
}
