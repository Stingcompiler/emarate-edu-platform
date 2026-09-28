import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

import { CountUp } from "./motion";

/** Small shared primitives for portal pages; tokens only (docs/06). */

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const styles = {
    primary: "bg-primary text-white hover:bg-primary-hover disabled:opacity-60",
    secondary: "border border-border bg-surface text-text hover:bg-surface-alt disabled:opacity-60",
    ghost: "text-primary hover:bg-primary-soft disabled:opacity-60",
  }[variant];
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${styles} ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border-soft bg-surface shadow-xs ${className}`}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 mt-5 px-1 text-xs font-semibold text-text-muted first:mt-0">{children}</h2>
  );
}

/** A labelled input row; several stack inside one Card as a grouped form (iOS style). */
export function Field({
  label,
  hint,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  return (
    <label className="block border-b border-border-soft px-4 py-2.5 last:border-b-0">
      <span className="block text-xs text-text-muted">{label}</span>
      <input
        {...props}
        aria-invalid={error ? true : undefined}
        className="mt-0.5 block w-full bg-transparent text-base text-text outline-none placeholder:text-n400"
      />
      {hint && !error && <span className="mt-1 block text-xs text-text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-danger-strong">{error}</span>}
    </label>
  );
}

export function TextArea({
  label,
  error,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }) {
  return (
    <label className="block border-b border-border-soft px-4 py-2.5 last:border-b-0">
      <span className="block text-xs text-text-muted">{label}</span>
      <textarea
        {...props}
        className="mt-0.5 block min-h-28 w-full resize-y bg-transparent text-base leading-relaxed text-text outline-none"
      />
      {error && <span className="mt-1 block text-xs text-danger-strong">{error}</span>}
    </label>
  );
}

export function Chip({
  active,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...props}
      className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm transition-colors ${
        active
          ? "bg-text font-semibold text-bg"
          : "border border-border-soft bg-surface text-text hover:bg-surface-alt"
      }`}
    >
      {children}
    </button>
  );
}

