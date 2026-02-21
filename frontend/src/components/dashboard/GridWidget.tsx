"use client";

import React from "react";

interface GridWidgetProps {
  title: string;
  children: React.ReactNode;
}

export default function GridWidget({ title, children }: GridWidgetProps) {
  return (
    <div
      style={{
        background: "var(--glass-bg)",
        borderRadius: "8px",
        border: "1px solid var(--glass-border)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--glass-border)", fontSize: "0.85rem", fontWeight: 600 }}>
        {title}
      </div>
      <div style={{ minHeight: "80px" }}>{children}</div>
    </div>
  );
}
