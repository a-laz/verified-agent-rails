export type ThemeScheme = "light" | "dark";

export type ThemeName = "calm" | "cyberpunk";

export interface ThemeEntry {
  label: string;
  scheme: ThemeScheme;
}

export const THEME_REGISTRY: Record<ThemeName, ThemeEntry> = {
  calm: { label: "Calm", scheme: "light" },
  cyberpunk: { label: "Cyberpunk", scheme: "dark" },
};

export const THEME_IDS = Object.keys(THEME_REGISTRY) as ThemeName[];
export const DEFAULT_THEME: ThemeName = "cyberpunk";