export function Notice({
  tone = "danger",
  children,
}: {
  tone?: "danger" | "info" | "success" | "warning";
  children: ReactNode;
}) {
  const styles = {
    danger: "bg-danger-soft text-danger-strong",
    info: "bg-info-soft text-info-strong",
    success: "bg-success-soft text-success-strong",
    warning: "bg-warning-soft text-warning-strong",
  }[tone];
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${styles}`}
    >
      {children}
    </p>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-surface-alt text-text-muted">
        {icon}
      </div>
      <p className="mt-4 font-semibold text-text">{title}</p>
      {children && (
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-text-muted">{children}</p>
      )}
    </div>
  );
}

/** Auth pages: full-bleed on phones, a centred 440px card on larger screens (docs/06 §9). */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-bg px-4 pb-10 pt-[max(3rem,env(safe-area-inset-top))] sm:grid sm:place-items-center sm:bg-bg-subtle sm:py-12">
      <div className="mx-auto w-full max-w-[440px] sm:rounded-2xl sm:border sm:border-border-soft sm:bg-surface sm:p-8 sm:shadow-md">
        <img src="/favicon.svg" alt="" width={56} height={56} className="mx-auto" />
        <h1 className="mt-4 text-center text-2xl font-bold text-text">{title}</h1>
        {subtitle && <p className="mt-1 text-center text-sm text-text-muted">{subtitle}</p>}
        <div className="mt-7">{children}</div>
      </div>
    </main>
  );
}

/** First message of a problem+json error, preferring field errors. */
export function problemMessage(error: unknown, fallback = "حدث خطأ. أعد المحاولة."): string {
  if (error && typeof error === "object") {
    const body = error as { errors?: Record<string, string[]>; detail?: string };
    const first = body.errors && Object.values(body.errors)[0]?.[0];
    return first || body.detail || fallback;
  }
  return fallback;
}

const TONES = {
  neutral: "bg-neutral-soft text-neutral-strong",
  info: "bg-info-soft text-info-strong",
  warning: "bg-warning-soft text-warning-strong",
  success: "bg-success-soft text-success-strong",
  danger: "bg-danger-soft text-danger-strong",
} as const;

/** Status colours are fixed across the system (docs/06 §2.4). */
const STATUS_TONE: Record<string, keyof typeof TONES> = {
  draft: "neutral",
  closed: "neutral",
  superseded: "neutral",
  unpublished: "neutral",
  open: "info",
  new: "info",
  validated: "info",
  pending: "warning",
  has_errors: "warning",
  suggested: "warning",
  committed: "success",
  published: "success",
  approved: "success",
  decided: "success",
  converted: "success",
  pass: "success",
  rejected: "danger",
  dismissed: "danger",
  fail: "danger",
  absent: "danger",
  withdrawn: "neutral",
  incomplete: "warning",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone = TONES[STATUS_TONE[status] ?? "neutral"];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      {label}
    </span>
  );
}

/** A small rounded code tile (course code / initials), as on the boards. */
export function CodeTile({ top, bottom }: { top: string; bottom?: string }) {
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary-soft text-center leading-tight text-primary-700">
      <span className="text-[11px] font-semibold">{top}</span>
      {bottom && <span className="text-sm font-bold">{bottom}</span>}
    </span>
  );
}

/** Splits "IT101" into ["IT", "101"] for CodeTile. */
export function splitCode(code: string): [string, string] {
  const match = /^([A-Za-z]+)(.*)$/.exec(code);
  return match ? [match[1] ?? code, match[2] ?? ""] : [code, ""];
}

export const STATUS_LABELS: Record<string, string> = {
  validated: "جاهزة للاعتماد",
  has_errors: "بها أخطاء",
  committed: "معتمدة",
  published: "منشورة",
  unpublished: "أُلغي نشرها",
  rejected: "مرفوضة",
  pending: "معلّق",
  approved: "مقبول",
  pass: "ناجح",
  fail: "راسب",
  absent: "غائب",
  withdrawn: "منسحب",
  incomplete: "غير مكتمل",
  draft: "مسودة",
  superseded: "مستبدلة",
  open: "مفتوحة",
  decided: "صدر قرار",
  closed: "مغلقة",
  new: "جديد",
  converted: "حُوّل إلى حالة",
  dismissed: "رُفض",
};

/** iOS-style on/off switch (boards SystemAdminSettings, ResultSettings). 44px touch height. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-grid min-h-11 shrink-0 place-items-center disabled:opacity-60"
    >
      <span
        className={`relative block h-7 w-12 rounded-full transition-colors ${checked ? "bg-success" : "bg-n300"}`}
      >
        <span
          className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}

/** A sideways-scrolling area (wide tables on phones). Focusable and named, so keyboard users
 *  can scroll it too (WCAG 2.1.1; axe "scrollable-region-focusable"). */
export function ScrollRegion({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={`overflow-x-auto rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * The large-screen layout (skill responsive-page §2a): the page's content beside a side
 * column — summary figures, help, related actions — so a wide screen is not a narrow
 * column in empty space. Phones show the side column after the content.
 */
export function WithSide({ side, children }: { side: ReactNode; children: ReactNode }) {
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">{children}</div>
      <aside className="mt-6 space-y-4 lg:sticky lg:top-6 lg:mt-0">{side}</aside>
    </div>
  );
}

/** Figures for a side column: [label, value] rows in one card. */
export function SideFigures({ title, rows }: { title?: string; rows: [string, ReactNode][] }) {
  return (
    <Card className="p-4">
      {title && <h2 className="mb-3 text-xs font-semibold text-text-muted">{title}</h2>}
      <dl className="grid grid-cols-2 gap-3">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-surface-alt p-3">
            <dd className="text-xl font-bold text-text">
              {typeof value === "number" ? <CountUp value={value} /> : value}
            </dd>
            <dt className="text-xs text-text-muted">{label}</dt>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** A short explanation for a side column (how this page works, who sees what). */
export function SideNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-4 text-sm leading-6">
      <h2 className="font-semibold text-text">{title}</h2>
      <div className="mt-1 text-text-muted">{children}</div>
    </Card>
  );
}
