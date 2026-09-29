import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { PortalShell } from "../../components/PortalShell";
import { FilterBar, Card, Chip, EmptyState } from "../../components/ui";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { can } from "../../lib/nav";
import {
  ExportBar,
  Picker,
  TeacherStatus,
  days,
  downloadCsv,
  initials,
  num,
  pct,
  useDepartments,
  useTerms,
} from "../../lib/reports";
import { count, N } from "../../lib/format";

export type TeacherRow = {
  public_id: string;
  name: string;
  department: string;
  kind: string;
  admin_role: string | null;
  offerings: number;
  students: number;
  lectures: number | null;
  planned: number | null;
  upload_percent: number | null;
  assignments: number | null;
  exams: number | null;
  grading_days: number | null;
  ungraded: number;
  ungraded_percent: number | null;
  live_held: number;
  live_planned: number;
  status: string;
};

export const ROLE_LINE = (r: Pick<TeacherRow, "kind" | "admin_role" | "department">) =>
  `${r.department || "—"} · ${r.admin_role === "department_manager" ? "مدير القسم" : r.admin_role === "department_supervisor" ? "مشرف القسم" : r.kind === "ta" ? "معيد" : "أستاذ"}`;

export function useTeachersReport(term?: number, department?: number, kind?: string) {
  return useQuery({
    queryKey: ["reports", "teachers", term, department, kind],
    queryFn: async () => {
      const { data } = await api.GET("/api/v1/reports/teachers", {
        params: {
          query: { term, department, kind: (kind || undefined) as "teacher" | "ta" | undefined },
        },
      });
      return data ?? null;
    },
  });
}

const FILTERS = [
  { key: "", label: "الكل" },
  { key: "below", label: "تحت الحد" },
  { key: "warn", label: "تنبيه" },
  { key: "ok", label: "ضمن الحدود" },
];

