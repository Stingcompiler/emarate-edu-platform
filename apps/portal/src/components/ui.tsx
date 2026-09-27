import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

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
