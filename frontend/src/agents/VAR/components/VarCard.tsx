"use client";

import React from "react";

type Tone = "neutral" | "success" | "danger";

/**
 * Card wrapper whose chrome (border + background wash + title color) reacts to
 * demo state, so granted→revoked reads as a felt "beat" (UX round 1: #3).
 */
export function VarCard({
  title,
  subtitle,
  tone = "neutral",
  badge,
  children,
  style,
}: {
  title: string;
  subtitle?: string;
  tone?: Tone;
  badge?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const border =
    tone === "success" ? "var(--success)" : tone === "danger" ? "var(--danger)" : "var(--glass-border)";
  const wash =
    tone === "success" ? "var(--success-soft)" : tone === "danger" ? "var(--danger-soft)" : "var(--glass-bg)";
  const titleColor =
    tone === "success" ? "var(--success)" : tone === "danger" ? "var(--danger)" : "var(--accent)";

  return (
    <section
      style={{
        background: wash,
        backdropFilter: "var(--glass-backdrop)",
        WebkitBackdropFilter: "var(--glass-backdrop)",
        border: `1px solid ${border}`,
        borderRadius: "var(--r-card)",
        boxShadow: "var(--glass-shadow)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "border-color var(--dur-med, 0.3s) var(--ease-standard), background var(--dur-med, 0.3s)",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--sp-2)",
          padding: "var(--sp-2) var(--sp-3)",
          borderBottom: "1px solid var(--glass-border)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--type-sm)",
              fontWeight: 700,
              color: titleColor,
              textTransform: "uppercase",
              letterSpacing: "var(--tracking-caps)",
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div style={{ fontSize: "var(--type-xs)", color: "var(--muted)", marginTop: "2px", lineHeight: 1.3 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {badge ? <div style={{ flexShrink: 0 }}>{badge}</div> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </section>
  );
}
