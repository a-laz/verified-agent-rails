/**
 * @agent-stack/ui — Design system tokens and primitives for Agent Stack.
 *
 * Import CSS in layout.tsx:
 *   import "@agent-stack/ui/styles/tokens.css";
 *   import "@agent-stack/ui/styles/themes/index.css";
 *   import "@agent-stack/ui/styles/calm-widgets.css";
 */

// Theme
export { THEME_REGISTRY, THEME_IDS, DEFAULT_THEME } from "./theme/themeRegistry";
export type { ThemeName, ThemeScheme } from "./theme/themeRegistry";

// Primitives
export { WidgetCard } from "./primitives/WidgetCard";
