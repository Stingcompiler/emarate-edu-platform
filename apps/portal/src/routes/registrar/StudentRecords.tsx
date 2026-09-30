import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { FilterBar, Card, Chip, StatusBadge } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { Picker, initials, num, useDepartments } from "../../lib/reports";
import { Pager } from "../../components/Pager";

export const STUDENT_STATUS: Record<string, string> = {
  active: "منتظم",
  suspended: "موقوف",
  graduated: "متخرج",
  withdrawn: "منسحب",
};

/** «سجل الطلاب» for the head registrar (college-wide): search, filters, open a record. */
export function StudentRecords() {
  const departments = useDepartments();
  const [department, setDepartment] = useState<number>();
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<number>();
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ["students", "records", department, search, level, page],
    queryFn: async () =>
      ok(
        await api.GET("/api/v1/students", {
          params: { query: { department, search: search || undefined, level, page } },
        }),
      ) ?? null,
  });
  const rows = list.data?.results ?? [];
  return (
    <PortalShell
      title={`سجل الطلاب · ${num(list.data?.count ?? 0)}`}
      titleAction={
        <Link to="/student-imports" className="text-sm font-semibold text-primary">
          استيراد
        </Link>
      }
    >
      <FilterBar>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="بحث بالاسم أو الرقم الجامعي"
            aria-label="بحث بالاسم أو الرقم الجامعي"
            className="min-h-10 flex-1 rounded-full border border-border-soft bg-surface px-4 text-sm sm:max-w-sm"
          />
          <Picker
            label="القسم"
            value={department}
            items={departments.data ?? []}
            name={(d) => d.name_ar}
            onChange={(v) => {
              setDepartment(v);
              setPage(1);
            }}
            all="الكل"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {[undefined, 1, 2, 3, 4, 5].map((l) => (
            <Chip
              key={l ?? 0}
              active={level === l}
              onClick={() => {
                setLevel(l);
                setPage(1);
              }}
            >
              {l ? `المستوى ${num(l)}` : "كل المستويات"}
            </Chip>
          ))}
        </div>
      </FilterBar>
      <Card className="mt-4 divide-y divide-border-soft">
        {rows.map((r) => (
          <Link
            key={r.public_id}
            to={`/students/${r.public_id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-700">
              {initials(r.full_name_ar)}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-sm text-text">{r.full_name_ar}</b>
              <span className="text-xs text-text-muted">
                <bdi>{r.university_number}</bdi> · {r.program_name} · المستوى {num(r.level)}
                {r.has_account ? "" : " · لم يفعّل حسابه"}
              </span>
            </span>
            <StatusBadge
              status={
                r.status === "active"
                  ? "approved"
                  : r.status === "suspended"
                    ? "rejected"
                    : "closed"
              }
              label={STUDENT_STATUS[r.status] ?? r.status}
            />
          </Link>
        ))}
        {!rows.length && <p className="px-4 py-4 text-sm text-text-muted">لا نتائج.</p>}
      </Card>
      <Pager page={page} count={list.data?.count ?? 0} onPage={setPage} />
    </PortalShell>
  );
}
