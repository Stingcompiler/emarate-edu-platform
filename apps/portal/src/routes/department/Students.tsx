import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { PortalShell } from "../../components/PortalShell";
import { FilterBar, Card, Chip, StatusBadge } from "../../components/ui";
import { api } from "../../lib/api";
import { useDepartment } from "../../lib/department";
import { initials, num } from "../../lib/reports";
import { Pager } from "../../components/Pager";

const STATUS: Record<string, string> = {
  active: "منتظم",
  suspended: "موقوف",
  graduated: "متخرج",
  withdrawn: "منسحب",
};

/** Department students: search, level and status filters (§4.15 «طلاب القسم»); phone cards, desktop table. */
export function DepartmentStudents() {
  const { id, department } = useDepartment();
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<number | undefined>();
  const [status, setStatus] = useState<string>("active");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["students", id, search, level, status, page],
    enabled: !!id,
    queryFn: async () =>
      (
        await api.GET("/api/v1/students", {
          params: {
            query: {
              department: id,
              search: search || undefined,
              level,
              status: (status || undefined) as never,
              page,
            },
          },
        })
      ).data ?? null,
  });
  const rows = list.data?.results ?? [];
  const s = rows.find((r) => r.public_id === picked);
  return (
    <PortalShell
      title={`طلاب القسم · ${num(list.data?.count ?? 0)}`}
      subtitle={department?.name_ar}
      back={{ label: "لوحة القسم", to: "/department" }}
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
            className="min-h-10 flex-1 rounded-full border border-border-soft bg-surface px-4 text-sm sm:max-w-sm"
          />
          {[undefined, 1, 2, 3, 4].map((l) => (
            <Chip
              key={l ?? 0}
              active={level === l}
              onClick={() => {
                setLevel(l);
                setPage(1);
              }}
            >
              {l ? `م${num(l)}` : "كل المستويات"}
            </Chip>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {["active", "suspended", "graduated", "withdrawn", ""].map((k) => (
            <Chip
              key={k || "all"}
              active={status === k}
              onClick={() => {
                setStatus(k);
                setPage(1);
              }}
            >
              {k ? STATUS[k] : "كل الحالات"}
            </Chip>
          ))}
        </div>
      </FilterBar>
      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
        <div>
          <Card className="divide-y divide-border-soft">
            {rows.map((r) => (
              <button
                key={r.public_id}
                type="button"
                onClick={() => setPicked(r.public_id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-surface-alt"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-700">
                  {initials(r.full_name_ar)}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm text-text">{r.full_name_ar}</b>
                  <span className="text-xs text-text-muted">
                    <bdi>{r.university_number}</bdi> · {r.program_name} · المستوى {num(r.level)}
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
                  label={STATUS[r.status] ?? r.status}
                />
              </button>
            ))}
            {!rows.length && <p className="px-4 py-4 text-sm text-text-muted">لا طلاب مطابقون.</p>}
          </Card>
          <Pager page={page} count={list.data?.count ?? 0} onPage={setPage} />
        </div>
        <aside className="mt-6 lg:mt-0">
          {s ? (
            <Card className="space-y-2 p-4 text-sm">
              <b className="block text-base text-text">{s.full_name_ar}</b>
              {s.full_name_en && (
                <p dir="ltr" className="text-end text-xs text-text-muted">
                  {s.full_name_en}
                </p>
              )}
              {[
                ["الرقم الجامعي", <bdi key="n">{s.university_number}</bdi>],
                ["البرنامج", s.program_name],
                ["المستوى", num(s.level)],
                ["الحالة", STATUS[s.status] ?? s.status],
                ["البريد", s.email ? <bdi key="e">{s.email}</bdi> : "—"],
                ["الهاتف", s.phone_e164 ? <bdi key="p">{s.phone_e164}</bdi> : "—"],
                ["الحساب", s.has_account ? "مفعّل" : "لم يسجّل بعد"],
              ].map(([k, v]) => (
                <p key={String(k)} className="flex justify-between gap-3">
                  <span className="text-text-muted">{k}</span>
                  <span className="font-medium">{v}</span>
                </p>
              ))}
            </Card>
          ) : (
            <Card className="p-4 text-sm text-text-muted">اختر طالبًا لعرض بياناته.</Card>
          )}
        </aside>
      </div>
    </PortalShell>
  );
}
