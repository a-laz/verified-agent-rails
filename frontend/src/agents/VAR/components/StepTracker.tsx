"use client";

import React from "react";
import { useBox } from "@/contexts/BoxCacheContext";

interface VarStatus {
  state: "idle" | "rejected" | "cleared" | "paid" | "parked" | "revoked";
}
interface Mandate {
  active: boolean;
  revoked: boolean;
}

const STEPS = [
  { n: 1, label: "Agent rejected", sub: "no passport" },
  { n: 2, label: "Human grants mandate", sub: "spend cap · expiry" },
  { n: 3, label: "Agent pays", sub: "stablecoin, on-leash" },
  { n: 4, label: "Agent parks yield", sub: "still on-leash" },
  { n: 5, label: "Human revokes", sub: "locked out next block" },
];

// Map the current box state to the active step index (0-based).
function activeIndex(state: string | undefined, mandate: Mandate | null): number {
  switch (state) {
    case "rejected":
      return mandate && mandate.revoked ? 4 : 0;
    case "cleared":
      return 1;
    case "paid":
      return 2;
    case "parked":
      return 3;
    case "revoked":
      return 4;
    default:
      // Idle/first-paint: light step 1 as "you are here" so the arc never looks dormant.
      return mandate && mandate.active && !mandate.revoked ? 1 : 0;
  }
}

export function StepTracker() {
  const status = useBox<VarStatus>("var/status");
  const mandate = useBox<Mandate>("var/mandate");
  const active = activeIndex(status?.state, mandate);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: "var(--sp-2)",
        padding: "var(--sp-3) var(--sp-5)",
        borderBottom: "1px solid var(--glass-border)",
        background: "var(--glass-bg)",
        overflowX: "auto",
      }}
    >
      {STEPS.map((step, i) => {
        const isActive = i === active;
        const isDone = active >= 0 && i < active;
        const isRevoke = step.n === 5;
        const accent = isRevoke ? "var(--danger)" : "var(--accent)";
        const fg = isActive ? accent : isDone ? "var(--success)" : "var(--muted)";
        const numBg = isActive ? accent : isDone ? "var(--success)" : "transparent";
        const numColor = isActive || isDone ? "var(--text-inverse)" : "var(--muted)";
        return (
          <div
            key={step.n}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--sp-2)",
              flex: "1 1 0",
              minWidth: "140px",
              opacity: active < 0 ? 0.8 : isActive || isDone ? 1 : 0.5,
              transition: "opacity var(--dur-med, 0.25s)",
            }}
          >
            <span
              style={{
                width: "30px",
                height: "30px",
                borderRadius: "50%",
                border: `1.5px solid ${isActive || isDone ? fg : "var(--glass-border)"}`,
                background: numBg,
                color: numColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.95rem",
                fontWeight: 700,
                fontFamily: "var(--font-data)",
                flexShrink: 0,
                boxShadow: isActive ? `0 0 0 4px ${isRevoke ? "var(--danger-soft)" : "var(--accent-soft, var(--glass-bg))"}` : "none",
              }}
            >
              {isDone ? "✓" : step.n}
            </span>
            <span style={{ minWidth: 0 }}>
              <span
                style={{
                  display: "block",
                  fontSize: "1.05rem",
                  fontWeight: isActive ? 800 : 600,
                  color: isActive ? fg : "var(--text)",
                  whiteSpace: "nowrap",
                }}
              >
                {step.label}
              </span>
              <span style={{ display: "block", fontSize: "var(--type-xs)", color: "var(--muted)", whiteSpace: "nowrap" }}>
                {step.sub}
              </span>
            </span>
            {i < STEPS.length - 1 ? (
              <span style={{ flex: 1, height: "1px", background: "var(--glass-border)", margin: "0 var(--sp-1)", minWidth: "8px" }} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
