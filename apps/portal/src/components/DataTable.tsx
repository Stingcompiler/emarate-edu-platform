import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "./ui";

export type Sort = { field: string; dir: "asc" | "desc" } | null;

/** asc → desc → none (the server's own order), the three states of a sortable header. */
export function nextSort(current: Sort, field: string): Sort {
  if (!current || current.field !== field) return { field, dir: "asc" };
  return current.dir === "asc" ? { field, dir: "desc" } : null;
}

/** The `ordering` query value for a sort (DRF: `-field` is descending); undefined when none. */
export const orderingOf = (sort: Sort): string | undefined =>
  sort ? `${sort.dir === "desc" ? "-" : ""}${sort.field}` : undefined;

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** The server field this header sorts by; no sorting when absent. */
  sort?: string;
  /** A figure: tabular digits, aligned to the end of the column. */
  numeric?: boolean;
  className?: string;
};

/**
 * A real table for large screens, for the lists where people act on several rows at once
 * (design review B7): column headers that sort in three states, a checkbox column with a
 * select-all, and a bar of bulk actions that appears when something is selected. The page keeps
 * its quiet row list for phones and for lists without bulk actions (docs/ui-profile.md).
 */
export function DataTable<T>({
  rows,
  rowId,
  columns,
  sort,
  onSort,
  selection,
  bulkBar,
  caption,
}: {
  rows: T[];
  rowId: (row: T) => string;
  columns: Column<T>[];
  sort: Sort;
  onSort: (next: Sort) => void;
  /** Checkboxes, when the person may act in bulk. */
  selection?: {
    picked: Set<string>;
    onChange: (next: Set<string>) => void;
    label: (row: T) => string;
  };
  /** Shown above the table while something is selected. */
  bulkBar?: ReactNode;
  caption: string;
}) {
  const ids = rows.map(rowId);
  const all = !!selection && ids.length > 0 && ids.every((id) => selection.picked.has(id));
  const some = !!selection && ids.some((id) => selection.picked.has(id));
  const toggle = (id: string) => {
    if (!selection) return;
    const next = new Set(selection.picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onChange(next);
  };
  return (
    <div className="hidden lg:block">
      {selection && selection.picked.size > 0 && bulkBar}
      <Card className="mt-3 overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface-alt text-xs text-text-muted">
            <tr>
              {selection && (
                <th scope="col" className="w-11 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="تحديد كل الصفوف المعروضة"
                    checked={all}
                    ref={(el) => {
                      if (el) el.indeterminate = some && !all;
                    }}
                    onChange={() => selection.onChange(all ? new Set() : new Set(ids))}
                    className="size-4"
                  />
                </th>
              )}
              {columns.map((c) => {
                const active = sort?.field === c.sort;
                const ariaSort =
                  c.sort == null
                    ? undefined
                    : active
                      ? sort!.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none";
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={ariaSort}
                    className={`px-3 py-2 font-semibold ${c.numeric ? "text-end" : "text-start"} ${c.className ?? ""}`}
                  >
                    {c.sort ? (
                      <button
                        type="button"
                        onClick={() => onSort(nextSort(sort, c.sort!))}
                        className={`inline-flex items-center gap-1 rounded hover:text-text ${active ? "text-text" : ""}`}
                      >
                        {c.header}
                        {active ? (
                          sort!.dir === "asc" ? (
                            <ArrowUp size={13} aria-hidden />
                          ) : (
                            <ArrowDown size={13} aria-hidden />
                          )
                        ) : (
                          <ChevronsUpDown size={13} className="opacity-50" aria-hidden />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {rows.map((row) => {
              const id = rowId(row);
              const picked = !!selection?.picked.has(id);
              return (
                <tr key={id} className={picked ? "bg-primary-soft/40" : "hover:bg-surface-alt"}>
                  {selection && (
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={selection.label(row)}
                        checked={picked}
                        onChange={() => toggle(id)}
                        className="size-4"
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-3 py-2.5 align-middle ${c.numeric ? "num" : "text-start"} ${c.className ?? ""}`}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
