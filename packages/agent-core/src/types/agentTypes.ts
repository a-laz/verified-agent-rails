import type { WidgetDefinition } from "./index";

export interface WidgetManifestEntry {
  definition: WidgetDefinition;
  component: React.ComponentType;
}

export interface AgentManifest {
  mindType: string;
  description: string;
  icon: string;
  widgets: WidgetManifestEntry[];
}
