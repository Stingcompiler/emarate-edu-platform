import { type LucideIcon, Moon, Sun, Sunset } from "lucide-react";

import { MODE_LABEL, type Mode, useTheme } from "../lib/theme";

const ICON: Record<Mode, LucideIcon> = { light: Sun, warm: Sunset, dark: Moon };

/**
 * One tap to the next mode — light, warm, dark (owner, 2026-10-30) — always in the same place;
 * Settings has the three and «النظام». The icon and the words say which mode it turns on.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { next, toggle } = useTheme();
  const Icon = ICON[next];
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={MODE_LABEL[next]}
      title={MODE_LABEL[next]}
      className={`grid size-10 shrink-0 place-items-center rounded-full transition-colors ${className}`}
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

/**
 * The same switch as a nav row: at the foot of the desktop sidebar and in the phone «المزيد»
 * sheet, where people look for settings. Labelled by what it turns on.
 */
export function ThemeRow({
  className = "",
  iconSize = 20,
}: {
  className?: string;
  iconSize?: number;
}) {
  const { next, toggle } = useTheme();
  const Icon = ICON[next];
  return (
    <button type="button" onClick={toggle} className={className}>
      <Icon size={iconSize} strokeWidth={1.75} aria-hidden className="shrink-0 opacity-70" />
      {MODE_LABEL[next]}
    </button>
  );
}
