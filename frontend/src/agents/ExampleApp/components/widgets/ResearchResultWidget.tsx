"use client";

import React from "react";
import { useBox } from "@/contexts/BoxCacheContext";

interface KBEntry {
  id: string;
  topic: string;
  content: string;
}

export function ResearchResultWidget() {
  const data = useBox<KBEntry[]>("research/results");

  if (!data) {
    return (
      <div style={{ padding: "12px", color: "var(--muted)", fontSize: "0.85rem" }}>
        No research results yet. Ask a question to get started.
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 12px" }}>
      {data.map((entry) => (
        <div
          key={entry.id}
          style={{
            padding: "8px",
            marginBottom: "8px",
            borderRadius: "6px",
            border: "1px solid var(--glass-border)",
            background: "var(--glass-bg)",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--accent)", marginBottom: "4px" }}>
            {entry.topic}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text)", lineHeight: 1.4 }}>
            {entry.content}
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "4px" }}>
            {entry.id}
          </div>
        </div>
      ))}
    </div>
  );
}
