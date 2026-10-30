import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { ConnectivityBar } from "../../components/ConnectivityBar";
import { VisitorNav, siteLink } from "../../components/VisitorNav";
import { ProgressRing } from "../../components/motion";
import { SITE_URL } from "../../lib/site";

/**
 * Visitor pages (apply / track), redesigned 2026-10-30 (owner): the site's navigation on top
 * (sticky, hidden while scrolling, back when it stops); on phones one column, on large screens
 * the form beside a side column with the steps and help (docs/06 §9 special shells).
 */
export function VisitorLayout({
  title,
  step,
  progress,
  steps,
  aside,
  children,
  back,
}: {
  title: string;
  step?: string;
  /** Wizard progress: a ring that fills as the steps are done. */
  progress?: { value: number; max: number };
  /** The wizard's steps: a line under the title on phones, a list in the side column. */
  steps?: { labels: string[]; current: number };
  /** More for the side column on large screens (after the steps, before the help). */
  aside?: ReactNode;
  children: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-bg-subtle">
      <VisitorNav />
      <main className="mx-auto max-w-[1120px] px-4 pb-16 pt-5 lg:px-8 lg:pt-8">
        <ConnectivityBar />
        {back}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-10">
          <div className="min-w-0">
            <div className="mt-2 flex items-center gap-3">
              {progress && (
                <ProgressRing
                  value={progress.value}
                  max={progress.max}
                  label={step ?? `${progress.value} / ${progress.max}`}
                >
                  {progress.value.toLocaleString("ar-u-nu-latn")}/
                  {progress.max.toLocaleString("ar-u-nu-latn")}
                </ProgressRing>
              )}
              <div>
                {step && <p className="text-xs font-semibold text-text-muted">{step}</p>}
                <h1 className="mt-1 text-[26px] font-bold leading-tight text-text lg:text-3xl">
                  {title}
                </h1>
              </div>
            </div>
            {steps && (
              <ol className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted lg:hidden">
                {steps.labels.map((label, i) => (
                  <li key={label} className={stepTone(i + 1, steps.current)}>
                    {i + 1 < steps.current ? "✓ " : `${i + 1}. `}
                    {label}
                  </li>
                ))}
              </ol>
            )}
            <div className="mt-5 lg:mt-6">{children}</div>
          </div>
          <aside className="mt-8 space-y-4 lg:sticky lg:top-24 lg:mt-2">
            {steps && (
              <section
                aria-label="خطوات التقديم"
                className="hidden rounded-xl border border-border-soft bg-surface p-4 shadow-xs lg:block"
              >
                <ol className="space-y-1">
                  {steps.labels.map((label, i) => {
                    const n = i + 1;
                    const done = n < steps.current;
                    const now = n === steps.current;
                    return (
                      <li
                        key={label}
                        aria-current={now ? "step" : undefined}
                        className={`flex min-h-10 items-center gap-3 rounded-lg px-2 text-sm ${now ? "bg-primary-soft" : ""} ${stepTone(n, steps.current)}`}
                      >
                        <span
                          className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                            done
                              ? "bg-success text-white"
                              : now
                                ? "bg-primary text-on-primary"
                                : "border border-border text-text-muted"
                          }`}
                        >
                          {done ? (
                            <Check size={14} aria-hidden />
                          ) : (
                            n.toLocaleString("ar-u-nu-latn")
                          )}
                        </span>
                        {label}
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}
            {aside}
            <section className="rounded-xl border border-border-soft bg-surface p-4 text-sm shadow-xs">
              <h2 className="font-bold text-text">تحتاج مساعدة؟</h2>
              <p className="mt-1 leading-6 text-text-muted">
                مكتب القبول يجيب عن أسئلة التقديم والبرامج والرسوم.
              </p>
              <a
                href={`${SITE_URL}/ar/contact/`}
                {...siteLink()}
                className="tap-44 mt-2 inline-flex items-center font-semibold text-primary hover:underline"
              >
                تواصل مع القبول
              </a>
            </section>
            <p className="text-center text-sm text-text-muted lg:text-start">
              <a href={SITE_URL} {...siteLink()} className="font-semibold hover:text-text">
                العودة إلى موقع الكلية
              </a>
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}

const stepTone = (n: number, current: number) =>
  n === current ? "font-semibold text-primary" : n < current ? "text-success-strong" : "";
