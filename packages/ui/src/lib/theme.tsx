"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { THEME_STORAGE_KEY } from "./theme-script";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" || value === "system" ? value : null;
  } catch {
    return null;
  }
}

function getMediaQuery(): MediaQueryList | null {
  try {
    return window.matchMedia(DARK_QUERY);
  } catch {
    return null;
  }
}

function resolve(theme: Theme): ResolvedTheme {
  if (theme === "system") return getMediaQuery()?.matches ? "dark" : "light";
  return theme;
}

function apply(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // ເລີ່ມ "system" ທັງ server/client ເພື່ອບໍ່ໃຫ້ hydration ບໍ່ຕົງ; ຄ່າຈິງອ່ານໃນ effect.
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  useEffect(() => {
    const stored = readStoredTheme();
    if (stored) setThemeState(stored);
  }, []);

  useEffect(() => {
    const sync = () => {
      const next = resolve(theme);
      setResolvedTheme(next);
      apply(next);
    };
    sync();
    if (theme !== "system") return;
    const query = getMediaQuery();
    query?.addEventListener("change", sync);
    return () => query?.removeEventListener("change", sync);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // storage ໃຊ້ບໍ່ໄດ້ (private mode ຯລຯ): ຍັງໃຊ້ໄດ້ໃນ session ນີ້
    }
  }, []);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
