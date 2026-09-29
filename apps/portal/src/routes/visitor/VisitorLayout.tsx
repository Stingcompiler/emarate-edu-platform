import type { ReactNode } from "react";
import { Link } from "react-router";

import { ProgressRing } from "../../components/motion";

/** Visitor pages (apply / track): the public-site shell — a centred column up to
 *  800px, no portal navigation (docs/06 §9 special shells). */
export function VisitorLayout({
  title,
  step,
  progress,
  children,
  back,
}: {
  title: string;
  step?: string;
  /** Wizard progress: a ring that fills as the steps are done. */
  progress?: { value: number; max: number };
  children: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-bg-subtle">
      <header className="border-b border-border-soft bg-surface">
        <div className="mx-auto flex h-14 max-w-[800px] items-center gap-3 px-4">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span className="text-sm font-bold text-text">كلية الإمارات للعلوم والتقنية</span>
          <span className="ms-auto flex gap-4 text-sm">
            <Link to="/apply" className="text-primary">
              التقديم
            </Link>
            <Link to="/track" className="text-primary">
              متابعة طلبي
            </Link>
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-[800px] px-4 pb-16 pt-5">
        {back}
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
            <h1 className="mt-1 text-[26px] font-bold leading-tight text-text">{title}</h1>
          </div>
        </div>
        <div className="mt-5">{children}</div>
      </main>
    </div>
  );
}
