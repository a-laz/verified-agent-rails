"use client";

import React, { useState } from "react";
import HeaderBar from "@/components/shell/HeaderBar";
import RightRail from "@/components/rail/RightRail";
import VarDashboard from "@/agents/VAR/VarDashboard";

export default function AppShell() {
  // Chat rail hidden by default — judges should land on the VAR story, not a chat box.
  const [railOpen, setRailOpen] = useState(false);
  const railWidth = 400;

  return (
    <div
      className="app-shell"
      style={{
        display: "grid",
        gridTemplateColumns: railOpen ? `1fr ${railWidth}px` : "1fr 0px",
        gridTemplateRows: "auto 1fr",
        height: "100vh",
        overflow: "hidden",
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      <HeaderBar isOpen={railOpen} onToggle={() => setRailOpen((p) => !p)} />
      <main style={{ gridColumn: "1 / 2", gridRow: "2 / 3", overflow: "auto" }}>
        <VarDashboard />
      </main>
      <RightRail isOpen={railOpen} />
    </div>
  );
}
