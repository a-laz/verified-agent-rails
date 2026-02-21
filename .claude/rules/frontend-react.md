# Frontend React Rules

## Next.js 14 App Router
- All components in `src/components/` are Client Components — add `"use client"` directive
- Server Components only in `src/app/` (layout.tsx is a Server Component)
- API routes in `src/app/api/` — these run on the server

## Context Pattern
- Providers wrap AppShell in `page.tsx`: ThemeProvider → BoxCacheProvider → ChatProvider → AgentManifestProvider
- Access context via hooks: `useChatContext()`, `useBox()`, `useAgentManifest()`, `useTheme()`

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
- Always handle null/empty state gracefully

## SSE Streaming
- Frontend uses POST fetch + ReadableStream to consume SSE from `/api/chat/stream`
- NOT EventSource (which only supports GET)
- Parse SSE events manually from the stream

## Box Polling
- BoxCacheContext polls `GET /api/box/Orchestrator` every 2 seconds
- Returns flat dict of all box keys across all agent types
