import type { ReactNode } from "react";

export type GridSpan = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type WidgetTier = "tile" | "card" | "workbench";
export type ScrollPolicy = "none" | "body" | "region";
export type WidgetTone = "neutral" | "user" | "ai-generated";

export interface WidgetDefinition {
  id: string;
  title: string;
  category: "control" | "telemetry" | "evaluation" | "preferences" | "development";
  tier: WidgetTier;
  defaultW: GridSpan;
  defaultH: number;
  minH?: number;
  scrollPolicy: ScrollPolicy;
  tone: WidgetTone;
  boxKeys: string[];
  description?: string;
  defaultHidden?: boolean;
  defaultX?: number;
  defaultY?: number;
}
