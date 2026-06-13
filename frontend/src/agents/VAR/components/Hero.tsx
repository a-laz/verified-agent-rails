"use client";

import React from "react";

/**
 * Persistent hero band — the first thing a judge reads. States WHAT VAR is and
 * WHY it matters before the demo arc even starts. (UX round 1: #1 blocker.)
 */
export function Hero() {
  return (
    <div
      style={{
        padding: "var(--sp-4) var(--sp-5)",
        borderBottom: "1px solid var(--glass-border)",
        background: "var(--glass-bg)",
        backdropFilter: "var(--glass-backdrop)",
        WebkitBackdropFilter: "var(--glass-backdrop)",
      }}
    >
      <h1
        style={{
          margin: 0,
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: "clamp(1.5rem, 2.6vw, 2.3rem)",
          lineHeight: 1.12,
          color: "var(--text)",
          letterSpacing: "-0.01em",
        }}
      >
        Verified Agent Rails —{" "}
        <span style={{ color: "var(--accent)", textShadow: "var(--glass-text-glow)" }}>
          give an AI agent a leash, not your whole wallet.
        </span>
      </h1>
      <p
        style={{
          margin: "var(--sp-2) 0 0",
          fontSize: "clamp(0.92rem, 1.1vw, 1.05rem)",
          color: "var(--muted)",
          maxWidth: "78ch",
          lineHeight: "var(--leading-normal)",
        }}
      >
        A human verifies once with World ID, grants the agent a scoped, on-chain{" "}
        <strong style={{ color: "var(--text)", fontWeight: 600 }}>mandate</strong>{" "}
        (spend cap · expiry · revocable), and the token itself refuses to move without it.{" "}
        <strong style={{ color: "var(--text)", fontWeight: 600 }}>
          Revoke → next block, the agent is locked out.
        </strong>
      </p>
      <div
        style={{
          marginTop: "var(--sp-3)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "var(--sp-1) var(--sp-2)",
          fontSize: "clamp(0.8rem, 0.95vw, 0.95rem)",
          fontFamily: "var(--font-data)",
          color: "var(--muted)",
        }}
      >
        <span style={{ color: "var(--text)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}>
          The arc
        </span>
        <span>① agent blocked — no leash</span>
        <span style={{ color: "var(--accent)" }}>→</span>
        <span>② human grants a scoped leash</span>
        <span style={{ color: "var(--accent)" }}>→</span>
        <span>③ agent pays + parks, on-leash</span>
        <span style={{ color: "var(--accent)" }}>→</span>
        <span style={{ color: "var(--danger)", fontWeight: 600 }}>④ human revokes → locked out</span>
      </div>
      <div style={{ marginTop: "var(--sp-3)", display: "flex", flexWrap: "wrap", gap: "var(--sp-2)" }}>
        {["On-chain enforcement", "ERC-7943 gated token", "World ID proof-of-human", "Revoke = next-block lockout"].map((t) => (
          <span
            key={t}
            style={{
              fontSize: "var(--type-xs)",
              color: "var(--accent)",
              border: "1px solid var(--glass-border)",
              borderRadius: "var(--r-pill)",
              padding: "2px var(--sp-2)",
              background: "var(--glass-bg)",
              fontFamily: "var(--font-data)",
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
