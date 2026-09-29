import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Motion pieces for the portal (packages/ui/src/motion.css has the rules): each one
 * explains a change — a number arriving, progress towards a goal, a finished step, the
 * selected option. All of them respect «reduce motion» and render the final state
 * immediately when asked to.
 */

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A number that counts up to its value once (e.g. figures on a dashboard). */
export function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString("ar-u-nu-latn"),
  duration = 700,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
}) {
  const [shown, setShown] = useState(() => (reduced() ? value : 0));
  const from = useRef(0);
  useEffect(() => {
    if (reduced()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setShown(origin + (value - origin) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  // Screen readers get the final value, not every step of the count.
  return (
    <>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}

/** Progress towards a goal as a ring that fills (grading done, steps completed …). */
export function ProgressRing({
  value,
  max,
  size = 44,
  label,
  children,
}: {
  value: number;
  max: number;
  size?: number;
  label: string;
  children?: ReactNode;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const r = (size - 6) / 2;
  const length = 2 * Math.PI * r;
  const [drawn, setDrawn] = useState(reduced() ? ratio : 0);
  useEffect(() => {
    // Next frame, so the stroke transitions from its previous length.
    const frame = requestAnimationFrame(() => setDrawn(ratio));
    return () => cancelAnimationFrame(frame);
  }, [ratio]);
  return (
    <span
      role="img"
      aria-label={label}
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth="5"
          className="stroke-surface-alt"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - drawn)}
          className={ratio >= 1 ? "stroke-success" : "stroke-primary"}
          style={{ transition: "stroke-dashoffset var(--dur-4) var(--ease-out)" }}
        />
      </svg>
      {children && (
        <span className="absolute text-[11px] font-bold text-text" aria-hidden="true">
          {children}
        </span>
      )}
    </span>
  );
}

const CONFETTI = ["#2d64a7", "#c8102e", "#1f9d61", "#e0a526", "#618abd", "#e05a6b"];

/** The moment something is done: a check that draws itself, with a little confetti. */
export function SuccessMark({ confetti = false }: { confetti?: boolean }) {
  return (
    <span className="relative mx-auto grid size-16 place-items-center">
      <span className="motion-check grid size-16 place-items-center rounded-full bg-success-soft text-success-strong">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 12.5l4.2 4.2L19 7"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ ["--len" as string]: 22 }}
          />
        </svg>
      </span>
      {confetti && (
        <span className="motion-confetti" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => {
            const angle = (i / 14) * Math.PI * 2;
            const reach = 46 + (i % 3) * 14;
            return (
              <i
                key={i}
                style={{
                  background: CONFETTI[i % CONFETTI.length],
                  ["--x" as string]: `${Math.cos(angle) * reach}px`,
                  ["--y" as string]: `${Math.sin(angle) * reach - 10}px`,
                  ["--r" as string]: `${(i % 2 ? 1 : -1) * (120 + i * 20)}deg`,
                }}
              />
            );
          })}
        </span>
      )}
    </span>
  );
}

/**
 * A segmented choice whose selection slides between the options (theme, phone type …).
 * Same markup as radio buttons for assistive tech.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className = "",
}: {
  label: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const active = box.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (active) setThumb({ left: active.offsetLeft, width: active.offsetWidth });
  }, [value, options.length]);
  return (
    <div
      ref={box}
      role="radiogroup"
      aria-label={label}
      className={`relative flex rounded-lg bg-surface-alt p-0.5 ${className}`}
    >
      {thumb && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0.5 rounded-md bg-surface shadow-xs"
          style={{
            left: thumb.left,
            width: thumb.width,
            transition: "left var(--dur-2) var(--ease-out), width var(--dur-2) var(--ease-out)",
          }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={`relative min-h-9 flex-1 rounded-md px-3 text-sm transition-colors ${value === o.key ? "font-semibold text-text" : "text-text-muted"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
