import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { DeleteEverythingDialog } from "../../components/DeleteEverything";
import { PortalShell } from "../../components/PortalShell";
import { StudentForm } from "../../components/StudentForm";
import { Avatar, Button, Card, Chip, FilterBar, StatusBadge } from "../../components/ui";
import { api, ok } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { can, canEverywhere } from "../../lib/nav";
import { levelSemester } from "../../lib/format";
import { Picker, initials, num, useDepartments } from "../../lib/reports";
import { Pager } from "../../components/Pager";

export const STUDENT_STATUS: Record<string, string> = {
  active: "منتظم",
  suspended: "موقوف",
  graduated: "متخرج",
  withdrawn: "منسحب",
};

/** «سجل الطلاب» for the head registrar (college-wide): search, filters, open a record; the
 * holders of ``students.manage`` add a student by hand beside the import (owner, 2026-11-08). */
export function StudentRecords() {
  const me = useMe();
  const canAdd = canEverywhere(me.data, "students.manage");
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
  // The system admin deletes many students at once, with everything they hold (owner,
  // 2026-11-15): picked one by one on any page, or every student the filters show.
  const deletes = can(me.data, "records.delete_all");
  const client = useQueryClient();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [gathering, setGathering] = useState(false);
  const toggle = (id: string) =>
    setPicked((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pickAllShown = async () => {
    setGathering(true);
    const ids = new Set(picked);
    for (let n = 1; ; n++) {
      const found = ok(
        await api.GET("/api/v1/students", {
          params: {
            query: { department, search: search || undefined, level, page: n, page_size: 100 },
          },
        }),
      );
      for (const r of found?.results ?? []) ids.add(r.public_id);
      if (!found?.next) break;
    }
    setPicked(ids);
    setGathering(false);
  };
  const box = (id: string, name: string) =>
    deletes && (
      <input
        type="checkbox"
        aria-label={`تحديد ${name}`}
        checked={picked.has(id)}
        onChange={() => toggle(id)}
        className="size-5 shrink-0 accent-danger"
      />
    );
  return (
    <PortalShell
      title={`سجل الطلاب · ${num(list.data?.count ?? 0)}`}
      titleAction={
        <span className="flex items-center gap-3">
          <Link to="/student-imports" className="text-sm font-semibold text-primary">
            استيراد
          </Link>
          {canAdd && (
            <Link
              to="/students/new"
              className="inline-flex min-h-10 items-center gap-1 rounded-full bg-primary px-3 text-sm font-semibold text-on-primary"
            >
              <Plus size={16} aria-hidden />
              طالب
            </Link>
          )}
        </span>
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
      {deletes && (
        <div className="mt-3 flex flex-wrap items-center gap-2" data-bulk-delete>
          <Button
            variant="secondary"
            className="min-h-10 px-3"
            disabled={gathering || !(list.data?.count ?? 0)}
            why={gathering ? "جارٍ التحديد" : "لا طلاب في نتائج التصفية"}
            onClick={() => void pickAllShown()}
          >
            {gathering ? "جارٍ التحديد…" : `تحديد كل نتائج التصفية (${num(list.data?.count ?? 0)})`}
          </Button>
          {picked.size > 0 && (
            <>
              <Button variant="danger" className="min-h-10 px-3" onClick={() => setDeleting(true)}>
                <Trash2 size={16} aria-hidden />
                حذف المحدَّدين ({num(picked.size)})
              </Button>
              <button
                type="button"
                className="min-h-10 px-2 text-sm text-text-muted hover:text-text"
                onClick={() => setPicked(new Set())}
              >
                إلغاء التحديد
              </button>
            </>
          )}
        </div>
      )}
      {deleting && (
        <DeleteEverythingDialog
          kind="student"
          ids={[...picked]}
          onDone={() => {
            setPicked(new Set());
            void client.invalidateQueries({ queryKey: ["students"] });
          }}
          onClose={() => setDeleting(false)}
        />
      )}
      {/* Large screens: a table (review 2026-09-29 PR 7, «سجل الطلاب بجدول»); phones keep rows. */}
      <Card className="mt-4 hidden overflow-hidden lg:block">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-xs text-text-muted">
            <tr>
              {deletes && (
                <th scope="col" className="w-10 px-4 py-2">
                  <span className="sr-only">تحديد</span>
                </th>
              )}
              {["الطالب", "الرقم الجامعي", "البرنامج", "المستوى والفصل", "الحساب", "الحالة"].map(
                (h) => (
                  <th key={h} scope="col" className="px-4 py-2 text-start font-medium">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {rows.map((r) => (
              <tr key={r.public_id} className="hover:bg-surface-alt">
                {deletes && <td className="px-4 py-2.5">{box(r.public_id, r.full_name_ar)}</td>}
                <th scope="row" className="px-4 py-2.5 text-start font-normal">
                  <Link
                    to={`/students/${r.public_id}`}
                    className="flex items-center gap-3 font-semibold text-text hover:text-primary"
                  >
                    <Avatar text={initials(r.full_name_ar)} size="sm" tone="primary" />
                    {r.full_name_ar}
                  </Link>
                </th>
                <td className="px-4 py-2.5 text-text-muted">
                  <bdi className="num">{r.university_number}</bdi>
                </td>
                <td className="px-4 py-2.5 text-text-muted">{r.program_name}</td>
                <td className="px-4 py-2.5">{levelSemester(r.level, r.semester)}</td>
                <td
                  className={`px-4 py-2.5 text-xs ${r.has_account ? "text-success-strong" : "text-text-muted"}`}
                >
                  {r.has_account ? "مفعّل" : "لم يفعّل"}
                </td>
                <td className="px-4 py-2.5">
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="px-4 py-4 text-sm text-text-muted">لا نتائج.</p>}
      </Card>
      <Card className="mt-4 divide-y divide-border-soft lg:hidden">
        {rows.map((r) => (
          <div key={r.public_id} className="flex items-center gap-2 ps-[var(--d-pad)]">
            {box(r.public_id, r.full_name_ar)}
            <Link
              to={`/students/${r.public_id}`}
              className="flex min-w-0 flex-1 items-center gap-[var(--d-gap)] px-[var(--d-pad)] py-[var(--d-row)] hover:bg-surface-alt"
            >
              <Avatar text={initials(r.full_name_ar)} size="md" tone="primary" />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm text-text">{r.full_name_ar}</b>
                <span className="text-xs text-text-muted">
                  <bdi className="num">{r.university_number}</bdi> · {r.program_name} ·{" "}
                  {levelSemester(r.level, r.semester)}
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
          </div>
        ))}
        {!rows.length && <p className="px-4 py-4 text-sm text-text-muted">لا نتائج.</p>}
      </Card>
      <Pager page={page} count={list.data?.count ?? 0} onPage={setPage} />
    </PortalShell>
  );
}

/** «طالب جديد» from the college-wide record (owner, 2026-11-08): any programme of any
 * department; the saved record opens next. */
export function NewStudent() {
  const navigate = useNavigate();
  const client = useQueryClient();
  return (
    <PortalShell title="طالب جديد" back={{ label: "سجل الطلاب", to: "/students" }}>
      <div className="max-w-xl">
        <StudentForm
          heading={false}
          onCancel={() => navigate("/students")}
          onSaved={(saved) => {
            client.invalidateQueries({ queryKey: ["students"] });
            navigate(`/students/${saved.public_id}`, { replace: true });
          }}
        />
      </div>
    </PortalShell>
  );
}
