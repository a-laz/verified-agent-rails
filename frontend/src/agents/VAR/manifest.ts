import type { AgentManifest, WidgetDefinition } from "@agent-stack/core";
import { GrantRevokePanel } from "./components/widgets/GrantRevokePanel";
import { MandateWidget } from "./components/widgets/MandateWidget";
import { AgentStatusWidget } from "./components/widgets/AgentStatusWidget";
import { TxFeedWidget } from "./components/widgets/TxFeedWidget";

const grantRevokeDef: WidgetDefinition = {
  id: "var-grant-revoke",
  title: "Mandate Control",
  description: "Grant or revoke the agent's spending mandate",
  category: "control",
  tier: "card",
  defaultW: 4,
  defaultH: 18,
  scrollPolicy: "none",
  tone: "user",
  boxKeys: ["var/mandate"],
};

const mandateDef: WidgetDefinition = {
  id: "var-mandate",
  title: "Active Mandate",
  description: "Current mandate terms and expiry",
  category: "telemetry",
  tier: "tile",
  defaultW: 4,
  defaultH: 14,
  scrollPolicy: "none",
  tone: "neutral",
  boxKeys: ["var/mandate"],
};

const statusDef: WidgetDefinition = {
  id: "var-agent-status",
  title: "Agent Status",
  description: "Eligibility state and payment/park actions",
  category: "control",
  tier: "card",
  defaultW: 4,
  defaultH: 20,
  scrollPolicy: "none",
  tone: "ai-generated",
  boxKeys: ["var/status"],
};

const txFeedDef: WidgetDefinition = {
  id: "var-tx-feed",
  title: "Transaction Feed",
  description: "Recent gated transfers and restriction codes",
  category: "telemetry",
  tier: "card",
  defaultW: 8,
  defaultH: 24,
  scrollPolicy: "body",
  tone: "neutral",
  boxKeys: ["var/tx_feed"],
};

export const manifest: AgentManifest = {
  mindType: "VAR",
  description: "Verified Agent Rails — gated agent payments with revocable mandates",
  icon: "shield",
  widgets: [
    { definition: grantRevokeDef, component: GrantRevokePanel },
    { definition: mandateDef, component: MandateWidget },
    { definition: statusDef, component: AgentStatusWidget },
    { definition: txFeedDef, component: TxFeedWidget },
  ],
};
