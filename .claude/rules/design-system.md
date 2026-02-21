# Design System Rules

## CSS Tokens
- ALL colors, spacing, typography, and effects come from `@agent-stack/ui/styles/tokens.css`
- NEVER hardcode hex colors, pixel sizes for spacing, or font names
- Use CSS custom properties: `var(--bg)`, `var(--text)`, `var(--accent)`, etc.
- Glass effects: `var(--glass-bg)`, `var(--glass-border)`, `var(--glass-backdrop)`
- Spacing scale: `var(--sp-1)` through `var(--sp-7)`
- Border radius: `var(--r-sm)`, `var(--r-card)`, `var(--r-pill)`

## Components
- Use `<WidgetCard>` from `@agent-stack/ui` for widget containers
- Themes controlled via `data-theme` attribute on `<html>`

## Don'ts
- Don't use Tailwind classes
- Don't import external CSS frameworks
- Don't add `!important` to override tokens
