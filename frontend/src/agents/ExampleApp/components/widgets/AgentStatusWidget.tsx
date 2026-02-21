"use client";

import React from "react";
import { useBox } from "@/contexts/BoxCacheContext";

interface AgentStatus {
  name: string;
  persona: string;
  status: string;
  task: string | null;
}

export function AgentStatusWidget() {
  const data = useBox<AgentStatus[]>("agents/status");

  if (!data) {
    return (
      <div style={{ padding: "12px", color: "var(--muted)", fontSize: "0.85rem" }}>
        Waiting for agent activity...
      </div>
    );
  }

  const statusColor = (s: string) => {
    switch (s) {
      case "thinking": return "var(--accent)";
      case "done": return "var(--success)";
      case "error": return "var(--danger)";
      default: return "var(--muted)";
    }
  };

  return (
    <div style={{ padding: "8px 12px" }}>
      {data.map((agent) => (
        <div
          key={agent.name}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "4px 0",
            fontSize: "0.85rem",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: statusColor(agent.status),
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 600 }}>{agent.name}</span>
          <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
            {agent.task || agent.status}
          </span>
        </div>
      ))}
    </div>
  );
}
