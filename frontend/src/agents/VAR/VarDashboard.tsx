"use client";

import React from "react";
import { useBox } from "@/contexts/BoxCacheContext";
import { Hero } from "./components/Hero";
import { StatusBanner } from "./components/StatusBanner";
import { StepTracker } from "./components/StepTracker";
import { VarCard } from "./components/VarCard";
import { GrantRevokePanel } from "./components/widgets/GrantRevokePanel";
import { MandateWidget } from "./components/widgets/MandateWidget";
import { AgentStatusWidget } from "./components/widgets/AgentStatusWidget";
import { TxFeedWidget } from "./components/widgets/TxFeedWidget";

interface Mandate {
  agent?: string;
  active: boolean;
  revoked: boolean;
}
interface VarStatus {
  state: "idle" | "rejected" | "cleared" | "paid" | "parked" | "revoked";
}
interface Balances {
  agentToken: number;
  serviceToken: number;
  vaultShares: number;
}

function fmt(n?: number): string {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function BalancesPanel() {
  const b = useBox<Balances>("var/balances");
  const cell = (label: string, value: string, hint: string) => (
    <div style={{ flex: 1, padding: "var(--sp-3)", minWidth: 0 }}>
      <div style={{ fontSize: "var(--type-xs)", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-data)",
          fontSize: "clamp(1.1rem, 1.5vw, 1.4rem)",
          fontWeight: 700,
          color: "var(--text)",
          marginTop: "2px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: "var(--type-xs)", color: "var(--subtle)" }}>{hint}</div>
    </div>
  );
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap" }}>
        {cell("Agent wallet", fmt(b?.agentToken), "gUSDC the agent holds")}
        {cell("Service paid", fmt(b?.serviceToken), "received from the agent")}
        {cell("Yield vault", fmt(b?.vaultShares), "parked, on-leash")}
      </div>
      <div
        style={{
          padding: "0 var(--sp-3) var(--sp-3)",
          fontSize: "var(--type-xs)",
          color: "var(--muted)",
          lineHeight: "var(--leading-normal)",
        }}
      >
        The mandate's <strong style={{ color: "var(--text)" }}>per-transaction cap</strong> limits every transfer — the
        agent moves money autonomously, but can never drain the wallet.
      </div>
    </div>
  );
}

export default function VarDashboard() {
  const mandate = useBox<Mandate>("var/mandate");
  const status = useBox<VarStatus>("var/status");

  // First-paint momentum: kick the read-only "check" probe once on mount so a cold
  // judge immediately lands on the live REJECTED beat (no payment — just a probe).
  const kicked = React.useRef(false);
  React.useEffect(() => {
    if (kicked.current) return;
    kicked.current = true;
    fetch("/api/proxy/var/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 10 }),
    }).catch(() => {});
  }, []);

  const mandateActive = !!mandate && mandate.active && !mandate.revoked;
  const leashTone: "neutral" | "success" | "danger" = mandate?.revoked
    ? "danger"
    : mandateActive
    ? "success"
    : "neutral";

  const s = status?.state;
  const agentTone: "neutral" | "success" | "danger" =
    s === "rejected" || s === "revoked"
      ? "danger"
      : s === "cleared" || s === "paid" || s === "parked"
      ? "success"
      : "neutral";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <Hero />
      <StatusBanner />
      <StepTracker />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gridAutoRows: "min-content",
          gap: "var(--sp-4)",
          padding: "var(--sp-4) var(--sp-5)",
        }}
      >
        <VarCard
          title="The Leash — active mandate"
          subtitle="The scope the human granted: spend cap · expiry · revocable"
          tone={leashTone}
        >
          <MandateWidget />
        </VarCard>

        <VarCard
          title="Human control — grant / revoke"
          subtitle="Verify once, hand the agent a scoped leash — or yank it back"
        >
          <GrantRevokePanel />
        </VarCard>

        <VarCard
          title="Is the agent allowed?"
          subtitle="Enforced on-chain at the token (ERC-7943) — one view call, no relayer, no off-chain check"
          tone={agentTone}
        >
          <AgentStatusWidget />
        </VarCard>

        <VarCard title="Where the money is" subtitle="Real balances move only when the mandate allows it">
          <BalancesPanel />
        </VarCard>

        <VarCard
          title="On-chain activity"
          subtitle="Every gated transfer, newest first  ·  green chip = mandate verified  ·  red chip = blocked"
          style={{ gridColumn: "1 / -1" }}
        >
          <TxFeedWidget />
        </VarCard>
      </div>
    </div>
  );
}
