"use client";

import React, { createContext, useContext, useMemo } from "react";
import type { AgentManifest, WidgetManifestEntry } from "@agent-stack/core";
import { manifest } from "@/agents/ExampleApp/manifest";

export interface AgentManifestContextValue {
  activeManifest: AgentManifest;
  widgetManifest: WidgetManifestEntry[];
}

const AgentManifestContext = createContext<AgentManifestContextValue | null>(null);

export function useAgentManifest(): AgentManifestContextValue {
  const ctx = useContext(AgentManifestContext);
  if (!ctx) throw new Error("useAgentManifest must be used within <AgentManifestProvider>");
  return ctx;
}

export function AgentManifestProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<AgentManifestContextValue>(
    () => ({ activeManifest: manifest, widgetManifest: manifest.widgets }),
    []
  );
  return <AgentManifestContext.Provider value={value}>{children}</AgentManifestContext.Provider>;
}
