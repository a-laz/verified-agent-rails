"use client";

import React from "react";
import ChatPanel from "./ChatPanel";

interface RightRailProps {
  isOpen: boolean;
}

export default function RightRail({ isOpen }: RightRailProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        gridColumn: "2 / 3",
        gridRow: "2 / 3",
        display: "flex",
        flexDirection: "column",
        borderLeft: "1px solid var(--glass-border)",
        background: "var(--glass-rail-bg)",
        backdropFilter: "var(--glass-rail-backdrop)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          fontSize: "0.85rem",
          fontWeight: 600,
          color: "var(--accent)",
          fontFamily: "var(--font-display)",
        }}
      >
        Chat
      </div>
      <ChatPanel />
    </div>
  );
}
