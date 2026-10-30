import { useEffect, useState } from "react";

/**
 * A header that gets out of the way (owner, 2026-10-30): hidden while the page scrolls down,
 * back as soon as the scrolling stops or turns up, always shown near the top of the page.
 */
export function useHideOnScroll(top = 80, idleMs = 400): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    let idle: number | undefined;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < top || y < last - 4) setHidden(false);
      else if (y > last + 4) setHidden(true);
      last = y;
      window.clearTimeout(idle);
      idle = window.setTimeout(() => setHidden(false), idleMs);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(idle);
    };
  }, [top, idleMs]);
  return hidden;
}
