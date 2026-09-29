import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
const KEY = "ecst-theme";

export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

/** "system" follows the OS (tokens.css media query); the others pin data-theme. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    /* private mode: the choice lasts for this visit */
  }
}

const EVENT = "ecst-theme-change";

/** The mode actually on screen ("system" resolves through the OS setting). */
export function isDark(theme: Theme = storedTheme()): boolean {
  if (theme !== "system") return theme === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * The theme, kept in step everywhere it is shown (top-bar toggle, Settings) and with the
 * OS when set to "system".
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(storedTheme);
  const [dark, setDark] = useState(() => isDark(theme));
  useEffect(() => {
    const sync = () => {
      const t = storedTheme();
      setThemeState(t);
      setDark(isDark(t));
    };
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    window.addEventListener(EVENT, sync);
    media.addEventListener("change", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      media.removeEventListener("change", sync);
    };
  }, []);
  const set = (next: Theme) => {
    applyTheme(next);
    window.dispatchEvent(new Event(EVENT));
  };
  return { theme, dark, set, toggle: () => set(dark ? "light" : "dark") };
}
