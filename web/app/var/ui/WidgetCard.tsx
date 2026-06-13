"use client";

import type { ReactNode } from "react";

// Card chrome for a dashboard widget. Ported from the cj agent-ui primitive.
export function WidgetCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--glass-bg)",
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
            color: "var(--text-accent)",
            textTransform: "uppercase",
            letterSpacing: "var(--tracking-caps)",
          }}
        >
          {title}
        </div>
      )}
      <div style={{ minHeight: "80px" }}>{children}</div>
    </div>
  );
}
