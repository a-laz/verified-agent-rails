# @agent-stack/ui — CLAUDE.md

Design system: CSS tokens, themes, and basic primitives.

## Exports
- `themeRegistry` — maps theme names to CSS class names
- `WidgetCard` — glass-effect container for dashboard widgets

## Styles
- `styles/tokens.css` — CSS custom properties (colors, spacing, typography, glass effects)
- `styles/themes/` — Theme overrides (calm, cyberpunk)
- `styles/calm-widgets.css` — Widget-specific styling

## Rules
- All colors via CSS custom properties, never hardcoded hex
- Themes controlled via `data-theme` attribute on `<html>`
- No Tailwind, no external CSS frameworks
- No `!important` overrides
