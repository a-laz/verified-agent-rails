"use client";

import React from "react";

interface HeaderBarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export default function HeaderBar({ isOpen, onToggle }: HeaderBarProps) {
  return (
    <header
      style={{
        gridColumn: "1 / -1",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        height: "48px",
        borderBottom: "1px solid var(--glass-border)",
        background: "var(--glass-rail-bg)",
        backdropFilter: "var(--glass-rail-backdrop)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span
          style={{
            fontSize: "1.15rem",
            fontWeight: 700,
            letterSpacing: "0.05em",
            fontFamily: "var(--font-display)",
            color: "var(--accent)",
            textShadow: "var(--glass-text-glow)",
          }}
        >
          Agent Stack
        </span>
        <span
          style={{
            fontSize: "0.8rem",
            color: "var(--muted)",
            borderLeft: "1px solid var(--glass-border)",
            paddingLeft: "12px",
          }}
        >
          Template App
        </span>
      </div>
      <button
        onClick={onToggle}
        style={{
          background: "none",
          border: "1px solid var(--border)",
          color: "var(--text)",
          padding: "4px 12px",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "0.8rem",
        }}
      >
        {isOpen ? "Hide Chat" : "Show Chat"}
      </button>
    </header>
  );
}
