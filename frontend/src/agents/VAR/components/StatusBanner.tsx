"use client";

import React from "react";
import { useBox } from "@/contexts/BoxCacheContext";

// Mirrors var/status
interface VarStatus {
  state: "idle" | "rejected" | "cleared" | "paid" | "parked" | "revoked";
  action: string;
  ok: boolean;
  code: number;
  message: string;
  txHash: string;
}

type Tone = "danger" | "success" | "neutral";

interface Beat {
  tone: Tone;
  icon: string;
  head: string;
  sub: string;
}

const BEATS: Record<string, Beat> = {
  rejected: {
    tone: "danger",
    icon: "⛔",
    head: "REJECTED — the token refused the transfer",
    sub: "The agent has no valid mandate. No accountable human behind it, no movement.",
  },
  revoked: {
    tone: "danger",
    icon: "🔒",
    head: "REVOKED — the human pulled the leash, agent locked out next block",
    sub: "One click killed the mandate. From the next block every transfer reverts — the agent is dead with no kill switch in its own code. Accountability with one click.",
  },
  cleared: {
    tone: "success",
    icon: "✓",
    head: "CLEARED — mandate verified on-chain",
    sub: "The token checked the agent's mandate in a single view call and allowed the transfer.",
  },
  paid: {
    tone: "success",
    icon: "✓",
    head: "PAID — settled in stablecoin, on-leash",
    sub: "The agent paid a service autonomously, within its mandate's spend cap and asset scope.",
  },
  parked: {
    tone: "success",
    icon: "✓",
    head: "PARKED — idle funds swept to yield, still on-leash",
    sub: "Autonomous, but only into assets the mandate permits. The leash holds even here.",
  },
  overcap: {
    tone: "danger",
    icon: "🛑",
    head: "BLOCKED — transfer exceeds the spend cap",
    sub: "The agent tried to move more than its mandate allows. The cap held — the token refused. The leash can't be exceeded, even if the agent is compromised or tricked.",
  },
};

const NEUTRAL: Beat = {
  tone: "neutral",
  icon: "▶",
  head: "Walk the arc",
  sub: "Use the controls below: the agent will be rejected with no mandate, then the human grants one, the agent transacts, and the human revokes.",
};

const toneColors: Record<Tone, { fg: string; bg: string; border: string }> = {
  danger: { fg: "var(--danger)", bg: "var(--danger-soft)", border: "var(--danger)" },
  success: { fg: "var(--success)", bg: "var(--success-soft)", border: "var(--success)" },
  neutral: { fg: "var(--muted)", bg: "var(--glass-bg)", border: "var(--glass-border)" },
};

export function StatusBanner() {
  const status = useBox<VarStatus>("var/status");
  // A post-revoke rejection (code 2) is the "locked out" climax — show the
  // REVOKED beat, not a generic rejection, so the kill-shot reads loud.
  let beatKey: string | undefined = status?.state;
  if (status?.state === "rejected" && status?.code === 2) beatKey = "revoked";
  if (status?.state === "rejected" && status?.code === 4) beatKey = "overcap";
  const beat = (beatKey && BEATS[beatKey]) || NEUTRAL;
  const c = toneColors[beat.tone];

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--sp-4)",
        padding: "var(--sp-4) var(--sp-5)",
        margin: "0",
        background: c.bg,
        borderBottom: `1px solid var(--glass-border)`,
        borderLeft: `4px solid ${c.border}`,
        transition: "background var(--dur-med, 0.25s) var(--ease-standard), border-color var(--dur-med, 0.25s)",
      }}
    >
      <span
        style={{
          fontSize: "2rem",
          lineHeight: 1,
          color: c.fg,
          flexShrink: 0,
        }}
      >
        {beat.icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(1.05rem, 1.7vw, 1.5rem)",
            fontWeight: 800,
            color: c.fg,
            letterSpacing: "0.01em",
            lineHeight: 1.15,
          }}
        >
          {beat.head}
        </div>
        <div
          style={{
            marginTop: "2px",
            fontSize: "clamp(0.85rem, 1vw, 0.98rem)",
            color: "var(--text)",
            opacity: 0.85,
            lineHeight: "var(--leading-normal)",
          }}
        >
          {beat.sub}
          {status?.message && beat.tone !== "neutral" ? (
            <span style={{ color: "var(--muted)", fontFamily: "var(--font-data)" }}>
              {"  ·  "}
              [{status.code}] {status.message}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
