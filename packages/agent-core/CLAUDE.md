# @agent-stack/core — CLAUDE.md

Minimal TypeScript types shared between frontend and packages.

## Exports
- `WidgetDefinition` — shape of a widget in a manifest
- `AgentManifest` — agent name + list of widgets
- `WidgetManifestEntry` — widget key + component pair

## Rules
- Types only — no runtime code, no React imports
- Keep minimal — don't add utilities or adapters
