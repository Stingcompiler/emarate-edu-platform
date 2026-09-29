import { Moon, Sun } from "lucide-react";

import { useTheme } from "../lib/theme";

/** One tap between light and dark, always in the same place (top bar); Settings has «النظام». */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { dark, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "الوضع الفاتح" : "الوضع الداكن"}
      title={dark ? "الوضع الفاتح" : "الوضع الداكن"}
      className={`grid size-10 shrink-0 place-items-center rounded-full transition-colors ${className}`}
    >
      {dark ? (
        <Sun size={20} strokeWidth={1.75} aria-hidden />
      ) : (
        <Moon size={20} strokeWidth={1.75} aria-hidden />
      )}
    </button>
  );
}
