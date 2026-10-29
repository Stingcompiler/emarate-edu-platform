import { ChevronLeft, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { Card } from "./ui";

/**
 * The pieces every home screen is built from (mockups 2026-10-29, plan
 * docs/qa/redesign-plan-2026-10-29.md): a role's home is a few panels, the first one being what
 * waits on the person. The panels hold quiet rows (docs/ui-profile.md), never cards in cards.
 */

/** A titled card: its heading inside, with an icon and an optional «عرض الكل» at the end. */
export function Panel({
  title,
  icon: Icon,
  more,
  className = "",
  children,
}: {
  title: string;
  icon?: LucideIcon;
  more?: { label?: string; to: string };
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className}>
      <Card className="overflow-hidden">
        <div className="flex min-h-12 items-center gap-2 px-4 pt-1">
          {Icon && (
            <Icon size={20} strokeWidth={1.75} aria-hidden className="shrink-0 text-primary" />
          )}
          <h2 className="flex-1 text-base font-bold text-text">{title}</h2>
          {more && (
            <Link
              to={more.to}
              className="tap-44 inline-flex items-center gap-0.5 text-sm font-semibold text-primary hover:underline"
            >
              {more.label ?? "عرض الكل"}
              <ChevronLeft size={16} aria-hidden className="ltr:rotate-180" />
            </Link>
          )}
        </div>
        <div className="divide-y divide-border-soft border-t border-border-soft">{children}</div>
      </Card>
    </section>
  );
}

/**
 * «يمكنك إنجازه الآن»: the one thing the person can do next, the only filled card on the page
 * (one strong action per screen, docs/06 §2.7). Absent when nothing is due.
 */
export function NextStepCard({
  eyebrow = "يمكنك إنجازه الآن",
  title,
  meta,
  tag,
  action,
}: {
  eyebrow?: string;
  title: string;
  meta?: string;
  /** A short state at the end of the eyebrow line («مفتوح», «متاح للتسليم»). */
  tag?: string;
  action: { label: string; to: string };
}) {
  return (
    <section aria-label={eyebrow} className="rounded-2xl bg-primary-500 p-5 text-white shadow-sm">
      <p className="flex items-center justify-between gap-3 text-sm text-primary-100">
        {eyebrow}
        {tag && (
          <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-white">
            {tag}
          </span>
        )}
      </p>
      <h2 className="mt-2 text-xl font-bold leading-snug">
        {/* The title opens it too (people tap the words first); one tab stop: the button. */}
        <Link to={action.to} tabIndex={-1} className="hover:underline">
          {title}
        </Link>
      </h2>
      {meta && <p className="mt-1 text-sm text-primary-100">{meta}</p>}
      {/* Navy on white in both themes: primary-700 turns light in dark mode (tokens.css). */}
      <Link
        to={action.to}
        className="mt-4 flex min-h-11 items-center justify-center rounded-lg bg-white px-4 text-sm font-semibold text-navy-500 hover:bg-navy-50 lg:inline-flex lg:min-w-48"
      >
        {action.label}
      </Link>
    </section>
  );
}

/** Something that waits on the person's acknowledgement (a regulation, an announcement). */
export function AckBanner({
  title,
  line,
  to,
  label,
}: {
  title: string;
  line: string;
  to: string;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-3 rounded-2xl border border-warning/40 bg-warning-soft px-4 py-3 hover:opacity-95"
    >
      <span className="min-w-0">
        <b className="block text-sm text-text">{title}</b>
        <span className="text-xs text-warning-strong">{line}</span>
      </span>
      <span className="shrink-0 rounded-lg border border-warning-strong/50 px-3 py-2 text-xs font-bold text-warning-strong">
        {label}
      </span>
    </Link>
  );
}

/** «وصول سريع»: the role's frequent destinations as rows inside a Panel. */
export function QuickLinks({
  items,
}: {
  items: { label: string; to: string; icon: LucideIcon }[];
}) {
  return (
    <>
      {items.map(({ label, to, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="flex min-h-12 items-center gap-3 px-4 text-sm text-text hover:bg-surface-alt"
        >
          <Icon size={20} strokeWidth={1.75} aria-hidden className="shrink-0 text-primary" />
          <span className="flex-1">{label}</span>
          <ChevronLeft size={16} aria-hidden className="text-text-muted ltr:rotate-180" />
        </Link>
      ))}
    </>
  );
}
