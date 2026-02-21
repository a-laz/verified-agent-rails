import type { AgentManifest, WidgetDefinition } from "@agent-stack/core";
import { AgentStatusWidget } from "./components/widgets/AgentStatusWidget";
import { ResearchResultWidget } from "./components/widgets/ResearchResultWidget";

const statusDef: WidgetDefinition = {
  id: "agent-status",
  title: "Agent Status",
  description: "Live status of all agents",
  category: "telemetry",
  tier: "tile",
  defaultW: 4,
  defaultH: 12,
  scrollPolicy: "none",
  tone: "neutral",
  boxKeys: ["agents/status"],
};

const researchDef: WidgetDefinition = {
  id: "research-results",
  title: "Research Results",
  description: "Results from the Researcher agent",
  category: "telemetry",
  tier: "card",
  defaultW: 8,
  defaultH: 24,
  scrollPolicy: "body",
  tone: "ai-generated",
  boxKeys: ["research/results"],
};

export const manifest: AgentManifest = {
  mindType: "Orchestrator",
  description: "Agent Stack Template — multi-agent application",
  icon: "search",
  widgets: [
    { definition: statusDef, component: AgentStatusWidget },
    { definition: researchDef, component: ResearchResultWidget },
  ],
};
