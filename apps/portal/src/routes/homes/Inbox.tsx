import { ChevronLeft } from "lucide-react";
import { Link } from "react-router";

import { Card } from "../../components/ui";
import { num } from "../../lib/reports";

export type InboxItem = {
  n: number;
  title: string;
  meta?: string;
  to: string;
  tone?: "warning" | "danger" | "info";
  /** The button's words; «فتح» when absent. */
  action?: string;
};

/**
 * «يحتاج إجراءً / قرارك»: what waits on the person, by priority. The count is a plain big
 * number (colour only for urgency), each row ends in a button; the first row's is the
 * primary one. The whole row is the link.
 */
export function Inbox({
  items,
  empty = "لا شيء بانتظارك.",
}: {
  items: InboxItem[];
  empty?: string;
}) {
  const shown = items.filter((i) => i.n > 0);
  const tone = {
    warning: "text-warning-strong",
    danger: "text-danger-strong",
    info: "text-info-strong",
  };
  return (
    <Card className="divide-y divide-border-soft">
      {shown.map((i, at) => (
        <Link
          key={i.title}
          to={i.to}
          className="flex items-center gap-4 px-4 py-3.5 hover:bg-surface-alt"
        >
          <span
            className={`w-12 shrink-0 text-center text-3xl font-bold tabular-nums ${tone[i.tone ?? "warning"]}`}
          >
            {num(i.n)}
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-sm text-text">{i.title}</b>
            {i.meta && <span className="block truncate text-xs text-text-muted">{i.meta}</span>}
          </span>
          <span
            className={`inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-xs font-semibold ${
              at === 0 ? "bg-primary text-on-primary" : "border border-border bg-surface text-text"
            }`}
          >
            {i.action ?? "فتح"}
            <ChevronLeft size={14} aria-hidden />
          </span>
        </Link>
      ))}
      {!shown.length && <p className="px-4 py-4 text-sm text-text-muted">{empty}</p>}
    </Card>
  );
}
