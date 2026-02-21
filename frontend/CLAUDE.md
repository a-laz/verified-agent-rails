# Frontend — CLAUDE.md

## Stack
- Next.js 14 (App Router), TypeScript, CSS custom properties
- No Tailwind, no external CSS frameworks

## Layout
```
frontend/src/
├─ app/
│   ├─ layout.tsx              # Root layout (Server Component)
│   ├─ page.tsx                # Provider hierarchy → AppShell
│   └─ api/proxy/[...path]/    # CORS bypass reverse proxy
├─ components/
│   ├─ shell/ (AppShell, HeaderBar)
│   ├─ dashboard/ (WidgetGrid, GridWidget)
│   └─ rail/ (RightRail, ChatPanel, ChatStream)
├─ contexts/
│   ├─ ChatContext.tsx          # POST fetch + ReadableStream SSE
│   ├─ BoxCacheContext.tsx      # 2s polling with useSyncExternalStore
│   ├─ AgentManifestContext.tsx # Widget manifest registry
│   └─ ThemeContext.tsx         # Theme toggle (calm/cyberpunk)
├─ agents/ExampleApp/
│   ├─ manifest.ts             # 2 widgets defined here
│   └─ components/widgets/     # Widget components
└─ lib/logger.ts               # Console wrapper
```

## Provider Hierarchy
```
ThemeProvider → BoxCacheProvider → ChatProvider → AgentManifestProvider → AppShell
```

## Widget Pattern (useBox)
```tsx
import { useBox } from "@/contexts/BoxCacheContext";

export function MyWidget() {
  const data = useBox<MyType>("my/box-key");
  if (!data) return <EmptyState />;
  return <div>{/* render */}</div>;
}
```
- Widgets NEVER call APIs directly — they read from box cache
- Always handle null/empty state

## SSE Streaming
- Frontend uses POST fetch + ReadableStream (NOT EventSource — that's GET only)
- Parse SSE events manually from the stream
- See `contracts/sse_events.md` for event format

## Box Polling
- BoxCacheContext polls `GET /api/box/Orchestrator` every 2s
- Returns flat dict of all box keys across all agents
- Uses `useSyncExternalStore` for React 18 compatibility

## Widgets

| Widget | Box Key | Description |
|--------|---------|-------------|
| AgentStatusWidget | `agents/status` | Agent status indicators |
| ResearchResultWidget | `research/results` | Knowledge base results |

## Styling Rules
- ALL colors/spacing from `@agent-stack/ui/styles/tokens.css`
- Use CSS custom properties: `var(--bg)`, `var(--text)`, `var(--accent)`
- Glass effects: `var(--glass-bg)`, `var(--glass-border)`
- No hardcoded hex colors, no Tailwind
