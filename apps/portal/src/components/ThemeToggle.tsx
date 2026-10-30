import { Check, type LucideIcon, Moon, Sun, Sunset } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { type Mode, useTheme } from "../lib/theme";

const MODES: { key: Mode; label: string; icon: LucideIcon }[] = [
  { key: "light", label: "فاتح", icon: Sun },
  { key: "warm", label: "دافئ", icon: Sunset },
  { key: "dark", label: "داكن", icon: Moon },
];
const ICON: Record<Mode, LucideIcon> = { light: Sun, warm: Sunset, dark: Moon };

/**
 * The theme button opens the three modes to choose from (owner, 2026-10-30: the person picks,
 * nothing changes by itself). The icon shows the mode in use; Settings also has «النظام».
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { mode, set } = useTheme();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    box.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const Icon = ICON[mode];
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="المظهر"
        title="المظهر"
        className={`grid size-10 shrink-0 place-items-center rounded-full transition-colors ${className}`}
      >
        <Icon size={20} strokeWidth={1.75} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="المظهر"
          className="absolute end-0 top-full z-50 mt-1 w-40 rounded-xl border border-border-soft bg-surface p-1 text-text shadow-md"
        >
          {MODES.map(({ key, label, icon: ItemIcon }) => (
            <button
              key={key}
              type="button"
              role="menuitemradio"
              aria-checked={mode === key}
              onClick={() => {
                set(key);
                setOpen(false);
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm hover:bg-surface-alt"
            >
              <ItemIcon size={18} strokeWidth={1.75} aria-hidden className="shrink-0" />
              <span className="flex-1 text-start">{label}</span>
              {mode === key && <Check size={16} aria-hidden className="text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The same choice as a row: at the foot of the desktop sidebar and in the phone «المزيد»
 * sheet — «المظهر» with the three modes side by side, the one in use marked.
 */
export function ThemeRow({
  className = "",
  iconSize = 20,
  onDark = false,
}: {
  className?: string;
  iconSize?: number;
  /** On the navy sidebar: light chips on a dark ground. */
  onDark?: boolean;
}) {
  const { mode, set } = useTheme();
  const Icon = ICON[mode];
  return (
    <div className={`${className} flex-wrap`}>
      <Icon size={iconSize} strokeWidth={1.75} aria-hidden className="shrink-0 opacity-70" />
      <span className="flex-1">المظهر</span>
      <span role="radiogroup" aria-label="المظهر" className="flex gap-1">
        {MODES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={mode === key}
            onClick={() => set(key)}
            className={`min-h-9 rounded-md px-2.5 text-xs font-semibold ${
              mode === key
                ? onDark
                  ? "bg-white text-navy-500"
                  : "bg-primary text-on-primary"
                : onDark
                  ? "bg-white/10 text-white hover:bg-white/20"
                  : "bg-surface-alt text-text hover:bg-border-soft"
            }`}
          >
            {label}
          </button>
        ))}
      </span>
    </div>
  );
}
