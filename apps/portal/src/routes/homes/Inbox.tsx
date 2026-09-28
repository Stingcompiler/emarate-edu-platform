import { Link } from "react-router";

import { Card } from "../../components/ui";
import { num } from "../../lib/reports";

export type InboxItem = {
  n: number;
  title: string;
  meta?: string;
  to: string;
  tone?: "warning" | "danger" | "info";
};

/** «يحتاج إجراءً / قرارك» — the numbered action list shared by the role homes. */
export function Inbox({
  items,
  empty = "لا شيء بانتظارك.",
}: {
  items: InboxItem[];
  empty?: string;
}) {
  const shown = items.filter((i) => i.n > 0);
  const tone = {
    warning: "bg-warning-soft text-warning-strong",
    danger: "bg-danger-soft text-danger-strong",
    info: "bg-info-soft text-info-strong",
  };
  return (
    <Card className="divide-y divide-border-soft">
      {shown.map((i) => (
        <Link
          key={i.title}
          to={i.to}
          className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
        >
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-full font-bold ${tone[i.tone ?? "warning"]}`}
          >
            {num(i.n)}
          </span>
          <span className="min-w-0">
            <b className="block text-sm text-text">{i.title}</b>
            {i.meta && <span className="block truncate text-xs text-text-muted">{i.meta}</span>}
          </span>
        </Link>
      ))}
      {!shown.length && <p className="px-4 py-4 text-sm text-text-muted">{empty}</p>}
    </Card>
  );
}
