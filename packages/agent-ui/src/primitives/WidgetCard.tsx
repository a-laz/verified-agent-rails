"use client";

import React from "react";

interface WidgetCardProps {
  title?: string;
  children: React.ReactNode;
}

export function WidgetCard({ title, children }: WidgetCardProps) {
  return (
    <div
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "var(--glass-backdrop)",
        borderRadius: "var(--r-card)",
        border: "1px solid var(--glass-border)",
        boxShadow: "var(--glass-shadow)",
        overflow: "hidden",
      }}
    >
      {title && (
        <div
          style={{
            padding: "var(--sp-2) var(--sp-3)",
            borderBottom: "1px solid var(--glass-border)",
            fontFamily: "var(--font-display)",
            fontSize: "var(--type-sm)",
            fontWeight: 600,
            color: "var(--accent)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {title}
        </div>
      )}
      <div style={{ minHeight: "80px" }}>{children}</div>
    </div>
  );
}
