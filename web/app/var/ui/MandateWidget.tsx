"use client";

import React from "react";
import { shortAddr, type MandateView } from "@/lib/var";

function useCountdown(expiry?: number): string {
  const [now, setNow] = React.useState(() => Math.floor(Date.now() / 1000));
  React.useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  if (!expiry) return "-";
  const remaining = expiry - now;
  if (remaining <= 0) return "expired";
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function MandateWidget({ mandate }: { mandate: MandateView | null }) {
  const countdown = useCountdown(mandate?.expiry);

  if (!mandate || !mandate.exists) {
    // Show the solution shape up front (greyed placeholder) so the value of a
    // grant is legible before one exists.
    const ph = (label: string) => (
      <div
        key={label}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "var(--sp-1) 0",
          fontSize: "var(--type-base)",
        }}
      >
        <span style={{ color: "var(--muted)" }}>{label}</span>
        <span style={{ color: "var(--subtle)", fontFamily: "var(--font-data)" }}>-</span>
      </div>
    );
    return (
      <div style={{ padding: "var(--sp-2) var(--sp-3)" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--sp-1)",
            padding: "2px var(--sp-2)",
            borderRadius: "var(--r-pill)",
            background: "var(--glass-bg)",
            border: "1px dashed var(--glass-border)",
            color: "var(--muted)",
            fontSize: "var(--type-xs)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "var(--tracking-wide)",
            marginBottom: "var(--sp-2)",
          }}
        >
          Awaiting grant
        </div>
        <div
          style={{
            fontSize: "var(--type-sm)",
            color: "var(--muted)",
            marginBottom: "var(--sp-2)",
            lineHeight: "var(--leading-normal)",
          }}
        >
          No leash yet. The token refuses every transfer. A grant fills in:
        </div>
        {ph("Spend cap (per tx)")}
        {ph("Asset")}
        {ph("Expires in")}
      </div>
    );
  }

  const expired = mandate.expiry > 0 && mandate.expiry <= Math.floor(Date.now() / 1000);

  let badgeLabel = "Active";
  let badgeBg = "var(--success-soft)";
  let badgeColor = "var(--success)";
  if (mandate.revoked) {
    badgeLabel = "Revoked";
    badgeBg = "var(--danger-soft)";
    badgeColor = "var(--danger)";
  } else if (expired || !mandate.active) {
    badgeLabel = expired ? "Expired" : "Inactive";
    badgeBg = "var(--warning-soft)";
    badgeColor = "var(--warning)";
  }

  const row = (label: string, value: React.ReactNode, emphasis = false) => (
    <div
      key={label}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "var(--sp-2)",
        padding: "var(--sp-1) 0",
        fontSize: "var(--type-base)",
      }}
    >
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span
        style={{
          color: "var(--text)",
          fontFamily: "var(--font-data)",
          fontSize: emphasis ? "var(--type-lg)" : "var(--type-base)",
          fontWeight: emphasis ? 700 : 400,
        }}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div style={{ padding: "var(--sp-2) var(--sp-3)" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--sp-1)",
          padding: "2px var(--sp-2)",
          borderRadius: "var(--r-pill)",
          background: badgeBg,
          color: badgeColor,
          fontSize: "var(--type-xs)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "var(--tracking-wide)",
          marginBottom: "var(--sp-2)",
        }}
      >
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: badgeColor }} />
        {badgeLabel}
      </div>

      {row("Agent", shortAddr(mandate.agent))}
      {row("Principal", shortAddr(mandate.human))}
      {row("Spend cap (per tx)", `${mandate.spendCap} gUSD`, true)}
      {row("Asset", shortAddr(mandate.asset))}
      {row("Expires in", mandate.revoked ? "-" : countdown, true)}
    </div>
  );
}
