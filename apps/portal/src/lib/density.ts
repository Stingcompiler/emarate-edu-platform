import { useEffect, useState } from "react";

export type Density = "comfortable" | "compact";
const KEY = "ecst-density";
const EVENT = "ecst-density-change";

export function storedDensity(): Density {
  try {
    return localStorage.getItem(KEY) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

/** Compact is `data-density` on the root (tokens.css applies it from 1024 px up only). */
export function applyDensity(density: Density): void {
  const root = document.documentElement;
  if (density === "compact") root.setAttribute("data-density", "compact");
  else root.removeAttribute("data-density");
  try {
    if (density === "compact") localStorage.setItem(KEY, "compact");
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the choice lasts for this visit */
  }
}

export function useDensity() {
  const [density, setState] = useState<Density>(storedDensity);
  useEffect(() => {
    const sync = () => setState(storedDensity());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  const set = (next: Density) => {
    applyDensity(next);
    window.dispatchEvent(new Event(EVENT));
  };
  return { density, set };
}
