import { useEffect, useState } from "react";

export type Theme = "light" | "warm" | "dark" | "system";
/** What is on screen once "system" is resolved. */
export type Mode = "light" | "warm" | "dark";
/** The switch's order (owner, 2026-10-30: three modes): light → warm → dark → light. */
const NEXT: Record<Mode, Mode> = { light: "warm", warm: "dark", dark: "light" };
export const MODE_LABEL: Record<Mode, string> = {
  light: "الوضع الفاتح",
  warm: "الوضع الدافئ",
  dark: "الوضع الداكن",
};
const KEY = "ecst-theme";

export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "warm" || value === "dark" ? value : "system";
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

/** The mode actually on screen ("system" resolves through the OS setting: light or dark). */
export function modeOf(theme: Theme = storedTheme()): Mode {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * The theme, kept in step everywhere it is shown (top-bar toggle, Settings) and with the
 * OS when set to "system".
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(storedTheme);
  const [mode, setMode] = useState<Mode>(() => modeOf(theme));
  useEffect(() => {
    const sync = () => {
      const t = storedTheme();
      setThemeState(t);
      setMode(modeOf(t));
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
  return { theme, mode, next: NEXT[mode], set, toggle: () => set(NEXT[mode]) };
}
