# Adding a New Widget

Step-by-step guide to adding a dashboard widget that displays agent data.

## 1. Define the Box Schema

First, document the data shape in `contracts/box_schemas.md`. The widget reads from a box key written by an agent tool.

## 2. Create the Widget Component

Create `frontend/src/agents/ExampleApp/components/widgets/MyDataWidget.tsx`:

```tsx
"use client";

import React from "react";
import { useBox } from "@/contexts/BoxCacheContext";

interface MyDataItem {
  item: string;
  score: number;
}

interface MyData {
  query: string;
  results: MyDataItem[];
  timestamp: string;
}

export function MyDataWidget() {
  const data = useBox<MyData>("mydata/results");

  if (!data) {
    return (
      <div style={{ padding: "var(--sp-4)", color: "var(--text-dim)" }}>
        No data yet. Ask the agent a question to see results.
      </div>
    );
  }

  return (
    <div style={{ padding: "var(--sp-3)" }}>
      <h3 style={{ color: "var(--text)", marginBottom: "var(--sp-2)" }}>
        Results for: {data.query}
      </h3>
      {data.results.map((item, i) => (
        <div
          key={i}
          style={{
            padding: "var(--sp-2)",
            marginBottom: "var(--sp-1)",
            background: "var(--glass-bg)",
            borderRadius: "var(--r-sm)",
            border: "1px solid var(--glass-border)",
          }}
        >
          <strong>{item.item}</strong>
          <span style={{ float: "right", color: "var(--accent)" }}>
            {(item.score * 100).toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  );
}
```

## 3. Register in Manifest

Edit `frontend/src/agents/ExampleApp/manifest.ts`:

```typescript
import { MyDataWidget } from "./components/widgets/MyDataWidget";

export const ExampleAppManifest: AgentManifest = {
  agentName: "ExampleApp",
  widgets: [
    // ... existing widgets
    {
      key: "my-data",
      title: "My Data",
      component: MyDataWidget,
      defaultSize: { w: 2, h: 1 },
    },
  ],
};
```

## 4. Verify

1. Start backend: `cd backend && uvicorn src.main:app --reload --port 8000`
2. Start frontend: `cd frontend && npm run dev`
3. Ask a question that triggers the agent tool
4. Widget should populate within 2 seconds (box polling interval)

## Key Rules

- Widgets NEVER call APIs directly — they read from `useBox()`
- Always handle `null` (no data yet) gracefully
- Use CSS custom properties for all styling (`var(--bg)`, `var(--text)`, etc.)
- Box key in `useBox("mydata/results")` MUST match the key used in `agent.box("mydata/results", ...)`
