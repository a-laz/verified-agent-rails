"use client";

import React from "react";
import { useAgentManifest } from "@/contexts/AgentManifestContext";

export default function WidgetGrid() {
  const { widgetManifest } = useAgentManifest();

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: "var(--sp-4)",
        padding: "var(--sp-4)",
      }}
    >
      {widgetManifest.map(({ definition: def, component: Widget }) => {
        if (!Widget) {
          return (
            <div key={def.id} style={{ padding: "var(--sp-4)", color: "var(--danger)" }}>
              Error: No component for &quot;{def.title}&quot;
            </div>
          );
        }
        return (
          <div
            key={def.id}
            style={{
              background: "var(--glass-bg)",
              backdropFilter: "var(--glass-backdrop)",
              WebkitBackdropFilter: "var(--glass-backdrop)",
              borderRadius: "var(--r-card)",
              border: "1px solid var(--glass-border)",
              boxShadow: "var(--glass-shadow)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "var(--sp-2) var(--sp-3)",
                borderBottom: "1px solid var(--glass-border)",
                fontFamily: "var(--font-display)",
                fontSize: "var(--type-sm)",
                fontWeight: 600,
                color: "var(--accent)",
                textTransform: "uppercase",
                letterSpacing: "var(--tracking-caps)",
              }}
            >
              {def.title}
            </div>
            <div style={{ minHeight: "80px" }}>
              <Widget />
            </div>
          </div>
        );
      })}

      {widgetManifest.length === 0 && (
        <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "var(--sp-6)", opacity: 0.5, color: "var(--muted)" }}>
          No widgets configured.
        </div>
      )}
    </div>
  );
}
