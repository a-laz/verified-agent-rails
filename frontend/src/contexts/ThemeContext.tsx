"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { THEME_REGISTRY, THEME_IDS, DEFAULT_THEME } from "@agent-stack/ui";
import type { ThemeName } from "@agent-stack/ui";
import logger from "@/lib/logger";

const LOG_PREFIX = "[ThemeContext]";

export type { ThemeName } from "@agent-stack/ui";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = "agentstack_theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

function applyTheme(theme: ThemeName) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "calm") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

function getInitialTheme(): ThemeName {
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME);

  useEffect(() => {
    const initial = getInitialTheme();
    setThemeState(initial);
    applyTheme(initial);
  }, []);

  const setTheme = useCallback((t: ThemeName) => {
    logger.log(LOG_PREFIX, "setTheme", t);
    setThemeState(t);
    applyTheme(t);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, t);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const idx = THEME_IDS.indexOf(prev);
      const next = THEME_IDS[(idx + 1) % THEME_IDS.length];
      logger.log(LOG_PREFIX, "toggleTheme", { from: prev, to: next });
      applyTheme(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, next);
      }
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
