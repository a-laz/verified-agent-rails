"use client";

import React, { createContext, useContext, useMemo } from "react";
import type { AgentManifest, WidgetManifestEntry } from "@agent-stack/core";
import { manifest as varManifest } from "@/agents/VAR/manifest";

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

// Active app = Verified Agent Rails. Only its widgets render — the template demo
// widgets (Agent Status / Research Results) are intentionally excluded so judges
// see only the VAR story, with no empty/irrelevant panels.
const MANIFESTS: AgentManifest[] = [varManifest];

export function AgentManifestProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<AgentManifestContextValue>(() => {
    const widgetManifest: WidgetManifestEntry[] = MANIFESTS.flatMap((m) => m.widgets);
    return { activeManifest: varManifest, widgetManifest };
  }, []);
  return <AgentManifestContext.Provider value={value}>{children}</AgentManifestContext.Provider>;
}