/** Board: DesktopHRTeachers (desktop table); phone derived — one card per teacher. */
export function Teachers() {
  const me = useMe();
  const notify = can(me.data, "hr.notify");
  const collegeWide = !!(
    me.data?.capabilities?.["reports.teachers"] as { everything?: boolean } | undefined
  )?.everything;
  const terms = useTerms();
  const departments = useDepartments();
  const [term, setTerm] = useState<number>();
  const [department, setDepartment] = useState<number>();
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const report = useTeachersReport(term, department, kind);
  const r = report.data;
  const rows = (r?.rows ?? []).filter((row) => !status || row.status === status);
  const csv = () =>
    r &&
    downloadCsv(
      `teachers-${r.term.name}`,
      [
        "الاسم",
        "القسم",
        "النوع",
        "مواد",
        "طلاب",
        "محاضرات",
        "مخطط",
        "انتظام الرفع٪",
        "واجبات",
        "اختبارات",
        "زمن التصحيح (يوم)",
        "غير مصحح٪",
        "بث منفذ",
        "بث مخطط",
        "الحالة",
      ],
      r.rows.map((t) => [
        t.name,
        t.department,
        t.kind === "ta" ? "معيد" : "أستاذ",
        t.offerings,
        t.students,
        t.lectures,
        t.planned,
        t.upload_percent,
        t.assignments,
        t.exams,
        t.grading_days,
        t.ungraded_percent,
        t.live_held,
        t.live_planned,
        t.status,
      ]),
    );
  const counts = r?.summary.counts;
  return (
    <PortalShell
      title={`مؤشرات الأساتذة${r ? ` · ${num(r.summary.members)}` : ""}`}
      subtitle={
        r
          ? `${r.term.name} · حتى الأسبوع ${num(r.term.week)}${r.previous ? ` · مقارنة بـ${r.previous.term}` : ""}`
          : undefined
      }
      back={can(me.data, "hr.view") ? { label: "الموارد البشرية", to: "/hr" } : undefined}
    >
      <FilterBar>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Chip key={f.key} active={status === f.key} onClick={() => setStatus(f.key)}>
              {f.label}{" "}
              {counts && num(f.key ? counts[f.key as keyof typeof counts] : r!.summary.members)}
            </Chip>
          ))}
          <div className="ms-auto">
            <ExportBar
              onCsv={csv}
              snapshot={{ kind: "teachers", term: term ?? r?.term.id, department }}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Picker
            label="الفصل"
            value={term ?? r?.term.id}
            items={terms.data ?? []}
            name={(t) => t.name_ar}
            onChange={setTerm}
          />
          {collegeWide && (
            <Picker
              label="القسم"
              value={department}
              items={departments.data ?? []}
              name={(d) => d.name_ar}
              onChange={setDepartment}
              all="الكل"
            />
          )}
          <label className="flex items-center gap-2 text-xs text-text-muted">
            الدور
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="min-h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text"
            >
              <option value="">أساتذة + معيدون</option>
              <option value="teacher">أساتذة</option>
              <option value="ta">معيدون</option>
            </select>
          </label>
          {r && (
            <span className="text-xs text-text-muted">
              الحدود: تصحيح ≤ {count(r.thresholds.grading_days, N.day)} · رفع ≥{" "}
              {num(r.thresholds.upload_percent)}٪
            </span>
          )}
        </div>
      </FilterBar>

      {!rows.length ? (
        <Card className="mt-4">
          <EmptyState icon={<Users size={24} aria-hidden />} title="لا أساتذة هنا" />
        </Card>
      ) : (
        <Card className="mt-4 divide-y divide-border-soft overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_70px_90px_60px_60px_60px_60px_70px_70px_110px] gap-2 bg-surface-alt px-4 py-2 text-[11px] text-text-muted xl:grid">
            <span>الأستاذ</span>
            <span>مواد · طلاب</span>
            <span>محاضرات · انتظام</span>
            <span>واجبات</span>
            <span>اختبارات</span>
            <span>التصحيح</span>
            <span>غير مصحح</span>
            <span>بث</span>
            <span>الحالة</span>
            <span />
          </div>
          {rows.map((t) => (
            <div
              key={t.public_id}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-sm xl:grid-cols-[minmax(0,1.6fr)_70px_90px_60px_60px_60px_60px_70px_70px_110px] xl:gap-2"
            >
              <Link
                to={`/hr/teachers/${t.public_id}`}
                className="col-span-2 flex min-w-0 items-center gap-3 xl:col-span-1"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-700">
                  {initials(t.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-text">{t.name}</span>
                  <span className="block truncate text-xs text-text-muted">{ROLE_LINE(t)}</span>
                </span>
              </Link>
              <span className="xl:hidden">
                <TeacherStatus status={t.status} />
              </span>
              <span className="col-span-3 text-xs text-text-muted xl:hidden">
                {count(t.offerings, N.course)} · تصحيح {days(t.grading_days)} · رفع{" "}
                {pct(t.upload_percent)} · غير مصحح {pct(t.ungraded_percent)} · بث {num(t.live_held)}
                /{num(t.live_planned)}
              </span>
              <span className="hidden xl:inline">
                {num(t.offerings)} · {num(t.students)}
              </span>
              <span
                className={`hidden xl:inline ${t.upload_percent != null && r && t.upload_percent < r.thresholds.upload_percent ? "font-semibold text-danger-strong" : ""}`}
              >
                {t.lectures == null
                  ? "—"
                  : `${num(t.lectures)}/${num(t.planned)} · ${pct(t.upload_percent)}`}
              </span>
              <span className="hidden xl:inline">{num(t.assignments)}</span>
              <span className="hidden xl:inline">{num(t.exams)}</span>
              <span
                className={`hidden xl:inline ${t.grading_days != null && r && t.grading_days > r.thresholds.grading_days ? "font-semibold text-danger-strong" : ""}`}
              >
                {num(t.grading_days, 1)}
              </span>
              <span className="hidden xl:inline">{pct(t.ungraded_percent)}</span>
              <span className="hidden xl:inline">
                {num(t.live_held)}/{num(t.live_planned)}
              </span>
              <span className="hidden xl:inline">
                <TeacherStatus status={t.status} />
              </span>
              <span className="col-span-3 flex gap-3 text-xs xl:col-span-1">
                {notify && t.status !== "ok" && t.status !== "none" && (
                  <Link
                    to={`/hr/notices/new?teacher=${t.public_id}`}
                    className="font-semibold text-danger-strong"
                  >
                    تنبيه
                  </Link>
                )}
                <Link to={`/hr/teachers/${t.public_id}`} className="font-semibold text-primary">
                  الملف
                </Link>
              </span>
            </div>
          ))}
        </Card>
      )}
      <p className="mt-3 text-xs text-text-muted">
        للاطلاع والتنبيه الفردي فقط — الموارد البشرية لا تعدّل التعيينات ولا الحسابات.
      </p>
    </PortalShell>
  );
}
