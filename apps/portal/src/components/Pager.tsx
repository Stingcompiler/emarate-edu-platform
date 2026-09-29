import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Lists show 10 items at a time (the API's page size, owner 2026-09-29) with page
 * controls: previous / numbered pages / next, and «عرض 11–20 من 64».
 */
export const PAGE_SIZE = 10;

/** Pages to show: first, last, the current one and its neighbours; gaps become «…». */
function pageList(page: number, pages: number): (number | "gap")[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1]! > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

export function Pager({
  page,
  count,
  onPage,
  pageSize = PAGE_SIZE,
  label = "الصفحات",
}: {
  page: number;
  count: number;
  onPage: (page: number) => void;
  pageSize?: number;
  label?: string;
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (count <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(count, page * pageSize);
  const go = (p: number) => {
    onPage(p);
    // Back to the top of the list, so the new page starts where the eye does.
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };
  const button =
    "grid min-h-11 min-w-11 place-items-center rounded-lg px-2 text-sm lg:min-h-9 lg:min-w-9";
  return (
    <nav
      aria-label={label}
      className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between"
    >
      <p className="text-sm text-text-muted" aria-live="polite">
        عرض {from.toLocaleString("ar-u-nu-latn")}–{to.toLocaleString("ar-u-nu-latn")} من{" "}
        {count.toLocaleString("ar-u-nu-latn")}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => go(page - 1)}
          disabled={page <= 1}
          className={`${button} gap-1 border border-border-soft bg-surface font-semibold text-text hover:bg-surface-alt disabled:opacity-40`}
        >
          <span className="flex items-center gap-1">
            <ChevronRight size={16} aria-hidden className="ltr:rotate-180" />
            السابق
          </span>
        </button>
        {/* Numbers: hidden on the narrowest phones, where «2 / 7» says it. */}
        <span className="px-2 text-sm text-text-muted sm:hidden">
          {page.toLocaleString("ar-u-nu-latn")} / {pages.toLocaleString("ar-u-nu-latn")}
        </span>
        <span className="hidden items-center gap-1 sm:flex">
          {pageList(page, pages).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-text-muted" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => go(p)}
                aria-current={p === page ? "page" : undefined}
                aria-label={`الصفحة ${p.toLocaleString("ar-u-nu-latn")}`}
                className={`${button} ${p === page ? "bg-text font-semibold text-bg" : "text-text hover:bg-surface-alt"}`}
              >
                {p.toLocaleString("ar-u-nu-latn")}
              </button>
            ),
          )}
        </span>
        <button
          type="button"
          onClick={() => go(page + 1)}
          disabled={page >= pages}
          className={`${button} border border-border-soft bg-surface font-semibold text-text hover:bg-surface-alt disabled:opacity-40`}
        >
          <span className="flex items-center gap-1">
            التالي
            <ChevronLeft size={16} aria-hidden className="ltr:rotate-180" />
          </span>
        </button>
      </div>
    </nav>
  );
}

type PageOf<T> = { count: number; results: T[] } | null | undefined;

/**
 * Server paging: the API returns 10 items and the total. ``key`` holds the filters —
 * changing any of them goes back to page 1. The previous page stays on screen while
 * the next one loads (no flash of an empty list).
 */
export function useServerPages<T>(
  key: unknown[],
  fetchPage: (page: number) => Promise<PageOf<T>>,
  options: { refetchInterval?: number } = {},
) {
  const [page, setPage] = useState(1);
  const filters = JSON.stringify(key);
  const last = useRef(filters);
  useEffect(() => {
    if (last.current !== filters) {
      last.current = filters;
      setPage(1);
    }
  }, [filters]);
  const query = useQuery({
    queryKey: [...key, "page", page],
    queryFn: () => fetchPage(page),
    placeholderData: keepPreviousData,
    ...options,
  });
  return {
    query,
    items: query.data?.results ?? [],
    count: query.data?.count ?? 0,
    page,
    setPage,
  };
}

/**
 * Paging on screen for lists that are grouped or counted on this page (exam phases, tab
 * counts): the whole set is loaded once, and shown 10 at a time with the same controls.
 * ``reset`` changes (a tab, a filter) go back to page 1.
 */
export function useLocalPages<T>(items: T[], reset: unknown = null) {
  const [page, setPage] = useState(1);
  const resetKey = JSON.stringify(reset);
  useEffect(() => setPage(1), [resetKey]);
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = useMemo(
    () => items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
    [items, current],
  );
  return { shown, page: current, setPage, count: items.length };
}

/** The query for a whole set (selects, summaries): the API's maximum page. */
export const ALL = { page_size: 100 } as const;
