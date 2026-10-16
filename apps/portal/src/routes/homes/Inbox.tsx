import { ChevronLeft } from "lucide-react";
import { Link } from "react-router";

import { Card, Skeleton } from "../../components/ui";
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

type Source = { isLoading: boolean; isError: boolean; refetch: () => unknown };

/**
 * What the sources an inbox is built from are doing, for its `loading`/`failed` props:
 * spread it (`<Inbox {...inboxState(a, b)} items={…} />`). An empty list is only «nothing
 * waits for you» once every source has loaded; before that it is loading, or failed.
 */
export function inboxState(...sources: Source[]) {
  return {
    loading: sources.some((q) => q.isLoading),
    failed: sources.some((q) => q.isError),
    onRetry: () => sources.filter((q) => q.isError).forEach((q) => void q.refetch()),
  };
}

/**
 * «يحتاج إجراءً / قرارك»: what waits on the person, by priority. The count is a plain big
 * number (colour only for urgency), each row ends in a button; the first row's is the
 * primary one. The whole row is the link.
 */
export function Inbox({
  items,
  empty = "لا شيء بانتظارك.",
  loading = false,
  failed = false,
  onRetry,
}: {
  items: InboxItem[];
  empty?: string;
  loading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
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
      {loading && (
        <div className="space-y-3 px-4 py-4" role="status" aria-label="جارٍ التحميل">
          {(shown.length ? [0] : [0, 1, 2]).map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-8 w-12 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/3 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && failed && (
        <p role="alert" className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <span className="text-danger-strong">
            {shown.length ? "قد تنقص بعض العناصر: تعذّر تحميل جزء منها." : "تعذّر تحميل ما ينتظرك."}
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="tap-44 shrink-0 font-semibold text-primary hover:underline"
            >
              أعد المحاولة
            </button>
          )}
        </p>
      )}
      {!loading && !failed && !shown.length && (
        <p className="px-4 py-4 text-sm text-text-muted">{empty}</p>
      )}
    </Card>
  );
}
